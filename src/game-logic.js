// Game Logic Engine for БАЛДА
// Supports: classic, bonus, mixed, challenge, geo game modes
// Configurable minimum word length

const LETTERS = 'абвгдежзиклмнопрстуфхцчшщъыьэюя';

const CATEGORY_LABELS = {
  noun:       '📦 Существительные',
  verb:       '⚡ Глаголы',
  adjective:  '🎨 Прилагательные',
  geo:        '🌍 География',
  animal:     '🐾 Животные',
  food:       '🍕 Еда',
  tech:       '💻 Технологии',
  sport:      '⚽ Спорт',
  nature:     '🌿 Природа',
  body:       '🫀 Тело',
  clothing:   '👕 Одежда',
  profession: '👷 Профессии',
  music:      '🎵 Музыка',
  science:    '🔬 Наука',
  home:       '🏠 Дом и быт',
  transport:  '🚗 Транспорт',
  building:   '🏛️ Здания',
  weapon:     '⚔️ Оружие',
  tool:       '🔧 Инструменты',
  art:        '🎭 Искусство',
  slang:      '🗣️ Сленг',
};

// Categories available for Bonus / Mixed / Challenge modes.
// Geo is intentionally excluded — it has its own dedicated game mode.
const SKIP_CATEGORIES = new Set(['other', 'general', 'name', 'noun', 'verb', 'adjective', 'geo']);

export function getAvailableCategories(wordCategories) {
  if (!wordCategories) return [];
  const counts = {};
  for (const cat of Object.values(wordCategories)) {
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return Object.entries(counts)
    .filter(([cat, count]) => count >= 30 && !SKIP_CATEGORIES.has(cat))
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => ({ id: cat, label: CATEGORY_LABELS[cat] || cat, count }));
}

export function getWordCategory(word, wordCategories) {
  if (!wordCategories) return null;
  return wordCategories[word] || null;
}

// ---------------------------------------------------------------------------
// Scoring
// geoSet — Set of geographic names (only relevant in 'geo' mode)
// ---------------------------------------------------------------------------

export function calculateScore(word, wordCategories, gameMode, activeCategory, geoSet = null) {
  const base = word.length;

  if (gameMode === 'geo') {
    const isGeo = geoSet?.has(word) ?? false;
    return { score: isGeo ? base * 3 : base, multiplier: isGeo ? 3 : 1, isCategory: isGeo };
  }

  if (gameMode === 'classic' || !activeCategory || !wordCategories) {
    return { score: base, multiplier: 1, isCategory: false };
  }

  const isCategory = getWordCategory(word, wordCategories) === activeCategory;

  if (gameMode === 'bonus') {
    return { score: isCategory ? base * 2 : base, multiplier: isCategory ? 2 : 1, isCategory };
  }

  if (gameMode === 'mixed') {
    return { score: isCategory ? base : Math.ceil(base / 2), multiplier: isCategory ? 1 : 0.5, isCategory };
  }

  if (gameMode === 'challenge') {
    return { score: isCategory ? base * 2 : base, multiplier: isCategory ? 2 : 1, isCategory };
  }

  return { score: base, multiplier: 1, isCategory: false };
}

