import React, { useState, useEffect } from 'react';

export default function WordInfo({ word, category, isCategory, multiplier, player, onClose }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!word) return;
    setLoading(true);
    setError(null);

    fetch(`/api/word-info?word=${encodeURIComponent(word)}&category=${encodeURIComponent(category || '')}`)
      .then(r => {
        if (!r.ok) throw new Error('Server error');
        return r.json();
      })
      .then(data => {
        setInfo(data);
        setLoading(false);
      })
      .catch(err => {
        setError('Нет связи с сервером');
        setLoading(false);
      });
  }, [word, category]);

  if (!word) return null;

  return (
    <div className={`word-info-card ${player === 1 ? 'wi-player' : 'wi-bot'}`}>
      <div className="wi-header">
        <div className="wi-word-row">
          <span className="wi-word">{word.toUpperCase()}</span>
          {isCategory && <span className="wi-cat-badge">⭐ по теме</span>}
          {multiplier > 1 && <span className="wi-mult">×{multiplier}</span>}
        </div>
        <button className="wi-close" onClick={onClose}>✕</button>
      </div>

      {loading && (
        <div className="wi-loading">
          <div className="pixel-spinner small" />
          <span>Загрузка...</span>
        </div>
      )}

      {error && (
        <div className="wi-body">
          <p className="wi-error">{error}</p>
        </div>
      )}

      {info && !loading && (
        <div className="wi-body">
          {info.translation && (
            <p className="wi-translation">🇬🇧 {info.translation}</p>
          )}
          {info.explanation && (
            <p className="wi-definition">{info.explanation}</p>
          )}
          {info.fun_fact && (
            <p className="wi-fact">💡 {info.fun_fact}</p>
          )}
        </div>
      )}
    </div>
  );
}
