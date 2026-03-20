# Dictionary Composition Design — БАЛДА
**Date:** 2026-03-20
**Status:** Approved

---

## Problem Statement

The БАЛДА game dictionary has three compounding quality problems:

1. **32% dead zone** — 13,973 words are tagged `general`, earn no bonuses in any mode, and cannot be reclassified without tooling.
2. **Word quality** — the dictionary contains both gaps (missing common modern words) and junk (obscure, archaic, or technical words no casual player recognises).
3. **Poor start words** — `getRandomStartWord(dictionary, size)` draws randomly from `dictionary`, which is the flat array of word strings already in React state (~43K words). It has no regard for the active game category, producing awkward or irrelevant starts.

---

## Goals

- Reclassify `general` words into existing semantic categories using Claude Haiku; demote genuinely uncategorisable words to `other`.
- Remove or flag rare/archaic words to shrink junk from the playable set.
- Produce a curated `start_words.json` where start words are recognisable and category-matched.

---

## Non-Goals

- Changing scoring, validation, or AI logic.
- Multi-label word support (one word, multiple categories).
- Lazy/live reclassification via the word-info API during gameplay.
- Geo overlap cleanup — the two dictionaries share zero entries today and the reclassify script cannot create overlaps (it never assigns the `geo` category).

---

## Playable Categories

The 17 categories available in bonus/mixed/challenge modes (in `CATEGORY_LABELS` and NOT in `SKIP_CATEGORIES`):

`animal`, `food`, `tech`, `sport`, `nature`, `body`, `clothing`, `profession`, `music`, `science`, `home`, `transport`, `building`, `weapon`, `tool`, `art`, `slang`

`SKIP_CATEGORIES` in `game-logic.js` line 33 contains: `other`, `general`, `name`, `noun`, `verb`, `adjective`, `geo`.

The reclassification script must only assign to the 17 playable categories above, or to `other`. It must **never** assign `name`, `noun`, `verb`, `adjective`, or `geo`.

---

## Architecture

Two deliverables produced by offline scripts run in order. One small backwards-compatible runtime change in `game-logic.js` and `App.jsx`.

### Deliverables

| File | Change | Effect |
|---|---|---|
| `public/dictionary_categorized.json` | 14K `general` words reclassified; rare/archaic removed | Bonus modes have far more scoreable words |
| `public/start_words.json` | New file: curated start words per category and grid size | Start word matches game mode, always recognisable |

### Script Execution Order

```
1. scripts/reclassify-general.cjs   — reclassify 14K general words, output updated dict
2. scripts/build-start-words.cjs    — generate start_words.json from the updated dict
```

---

## Section 1: Reclassification Pipeline

**Script:** `scripts/reclassify-general.cjs`

**Input:** All words tagged `general` in `dictionary_categorized.json` (~14K words). The script accepts `ANTHROPIC_API_KEY` as an environment variable (not available locally — invoke via `ANTHROPIC_API_KEY=sk-... node scripts/reclassify-general.cjs`).

**Process:**
- Load all `general` words from `dictionary_categorized.json`.
- Check `scripts/output/reclassify-progress.json` on startup. This file is an object `{ "lastBatchIndex": N, "results": { word: {cat, freq}, ... } }` where `lastBatchIndex` is 0-indexed: after batch 0 completes successfully, `lastBatchIndex` is set to 0. If the file exists on startup, batches 0 through `lastBatchIndex` (inclusive) are skipped and their results are loaded from the file; processing resumes from batch `lastBatchIndex + 1`.
- Batch 50 words per Claude Haiku API call (~280 total calls for 14K words).
- Prompt is in English. It names each of the 17 playable categories with 3–5 brief Russian example words each, and asks Claude to return a JSON object: `{ "word": { "cat": "category_or_other", "freq": "common|rare|archaic" } }` for each word in the batch.
- After each batch, merge results into `reclassify-progress.json` and increment `lastBatchIndex`.

**Categorising output words (check `freq` first, then `cat`):**

1. If `freq === "rare"` or `freq === "archaic"` → write to `reclassify-excluded.json`; remove word from `dictionary_categorized.json` entirely. (This rule takes priority over all others — applies regardless of `cat` value.)
2. If `freq === "common"` and `cat` is one of the 17 playable categories → update dict entry to that category.
3. If `freq === "common"` and `cat === "other"` → write to `reclassify-review.json` for manual spot-check; update dict entry to `other`.
4. All remaining words not matched by rules 1–3 (e.g. Claude returned a hallucinated category name like `"geography"`, `"verb"`, or `"general"`) → log a warning to stderr with the word and the returned `cat` value; update dict entry to `other`.

**Output files:**
- `public/dictionary_categorized.json` — updated in place.
- `scripts/output/reclassify-progress.json` — resumability checkpoint (can be deleted after a successful run).
- `scripts/output/reclassify-review.json` — common words that landed in `other` (for manual review).
- `scripts/output/reclassify-excluded.json` — rare/archaic words removed from the dict.

