#!/usr/bin/env node
/**
 * БАЛДА — Reclassify 'general' words via Claude Haiku
 *
 * Usage: ANTHROPIC_API_KEY=sk-... node scripts/reclassify-general.cjs
 *
 * Outputs:
 *   public/dictionary_categorized.json  — updated in place
 *   scripts/output/reclassify-progress.json  — resumability checkpoint
 *   scripts/output/reclassify-review.json    — common words stuck in 'other' (manual review)
 *   scripts/output/reclassify-excluded.json  — rare/archaic words removed from dict
 */

const fs   = require('fs');
const path = require('path');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ERROR: Set ANTHROPIC_API_KEY env var');
  console.error('  ANTHROPIC_API_KEY=sk-... node scripts/reclassify-general.cjs');
  process.exit(1);
}

const ROOT          = path.join(__dirname, '..');
const DICT_PATH     = path.join(ROOT, 'public/dictionary_categorized.json');
const OUT_DIR       = path.join(__dirname, 'output');
const PROGRESS_PATH = path.join(OUT_DIR, 'reclassify-progress.json');
const REVIEW_PATH   = path.join(OUT_DIR, 'reclassify-review.json');
const EXCLUDED_PATH = path.join(OUT_DIR, 'reclassify-excluded.json');

const BATCH_SIZE = 50;

const PLAYABLE = new Set([
  'animal','food','tech','sport','nature','body','clothing',
  'profession','music','science','home','transport','building',
  'weapon','tool','art','slang',
]);

const CATEGORY_EXAMPLES = {
  animal:     'кот, лиса, волк, орёл, акула',
  food:       'хлеб, суп, мясо, рыба, борщ',
  tech:       'экран, чип, байт, сервер, код',
  sport:      'мяч, гол, бег, борьба, гимнаст',
  nature:     'лес, река, гора, дождь, скала',
  body:       'рука, нога, глаз, зуб, спина',
  clothing:   'куртка, шарф, брюки, туфля, пояс',
  profession: 'врач, учитель, повар, актёр, пилот',
  music:      'нота, бас, альт, хор, скрипка',
  science:    'атом, ген, формула, теорема, лазер',
  home:       'диван, лампа, кастрюля, ковёр, кресло',
  transport:  'автобус, поезд, самолёт, трамвай, яхта',
  building:   'школа, завод, церковь, вокзал, театр',
  weapon:     'меч, пушка, стрела, копьё, бомба',
  tool:       'молоток, пила, дрель, гвоздь, ключ',
  art:        'картина, скульптура, поэзия, опера, роман',
  slang:      'чувак, тусовка, прикол, халява, кайф',
};

