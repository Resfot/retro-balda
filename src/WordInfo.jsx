import React, { useState, useEffect } from 'react';

const FREQ_LABELS = {
  common: { label: 'Частое', emoji: '🟢', desc: 'Топ-3000 слов' },
  intermediate: { label: 'Среднее', emoji: '🟡', desc: 'Топ-10000 слов' },
  advanced: { label: 'Продвинутое', emoji: '🟠', desc: 'Топ-30000 слов' },
  rare: { label: 'Редкое', emoji: '🔴', desc: 'Редко используется' },
  unknown: { label: '—', emoji: '⚪', desc: '' },
};

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

  const freq = info ? FREQ_LABELS[info.frequency] || FREQ_LABELS.unknown : FREQ_LABELS.unknown;

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
          {info.definition && (
            <p className="wi-definition">{info.definition}</p>
          )}
          {info.fun_fact && (
            <p className="wi-fact">💡 {info.fun_fact}</p>
          )}
          <div className="wi-meta">
            <span className="wi-freq" title={freq.desc}>
              {freq.emoji} {freq.label}
            </span>
            {info.source === 'api' && <span className="wi-new">новое!</span>}
          </div>
        </div>
      )}
    </div>
  );
}
