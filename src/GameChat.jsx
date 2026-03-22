import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sendChatMessage, subscribeToChatMessages } from './supabase';

const QUICK_REACTIONS = [
  'Удачи!',
  'Ого!',
  'GG',
  'Хорошее слово!',
  'Ну ты даёшь!',
];

const RATE_LIMIT_MS = 2000;

export default function GameChat({ roomId, playerId, playerName, opponentName }) {
  const [messages, setMessages] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [inputText, setInputText] = useState('');
  const lastSentRef = useRef(0);
  const messagesEndRef = useRef(null);
  const seenIdsRef = useRef(new Set());
  const isExpandedRef = useRef(false);

  useEffect(() => { isExpandedRef.current = isExpanded; }, [isExpanded]);

  // Subscribe to chat messages
  useEffect(() => {
    const cleanup = subscribeToChatMessages(roomId, (msg) => {
      // Deduplicate
      if (seenIdsRef.current.has(msg.id)) return;
      seenIdsRef.current.add(msg.id);

      setMessages(prev => [...prev, msg]);

      // Increment unread if collapsed and message is from opponent
      if (!isExpandedRef.current && msg.player_id !== playerId) {
        setUnreadCount(prev => prev + 1);
      }
    });

    return cleanup;
  }, [roomId, playerId]);

  // Auto-scroll when new messages arrive or panel expands
  useEffect(() => {
    if (isExpanded && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isExpanded]);

  // Clear unread when expanding
  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => {
      if (!prev) setUnreadCount(0);
      return !prev;
    });
  }, []);

  const doSend = useCallback(async (text, type = 'text') => {
    const now = Date.now();
    if (now - lastSentRef.current < RATE_LIMIT_MS) return;
    if (!text.trim()) return;

    lastSentRef.current = now;

    // Optimistic add
    const optimistic = {
      id: 'local-' + now,
      room_id: roomId,
      player_id: playerId,
      player_name: playerName,
      message: text.trim().slice(0, 200),
      type,
      created_at: new Date().toISOString(),
    };
    seenIdsRef.current.add(optimistic.id);
    setMessages(prev => [...prev, optimistic]);

    await sendChatMessage(roomId, playerId, playerName, text.trim(), type);
  }, [roomId, playerId, playerName]);

  const handleSend = useCallback(() => {
    if (!inputText.trim()) return;
    doSend(inputText, 'text');
    setInputText('');
  }, [inputText, doSend]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  return (
    <div className="game-chat">
      {/* Collapsed bar */}
      <div className="chat-bar" onClick={toggleExpanded}>
        <span className="chat-bar-icon">{isExpanded ? '▼' : '▲'} 💬</span>
        <span className="chat-bar-preview">
          {latestMessage
            ? `${latestMessage.player_id === playerId ? 'Вы' : opponentName}: ${latestMessage.message}`
            : 'Чат'
          }
        </span>
        {unreadCount > 0 && (
          <span className="chat-unread-badge">{unreadCount}</span>
        )}
      </div>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="chat-panel">
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">Напишите первое сообщение!</div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-msg ${msg.player_id === playerId ? 'chat-msg-mine' : 'chat-msg-theirs'} ${msg.type === 'reaction' ? 'chat-msg-reaction' : ''}`}
              >
                <span className="chat-msg-name">
                  {msg.player_id === playerId ? 'Вы' : opponentName}
                </span>
                <span className="chat-msg-text">{msg.message}</span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick reactions */}
          <div className="chat-reactions">
            {QUICK_REACTIONS.map((r) => (
              <button
                key={r}
                className="chat-reaction-btn"
                onClick={() => doSend(r, 'reaction')}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Text input */}
          <div className="chat-input-row">
            <input
              className="chat-input"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value.slice(0, 200))}
              onKeyDown={handleKeyDown}
              placeholder="Сообщение..."
              maxLength={200}
            />
            <button className="chat-send-btn" onClick={handleSend} disabled={!inputText.trim()}>
              ➤
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
