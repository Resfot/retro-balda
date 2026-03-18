// Game Logic Engine for БАЛДА
// With category-based scoring modes

const LETTERS = 'абвгдежзиклмнопрстуфхцчшщъыьэюя';

const CATEGORY_LABELS = {
  noun: '📦 Существительные',
  verb: '⚡ Глаголы',
  adjective: '🎨 Прилагательные',
  geo: '🌍 География',
  animal: '🐾 Животные',
  food: '🍕 Еда',
  tech: '💻 Технологии',
  sport: '⚽ Спорт',
  nature: '🌿 Природа',
  body: '🫀 Тело',
  clothing: '👕 Одежда',
  profession: '👷 Профессии',
  music: '🎵 Музыка',
  science: '🔬 Наука',
  home: '🏠 Дом и быт',
  transport: '🚗 Транспорт',
  building: '🏛️ Здания',
  weapon: '⚔️ Оружие',
  tool: '🔧 Инструменты',
  art: '🎭 Искусство',
  slang: '🗣️ Сленг',
};

export function getAvailableCategories(wordCategories) {
  if (!wordCategories) return [];
  const counts = {};
  for (const cat of Object.values(wordCategories)) {
    counts[cat] = (counts[cat] || 0) + 1;
  }
  const skip = new Set(['other', 'general', 'name']);
  return Object.entries(counts)
    .filter(([cat, count]) => count >= 30 && !skip.has(cat))
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => ({
      id: cat,
      label: CATEGORY_LABELS[cat] || cat,
      count,
    }));
}

export function getWordCategory(word, wordCategories) {
  if (!wordCategories) return null;
  return wordCategories[word] || null;
}

export function calculateScore(word, wordCategories, gameMode, activeCategory) {
  const baseScore = word.length;
  const wordCat = getWordCategory(word, wordCategories);

  if (gameMode === 'classic' || !activeCategory || !wordCategories) {
    return { score: baseScore, multiplier: 1, isCategory: false };
  }

  const isCategory = wordCat === activeCategory;

  if (gameMode === 'bonus') {
    return {
      score: isCategory ? baseScore * 2 : baseScore,
      multiplier: isCategory ? 2 : 1,
      isCategory,
    };
  }

  if (gameMode === 'mixed') {
    return {
      score: isCategory ? baseScore : Math.ceil(baseScore / 2),
      multiplier: isCategory ? 1 : 0.5,
      isCategory,
    };
  }

  if (gameMode === 'challenge') {
    return {
      score: isCategory ? baseScore * 2 : baseScore,
      multiplier: isCategory ? 2 : 1,
      isCategory,
    };
  }

  return { score: baseScore, multiplier: 1, isCategory: false };
}

export function pickRandomCategory(availableCategories, lastCategory) {
  if (!availableCategories || availableCategories.length === 0) return null;
  const options = availableCategories.filter(c => c.id !== lastCategory);
  const pool = options.length > 0 ? options : availableCategories;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

export function createGrid(size, startWord) {
  const grid = Array.from({ length: size }, () => Array(size).fill(''));
  const midRow = Math.floor(size / 2);
  const word = startWord.toLowerCase();
  for (let i = 0; i < word.length && i < size; i++) {
    grid[midRow][i] = word[i];
  }
  return grid;
}

export function getRandomStartWord(dictionary, size) {
  const candidates = dictionary.filter(w => w.length === size);
  if (candidates.length === 0) return size === 5 ? 'балда' : 'молоток';
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function isInBounds(row, col, size) {
  return row >= 0 && row < size && col >= 0 && col < size;
}

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export function getNeighbors(row, col, size) {
  return DIRS
    .map(([dr, dc]) => [row + dr, col + dc])
    .filter(([r, c]) => isInBounds(r, c, size));
}

export function hasAdjacentFilled(grid, row, col) {
  const size = grid.length;
  return getNeighbors(row, col, size).some(([r, c]) => grid[r][c] !== '');
}

export function getValidPlacements(grid) {
  const size = grid.length;
  const placements = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === '' && hasAdjacentFilled(grid, r, c)) {
        placements.push([r, c]);
      }
    }
  }
  return placements;
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

export function validateMove(grid, path, placedCell, usedWords, dictSet) {
  if (!isPathValid(path)) return { valid: false, reason: 'Путь должен идти по соседним клеткам' };
  const includesPlaced = path.some(([r, c]) => r === placedCell[0] && c === placedCell[1]);
  if (!includesPlaced) return { valid: false, reason: 'Слово должно содержать новую букву' };
  const allFilled = path.every(([r, c]) => grid[r][c] !== '');
  if (!allFilled) return { valid: false, reason: 'Все клетки в пути должны быть заполнены' };
  const word = getWordFromPath(grid, path);
  if (word.length < 2) return { valid: false, reason: 'Слово должно быть не менее 2 букв' };
  if (!dictSet.has(word)) return { valid: false, reason: `"${word}" нет в словаре` };
  if (usedWords.has(word)) return { valid: false, reason: `"${word}" уже использовано` };
  return { valid: true, word, score: word.length };
}