export function pickRandomCategory(availableCategories, lastCategory) {
  if (!availableCategories?.length) return null;
  const options = availableCategories.filter(c => c.id !== lastCategory);
  const pool = options.length > 0 ? options : availableCategories;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

export function createGrid(size, startWord) {
  const grid = Array.from({ length: size }, () => Array(size).fill(''));
  const midRow = Math.floor(size / 2);
  const word = startWord.toLowerCase();
  for (let i = 0; i < word.length && i < size; i++) grid[midRow][i] = word[i];
  return grid;
}

export function getRandomStartWord(dictionary, size, category = null, startWords = null) {
  const sizeKey = String(size);
  const pool = startWords?.[category]?.[sizeKey]
             ?? startWords?.['default']?.[sizeKey]
             ?? null;
  if (pool?.length) return pool[Math.floor(Math.random() * pool.length)];
  const candidates = dictionary.filter(w => w.length === size);
  if (!candidates.length) return size === 5 ? 'балда' : 'молоток';
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function isInBounds(row, col, size) {
  return row >= 0 && row < size && col >= 0 && col < size;
}

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export function getNeighbors(row, col, size) {
  return DIRS.map(([dr, dc]) => [row + dr, col + dc]).filter(([r, c]) => isInBounds(r, c, size));
}

export function hasAdjacentFilled(grid, row, col) {
  return getNeighbors(row, col, grid.length).some(([r, c]) => grid[r][c] !== '');
}

export function getValidPlacements(grid) {
  const size = grid.length;
  const out = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (grid[r][c] === '' && hasAdjacentFilled(grid, r, c)) out.push([r, c]);
  return out;
}

export function isPathValid(path) {
  if (path.length < 2) return false;
  const seen = new Set();
  for (let i = 0; i < path.length; i++) {
    const key = `${path[i][0]},${path[i][1]}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (i > 0) {
      const dr = Math.abs(path[i][0] - path[i - 1][0]);
      const dc = Math.abs(path[i][1] - path[i - 1][1]);
      if (dr + dc !== 1) return false;
    }
  }
  return true;
}

export function getWordFromPath(grid, path) {
  return path.map(([r, c]) => grid[r][c]).join('');
}

export function isGridFull(grid) {
  return grid.every(row => row.every(cell => cell !== ''));
}

// ---------------------------------------------------------------------------
// Move validation
// minLength — minimum accepted word length (default 3)
// ---------------------------------------------------------------------------

export function validateMove(grid, path, placedCell, usedWords, dictSet, minLength = 3) {
  if (!isPathValid(path))
    return { valid: false, reason: 'Путь должен идти по соседним клеткам' };

  if (!path.some(([r, c]) => r === placedCell[0] && c === placedCell[1]))
    return { valid: false, reason: 'Слово должно содержать новую букву' };

  if (!path.every(([r, c]) => grid[r][c] !== ''))
    return { valid: false, reason: 'Все клетки в пути должны быть заполнены' };

  const word = getWordFromPath(grid, path);

  if (word.length < minLength)
    return { valid: false, reason: `Минимум ${minLength} буквы` };

  if (!dictSet.has(word))
    return { valid: false, reason: `"${word.toUpperCase()}" нет в словаре` };

  if (usedWords.has(word))
    return { valid: false, reason: `"${word.toUpperCase()}" уже использовано` };

  return { valid: true, word, score: word.length };
}

// ---------------------------------------------------------------------------
// DFS word finder (internal)
// minLength — don't push results shorter than this
// ---------------------------------------------------------------------------

function findWordsThrough(grid, placedRow, placedCol, size, usedWords, dictSet, minLength) {
  const results = [];
  const maxLen  = Math.min(size * size, 12);

  for (let startR = 0; startR < size; startR++) {
    for (let startC = 0; startC < size; startC++) {
      if (grid[startR][startC] === '') continue;
      const visited = new Set([`${startR},${startC}`]);
      dfs(
        grid, startR, startC, size,
        [[startR, startC]], visited,
        placedRow, placedCol,
        usedWords, dictSet, results, maxLen, minLength
      );
    }
  }
  return results;
}

function dfs(grid, row, col, size, path, visited, placedRow, placedCol, usedWords, dictSet, results, maxLen, minLength) {
  if (path.length >= minLength) {
    if (path.some(([r, c]) => r === placedRow && c === placedCol)) {
      const word = path.map(([r, c]) => grid[r][c]).join('');
      if (dictSet.has(word) && !usedWords.has(word)) {
        results.push({ word, path: path.map(p => [...p]) });
      }
    }
  }

  if (path.length >= maxLen) return;

  for (const [nr, nc] of getNeighbors(row, col, size)) {
    const key = `${nr},${nc}`;
    if (visited.has(key) || grid[nr][nc] === '') continue;
    visited.add(key);
    path.push([nr, nc]);
    dfs(grid, nr, nc, size, path, visited, placedRow, placedCol, usedWords, dictSet, results, maxLen, minLength);
    path.pop();
    visited.delete(key);
  }
}

// ---------------------------------------------------------------------------
// AI move finder
// geoSet     — geographic names (passed in geo mode so they score ×3)
// minLength  — minimum word length the AI will consider
// ---------------------------------------------------------------------------

export function findAIMove(
  grid, usedWords, dictSet,
  difficulty    = 'medium',
  wordCategories = null,
  gameMode      = 'classic',
  activeCategory = null,
  minLength     = 3,
  geoSet        = null,
) {
  const size = grid.length;
  const placements = getValidPlacements(grid);
  if (!placements.length) return null;

  // In geo mode, combine base + geo dictionaries for the search
  const effectiveDict = (gameMode === 'geo' && geoSet?.size)
    ? new Set([...dictSet, ...geoSet])
    : dictSet;

  let allMoves = [];

  for (const [pr, pc] of placements) {
    for (const letter of LETTERS) {
      grid[pr][pc] = letter;
      for (const { word, path } of findWordsThrough(grid, pr, pc, size, usedWords, effectiveDict, minLength)) {
        const { score, isCategory } = calculateScore(word, wordCategories, gameMode, activeCategory, geoSet);
        allMoves.push({ placedCell: [pr, pc], letter, word, path, score, isCategory });
      }
      grid[pr][pc] = '';
    }
  }

  if (!allMoves.length) return null;

  // In non-classic modes, AI prefers bonus words (category hit or geo name)
  if (gameMode !== 'classic') {
    const bonusMoves = allMoves.filter(m => m.isCategory);
    if (bonusMoves.length > 0) {
      if (difficulty === 'hard') {
        allMoves = bonusMoves;
      } else if (difficulty === 'medium' && Math.random() < 0.7) {
        allMoves = bonusMoves;
      }
    }
  }

  allMoves.sort((a, b) => b.score - a.score);

  if (difficulty === 'easy') {
    // Pick from the bottom 40 % — intentionally weak
    const idx = Math.floor(Math.random() * Math.ceil(allMoves.length * 0.4))
              + Math.floor(allMoves.length * 0.6);
    return allMoves[Math.min(idx, allMoves.length - 1)];
  }

  if (difficulty === 'medium') {
    // Pick from the top 50 %
    const top = allMoves.slice(0, Math.max(1, Math.ceil(allMoves.length * 0.5)));
    return top[Math.floor(Math.random() * top.length)];
  }

  // Hard — best score, random tiebreak
  const best     = allMoves[0].score;
  const topMoves = allMoves.filter(m => m.score === best);
  return topMoves[Math.floor(Math.random() * topMoves.length)];
}

// ---------------------------------------------------------------------------
// Hint system
// ---------------------------------------------------------------------------

export function findHint(grid, usedWords, dictSet, wordCategories, activeCategory, hintLevel = 0, minLength = 3, geoSet = null) {
  const size = grid.length;
  const placements = getValidPlacements(grid);
  if (!placements.length) return null;

  const effectiveDict = (activeCategory === 'geo' || !activeCategory && geoSet?.size && false)
    ? new Set([...dictSet, ...geoSet])   // future-proof hook; geo hint handled below
    : dictSet;

  // When playing in geo mode, include geo words
  const searchDict = geoSet?.size ? new Set([...dictSet, ...geoSet]) : dictSet;

  let allMoves = [];

  for (const [pr, pc] of placements) {
    for (const letter of LETTERS) {
      grid[pr][pc] = letter;
      for (const { word, path } of findWordsThrough(grid, pr, pc, size, usedWords, searchDict, minLength)) {
        const wordCat  = getWordCategory(word, wordCategories);
        const isGeo    = geoSet?.has(word) ?? false;
        const isCategory = activeCategory
          ? (wordCat === activeCategory || isGeo)
          : false;
        allMoves.push({ placedCell: [pr, pc], letter, word, path, score: word.length, isCategory });
      }
      grid[pr][pc] = '';
    }
  }

  if (!allMoves.length) return null;

  // Prefer category / geo words, then longest
  allMoves.sort((a, b) => {
    if (a.isCategory !== b.isCategory) return a.isCategory ? -1 : 1;
    return b.score - a.score;
  });

  const move = allMoves[0];

  if (hintLevel === 0) {
    return { level: 0, wordLength: move.word.length, isCategory: move.isCategory, firstLetter: move.word[0].toUpperCase(), move: null };
  }
  if (hintLevel === 1) {
    return { level: 1, word: move.word, isCategory: move.isCategory, move: null };
  }
  return { level: 2, word: move.word, isCategory: move.isCategory, move: { placedCell: move.placedCell, letter: move.letter, path: move.path } };
}

export { LETTERS, CATEGORY_LABELS };
