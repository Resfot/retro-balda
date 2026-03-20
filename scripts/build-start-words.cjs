#!/usr/bin/env node
/**
 * БАЛДА — Build curated start_words.json
 *
 * Run AFTER reclassify-general.cjs:
 *   ANTHROPIC_API_KEY=sk-... node scripts/build-start-words.cjs
 *
 * Output: public/start_words.json
 * Format: { "category": { "5": ["word", ...], "7": [...] }, ... }
 */

const fs   = require('fs');
const path = require('path');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ERROR: Set ANTHROPIC_API_KEY env var');
  process.exit(1);
}

const ROOT      = path.join(__dirname, '..');
const DICT_PATH = path.join(ROOT, 'public/dictionary_categorized.json');
const OUT_PATH  = path.join(ROOT, 'public/start_words.json');

const PLAYABLE = [
  'animal','food','tech','sport','nature','body','clothing',
  'profession','music','science','home','transport','building',
  'weapon','tool','art','slang',
];
const SIZES    = [5, 7];
const MIN_POOL = 10;  // skip category+size if fewer than this many candidates
const TOP_N    = 30;  // target entries per category+size
const CAP      = 200; // max candidates sent to Claude per call

async function rankWords(words, category, size) {
  const prompt = `You are helping a Russian word game. Rank these Russian words by how recognisable they are to a casual Russian-speaking adult (not linguists — everyday people).

Category context: ${category === 'default' ? 'general vocabulary' : category}
Word length: ${size} letters

Words to rank: ${JSON.stringify(words)}

Return ONLY a JSON array of the top ${Math.min(TOP_N, words.length)} most recognisable words from the list above.
Keep words exactly as given. No markdown, no explanation.`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      let text = (data.content?.[0]?.text ?? '').trim();
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      const ranked = JSON.parse(text);
      // Validate: only return words that were in the input
      const wordSet = new Set(words);
      return ranked.filter(w => wordSet.has(w)).slice(0, TOP_N);
    } catch (e) {
      const delay = Math.pow(2, attempt) * 1500;
      process.stderr.write(`  Attempt ${attempt + 1}/3 failed: ${e.message} — retrying in ${delay}ms\n`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`Failed after 3 retries for ${category}/${size}`);
}

async function main() {
  const dict     = JSON.parse(fs.readFileSync(DICT_PATH, 'utf-8'));
  const allWords = Object.keys(dict);
  const result   = {};

  const keys = ['default', ...PLAYABLE];

  for (const cat of keys) {
    result[cat] = {};

    for (const size of SIZES) {
      let pool;

      if (cat === 'default') {
        // Alphabetical sort for reproducibility, capped at CAP
        pool = allWords.filter(w => w.length === size).sort().slice(0, CAP);
      } else {
        pool = allWords.filter(w => w.length === size && dict[w] === cat);
      }

      if (pool.length < MIN_POOL) {
        console.log(`  SKIP ${cat}/${size}: ${pool.length} candidates (need ≥ ${MIN_POOL})`);
        continue;
      }

      const candidates = pool.length > CAP ? pool.slice(0, CAP) : pool;
      process.stdout.write(`  ${cat}/${size}: ranking ${candidates.length} words… `);

      const ranked = await rankWords(candidates, cat, size);

      if (ranked.length >= MIN_POOL) {
        result[cat][String(size)] = ranked;
        process.stdout.write(`✓ (${ranked.length} kept)\n`);
      } else {
        process.stdout.write(`⚠ only ${ranked.length} valid — skipping\n`);
      }
    }

    // Remove category key if it ended up empty
    if (Object.keys(result[cat]).length === 0) {
      delete result[cat];
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));

  console.log('\n=== start_words.json ===');
  for (const [cat, sizes] of Object.entries(result)) {
    for (const [sz, words] of Object.entries(sizes)) {
      console.log(`  ${(cat + '/' + sz).padEnd(16)} ${words.length} words   e.g. ${words.slice(0, 3).join(', ')}`);
    }
  }
  console.log(`\n✅  Written: public/start_words.json`);
}

main().catch(e => { console.error('\n❌ ', e.message); process.exit(1); });
