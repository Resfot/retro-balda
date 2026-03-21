#!/usr/bin/env node
/**
 * БАЛДА — Category Auditor
 *
 * Sends the cleaned dictionary_categorized.json to Claude Haiku in batches.
 * Haiku corrects any mis-tagged words.  Results are written back to the
 * same file plus an audit-log.json for manual review.
 *
 * Prerequisites:
 *   1. Run build-dictionary.js first
 *   2. Set ANTHROPIC_API_KEY environment variable
 *
 * Usage:  ANTHROPIC_API_KEY=sk-ant-... node scripts/audit-categories.js
 */

const fs    = require('fs');
const https = require('https');
const path  = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT      = path.join(__dirname, '..');
const DICT_PATH = path.join(ROOT, 'public/dictionary_categorized.json');
const LOG_PATH  = path.join(__dirname, 'audit-log.json');

const MODEL      = 'claude-haiku-4-5-20251001';
const BATCH_SIZE = 120;   // words per API call
const DELAY_MS   = 400;   // pause between requests (rate limit headroom)

const VALID_CATEGORIES = new Set([
  'home', 'profession', 'tool', 'nature', 'body', 'weapon',
  'adjective', 'science', 'transport', 'food', 'art', 'tech',
  'building', 'clothing', 'animal', 'verb', 'sport', 'music',
  'slang', 'general',
]);

const CAT_DESCRIPTIONS = `
home       — household items, furniture, appliances
profession — jobs, occupations, roles
tool       — tools, instruments, devices
nature     — plants, landscapes, weather, geography (non-proper)
body       — body parts, anatomy, health
weapon     — weapons, military equipment
adjective  — descriptive / qualifying words
science    — scientific terms, biology, chemistry, physics
transport  — vehicles, ways of transport
food       — food, drinks, cooking ingredients
art        — art, culture, entertainment, theatre
tech       — technology, computers, electronics
building   — buildings, architecture, rooms, infrastructure
clothing   — clothes, shoes, accessories
animal     — animals, creatures, insects
verb       — action words, processes
sport      — sports, athletics, games
music      — music, musical instruments
slang      — informal, colloquial, internet slang
general    — common words that don't clearly fit any above category`.trim();

const API_KEY = process.env.ANTHROPIC_API_KEY;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function callHaiku(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
        },
      },
      res => {
        let buf = '';
        res.on('data', c => (buf += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(buf);
            resolve(parsed.content?.[0]?.text ?? '');
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function extractJSON(text) {
  // Find first {...} block, even if Haiku adds explanation around it
  const m = text.match(/\{[\s\S]*?\}/);
  if (!m) return {};
  try { return JSON.parse(m[0]); } catch { return {}; }
}

async function auditBatch(words, currentCategory) {
  const prompt = `You are auditing a Russian word game dictionary.
The words below are tagged as category "${currentCategory}".

Words: ${words.join(', ')}

Category descriptions:
${CAT_DESCRIPTIONS}

Return ONLY a JSON object containing words that are WRONG for "${currentCategory}" as keys, with their correct category as values.
If a word belongs to "${currentCategory}" leave it out.
If all are correct, return {}.
Example: {"собака":"animal","молоток":"tool"}`;

  const response = await callHaiku(prompt);
  const changes  = extractJSON(response);

  // Validate — only accept known categories
  const clean = {};
  for (const [word, cat] of Object.entries(changes)) {
    if (typeof cat === 'string' && VALID_CATEGORIES.has(cat) && cat !== currentCategory) {
      clean[word] = cat;
    }
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!API_KEY) {
    console.error('❌  Set ANTHROPIC_API_KEY before running this script.');
    process.exit(1);
  }

  const dict = JSON.parse(fs.readFileSync(DICT_PATH, 'utf-8'));

  // Group by category (skip geo — it lives in its own file now)
  const byCategory = {};
  for (const [word, cat] of Object.entries(dict)) {
    if (cat === 'geo') continue;
    (byCategory[cat] = byCategory[cat] || []).push(word);
  }

  const allCorrections = {};
  let totalChanges = 0;

  console.log('🔍  Starting category audit with Claude Haiku…\n');

  for (const [category, words] of Object.entries(byCategory)) {
    const batches = chunks(words, BATCH_SIZE);
    process.stdout.write(`  ${category.padEnd(12)} ${words.length} words  `);

    let catChanges = 0;

    for (let i = 0; i < batches.length; i++) {
      try {
        const changes = await auditBatch(batches[i], category);

        for (const [word, newCat] of Object.entries(changes)) {
          if (dict[word]) {
            allCorrections[word] = { from: category, to: newCat };
            dict[word] = newCat;
            catChanges++;
            totalChanges++;
          }
        }

        process.stdout.write('.');
        await sleep(DELAY_MS);
      } catch (err) {
        process.stdout.write('!');
        console.error(`\n  Error batch ${i + 1}/${batches.length}:`, err.message);
        await sleep(1000); // extra pause on error
      }
    }

    console.log(`  → ${catChanges} corrections`);
  }

  // Write corrected dictionary
  fs.writeFileSync(DICT_PATH, JSON.stringify(dict));

  // Write audit log
  fs.writeFileSync(LOG_PATH, JSON.stringify(allCorrections, null, 2));

  console.log(`\n✅  Done.`);
  console.log(`   Total corrections : ${totalChanges}`);
  console.log(`   Audit log         : scripts/audit-log.json`);
  console.log(`   Updated dict      : public/dictionary_categorized.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