async function callHaiku(words) {
  const catList = Object.entries(CATEGORY_EXAMPLES)
    .map(([c, ex]) => `  ${c}: ${ex}`)
    .join('\n');

  const prompt = `Classify each Russian word into exactly one category from the list below, or "other" if none fit.
Also rate each word's usage frequency as "common", "rare", or "archaic".

Categories:
${catList}

Words to classify: ${JSON.stringify(words)}

Return ONLY a JSON object with no markdown:
{"word1": {"cat": "category_or_other", "freq": "common|rare|archaic"}, "word2": {...}, ...}`;

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
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const data = await res.json();
      let text = (data.content?.[0]?.text ?? '').trim();
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      return JSON.parse(text);
    } catch (e) {
      const delay = Math.pow(2, attempt) * 1500;
      process.stderr.write(`Batch attempt ${attempt + 1}/3 failed: ${e.message} — retrying in ${delay}ms\n`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Batch failed after 3 retries — aborting (progress saved, can resume)');
}

function applyRule(word, { cat, freq }, dict, excluded, review) {
  // Rule 1 (highest priority): rare/archaic → exclude regardless of cat
  if (freq === 'rare' || freq === 'archaic') {
    excluded[word] = { cat, freq };
    delete dict[word];
    return;
  }

  // Rule 2: common + known playable category → promote
  if (freq === 'common' && PLAYABLE.has(cat)) {
    dict[word] = cat;
    return;
  }

  // Rule 3: common + other → flag for manual review, store as 'other'
  if (freq === 'common' && cat === 'other') {
    review[word] = { cat, freq };
    dict[word] = 'other';
    return;
  }

  // Rule 4: unexpected/hallucinated category → warn, store as 'other'
  if (!PLAYABLE.has(cat) && cat !== 'other') {
    process.stderr.write(`WARN: "${word}" returned unexpected cat="${cat}" freq="${freq}" — storing as 'other'\n`);
  }
  dict[word] = 'other';
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const dict = JSON.parse(fs.readFileSync(DICT_PATH, 'utf-8'));
  const generals = Object.keys(dict).filter(w => dict[w] === 'general');
  console.log(`📖  Found ${generals.length.toLocaleString()} 'general' words to reclassify`);

  // Load or init progress
  let progress = { lastBatchIndex: -1, results: {} };
  if (fs.existsSync(PROGRESS_PATH)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf-8'));
    const done = progress.lastBatchIndex + 1;
    const total = Math.ceil(generals.length / BATCH_SIZE);
    console.log(`⏩  Resuming from batch ${done}/${total}`);
  }

  // Slice into batches
  const batches = [];
  for (let i = 0; i < generals.length; i += BATCH_SIZE) {
    batches.push(generals.slice(i, i + BATCH_SIZE));
  }

  for (let bi = 0; bi < batches.length; bi++) {
    if (bi <= progress.lastBatchIndex) continue; // already processed

    const batch = batches[bi];
    const pct = Math.round(((bi + 1) / batches.length) * 100);
    process.stdout.write(`  Batch ${bi + 1}/${batches.length} (${pct}%) — ${batch.length} words… `);

    const results = await callHaiku(batch);

    // Merge results
    for (const [w, r] of Object.entries(results)) {
      if (progress.results[w] === undefined) {
        progress.results[w] = r;
      }
    }
    // Handle words Claude may have silently skipped
    for (const w of batch) {
      if (progress.results[w] === undefined) {
        process.stderr.write(`WARN: "${w}" missing from batch response — defaulting to {other, common}\n`);
        progress.results[w] = { cat: 'other', freq: 'common' };
      }
    }

    progress.lastBatchIndex = bi;
    fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
    process.stdout.write('✓\n');
  }

  console.log('\n🔧  Applying classification rules to dictionary…');

  const excluded = {};
  const review   = {};

  for (const [word, result] of Object.entries(progress.results)) {
    applyRule(word, result, dict, excluded, review);
  }

  // Write outputs
  fs.writeFileSync(DICT_PATH,     JSON.stringify(dict));
  fs.writeFileSync(EXCLUDED_PATH, JSON.stringify(excluded, null, 2));
  fs.writeFileSync(REVIEW_PATH,   JSON.stringify(review,   null, 2));

  // Stats
  const cats = {};
  for (const c of Object.values(dict)) cats[c] = (cats[c] || 0) + 1;

  console.log('\n=== Results ===');
  console.log(`Dictionary total : ${Object.keys(dict).length.toLocaleString()} words`);
  console.log(`'general' remaining: ${(cats.general || 0).toLocaleString()}`);
  console.log(`Excluded (rare/archaic): ${Object.keys(excluded).length.toLocaleString()}`);
  console.log(`Review queue (common→other): ${Object.keys(review).length.toLocaleString()}`);
  console.log('\nCategory distribution:');
  Object.entries(cats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([c, n]) => console.log(`  ${c.padEnd(12)} ${n.toLocaleString()}`));

  console.log('\n✅  Done. Next step:');
  console.log('   ANTHROPIC_API_KEY=sk-... node scripts/build-start-words.cjs');
  console.log('\n   Also update public/dictionary.json (flat array):');
  console.log('   node -e "const d=require(\'./public/dictionary_categorized.json\'); require(\'fs\').writeFileSync(\'public/dictionary.json\', JSON.stringify(Object.keys(d)))"');
}

main().catch(e => { console.error('\n❌ ', e.message); process.exit(1); });
