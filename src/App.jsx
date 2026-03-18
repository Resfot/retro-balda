import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  createGrid, getRandomStartWord, hasAdjacentFilled, getValidPlacements,
  isPathValid, getWordFromPath, validateMove, isGridFull, findAIMove,
  getNeighbors, LETTERS, CATEGORY_LABELS,
  getAvailableCategories, calculateScore, pickRandomCategory, getWordCategory,
  findHint
} from './game-logic';
import WordInfo from './WordInfo';
import Lobby from './Lobby';
import MultiplayerGame from './MultiplayerGame';

const DIFFICULTIES = [
  { id: 'easy', label: 'Легко', emoji: '😊' },
  { id: 'medium', label: 'Средне', emoji: '😎' },
  { id: 'hard', label: 'Сложно', emoji: '🤖' },
];

const GAME_MODES = [
  { id: 'classic', label: 'Классика', emoji: '🎮', desc: 'Обычные правила' },
  { id: 'bonus', label: 'Бонус', emoji: '⭐', desc: 'Слова по теме ×2' },
  { id: 'mixed', label: 'Микс', emoji: '🔀', desc: 'Тема меняется каждые 2-3 хода' },
  { id: 'challenge', label: 'Вызов', emoji: '🔥', desc: '3 хода на слово по теме' },
];

const CHALLENGE_TURNS = 3;
const CHALLENGE_PENALTY = 3;
const MIXED_ROTATE_MIN = 2;
const MIXED_ROTATE_MAX = 3;

const TIMER_OPTIONS = [
  { id: 0, label: 'Выкл', emoji: '♾️' },
  { id: 30, label: '30с', emoji: '⚡' },
  { id: 60, label: '60с', emoji: '⏱️' },
  { id: 90, label: '90с', emoji: '🐢' },
];

