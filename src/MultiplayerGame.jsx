import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, getPlayerId } from './supabase';
import {
  createGrid, getRandomStartWord, hasAdjacentFilled, getValidPlacements,
  isPathValid, getWordFromPath, validateMove, isGridFull,
  getNeighbors, LETTERS, CATEGORY_LABELS,
  calculateScore, pickRandomCategory, getWordCategory, findHint,
  getAvailableCategories
} from './game-logic';
import WordInfo from './WordInfo';

const CHALLENGE_TURNS = 3;
const CHALLENGE_PENALTY = 3;
const MIXED_ROTATE_MIN = 2;
const MIXED_ROTATE_MAX = 3;

const HINT_COSTS = [1, 2, 3];

export default function MultiplayerGame({ room: initialRoom, playerNumber, dictionary, dictSet, wordCategories, availableCategories, onExit }) {
  const playerId = getPlayerId();
  const myNumber = playerNumber; // 1 or 2
  const opponentNumber = myNumber === 1 ? 2 : 1;

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
  const [showLetterPicker, setShowLetterPicker] = useState(false);
  const [pendingCell, setPendingCell] = useState(null);
  const [passCount, setPassCount] = useState(0);
  const [lastMoveHighlight, setLastMoveHighlight] = useState(null);

  // Settings from room
  const [gridSize] = useState(initialRoom.grid_size || 5);
  const [turnTime] = useState(initialRoom.turn_time || 60);
  const [gameMode] = useState(initialRoom.game_mode || 'classic');
  const [activeCategory, setActiveCategory] = useState(initialRoom.active_category || null);
  const [turnsSinceRotate, setTurnsSinceRotate] = useState(0);
  const [nextRotateAt, setNextRotateAt] = useState(0);
  const [challengeCounters, setChallengeCounters] = useState([0, 0]);

  // UI state
  const [showWordInfo, setShowWordInfo] = useState(null);
  const [hint, setHint] = useState(null);
  const [hintLevel, setHintLevel] = useState(0);

  // Timer
  const [timeLeft, setTimeLeft] = useState(turnTime);
  const timerRef = useRef(null);

  // Currency
  const [currency, setCurrency] = useState(() => {
    try { return Number(localStorage.getItem('balda_currency')) || 5; } catch { return 5; }
  });
  const [earnMessage, setEarnMessage] = useState(null);
  useEffect(() => {
    try { localStorage.setItem('balda_currency', String(currency)); } catch {}
  }, [currency]);

  const earnCurrency = (amount, reason) => {
    setCurrency(prev => prev + amount);
    setEarnMessage({ text: reason, amount });
    setTimeout(() => setEarnMessage(null), 2500);
  };

  const isMyTurn = currentPlayer === myNumber;
  const isGameOver = phase === 'gameOver';
  const roomId = initialRoom.id;

  // Initialize game (host creates the board)
  useEffect(() => {
    if (myNumber === 1) {
      // Host initializes
      const word = getRandomStartWord(dictionary, gridSize);
      const newGrid = createGrid(gridSize, word);

      let cat = activeCategory;
      let rotateAt = 0;
      if (gameMode === 'mixed') {
        cat = pickRandomCategory(availableCategories, null);
        rotateAt = MIXED_ROTATE_MIN + Math.floor(Math.random() * (MIXED_ROTATE_MAX - MIXED_ROTATE_MIN + 1));
        setActiveCategory(cat);
        setNextRotateAt(rotateAt);
      }

      setGrid(newGrid);
      setMessage('Ваш ход!');

      // Save initial state to Supabase
      supabase.from('game_rooms').update({
        grid: newGrid,
        start_word: word,
        current_player: 1,
        phase: 'place',
        scores: [0, 0],
        used_words: [word],
        player_words: [[], []],
        active_category: cat,
        last_move: { type: 'init', grid: newGrid, word, category: cat, rotate_at: rotateAt },
      }).eq('id', roomId);

      setUsedWords(new Set([word]));
    }
  }, []);

  // Subscribe to room changes
  useEffect(() => {
    const channel = supabase
      .channel(`game-${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_rooms',
        filter: `id=eq.${roomId}`,
      }, (payload) => {
        const room = payload.new;
        handleRoomUpdate(room);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  const handleRoomUpdate = (room) => {
    const move = room.last_move;
    if (!move) return;

    if (move.type === 'init' && myNumber === 2) {
      // Guest receives initial state
      setGrid(move.grid);
      setUsedWords(new Set(room.used_words || []));
      if (move.category) setActiveCategory(move.category);
      if (move.rotate_at) setNextRotateAt(move.rotate_at);
      setMessage('Ход соперника...');
      setCurrentPlayer(1);
      setPhase('place');
    }

    if (move.type === 'word' && move.player !== myNumber) {
      // Opponent played a word
      setGrid(move.grid);
      setScores(room.scores);
      setPlayerWords(room.player_words);
      setUsedWords(new Set(room.used_words));
      setCurrentPlayer(myNumber);
      setPhase('place');
      setPassCount(0);
      setLastMoveHighlight({ path: move.path, player: move.player });
      setShowWordInfo({
        word: move.word,
        category: getWordCategory(move.word, wordCategories),
        isCategory: move.isCategory,
        multiplier: move.multiplier,
        player: move.player,
      });
      if (move.active_category) setActiveCategory(move.active_category);
      if (move.challenge_counters) setChallengeCounters(move.challenge_counters);
      setMessage(`Соперник: "${move.word}" — ${move.score} очков. Ваш ход!`);
      setTimeout(() => setLastMoveHighlight(null), 2000);
    }

    if (move.type === 'pass' && move.player !== myNumber) {
      setPassCount(prev => {
        const newCount = prev + 1;
        if (newCount >= 2) {
          setPhase('gameOver');
          setMessage('Игра окончена! Оба игрока спасовали');
        } else {
          setCurrentPlayer(myNumber);
          setPhase('place');
          setMessage('Соперник спасовал. Ваш ход!');
        }
        return newCount;
      });
      if (room.scores) setScores(room.scores);
      if (move.challenge_counters) setChallengeCounters(move.challenge_counters);
    }

    if (move.type === 'timeout' && move.player !== myNumber) {
      setPassCount(prev => {
        const newCount = prev + 1;
        if (newCount >= 2) {
          setPhase('gameOver');
          setMessage('Игра окончена!');
        } else {
          setCurrentPlayer(myNumber);
          setPhase('place');
          setMessage('⏰ У соперника вышло время. Ваш ход!');
        }
        return newCount;
      });
      if (room.scores) setScores(room.scores);
    }

    if (room.status === 'finished') {
      setPhase('gameOver');
      setScores(room.scores);
    }
  };

  // Timer
  useEffect(() => {
    if (turnTime <= 0 || !isMyTurn || isGameOver) return;
    if (phase !== 'place' && phase !== 'trace') return;

    setTimeLeft(turnTime);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isMyTurn, phase, turnTime]);

  // Auto-pass on timeout
  useEffect(() => {
    if (turnTime > 0 && timeLeft === 0 && isMyTurn && (phase === 'place' || phase === 'trace')) {
      handleTimeout();
    }
  }, [timeLeft]);

  const handleTimeout = async () => {
    setMessage('⏰ Время вышло!');
    if (placedCell) {
      const newGrid = grid.map(r => [...r]);
      newGrid[placedCell[0]][placedCell[1]] = '';
      setGrid(newGrid);
    }
    setPlacedCell(null);
    setPlacedLetter('');
    setSelectedPath([]);

    const newPassCount = passCount + 1;
    setPassCount(newPassCount);

    if (newPassCount >= 2) {
      setPhase('gameOver');
      await supabase.from('game_rooms').update({
        status: 'finished',
        scores,
        last_move: { type: 'timeout', player: myNumber },
      }).eq('id', roomId);
      return;
    }

    setCurrentPlayer(opponentNumber);
    setPhase('waiting');
    setMessage('Ход соперника...');

    await supabase.from('game_rooms').update({
      current_player: opponentNumber,
      phase: 'place',
      last_move: { type: 'timeout', player: myNumber },
    }).eq('id', roomId);
  };

  // Cell click
  const handleCellClick = (row, col) => {
    if (!isMyTurn || isGameOver) return;

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
          if (Math.abs(row - last[0]) + Math.abs(col - last[1]) !== 1) return;
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
    setMessage('Составьте слово');
  };

  const cancelPlace = () => {
    setShowLetterPicker(false);
    setPendingCell(null);
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
    setMessage('Ваш ход!');
  };

  // Submit word
  const submitWord = async () => {
    if (phase !== 'trace' || selectedPath.length < 2) {
      setMessage('Выберите минимум 2 буквы');
      return;
    }

    const result = validateMove(grid, selectedPath, placedCell, usedWords, dictSet);
    if (!result.valid) {
      setMessage(result.reason);
      return;
    }

    const scoreInfo = calculateScore(result.word, wordCategories, gameMode, activeCategory);
    const newScores = [...scores];
    newScores[myNumber - 1] += scoreInfo.score;

    // Challenge penalty
    let finalScores = newScores;
    const newCounters = [...challengeCounters];
    if (gameMode === 'challenge') {
      if (scoreInfo.isCategory) {
        newCounters[myNumber - 1] = 0;
      } else {
        newCounters[myNumber - 1] += 1;
        if (newCounters[myNumber - 1] >= CHALLENGE_TURNS) {
          finalScores = [...newScores];
          finalScores[myNumber - 1] = Math.max(0, finalScores[myNumber - 1] - CHALLENGE_PENALTY);
          newCounters[myNumber - 1] = 0;
        }
      }
      setChallengeCounters(newCounters);
    }

    const newPlayerWords = [playerWords[0].slice(), playerWords[1].slice()];
    newPlayerWords[myNumber - 1].push({
      word: result.word,
      score: scoreInfo.score,
      isCategory: scoreInfo.isCategory,
      multiplier: scoreInfo.multiplier,
    });
    const newUsed = new Set(usedWords);
    newUsed.add(result.word);

    // Category rotation for mixed mode
    let newCategory = activeCategory;
    const newTurns = turnsSinceRotate + 1;
    if (gameMode === 'mixed' && newTurns >= nextRotateAt) {
      newCategory = pickRandomCategory(availableCategories, activeCategory);
      setActiveCategory(newCategory);
      setNextRotateAt(newTurns + MIXED_ROTATE_MIN + Math.floor(Math.random() * (MIXED_ROTATE_MAX - MIXED_ROTATE_MIN + 1)));
    }
    setTurnsSinceRotate(newTurns);

    setScores(finalScores);
    setPlayerWords(newPlayerWords);
    setUsedWords(newUsed);
    setPassCount(0);
    setLastMoveHighlight({ path: selectedPath.map(p => [...p]), player: myNumber });
    setSelectedPath([]);
    setPlacedCell(null);

    setShowWordInfo({
      word: result.word,
      category: getWordCategory(result.word, wordCategories),
      isCategory: scoreInfo.isCategory,
      multiplier: scoreInfo.multiplier,
      player: myNumber,
    });

    if (scoreInfo.isCategory && gameMode !== 'classic') {
      earnCurrency(1, 'Слово по теме!');
    }

    // Check game over
    const gameOver = isGridFull(grid) || getValidPlacements(grid).length === 0;

    setCurrentPlayer(opponentNumber);
    setPhase(gameOver ? 'gameOver' : 'waiting');
    setMessage(gameOver ? 'Игра окончена!' : 'Ход соперника...');

    // Sync to Supabase
    await supabase.from('game_rooms').update({
      grid,
      current_player: gameOver ? null : opponentNumber,
      phase: gameOver ? 'gameOver' : 'place',
      scores: finalScores,
      used_words: Array.from(newUsed),
      player_words: newPlayerWords,
      active_category: newCategory,
      status: gameOver ? 'finished' : 'playing',
      last_move: {
        type: 'word',
        player: myNumber,
        word: result.word,
        score: scoreInfo.score,
        isCategory: scoreInfo.isCategory,
        multiplier: scoreInfo.multiplier,
        path: selectedPath.map(p => [...p]),
        grid,
        active_category: newCategory,
        challenge_counters: newCounters,
      },
    }).eq('id', roomId);
  };

  const passTurn = async () => {
    if (placedCell) {
      const newGrid = grid.map(r => [...r]);
      newGrid[placedCell[0]][placedCell[1]] = '';
      setGrid(newGrid);
    }
    setPlacedCell(null);
    setPlacedLetter('');
    setSelectedPath([]);

    let currentScores = scores;
    const newCounters = [...challengeCounters];
    if (gameMode === 'challenge') {
      newCounters[myNumber - 1] += 1;
      if (newCounters[myNumber - 1] >= CHALLENGE_TURNS) {
        currentScores = [...scores];
        currentScores[myNumber - 1] = Math.max(0, currentScores[myNumber - 1] - CHALLENGE_PENALTY);
        newCounters[myNumber - 1] = 0;
        setScores(currentScores);
      }
      setChallengeCounters(newCounters);
    }

    const newPassCount = passCount + 1;
    setPassCount(newPassCount);

    if (newPassCount >= 2) {
      setPhase('gameOver');
      setMessage('Игра окончена! Оба спасовали');
      await supabase.from('game_rooms').update({
        status: 'finished',
        scores: currentScores,
        last_move: { type: 'pass', player: myNumber, challenge_counters: newCounters },
      }).eq('id', roomId);
      return;
    }

    setCurrentPlayer(opponentNumber);
    setPhase('waiting');
    setMessage('Вы спасовали. Ход соперника...');

    await supabase.from('game_rooms').update({
      current_player: opponentNumber,
      phase: 'place',
      scores: currentScores,
      last_move: { type: 'pass', player: myNumber, challenge_counters: newCounters },
    }).eq('id', roomId);
  };

  // Hints
  const requestHint = () => {
    if (!isMyTurn || (phase !== 'place' && phase !== 'trace')) return;
    const nextLevel = hint ? Math.min(hintLevel + 1, 2) : 0;
    const cost = HINT_COSTS[nextLevel];
    if (currency < cost) { setMessage(`Не хватает Букв! Нужно ${cost}`); return; }

    const currentGrid = grid.map(r => [...r]);
    if (placedCell) currentGrid[placedCell[0]][placedCell[1]] = '';

    const h = findHint(currentGrid, usedWords, dictSet, wordCategories, activeCategory, nextLevel);
    if (!h) { setMessage('Подсказок нет!'); return; }

    setCurrency(prev => prev - cost);
    setHint(h);
    setHintLevel(nextLevel);
  };

  const clearHint = () => { setHint(null); setHintLevel(0); };

  // Cell state
  const getCellState = (row, col) => {
    if (placedCell && placedCell[0] === row && placedCell[1] === col) return 'placed';
    if (selectedPath.some(([r, c]) => r === row && c === col)) return 'selected';
    if (hint?.level === 2 && hint.move) {
      if (hint.move.placedCell[0] === row && hint.move.placedCell[1] === col) return 'hint-place';
      if (hint.move.path.some(([r, c]) => r === row && c === col)) return 'hint-path';
    }
    if (lastMoveHighlight?.path.some(([r, c]) => r === row && c === col)) {
      return lastMoveHighlight.player === myNumber ? 'last-p1' : 'last-p2';
    }
    if (grid[row][col] !== '') return 'filled';
    if (isMyTurn && phase === 'place' && hasAdjacentFilled(grid, row, col)) return 'valid-place';
    return 'empty';
  };

  const currentTracedWord = phase === 'trace' && selectedPath.length > 0
    ? getWordFromPath(grid, selectedPath) : '';

  // Win reward
  useEffect(() => {
    if (phase === 'gameOver' && scores[myNumber - 1] > scores[opponentNumber - 1]) {
      earnCurrency(3, 'Победа!');
    }
  }, [phase]);

  if (!grid) {
    return (
      <div className="app loading-screen">
        <div className="game-panel">
          <div className="panel-header">
            <span className="panel-title">Подключение...</span>
          </div>
          <div className="panel-body">
            <div className="loader">
              <div className="pixel-spinner" />
              <p>Подключение...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app game-screen">
      <div className="game-panel">
        <div className="panel-header">
          <span className="panel-title">БАЛДА — Онлайн</span>
          <button className="panel-close" onClick={onExit}>✕</button>
        </div>
        <div className="panel-body">
      {/* Category bar */}
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
              <span className="cc-you">Вы: {challengeCounters[myNumber - 1]}/{CHALLENGE_TURNS}</span>
              <span className="cc-bot">Они: {challengeCounters[opponentNumber - 1]}/{CHALLENGE_TURNS}</span>
            </span>
          )}
        </div>
      )}

      {/* Score bar */}
      <div className="score-bar">
        <div className={`player-score ${isMyTurn && !isGameOver ? 'active' : ''}`}>
          <span className="player-label">Вы (П{myNumber})</span>
          <span className="score-value">{scores[myNumber - 1]}</span>
        </div>
        <div className="vs">VS</div>
        <div className={`player-score p2 ${!isMyTurn && !isGameOver ? 'active' : ''}`}>
          <span className="player-label">Соперник</span>
          <span className="score-value">{scores[opponentNumber - 1]}</span>
        </div>
      </div>

      {/* Currency */}
      <div className="currency-bar">
        <span className="currency-icon">🅱</span>
        <span className="currency-amount">{currency}</span>
        <span className="currency-label">Букв</span>
        {earnMessage && (
          <span className="currency-earn" key={Date.now()}>+{earnMessage.amount} {earnMessage.text}</span>
        )}
      </div>

      {/* Message + Timer */}
      <div className={`message-bar ${!isMyTurn && !isGameOver ? 'thinking' : ''}`}>
        {message}
        {currentTracedWord && <span className="traced-word"> → {currentTracedWord}</span>}
        {turnTime > 0 && isMyTurn && (phase === 'place' || phase === 'trace') && (
          <span className={`timer-badge ${timeLeft <= 10 ? 'timer-danger' : timeLeft <= 20 ? 'timer-warn' : ''}`}>
            ⏱️ {timeLeft}с
          </span>
        )}
      </div>

      {/* Grid */}
      <div className="grid-container" style={{ '--grid-size': gridSize }}>
        <div className="grid">
          {grid.map((row, ri) => row.map((cell, ci) => (
            <button
              key={`${ri}-${ci}`}
              className={`cell cell-${getCellState(ri, ci)}`}
              onClick={() => handleCellClick(ri, ci)}
              disabled={!isMyTurn || isGameOver}
            >
              {cell.toUpperCase()}
            </button>
          )))}
        </div>
      </div>

      {/* Actions */}
      {!isGameOver && isMyTurn && (
        <div className="actions">
          {phase === 'trace' && (
            <>
              <button className="btn-action btn-undo" onClick={undoPlace}>↩</button>
              <button
                className="btn-action btn-hint"
                onClick={requestHint}
                disabled={currency < HINT_COSTS[hint ? Math.min(hintLevel + 1, 2) : 0]}
              >
                💡 {HINT_COSTS[hint ? Math.min(hintLevel + 1, 2) : 0]}🅱
              </button>
              <button className="btn-action btn-submit" onClick={submitWord} disabled={selectedPath.length < 2}>✓</button>
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
        </div>
      )}

      {!isGameOver && !isMyTurn && (
        <div className="actions">
          <div className="ai-thinking">
            <div className="pixel-spinner small" />
            <span>Ход соперника...</span>
          </div>
        </div>
      )}

      {/* Hint panel */}
      {hint && (
        <div className={`hint-panel ${hint.isCategory ? 'hint-cat' : ''}`}>
          <div className="hint-header">
            <span>💡 {hint.level + 1}/3</span>
            <button className="hint-close" onClick={clearHint}>✕</button>
          </div>
          <div className="hint-body">
            {hint.level === 0 && <p>Слово на <strong>«{hint.firstLetter}»</strong>, {hint.wordLength} букв{hint.isCategory && <span className="hint-cat-badge">⭐</span>}</p>}
            {hint.level === 1 && <p><strong className="hint-word">{hint.word.toUpperCase()}</strong>{hint.isCategory && <span className="hint-cat-badge">⭐</span>}</p>}
            {hint.level === 2 && <p><strong className="hint-word">{hint.word.toUpperCase()}</strong> — «{hint.move.letter.toUpperCase()}» в клетку{hint.isCategory && <span className="hint-cat-badge">⭐</span>}</p>}
            {hint.level < 2 && (
              <button className="btn-action btn-hint-more" onClick={requestHint} disabled={currency < HINT_COSTS[Math.min(hintLevel + 1, 2)]}>
                Ещё → {HINT_COSTS[Math.min(hintLevel + 1, 2)]}🅱
              </button>
            )}
          </div>
        </div>
      )}

      {/* Game over */}
      {isGameOver && (
        <div className="game-over">
          <h2>
            {scores[myNumber - 1] > scores[opponentNumber - 1] ? '🎉 Вы победили!' :
              scores[myNumber - 1] < scores[opponentNumber - 1] ? '😞 Соперник победил' : '🤝 Ничья!'}
          </h2>
          <p>{scores[myNumber - 1]} : {scores[opponentNumber - 1]}</p>
          <div className="game-over-actions">
            <button className="btn-play" onClick={onExit}>Лобби</button>
          </div>
        </div>
      )}

      {/* Word info */}
      {showWordInfo && (
        <WordInfo
          word={showWordInfo.word}
          category={showWordInfo.category}
          isCategory={showWordInfo.isCategory}
          multiplier={showWordInfo.multiplier}
          player={showWordInfo.player === myNumber ? 1 : 2}
          onClose={() => setShowWordInfo(null)}
        />
      )}

      {/* Words */}
      <div className="words-section">
        <div className="words-col">
          <h4>Ваши слова:</h4>
          <div className="word-list">
            {playerWords[myNumber - 1].length === 0 ? <span className="empty-list">—</span> :
              playerWords[myNumber - 1].map((w, i) => (
                <span key={i} className={`word-tag p1 clickable ${w.isCategory ? 'cat-word' : ''}`}
                  onClick={() => setShowWordInfo({ word: w.word, category: getWordCategory(w.word, wordCategories), isCategory: w.isCategory, multiplier: w.multiplier, player: myNumber })}>
                  {w.word} (+{w.score}{w.multiplier > 1 ? '⭐' : ''})
                </span>
              ))}
          </div>
        </div>
        <div className="words-col">
          <h4>Соперник:</h4>
          <div className="word-list">
            {playerWords[opponentNumber - 1].length === 0 ? <span className="empty-list">—</span> :
              playerWords[opponentNumber - 1].map((w, i) => (
                <span key={i} className={`word-tag p2 clickable ${w.isCategory ? 'cat-word' : ''}`}
                  onClick={() => setShowWordInfo({ word: w.word, category: getWordCategory(w.word, wordCategories), isCategory: w.isCategory, multiplier: w.multiplier, player: opponentNumber })}>
                  {w.word} (+{w.score}{w.multiplier > 1 ? '⭐' : ''})
                </span>
              ))}
          </div>
        </div>
      </div>

      {/* Letter picker */}
      {showLetterPicker && (
        <div className="modal-overlay" onClick={cancelPlace}>
          <div className="letter-picker" onClick={e => e.stopPropagation()}>
            <h3>Выберите букву</h3>
            <div className="letter-grid">
              {LETTERS.split('').map(l => (
                <button key={l} className="letter-btn" onClick={() => placeLetter(l)}>{l.toUpperCase()}</button>
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
