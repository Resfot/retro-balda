#!/usr/bin/env node
/**
 * БАЛДА — Dictionary Builder
 *
 * Reads dictionary_categorized.json, applies quality filters using a
 * Russian word-frequency corpus, then writes three output files:
 *
 *   public/dictionary.json            — flat array, all kept words (no geo)
 *   public/dictionary_categorized.json — {word: category}, geo removed
 *   public/dictionary_geo.json        — flat array, geographic names only
 *
 * Usage:  node scripts/build-dictionary.js
 */

const fs    = require('fs');
const https = require('https');
const path  = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FREQ_URL =
  'https://raw.githubusercontent.com/hingston/russian/master/100000-russian-words.txt';

const ROOT             = path.join(__dirname, '..');
const IN_CATEGORIZED   = path.join(ROOT, 'public/dictionary_categorized.json');
const OUT_CATEGORIZED  = path.join(ROOT, 'public/dictionary_categorized.json');
const OUT_GEO          = path.join(ROOT, 'public/dictionary_geo.json');
const OUT_FLAT         = path.join(ROOT, 'public/dictionary.json');

const MIN_LENGTH       = 3;   // words shorter than this are always dropped
const FREQ_GATE_MAX    = 4;   // words <= this length must appear in freq list

const VOWELS = new Set('аеёиоуыьъэюя');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasVowel(word) {
  return [...word].some(c => VOWELS.has(c));
}

function downloadText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let buf = '';
      res.on('data', c => (buf += c));
      res.on('end', () => resolve(buf));
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Download frequency list -----------------------------------------------
  console.log('⬇  Downloading frequency list…');
  const raw = await downloadText(FREQ_URL);
  const freqSet = new Set(
    raw.split('\n').map(w => w.trim().toLowerCase()).filter(Boolean)
  );
  console.log(`   ${freqSet.size.toLocaleString()} entries loaded`);

  // 2. Load source dictionary ------------------------------------------------
  const source = JSON.parse(fs.readFileSync(IN_CATEGORIZED, 'utf-8'));
  const entries = Object.entries(source);
  console.log(`📖  Source dictionary: ${entries.length.toLocaleString()} entries`);

  // 3. Filter ----------------------------------------------------------------
  const outCategorized = {};
  const geoWords       = [];
  let removed = 0;

  for (const [word, cat] of entries) {
    // Geo words go to their own file — no frequency gate applied
    if (cat === 'geo') {
      if (word.length >= MIN_LENGTH && hasVowel(word)) {
        geoWords.push(word);
      }
      continue;
    }

    // Too short
    if (word.length < MIN_LENGTH)          { removed++; continue; }
    // Consonant cluster / abbreviation
    if (!hasVowel(word))                   { removed++; continue; }
    // Short words must appear in the frequency corpus
    if (word.length <= FREQ_GATE_MAX && !freqSet.has(word)) { removed++; continue; }

    outCategorized[word] = cat;
  }

  const flatWords = Object.keys(outCategorized);

  // 4. Report ----------------------------------------------------------------
  console.log(`\n✅  Results:`);
  console.log(`   dictionary_categorized.json : ${flatWords.length.toLocaleString()} words  (removed ${removed.toLocaleString()})`);
  console.log(`   dictionary_geo.json         : ${geoWords.length.toLocaleString()} geographic names`);
  console.log(`   dictionary.json             : ${flatWords.length.toLocaleString()} words  (flat array)`);

  // 5. Write -----------------------------------------------------------------
  fs.writeFileSync(OUT_CATEGORIZED, JSON.stringify(outCategorized));
  fs.writeFileSync(OUT_GEO,         JSON.stringify(geoWords));
  fs.writeFileSync(OUT_FLAT,        JSON.stringify(flatWords));

  console.log('\n🎉  Done — commit the three updated files in public/');
}

main().catch(err => { console.error(err); process.exit(1); });