**Cost estimate:**
- ~280 batches × ~500 input tokens/batch ≈ 140K input tokens
- ~280 batches × ~700 output tokens/batch ≈ 196K output tokens
- Total ~336K tokens. At Claude Haiku pricing (input ~$0.80/MTok, output ~$4.00/MTok): **under $1** (~$0.11 input + ~$0.78 output ≈ ~$0.90 total).

**Expected result:**
- ~8–10K words find proper semantic categories.
- ~4–6K words land in `other` (still playable, never earn bonuses — `other` is already in `SKIP_CATEGORIES`).
- ~1–2K words excluded as rare/archaic.

**No scoring code changes required** — `other` is already excluded from bonus scoring.

---

## Section 2: Curated Start Words

**Script:** `scripts/build-start-words.cjs`

**Input:** Post-reclassification `public/dictionary_categorized.json`. Also accepts `ANTHROPIC_API_KEY` as an env var.

**Process:**
1. For each of the 17 playable categories plus `default`, and for each supported grid size (5 and 7), pull all words of that exact length tagged with that category.
   - For `default`: pull all words of the correct length from the entire dictionary, sorted alphabetically (for reproducibility), capped at the first 200.
2. If the candidate pool for a given category+length has fewer than 10 words, omit that category+size key — the runtime will fall through to `default`.
3. Send each candidate list (up to 200 words) to Claude Haiku: "Rank these Russian words by how recognisable they are to a casual Russian-speaking adult. Return the top 30 as a JSON array of strings."
4. Write results to `public/start_words.json`.

**Note on geo mode:** Geo mode does not have a dedicated start word pool. Geo-mode games fall through to `default`, which is intentional — the start word in geo mode does not need to be a geographic name.

**Output:** `public/start_words.json`

```json
{
  "default":   { "5": ["балда", "город", "столб", ...], "7": ["школьник", "молоток", ...] },
  "animal":    { "5": ["волки", "орёл", ...],            "7": ["медведи", "попугай", ...] },
  "food":      { "5": ["хлеба", "борщи", ...],           "7": ["картошка", "колбаса", ...] },
  ...
}
```

Category+size keys are only present when the pool met the minimum threshold (≥10 words). Thin categories like `slang` may only have `default` fallback.

**Runtime change** in `game-logic.js` (backwards-compatible — all new params are optional):

```js
export function getRandomStartWord(dictionary, size, category = null, startWords = null) {
  const sizeKey = String(size);
  const pool = startWords?.[category]?.[sizeKey]
             ?? startWords?.['default']?.[sizeKey]
             ?? null;
  if (pool?.length) return pool[Math.floor(Math.random() * pool.length)];
  // existing fallback unchanged
  const candidates = dictionary.filter(w => w.length === size);
  if (!candidates.length) return size === 5 ? 'балда' : 'молоток';
  return candidates[Math.floor(Math.random() * candidates.length)];
}
```

**`App.jsx` integration:**
- Add `const [startWords, setStartWords] = useState(null);` alongside the existing dictionary state vars.
- In the existing geo dict `fetch` block (App.jsx ~line 253), add a parallel non-blocking fetch:
  ```js
  fetch('./start_words.json')
    .then(r => r.json())
    .then(data => setStartWords(data))
    .catch(() => {}); // silent fallback — random word used instead
  ```
- In `startGame` (App.jsx ~line 334–380): `cat` is computed locally before `getRandomStartWord` is called (lines 340–347 derive `cat` from `gameMode` and `selectedCategory`). Pass `cat` and `startWords` directly as arguments:
  ```js
  const word = getRandomStartWord(dictionary, gridSize, cat, startWords);
  ```
  Do **not** pass the `activeCategory` state variable — it still holds the previous game's value at this point.

---

## Runtime Changes Summary

| File | Change |
|---|---|
| `scripts/reclassify-general.cjs` | New script |
| `scripts/build-start-words.cjs` | New script |
| `public/dictionary_categorized.json` | Updated by reclassify script |
| `public/start_words.json` | New file |
| `src/game-logic.js` | `getRandomStartWord` signature updated (backwards-compatible) |
| `src/App.jsx` | Load `start_words.json`, pass `cat` + `startWords` to `getRandomStartWord` |

---

## Success Criteria

- `general` word count reduced from 13,973 to under 6,000.
- `slang`, `weapon`, and other thin categories grow noticeably after reclassification.
- Every combination of playable category + grid size that has ≥10 candidate words has at least 10 entries in `start_words.json` (ideally 30).
- `reclassify-excluded.json` spot-check of 20 random entries confirms removal of genuinely obscure/archaic terms.
- In a bonus/mixed/challenge game, `getRandomStartWord` always returns a word from the active category's start pool when that pool exists.
