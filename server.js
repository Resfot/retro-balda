import express from 'express';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Config ---
const PORT = 3001;
const API_KEY = process.env.CLAUDE_API_KEY || '';
const MODEL = 'claude-haiku-4-5-20251001';

if (!API_KEY) {
  console.error('\n⚠️  Set CLAUDE_API_KEY environment variable!');
  console.error('   PowerShell:  $env:CLAUDE_API_KEY="sk-ant-..."');
  console.error('   Then run:    npm run server\n');
  process.exit(1);
}

// --- SQLite ---
const db = new Database(join(__dirname, 'word_cache.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS word_info (
    word TEXT PRIMARY KEY,
    category TEXT,
    translation TEXT,
    explanation TEXT,
    fun_fact TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

const getWord = db.prepare('SELECT * FROM word_info WHERE word = ?');
const insertWord = db.prepare(`
  INSERT OR REPLACE INTO word_info (word, category, translation, explanation, fun_fact)
  VALUES (?, ?, ?, ?, ?)
`);
const getStats = db.prepare('SELECT COUNT(*) as total FROM word_info');

console.log(`📚 Word cache: ${getStats.get().total} words stored`);

// --- Claude API helper ---
async function callClaude(word) {
  const payload = JSON.stringify({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `Ты — эксперт по русскому языку и этимологии. Пользователь играет в игру "Балда" и составил слово.

Дай информацию о слове "${word}".

СТРОГИЕ ПРАВИЛА:
1. ПЕРЕВОД: Перевод слова на английский. Одно-два слова, без пояснений.
2. ОБЪЯСНЕНИЕ: Краткое объяснение на русском, 1-2 предложения максимум. Без воды.
3. ИНТЕРЕСНЫЙ ФАКТ: Один реальный, проверяемый факт — этимология, связь с другими языками, исторический/научный факт, или необычное применение. Не выдумывай. Не повторяй объяснение.

Ответь строго в JSON:
{"translation": "...", "explanation": "...", "fun_fact": "..."}

Только JSON, без маркдауна, без комментариев.`
      }
    ]
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: payload,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  let text = '';
  for (const block of data.content || []) {
    if (block.type === 'text') text += block.text;
  }

  // Clean and parse JSON
  text = text.trim();
  if (text.startsWith('```')) text = text.split('\n').slice(1).join('\n');
  if (text.endsWith('```')) text = text.slice(0, -3);
  text = text.trim();

  return JSON.parse(text);
}

// --- Express ---
const app = express();
app.use(express.json());

// Get word info (cache-first)
app.get('/api/word-info', async (req, res) => {
  const word = (req.query.word || '').toLowerCase().trim();
  if (!word) return res.status(400).json({ error: 'Missing word parameter' });

  // Check cache first
  const cached = getWord.get(word);
  if (cached) {
    return res.json({ ...cached, source: 'cache' });
  }

  // Call Claude API
  try {
    const info = await callClaude(word);
    const category = req.query.category || '';

    insertWord.run(
      word,
      category,
      info.translation || '',
      info.explanation || '',
      info.fun_fact || ''
    );

    console.log(`✨ New word: "${word}"`);

    res.json({
      word,
      category,
      translation: info.translation,
      explanation: info.explanation,
      fun_fact: info.fun_fact,
      source: 'api',
    });
  } catch (err) {
    console.error(`❌ Error for "${word}":`, err.message);
    res.status(500).json({ error: 'Failed to get word info', details: err.message });
  }
});

// Batch lookup (for pre-warming cache)
app.post('/api/word-info/batch', async (req, res) => {
  const words = req.body.words || [];
  const results = {};
  const toFetch = [];

  for (const w of words) {
    const cached = getWord.get(w.word || w);
    if (cached) {
      results[cached.word] = { ...cached, source: 'cache' };
    } else {
      toFetch.push(w);
    }
  }

  // Fetch missing words sequentially (to avoid rate limits)
  for (const w of toFetch) {
    const word = w.word || w;
    const category = w.category || '';
    try {
      const info = await callClaude(word);
      insertWord.run(word, category, info.translation || '', info.explanation || '', info.fun_fact || '');
      results[word] = { word, category, translation: info.translation, explanation: info.explanation, fun_fact: info.fun_fact, source: 'api' };
      console.log(`✨ Batch: "${word}"`);
    } catch (err) {
      console.error(`❌ Batch error "${word}":`, err.message);
      results[word] = { word, error: err.message };
    }
  }

  res.json({ results, cached: words.length - toFetch.length, fetched: toFetch.length });
});

// Stats
app.get('/api/stats', (req, res) => {
  const total = getStats.get().total;
  const byCat = db.prepare('SELECT category, COUNT(*) as count FROM word_info GROUP BY category ORDER BY count DESC').all();
  res.json({ total, byCategory: byCat });
});

app.listen(PORT, () => {
  console.log(`\n🎮 БАЛДА Word Server running on http://localhost:${PORT}`);
  console.log(`   Cache: ${getStats.get().total} words`);
  console.log(`   Model: ${MODEL}\n`);
});