export function isGridFull(grid) {
  return grid.every(row => row.every(cell => cell !== ''));
}

// --- AI Logic (category-aware) ---

export function findAIMove(grid, usedWords, dictSet, difficulty = 'medium', wordCategories = null, gameMode = 'classic', activeCategory = null) {
  const size = grid.length;
  const placements = getValidPlacements(grid);
  if (placements.length === 0) return null;

  let allMoves = [];

  for (const [pr, pc] of placements) {
    for (let li = 0; li < LETTERS.length; li++) {
      const letter = LETTERS[li];
      grid[pr][pc] = letter;

      const words = findWordsThrough(grid, pr, pc, size, usedWords, dictSet);
      for (const { word, path } of words) {
        const { score, isCategory } = calculateScore(word, wordCategories, gameMode, activeCategory);
        allMoves.push({ placedCell: [pr, pc], letter, word, path, score, isCategory });
      }

      grid[pr][pc] = '';
    }
  }

  if (allMoves.length === 0) return null;

  // AI prefers category words in category modes
  if (gameMode !== 'classic' && activeCategory && wordCategories) {
    const catMoves = allMoves.filter(m => m.isCategory);
    if (catMoves.length > 0) {
      if (difficulty === 'hard') {
        allMoves = catMoves;
      } else if (difficulty === 'medium' && Math.random() < 0.7) {
        allMoves = catMoves;
      }
    }
  }

  allMoves.sort((a, b) => b.score - a.score);

  let move;
  if (difficulty === 'easy') {
    const idx = Math.floor(Math.random() * Math.ceil(allMoves.length * 0.4)) + Math.floor(allMoves.length * 0.6);
    move = allMoves[Math.min(idx, allMoves.length - 1)];
  } else if (difficulty === 'medium') {
    const top = allMoves.slice(0, Math.max(1, Math.ceil(allMoves.length * 0.5)));
    move = top[Math.floor(Math.random() * top.length)];
  } else {
    const best = allMoves[0].score;
    const topMoves = allMoves.filter(m => m.score === best);
    move = topMoves[Math.floor(Math.random() * topMoves.length)];
  }

  return move;
}

function findWordsThrough(grid, placedRow, placedCol, size, usedWords, dictSet) {
  const results = [];
  const maxLen = Math.min(size * size, 12);

  for (let startR = 0; startR < size; startR++) {
    for (let startC = 0; startC < size; startC++) {
      if (grid[startR][startC] === '') continue;
      const visited = new Set();
      visited.add(`${startR},${startC}`);
      dfs(grid, startR, startC, size, [[startR, startC]], visited,
        placedRow, placedCol, usedWords, dictSet, results, maxLen);
    }
  }
  return results;
}

function dfs(grid, row, col, size, path, visited, placedRow, placedCol, usedWords, dictSet, results, maxLen) {
  if (path.length >= 2) {
    const includesPlaced = path.some(([r, c]) => r === placedRow && c === placedCol);
    if (includesPlaced) {
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
    dfs(grid, nr, nc, size, path, visited, placedRow, placedCol, usedWords, dictSet, results, maxLen);
    path.pop();
    visited.delete(key);
  }
}

// --- Hint System ---

export function findHint(grid, usedWords, dictSet, wordCategories, activeCategory, hintLevel = 0) {
  const size = grid.length;
  const placements = getValidPlacements(grid);
  if (placements.length === 0) return null;

  let allMoves = [];

  for (const [pr, pc] of placements) {
    for (let li = 0; li < LETTERS.length; li++) {
      const letter = LETTERS[li];
      grid[pr][pc] = letter;

      const words = findWordsThrough(grid, pr, pc, size, usedWords, dictSet);
      for (const { word, path } of words) {
        const wordCat = getWordCategory(word, wordCategories);
        const isCategory = activeCategory && wordCat === activeCategory;
        allMoves.push({ placedCell: [pr, pc], letter, word, path, score: word.length, isCategory });
      }

      grid[pr][pc] = '';
    }
  }

  if (allMoves.length === 0) return null;

  // Prefer category words, then sort by length descending
  allMoves.sort((a, b) => {
    if (a.isCategory !== b.isCategory) return a.isCategory ? -1 : 1;
    return b.score - a.score;
  });

  const move = allMoves[0];

  // Progressive hints based on level
  // 0: just the category match indicator + word length
  // 1: show the word itself
  // 2: show the word + where to place the letter
  if (hintLevel === 0) {
    return {
      level: 0,
      wordLength: move.word.length,
      isCategory: move.isCategory,
      firstLetter: move.word[0].toUpperCase(),
      move: null,
    };
  } else if (hintLevel === 1) {
    return {
      level: 1,
      word: move.word,
      isCategory: move.isCategory,
      move: null,
    };
  } else {
    return {
      level: 2,
      word: move.word,
      isCategory: move.isCategory,
      move: { placedCell: move.placedCell, letter: move.letter, path: move.path },
    };
  }
}

export { LETTERS, CATEGORY_LABELS };
