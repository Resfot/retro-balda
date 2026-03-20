import React, { useState, useEffect } from 'react';
import { supabase, getPlayerId, getPlayerName, setPlayerName } from './supabase';
import { isTelegram, shareGame, hapticImpact } from './telegram';
import { CATEGORY_LABELS, getAvailableCategories } from './game-logic';

const TIMER_OPTIONS = [
  { id: 30, label: '30с' },
  { id: 60, label: '60с' },
  { id: 90, label: '90с' },
];

const GAME_MODES = [
  { id: 'classic', label: 'Классика', emoji: '🎮' },
  { id: 'bonus', label: 'Бонус ×2', emoji: '⭐' },
  { id: 'mixed', label: 'Микс', emoji: '🔀' },
  { id: 'challenge', label: 'Вызов', emoji: '🔥' },
];

export default function Lobby({ onGameStart, onBack, wordCategories, autoJoinCode, onAutoJoinConsumed }) {
  const [tab, setTab] = useState('main'); // main, create, join, waiting, matchmaking
  const [name, setName] = useState(getPlayerName());
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [roomId, setRoomId] = useState(null);

  // Host settings
  const [gridSize, setGridSize] = useState(5);
  const [turnTime, setTurnTime] = useState(60);
  const [gameMode, setGameMode] = useState('classic');
  const [selectedCategory, setSelectedCategory] = useState(null);

  const playerId = getPlayerId();
  const availableCategories = wordCategories ? getAvailableCategories(wordCategories) : [];
  const hasCategorizedDict = availableCategories.length > 0;

  // Save name on change
  useEffect(() => {
    if (name.trim()) setPlayerName(name.trim());
  }, [name]);

  // Poll for guest joining (when host is waiting)
  useEffect(() => {
    if (tab !== 'waiting' || !roomId) return;

    const channel = supabase
      .channel(`room-${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_rooms',
        filter: `id=eq.${roomId}`,
      }, (payload) => {
        const room = payload.new;
        if (room.guest_id && room.status === 'playing') {
          onGameStart(room, 1); // host is player 1
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tab, roomId]);

  // Create room
  const createRoom = async () => {
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('game_rooms')
        .insert({
          host_id: playerId,
          grid_size: gridSize,
          turn_time: turnTime,
          game_mode: gameMode,
          active_category: (gameMode === 'bonus' || gameMode === 'challenge') ? selectedCategory : null,
          is_public: false,
          status: 'waiting',
        })
        .select()
        .single();

      if (err) throw err;
      setRoomId(data.id);
      setTab('waiting');
    } catch (e) {
      setError('Не удалось создать комнату: ' + e.message);
    }
  };

  // Join room by code
  const joinRoom = async (codeOverride) => {
    setError('');
    const code = (codeOverride || roomCode).trim().toLowerCase();
    if (!code) { setError('Введите код комнаты'); return; }

    try {
      // Find room
      const { data: room, error: err } = await supabase
        .from('game_rooms')
        .select('*')
        .eq('id', code)
        .eq('status', 'waiting')
        .single();

      if (err || !room) { setError('Комната не найдена или уже занята'); return; }
      if (room.host_id === playerId) { setError('Нельзя присоединиться к своей комнате'); return; }

      // Join
      const { error: updateErr } = await supabase
        .from('game_rooms')
        .update({ guest_id: playerId, status: 'playing' })
        .eq('id', code);

      if (updateErr) throw updateErr;

      onGameStart(room, 2); // guest is player 2
    } catch (e) {
      setError('Ошибка: ' + e.message);
    }
  };

  // Auto-join room from Telegram deep link
  useEffect(() => {
    if (autoJoinCode && supabase) {
      setTab('join');
      setRoomCode(autoJoinCode);
      if (onAutoJoinConsumed) onAutoJoinConsumed();
      // Small delay so UI renders, then auto-join
      setTimeout(() => joinRoom(autoJoinCode), 500);
    }
  }, [autoJoinCode]);

  // Quick matchmaking
  const findMatch = async () => {
    setError('');
    setTab('matchmaking');

    try {
      // Look for existing public room
      const { data: rooms } = await supabase
        .from('game_rooms')
        .select('*')
        .eq('status', 'waiting')
        .eq('is_public', true)
        .neq('host_id', playerId)
        .limit(1);

      if (rooms && rooms.length > 0) {
        const room = rooms[0];
        const { error: err } = await supabase
          .from('game_rooms')
          .update({ guest_id: playerId, status: 'playing' })
          .eq('id', room.id);

        if (err) throw err;
        onGameStart(room, 2);
        return;
      }

      // No room found — create a public one and wait
      const { data, error: err } = await supabase
        .from('game_rooms')
        .insert({
          host_id: playerId,
          grid_size: gridSize,
          turn_time: turnTime,
          game_mode: 'classic',
          is_public: true,
          status: 'waiting',
        })
        .select()
        .single();

      if (err) throw err;
      setRoomId(data.id);
      setTab('waiting');
    } catch (e) {
      setError('Ошибка: ' + e.message);
      setTab('main');
    }
  };

  // Cancel waiting
  const cancelWaiting = async () => {
    if (roomId) {
      await supabase.from('game_rooms').delete().eq('id', roomId);
    }
    setRoomId(null);
    setTab('main');
  };

  if (!supabase) {
    return (
      <div className="app menu-screen">
        <div className="game-panel">
          <div className="panel-header">
            <span className="panel-title">Ошибка</span>
            <button className="panel-close" onClick={onBack}>✕</button>
          </div>
          <div className="panel-body">
            <h2>Мультиплеер недоступен</h2>
            <p className="subtitle">Настройте VITE_SUPABASE_URL и VITE_SUPABASE_KEY</p>
            <button className="btn-action" onClick={onBack}>← Назад</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app menu-screen">
      <div className="game-panel">
        <div className="panel-header">
          <span className="panel-title">🎮 Мультиплеер</span>
          <button className="panel-close" onClick={onBack}>✕</button>
        </div>
        <div className="panel-body">
      <div className="menu-container">
        <h1 className="game-title" style={{ fontSize: 32 }}>🎮 ОНЛАЙН</h1>
        <p className="subtitle">Мультиплеер</p>

        {/* Name input */}
        <div className="menu-section">
          <label>Ваше имя</label>
          <input
            className="lobby-input"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={20}
            placeholder="Игрок"
          />
        </div>

        {error && <div className="lobby-error">{error}</div>}

        {/* Main lobby */}
        {tab === 'main' && (
          <>
            <div className="lobby-buttons">
              <button className="lobby-btn lobby-create" onClick={() => setTab('create')}>
                <span className="lobby-btn-emoji">🎮</span>
                <div>
                  <span className="lobby-btn-label">Пригласить друга</span>
                  <span className="lobby-btn-desc">Создайте игру и отправьте ссылку</span>
                </div>
              </button>
              <button className="lobby-btn lobby-join" onClick={() => setTab('join')}>
                <span className="lobby-btn-emoji">🔗</span>
                <div>
                  <span className="lobby-btn-label">Войти по коду</span>
                  <span className="lobby-btn-desc">У вас есть код от друга</span>
                </div>
              </button>
              <button className="lobby-btn lobby-match" onClick={findMatch}>
                <span className="lobby-btn-emoji">🔍</span>
                <div>
                  <span className="lobby-btn-label">Случайный соперник</span>
                  <span className="lobby-btn-desc">Быстрая игра с кем-то онлайн</span>
                </div>
              </button>
            </div>
            <button className="btn-action" onClick={onBack} style={{ marginTop: 20 }}>← Меню</button>
          </>
        )}

        {/* Create room settings */}
        {tab === 'create' && (
          <>
            <div className="menu-section">
              <label>Размер поля</label>
              <div className="btn-group">
                <button className={gridSize === 5 ? 'active' : ''} onClick={() => setGridSize(5)}>5×5</button>
                <button className={gridSize === 7 ? 'active' : ''} onClick={() => setGridSize(7)}>7×7</button>
              </div>
            </div>

            <div className="menu-section">
              <label>Таймер на ход</label>
              <div className="btn-group">
                {TIMER_OPTIONS.map(t => (
                  <button key={t.id} className={turnTime === t.id ? 'active' : ''} onClick={() => setTurnTime(t.id)}>
                    ⏱️ {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="menu-section">
              <label>Режим</label>
              <div className="btn-group" style={{ flexWrap: 'wrap' }}>
                {GAME_MODES.map(m => {
                  const disabled = m.id !== 'classic' && !hasCategorizedDict;
                  return (
                    <button
                      key={m.id}
                      className={`${gameMode === m.id ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                      onClick={() => !disabled && setGameMode(m.id)}
                    >
                      {m.emoji} {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {(gameMode === 'bonus' || gameMode === 'challenge') && hasCategorizedDict && (
              <div className="menu-section">
                <label>Тема</label>
                <div className="category-grid">
                  {availableCategories.slice(0, 12).map(cat => (
                    <button
                      key={cat.id}
                      className={`cat-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(cat.id)}
                    >
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              className="btn-play"
              onClick={createRoom}
              disabled={(gameMode === 'bonus' || gameMode === 'challenge') && !selectedCategory}
            >
              СОЗДАТЬ
            </button>
            <button className="btn-action" onClick={() => setTab('main')} style={{ marginTop: 12 }}>← Назад</button>
          </>
        )}

        {/* Join room */}
        {tab === 'join' && (
          <>
            <div className="menu-section">
              <label>Код комнаты</label>
              <input
                className="lobby-input lobby-code-input"
                type="text"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toLowerCase())}
                maxLength={6}
                placeholder="abc123"
                autoFocus
              />
            </div>
            <button className="btn-play" onClick={joinRoom} disabled={!roomCode.trim()}>
              ВОЙТИ
            </button>
            <button className="btn-action" onClick={() => setTab('main')} style={{ marginTop: 12 }}>← Назад</button>
          </>
        )}

        {/* Waiting for opponent */}
        {tab === 'waiting' && (
          <div className="lobby-waiting">
            <div className="pixel-spinner" />
            <p>Ожидание соперника...</p>
            {roomId && !roomId.startsWith('matchmake') && (
              <div className="room-code-display">
                <label>Код комнаты:</label>
                <span className="room-code">{roomId.toUpperCase()}</span>
                
                {/* Primary action: invite via Telegram */}
                <button className="invite-btn" style={{ marginTop: 12 }} onClick={() => {
                  shareGame(roomId);
                  hapticImpact('medium');
                }}>
                  {isTelegram ? '📨 Пригласить друга' : '📋 Скопировать ссылку'}
                </button>
                
                {/* Secondary: copy code */}
                <button
                  className="btn-action"
                  onClick={() => { 
                    const link = `https://t.me/balda_word_bot?startapp=room_${roomId}`;
                    navigator.clipboard?.writeText(isTelegram ? link : roomId); 
                    hapticImpact('light'); 
                  }}
                  style={{ fontSize: 12, padding: '6px 12px', marginTop: 6 }}
                >
                  {isTelegram ? '🔗 Скопировать ссылку' : '📋 Скопировать код'}
                </button>
              </div>
            )}
            <button className="btn-action" onClick={cancelWaiting} style={{ marginTop: 20 }}>
              Отмена
            </button>
          </div>
        )}

        {/* Matchmaking */}
        {tab === 'matchmaking' && (
          <div className="lobby-waiting">
            <div className="pixel-spinner" />
            <p>Поиск соперника...</p>
            <button className="btn-action" onClick={cancelWaiting} style={{ marginTop: 20 }}>
              Отмена
            </button>
          </div>
        )}
      </div>
        </div>
      </div>
    </div>
  );
}