export default function App() {
  const [screen, setScreen] = useState('menu');
  const [dictionary, setDictionary] = useState(null);
  const [dictSet, setDictSet] = useState(null);
  const [wordCategories, setWordCategories] = useState(null);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Game settings
  const [gridSize, setGridSize] = useState(5);
  const [difficulty, setDifficulty] = useState('medium');
  const [gameMode, setGameMode] = useState('classic');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [turnTime, setTurnTime] = useState(0); // 0 = off, seconds

  // Game state
  const [grid, setGrid] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(1);
  const [phase, setPhase] = useState('place');
  const [placedCell, setPlacedCell] = useState(null);
  const [placedLetter, setPlacedLetter] = useState('');
  const [selectedPath, setSelectedPath] = useState([]);
  const [scores, setScores] = useState([0, 0]);
  const [usedWords, setUsedWords] = useState(new Set());
  const [playerWords, setPlayerWords] = useState([[], []]);
  const [message, setMessage] = useState('');
  const [startWord, setStartWord] = useState('');
  const [showLetterPicker, setShowLetterPicker] = useState(false);
  const [pendingCell, setPendingCell] = useState(null);
  const [passCount, setPassCount] = useState(0);
  const [aiPath, setAiPath] = useState([]);
  const [lastMoveHighlight, setLastMoveHighlight] = useState(null);

  // Category mode state
  const [activeCategory, setActiveCategory] = useState(null);
  const [turnsSinceRotate, setTurnsSinceRotate] = useState(0);
  const [nextRotateAt, setNextRotateAt] = useState(0);
  const [challengeCounters, setChallengeCounters] = useState([0, 0]); // turns without category word
  const [lastScoreInfo, setLastScoreInfo] = useState(null); // { multiplier, isCategory }
  const [hint, setHint] = useState(null); // current hint data
  const [hintLevel, setHintLevel] = useState(0); // 0-2 progressive
  const [hintsUsed, setHintsUsed] = useState(0);
  const [showWordInfo, setShowWordInfo] = useState(null);

  // Multiplayer state
  const [multiRoom, setMultiRoom] = useState(null);
  const [multiPlayerNumber, setMultiPlayerNumber] = useState(null);

  // Currency system (Буквы)
  const HINT_COSTS = [1, 2, 3]; // cost per level
  const STARTING_BALANCE = 5;
  const REWARD_CATEGORY_WORD = 1;
  const REWARD_WIN = 3;
  const [currency, setCurrency] = useState(() => {
    try {
      const saved = localStorage.getItem('balda_currency');
      return saved !== null ? Number(saved) : STARTING_BALANCE;
    } catch { return STARTING_BALANCE; }
  });
  const [earnMessage, setEarnMessage] = useState(null); // { text, amount }

  // Timer state
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef(null);

  // Persist currency
  useEffect(() => {
    try { localStorage.setItem('balda_currency', String(currency)); } catch {}
  }, [currency]);

  // Reward for winning
  useEffect(() => {
    if (phase === 'gameOver' && scores[0] > scores[1]) {
      earnCurrency(REWARD_WIN, 'Победа!');
    }
  }, [phase]);

  // Timer — countdown during player's turn
  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (turnTime > 0) setTimeLeft(turnTime);
  }, [turnTime]);

  useEffect(() => {
    // Only tick during player's active turn
    if (turnTime <= 0) return;
    if (currentPlayer !== 1) return;
    if (phase !== 'place' && phase !== 'trace') return;

    setTimeLeft(turnTime);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [currentPlayer, phase === 'place' || phase === 'trace' ? 'active' : 'inactive', turnTime]);

  // Auto-pass when timer hits 0
  const autoPassRef = useRef(null);
  autoPassRef.current = () => {
    if (currentPlayer === 1 && (phase === 'place' || phase === 'trace')) {
      setMessage('⏰ Время вышло!');
      // Undo placement if in trace phase
      if (placedCell) {
        const newGrid = grid.map(r => [...r]);
        newGrid[placedCell[0]][placedCell[1]] = '';
        setGrid(newGrid);
      }
      setPlacedCell(null);
      setPlacedLetter('');
      setSelectedPath([]);
      clearHint();

      let currentScores = scores;
      if (gameMode === 'challenge') {
        const newCounters = [...challengeCounters];
        newCounters[0] += 1;
        if (newCounters[0] >= CHALLENGE_TURNS) {
          currentScores = [...scores];
          currentScores[0] = Math.max(0, currentScores[0] - CHALLENGE_PENALTY);
          newCounters[0] = 0;
        }
        setChallengeCounters(newCounters);
        setScores(currentScores);
      }

      const newPassCount = passCount + 1;
      setPassCount(newPassCount);

      if (newPassCount >= 2) {
        setPhase('gameOver');
        setMessage('Игра окончена! Оба игрока спасовали');
        return;
      }

      const newTurns = turnsSinceRotate + 1;
      setTurnsSinceRotate(newTurns);
      setCurrentPlayer(2);
      setPhase('aiThinking');
      setTimeout(() => runAI(grid.map(r => [...r]), usedWords, currentScores, playerWords, newTurns), 800);
    }
  };

  useEffect(() => {
    if (turnTime > 0 && timeLeft === 0 && currentPlayer === 1 && (phase === 'place' || phase === 'trace')) {
      autoPassRef.current();
    }
  }, [timeLeft]);

  const gridRef = useRef(null);

  // Load dictionary — try categorized first, fallback to flat list
  useEffect(() => {
    let loaded = false;

    // Try categorized dictionary first
    fetch('./dictionary_categorized.json')
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
      .then(data => {
        if (loaded) return;
        loaded = true;
        // Categorized format: { word: category, ... }
        const words = Object.keys(data);
        setDictionary(words);
        setDictSet(new Set(words));
        setWordCategories(data);
        setAvailableCategories(getAvailableCategories(data));
        setLoading(false);
      })
      .catch(() => {
        if (loaded) return;
        // Fallback to flat dictionary
        fetch('./dictionary.json')
          .then(r => r.json())
          .then(words => {
            loaded = true;
            setDictionary(words);
            setDictSet(new Set(words));
            setWordCategories(null);
            setAvailableCategories([]);
            setLoading(false);
          })
          .catch(() => {
            loaded = true;
            const fallback = ['балда', 'слово', 'доска', 'буква', 'очко', 'игра', 'поле', 'ход', 'мяч', 'дом', 'кот', 'сон', 'лес', 'мир'];
            setDictionary(fallback);
            setDictSet(new Set(fallback));
            setLoading(false);
          });
      });
  }, []);

  // Start new game
  const startGame = useCallback(() => {
    if (!dictionary) return;
    const word = getRandomStartWord(dictionary, gridSize);
    const newGrid = createGrid(gridSize, word);
    const initialUsed = new Set([word]);

    // Set up category for the mode
    let cat = null;
    let rotateAt = 0;
    if (gameMode === 'bonus') {
      cat = selectedCategory;
    } else if (gameMode === 'mixed') {
      cat = pickRandomCategory(availableCategories, null);
      rotateAt = MIXED_ROTATE_MIN + Math.floor(Math.random() * (MIXED_ROTATE_MAX - MIXED_ROTATE_MIN + 1));
    } else if (gameMode === 'challenge') {
      cat = selectedCategory;
    }

    setGrid(newGrid);
    setStartWord(word);
    setCurrentPlayer(1);
    setPhase('place');
    setPlacedCell(null);
    setPlacedLetter('');
    setSelectedPath([]);
    setScores([0, 0]);
    setUsedWords(initialUsed);
    setPlayerWords([[], []]);
    setPassCount(0);
    setAiPath([]);
    setLastMoveHighlight(null);
    setActiveCategory(cat);
    setTurnsSinceRotate(0);
    setNextRotateAt(rotateAt);
    setChallengeCounters([0, 0]);
    setLastScoreInfo(null);
    setHint(null);
    setHintLevel(0);
    setHintsUsed(0);
    setShowWordInfo(null);
    setMessage(cat
      ? `Ваш ход! Тема: ${CATEGORY_LABELS[cat] || cat}`
      : 'Ваш ход! Поставьте букву');
    setScreen('game');
  }, [dictionary, gridSize, gameMode, selectedCategory, availableCategories]);

  // Handle cell click
  const handleCellClick = (row, col) => {
    if (phase === 'aiThinking' || phase === 'gameOver') return;

    if (phase === 'place') {
      if (grid[row][col] !== '' || !hasAdjacentFilled(grid, row, col)) return;
      setPendingCell([row, col]);
      setShowLetterPicker(true);
    } else if (phase === 'trace') {
      const idx = selectedPath.findIndex(([r, c]) => r === row && c === col);
      if (idx >= 0) {
        setSelectedPath(selectedPath.slice(0, idx));
      } else {
        if (grid[row][col] === '') return;
        if (selectedPath.length > 0) {
          const last = selectedPath[selectedPath.length - 1];
          const dr = Math.abs(row - last[0]);
          const dc = Math.abs(col - last[1]);
          if (dr + dc !== 1) return;
          if (selectedPath.some(([r, c]) => r === row && c === col)) return;
        }
        setSelectedPath([...selectedPath, [row, col]]);
      }
    }
  };

  const placeLetter = (letter) => {
    if (!pendingCell) return;
    const [row, col] = pendingCell;
    const newGrid = grid.map(r => [...r]);
    newGrid[row][col] = letter;
    setGrid(newGrid);
    setPlacedCell([row, col]);
    setPlacedLetter(letter);
    setPhase('trace');
    setSelectedPath([]);
    setShowLetterPicker(false);
    setPendingCell(null);
    setMessage('Составьте слово, нажимая на буквы');
  };

  const cancelPlace = () => {
    setShowLetterPicker(false);
    setPendingCell(null);
  };

  // Hint system
  const requestHint = () => {
    if (phase !== 'place' && phase !== 'trace') return;

    const nextLevel = hint ? Math.min(hintLevel + 1, 2) : 0;
    const cost = HINT_COSTS[nextLevel];

    if (currency < cost) {
      setMessage(`Не хватает Букв! Нужно ${cost}, у вас ${currency}`);
      return;
    }

    const currentGrid = grid.map(r => [...r]);
    if (placedCell) {
      currentGrid[placedCell[0]][placedCell[1]] = '';
    }

    const h = findHint(currentGrid, usedWords, dictSet, wordCategories, activeCategory, nextLevel);

    if (!h) {
      setMessage('Подсказок нет — нет доступных ходов!');
      return;
    }

    setCurrency(prev => prev - cost);
    setHint(h);
    setHintLevel(nextLevel);
    if (nextLevel === 0) setHintsUsed(prev => prev + 1);
  };

  const clearHint = () => {
    setHint(null);
    setHintLevel(0);
  };

  // Currency earn helper
  const earnCurrency = (amount, reason) => {
    setCurrency(prev => prev + amount);
    setEarnMessage({ text: reason, amount });
    setTimeout(() => setEarnMessage(null), 2500);
  };

  // Handle mixed mode category rotation
  const maybeRotateCategory = (totalTurns) => {
    if (gameMode !== 'mixed') return null;
    if (totalTurns >= nextRotateAt) {
      const newCat = pickRandomCategory(availableCategories, activeCategory);
      const newRotateAt = totalTurns + MIXED_ROTATE_MIN + Math.floor(Math.random() * (MIXED_ROTATE_MAX - MIXED_ROTATE_MIN + 1));
      setActiveCategory(newCat);
      setNextRotateAt(newRotateAt);
      setTurnsSinceRotate(0);
      return newCat;
    }
    return null;
  };

  // Handle challenge mode penalty check
  const checkChallengePenalty = (playerIdx, playedCategoryWord, currentScores) => {
    if (gameMode !== 'challenge') return currentScores;

    const newCounters = [...challengeCounters];
    const newScores = [...currentScores];

    if (playedCategoryWord) {
      newCounters[playerIdx] = 0;
    } else {
      newCounters[playerIdx] += 1;
      if (newCounters[playerIdx] >= CHALLENGE_TURNS) {
        newScores[playerIdx] = Math.max(0, newScores[playerIdx] - CHALLENGE_PENALTY);
        newCounters[playerIdx] = 0;
      }
    }

    setChallengeCounters(newCounters);
    return newScores;
  };

  // Submit word
  const submitWord = () => {
    if (phase !== 'trace' || selectedPath.length < 2) {
      setMessage('Выберите минимум 2 буквы');
      return;
    }

    const result = validateMove(grid, selectedPath, placedCell, usedWords, dictSet);
    if (!result.valid) {
      setMessage(result.reason);
      return;
    }

    // Calculate score with category multiplier
    const scoreInfo = calculateScore(result.word, wordCategories, gameMode, activeCategory);
    const newScores = [...scores];
    newScores[0] += scoreInfo.score;

    // Check challenge penalty
    const finalScores = checkChallengePenalty(0, scoreInfo.isCategory, newScores);

    const newPlayerWords = [playerWords[0].slice(), playerWords[1].slice()];
    newPlayerWords[0].push({
      word: result.word,
      score: scoreInfo.score,
      isCategory: scoreInfo.isCategory,
      multiplier: scoreInfo.multiplier,
    });
    const newUsed = new Set(usedWords);
    newUsed.add(result.word);

    setScores(finalScores);
    setPlayerWords(newPlayerWords);
    setUsedWords(newUsed);
    setPassCount(0);
    setLastMoveHighlight({ path: selectedPath.map(p => [...p]), player: 1 });
    setSelectedPath([]);
    setPlacedCell(null);
    setLastScoreInfo(scoreInfo);
    clearHint();
    setShowWordInfo({
      word: result.word,
      category: getWordCategory(result.word, wordCategories),
      isCategory: scoreInfo.isCategory,
      multiplier: scoreInfo.multiplier,
      player: 1,
    });
    let msg = `"${result.word}" — ${scoreInfo.score} очков`;
    if (scoreInfo.multiplier > 1) msg += ` (×${scoreInfo.multiplier}!)`;
    else if (scoreInfo.multiplier < 1) msg += ` (не по теме)`;
    setMessage(msg);

    // Reward for category word
    if (scoreInfo.isCategory && gameMode !== 'classic') {
      earnCurrency(REWARD_CATEGORY_WORD, 'Слово по теме!');
    }

    const newTurns = turnsSinceRotate + 1;
    setTurnsSinceRotate(newTurns);

    if (isGridFull(grid)) {
      setPhase('gameOver');
      return;
    }

    setCurrentPlayer(2);
    setPhase('aiThinking');
    setTimeout(() => runAI(grid, newUsed, finalScores, newPlayerWords, newTurns), 800);
  };

  const undoPlace = () => {
    if (!placedCell) return;
    const newGrid = grid.map(r => [...r]);
    newGrid[placedCell[0]][placedCell[1]] = '';
    setGrid(newGrid);
    setPlacedCell(null);
    setPlacedLetter('');
    setSelectedPath([]);
    setPhase('place');
    setMessage(activeCategory
      ? `Ваш ход! Тема: ${CATEGORY_LABELS[activeCategory] || activeCategory}`
      : 'Ваш ход! Поставьте букву');
  };

  const passTurn = () => {
    if (placedCell) {
      const newGrid = grid.map(r => [...r]);
      newGrid[placedCell[0]][placedCell[1]] = '';
      setGrid(newGrid);
    }
    setPlacedCell(null);
    setPlacedLetter('');
    setSelectedPath([]);

    // Challenge mode: passing still counts as a turn without category word
    let currentScores = scores;
    if (gameMode === 'challenge') {
      currentScores = checkChallengePenalty(0, false, scores);
      setScores(currentScores);
    }

    const newPassCount = passCount + 1;
    setPassCount(newPassCount);

    if (newPassCount >= 2) {
      setPhase('gameOver');
      setMessage('Игра окончена! Оба игрока спасовали');
      return;
    }

    const newTurns = turnsSinceRotate + 1;
    setTurnsSinceRotate(newTurns);

    setMessage('Вы спасовали. Ход бота...');
    setCurrentPlayer(2);
    setPhase('aiThinking');
    setTimeout(() => runAI(grid.map(r => [...r]), usedWords, currentScores, playerWords, newTurns), 800);
  };

  // AI Turn
  const runAI = (currentGrid, currentUsed, currentScores, currentPlayerWords, totalTurns) => {
    // Maybe rotate category in mixed mode
    let cat = activeCategory;
    const rotated = maybeRotateCategory(totalTurns);
    if (rotated) cat = rotated;

    const move = findAIMove(
      currentGrid.map(r => [...r]),
      currentUsed,
      dictSet,
      difficulty,
      wordCategories,
      gameMode,
      cat
    );

    if (!move) {
      const newPassCount = passCount + 1;
      if (newPassCount >= 2) {
        setPhase('gameOver');
        setMessage('Игра окончена! Бот спасовал');
      } else {
        // Challenge penalty for AI passing
        let aiScores = currentScores;
        if (gameMode === 'challenge') {
          aiScores = checkChallengePenalty(1, false, currentScores);
          setScores(aiScores);
        }
        setPassCount(newPassCount);
        setCurrentPlayer(1);
        setPhase('place');
        setMessage(cat
          ? `Бот спасовал. Ваш ход! Тема: ${CATEGORY_LABELS[cat] || cat}`
          : 'Бот спасовал. Ваш ход!');
      }
      return;
    }

    const newGrid = currentGrid.map(r => [...r]);
    newGrid[move.placedCell[0]][move.placedCell[1]] = move.letter;

    const scoreInfo = calculateScore(move.word, wordCategories, gameMode, cat);
    const newScores = [...currentScores];
    newScores[1] += scoreInfo.score;

    // Challenge penalty for AI
    const finalScores = checkChallengePenalty(1, scoreInfo.isCategory, newScores);

    const newPlayerWords = [currentPlayerWords[0].slice(), currentPlayerWords[1].slice()];
    newPlayerWords[1].push({
      word: move.word,
      score: scoreInfo.score,
      isCategory: scoreInfo.isCategory,
      multiplier: scoreInfo.multiplier,
    });
    const newUsed = new Set(currentUsed);
    newUsed.add(move.word);

    setGrid(newGrid);
    setScores(finalScores);
    setPlayerWords(newPlayerWords);
    setUsedWords(newUsed);
    setPassCount(0);
    setLastMoveHighlight({ path: move.path, player: 2 });
    setAiPath(move.path);

    let msg = `Бот: "${move.word}" — ${scoreInfo.score} очков`;
    if (scoreInfo.multiplier > 1) msg += ` (×${scoreInfo.multiplier}!)`;
    else if (scoreInfo.multiplier < 1) msg += ` (не по теме)`;
    setMessage(msg);
    setLastScoreInfo(scoreInfo);
    setShowWordInfo({
      word: move.word,
      category: getWordCategory(move.word, wordCategories),
      isCategory: scoreInfo.isCategory,
      multiplier: scoreInfo.multiplier,
      player: 2,
    });

    if (isGridFull(newGrid) || getValidPlacements(newGrid).length === 0) {
      setPhase('gameOver');
      return;
    }

    setTimeout(() => {
      setAiPath([]);
      setCurrentPlayer(1);
      setPhase('place');

      // Rotate category in mixed mode after AI turn too
      const newTurns = totalTurns + 1;
      setTurnsSinceRotate(newTurns);
      const rotated2 = maybeRotateCategory(newTurns);
      const finalCat = rotated2 || cat;

      if (finalCat && rotated2) {
        setMessage(`Новая тема: ${CATEGORY_LABELS[finalCat] || finalCat}! Ваш ход!`);
      } else if (finalCat) {
        setMessage(`Ваш ход! Тема: ${CATEGORY_LABELS[finalCat] || finalCat}`);
      } else {
        setMessage('Ваш ход! Поставьте букву');
      }
    }, 1500);
  };

  // Cell state helpers
  const getCellState = (row, col) => {
    if (placedCell && placedCell[0] === row && placedCell[1] === col) return 'placed';
    if (selectedPath.some(([r, c]) => r === row && c === col)) return 'selected';
    if (aiPath.some(([r, c]) => r === row && c === col)) return 'ai-highlight';
    if (hint?.level === 2 && hint.move) {
      if (hint.move.placedCell[0] === row && hint.move.placedCell[1] === col) return 'hint-place';
      if (hint.move.path.some(([r, c]) => r === row && c === col)) return 'hint-path';
    }
    if (lastMoveHighlight?.path.some(([r, c]) => r === row && c === col)) {
      return lastMoveHighlight.player === 1 ? 'last-p1' : 'last-p2';
    }
    if (grid[row][col] !== '') return 'filled';
    if (phase === 'place' && hasAdjacentFilled(grid, row, col)) return 'valid-place';
    return 'empty';
  };

  const currentTracedWord = phase === 'trace' && selectedPath.length > 0
    ? getWordFromPath(grid, selectedPath)
    : '';

  // Check if category modes are available
  const hasCategorizedDict = availableCategories.length > 0;

  // --- RENDER ---

  if (loading) {
    return (
      <div className="app loading-screen">
        <div className="window xp-window">
          <div className="title-bar">
            <div className="title-bar-text">БАЛДА.exe — Загрузка</div>
          </div>
          <div className="window-body">
            <div className="loader">
              <div className="pixel-spinner" />
              <p>Загрузка словаря...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'menu') {
    return (
      <div className="app menu-screen">
        <div className="window xp-window">
          <div className="title-bar">
            <div className="title-bar-text">БАЛДА.exe — Главное меню</div>
            <div className="title-bar-controls">
              <button aria-label="Minimize"></button>
              <button aria-label="Maximize"></button>
              <button aria-label="Close"></button>
            </div>
          </div>
          <div className="window-body">
            <div className="menu-container">
          <h1 className="game-title">БАЛДА</h1>
          <p className="subtitle">Ретро-издание</p>

          <div className="menu-section">
            <label>Размер поля</label>
            <div className="btn-group">
              <button className={gridSize === 5 ? 'active' : ''} onClick={() => setGridSize(5)}>5×5</button>
              <button className={gridSize === 7 ? 'active' : ''} onClick={() => setGridSize(7)}>7×7</button>
            </div>
          </div>

          <div className="menu-section">
            <label>Сложность</label>
            <div className="btn-group">
              {DIFFICULTIES.map(d => (
                <button key={d.id} className={difficulty === d.id ? 'active' : ''} onClick={() => setDifficulty(d.id)}>
                  {d.emoji} {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="menu-section">
            <label>Таймер на ход</label>
            <div className="btn-group">
              {TIMER_OPTIONS.map(t => (
                <button key={t.id} className={turnTime === t.id ? 'active' : ''} onClick={() => setTurnTime(t.id)}>
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="menu-section">
            <label>Режим игры</label>
            <div className="mode-grid">
              {GAME_MODES.map(m => {
                const disabled = m.id !== 'classic' && !hasCategorizedDict;
                return (
                  <button
                    key={m.id}
                    className={`mode-btn ${gameMode === m.id ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                    onClick={() => !disabled && setGameMode(m.id)}
                    title={disabled ? 'Загрузите dictionary_categorized.json для этого режима' : m.desc}
                  >
                    <span className="mode-emoji">{m.emoji}</span>
                    <span className="mode-label">{m.label}</span>
                    <span className="mode-desc">{disabled ? '🔒' : m.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category picker for bonus/challenge modes */}
          {(gameMode === 'bonus' || gameMode === 'challenge') && hasCategorizedDict && (
            <div className="menu-section">
              <label>Выберите тему {gameMode === 'bonus' ? '(×2 очков)' : '(вызов)'}</label>
              <div className="category-grid">
                {availableCategories.map(cat => (
                  <button
                    key={cat.id}
                    className={`cat-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat.id)}
                  >
                    <span>{cat.label}</span>
                    <span className="cat-count">{cat.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {gameMode === 'mixed' && hasCategorizedDict && (
            <div className="mode-info">
              🔀 Тема будет меняться каждые {MIXED_ROTATE_MIN}–{MIXED_ROTATE_MAX} хода. Слова по теме = полные очки, остальные = половина.
            </div>
          )}

          <button
            className="btn-play"
            onClick={startGame}
            disabled={(gameMode === 'bonus' || gameMode === 'challenge') && !selectedCategory}
          >
            ИГРАТЬ
          </button>

          <button
            className="btn-play btn-multiplayer"
            onClick={() => setScreen('lobby')}
          >
            🌐 ОНЛАЙН
          </button>

          <div className="rules">
            <h3>Правила:</h3>
            <p>1. Поставьте букву рядом с существующей</p>
            <p>2. Составьте слово, проходя по соседним клеткам</p>
            <p>3. Слово должно содержать новую букву</p>
            <p>4. Слова не повторяются</p>
            <p>5. Побеждает тот, кто набрал больше очков</p>
            {gameMode === 'bonus' && <p className="rule-bonus">⭐ Бонус: слова по теме дают ×2 очков!</p>}
            {gameMode === 'mixed' && <p className="rule-bonus">🔀 Микс: тема меняется, слова не по теме = ½ очков</p>}
            {gameMode === 'challenge' && <p className="rule-bonus">🔥 Вызов: {CHALLENGE_TURNS} хода без слова по теме = −{CHALLENGE_PENALTY} очков!</p>}
          </div>
        </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'game' && grid) {
    const isGameOver = phase === 'gameOver';

    return (
      <div className="app game-screen">
        <div className="window xp-window">
          <div className="title-bar">
            <div className="title-bar-text">БАЛДА.exe — Игра</div>
            <div className="title-bar-controls">
              <button aria-label="Minimize"></button>
              <button aria-label="Maximize"></button>
              <button aria-label="Close" onClick={() => setScreen('menu')}></button>
            </div>
          </div>
          <div className="window-body">
        {/* Active category indicator */}
        {activeCategory && gameMode !== 'classic' && (
          <div className={`category-bar mode-${gameMode}`}>
            <span className="cat-mode-label">
              {gameMode === 'bonus' && '⭐'}
              {gameMode === 'mixed' && '🔀'}
              {gameMode === 'challenge' && '🔥'}
            </span>
            <span className="cat-active-name">{CATEGORY_LABELS[activeCategory] || activeCategory}</span>
            {gameMode === 'challenge' && (
              <span className="challenge-counters">
                <span className="cc-you" title="Ваши ходы без темы">Вы: {challengeCounters[0]}/{CHALLENGE_TURNS}</span>
                <span className="cc-bot" title="Ходы бота без темы">Бот: {challengeCounters[1]}/{CHALLENGE_TURNS}</span>
              </span>
            )}
            {gameMode === 'bonus' && <span className="bonus-label">×2</span>}
            {gameMode === 'mixed' && <span className="bonus-label">×½ если не по теме</span>}
          </div>
        )}

        {/* Score Bar */}
        <div className="score-bar">
          <div className={`player-score ${currentPlayer === 1 && !isGameOver ? 'active' : ''}`}>
            <span className="player-label">Вы</span>
            <span className="score-value">{scores[0]}</span>
          </div>
          <div className="vs">VS</div>
          <div className={`player-score p2 ${currentPlayer === 2 && !isGameOver ? 'active' : ''}`}>
            <span className="player-label">Бот</span>
            <span className="score-value">{scores[1]}</span>
          </div>
        </div>

        {/* Currency */}
        <div className="currency-bar">
          <span className="currency-icon">🅱</span>
          <span className="currency-amount">{currency}</span>
          <span className="currency-label">Букв</span>
          {earnMessage && (
            <span className="currency-earn" key={Date.now()}>
              +{earnMessage.amount} {earnMessage.text}
            </span>
          )}
        </div>

        {/* Message */}
        <div className={`message-bar ${phase === 'aiThinking' ? 'thinking' : ''}`}>
          {message}
          {currentTracedWord && <span className="traced-word"> → {currentTracedWord}</span>}
          {turnTime > 0 && currentPlayer === 1 && (phase === 'place' || phase === 'trace') && (
            <span className={`timer-badge ${timeLeft <= 10 ? 'timer-danger' : timeLeft <= 20 ? 'timer-warn' : ''}`}>
              ⏱️ {timeLeft}с
            </span>
          )}
        </div>

        {/* Grid */}
        <div className="grid-container" ref={gridRef} style={{ '--grid-size': gridSize }}>
          <div className="grid">
            {grid.map((row, ri) => row.map((cell, ci) => {
              const state = getCellState(ri, ci);
              return (
                <button
                  key={`${ri}-${ci}`}
                  className={`cell cell-${state}`}
                  onClick={() => handleCellClick(ri, ci)}
                  disabled={phase === 'aiThinking' || phase === 'gameOver'}
                >
                  {cell.toUpperCase()}
                </button>
              );
            }))}
          </div>
        </div>

        {/* Action buttons */}
        {!isGameOver && (
          <div className="actions">
            {phase === 'trace' && (
              <>
                <button className="btn-action btn-undo" onClick={undoPlace}>↩ Отмена</button>
                <button
                  className="btn-action btn-hint"
                  onClick={requestHint}
                  disabled={currency < HINT_COSTS[hint ? Math.min(hintLevel + 1, 2) : 0]}
                >
                  💡 {HINT_COSTS[hint ? Math.min(hintLevel + 1, 2) : 0]}🅱
                </button>
                <button className="btn-action btn-submit" onClick={submitWord} disabled={selectedPath.length < 2}>✓ Слово</button>
              </>
            )}
            {phase === 'place' && (
              <>
                <button
                  className="btn-action btn-hint"
                  onClick={requestHint}
                  disabled={currency < HINT_COSTS[0]}
                >
                  💡 {HINT_COSTS[0]}🅱
                </button>
                <button className="btn-action btn-pass" onClick={passTurn}>Пас</button>
              </>
            )}
            {phase === 'aiThinking' && (
              <div className="ai-thinking">
                <div className="pixel-spinner small" />
                <span>Бот думает...</span>
              </div>
            )}
          </div>
        )}

        {/* Hint Panel */}
        {hint && (
          <div className={`hint-panel ${hint.isCategory ? 'hint-cat' : ''}`}>
            <div className="hint-header">
              <span>💡 Подсказка {hint.level + 1}/3</span>
              <button className="hint-close" onClick={clearHint}>✕</button>
            </div>
            <div className="hint-body">
              {hint.level === 0 && (
                <p>
                  Есть слово на <strong>«{hint.firstLetter}»</strong>, {hint.wordLength} букв
                  {hint.isCategory && <span className="hint-cat-badge">⭐ по теме!</span>}
                </p>
              )}
              {hint.level === 1 && (
                <p>
                  Слово: <strong className="hint-word">{hint.word.toUpperCase()}</strong>
                  {hint.isCategory && <span className="hint-cat-badge">⭐ по теме!</span>}
                </p>
              )}
              {hint.level === 2 && (
                <p>
                  Слово: <strong className="hint-word">{hint.word.toUpperCase()}</strong>
                  {' — '}поставьте <strong>«{hint.move.letter.toUpperCase()}»</strong> в подсвеченную клетку
                  {hint.isCategory && <span className="hint-cat-badge">⭐ по теме!</span>}
                </p>
              )}
              {hint.level < 2 && (
                <button
                  className="btn-action btn-hint-more"
                  onClick={requestHint}
                  disabled={currency < HINT_COSTS[Math.min(hintLevel + 1, 2)]}
                >
                  Ещё подсказку → {HINT_COSTS[Math.min(hintLevel + 1, 2)]}🅱
                </button>
              )}
            </div>
          </div>
        )}

        {/* Game Over */}
        {isGameOver && (
          <div className="game-over">
            <h2>
              {scores[0] > scores[1] ? '🎉 Вы победили!' :
                scores[0] < scores[1] ? '🤖 Бот победил!' : '🤝 Ничья!'}
            </h2>
            <p>{scores[0]} : {scores[1]}</p>
            <div className="game-over-actions">
              <button className="btn-play" onClick={startGame}>Ещё раз</button>
              <button className="btn-action" onClick={() => setScreen('menu')}>Меню</button>
            </div>
          </div>
        )}

        {/* Word Info Card */}
        {showWordInfo && (
          <WordInfo
            word={showWordInfo.word}
            category={showWordInfo.category}
            isCategory={showWordInfo.isCategory}
            multiplier={showWordInfo.multiplier}
            player={showWordInfo.player}
            onClose={() => setShowWordInfo(null)}
          />
        )}

        {/* Used words */}
        <div className="words-section">
          <div className="words-col">
            <h4>Ваши слова:</h4>
            <div className="word-list">
              {playerWords[0].length === 0 ? <span className="empty-list">—</span> :
                playerWords[0].map((w, i) => (
                  <span
                    key={i}
                    className={`word-tag p1 clickable ${w.isCategory ? 'cat-word' : ''}`}
                    onClick={() => setShowWordInfo({
                      word: w.word, category: getWordCategory(w.word, wordCategories),
                      isCategory: w.isCategory, multiplier: w.multiplier, player: 1,
                    })}
                  >
                    {w.word} (+{w.score}{w.multiplier > 1 ? '⭐' : ''})
                  </span>
                ))}
            </div>
          </div>
          <div className="words-col">
            <h4>Слова бота:</h4>
            <div className="word-list">
              {playerWords[1].length === 0 ? <span className="empty-list">—</span> :
                playerWords[1].map((w, i) => (
                  <span
                    key={i}
                    className={`word-tag p2 clickable ${w.isCategory ? 'cat-word' : ''}`}
                    onClick={() => setShowWordInfo({
                      word: w.word, category: getWordCategory(w.word, wordCategories),
                      isCategory: w.isCategory, multiplier: w.multiplier, player: 2,
                    })}
                  >
                    {w.word} (+{w.score}{w.multiplier > 1 ? '⭐' : ''})
                  </span>
                ))}
            </div>
          </div>
        </div>

        {/* Letter Picker Modal */}
        {showLetterPicker && (
          <div className="modal-overlay" onClick={cancelPlace}>
            <div className="letter-picker" onClick={e => e.stopPropagation()}>
              <h3>Выберите букву</h3>
              <div className="letter-grid">
                {LETTERS.split('').map(l => (
                  <button key={l} className="letter-btn" onClick={() => placeLetter(l)}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
              <button className="btn-action btn-cancel" onClick={cancelPlace}>Отмена</button>
            </div>
          </div>
        )}
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'lobby') {
    return (
      <Lobby
        onGameStart={(room, playerNum) => {
          setMultiRoom(room);
          setMultiPlayerNumber(playerNum);
          setScreen('multiplayer');
        }}
        onBack={() => setScreen('menu')}
        wordCategories={wordCategories}
      />
    );
  }

  if (screen === 'multiplayer' && multiRoom) {
    return (
      <MultiplayerGame
        room={multiRoom}
        playerNumber={multiPlayerNumber}
        dictionary={dictionary}
        dictSet={dictSet}
        wordCategories={wordCategories}
        availableCategories={availableCategories}
        onExit={() => {
          setMultiRoom(null);
          setMultiPlayerNumber(null);
          setScreen('lobby');
        }}
      />
    );
  }

  return null;
}
