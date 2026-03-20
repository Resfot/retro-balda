import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const MODEL = 'claude-haiku-4-5-20251001';

async function callClaude(word) {
  const prompt = `Ты — эксперт по русскому языку и этимологии. Пользователь играет в игру "Балда" и составил слово.

Дай информацию о слове "${word}".

СТРОГИЕ ПРАВИЛА:
1. ОПРЕДЕЛЕНИЕ: Дай краткое, точное определение (1-2 предложения). Без воды. Если слово имеет несколько значений — дай самое распространённое.

2. ИНТЕРЕСНЫЙ ФАКТ: Один реальный, проверяемый факт. Это ДОЛЖЕН быть:
   - Этимология (откуда пришло слово, из какого языка, как менялось значение)
   - Или удивительная связь с другими словами (родственные слова в других языках, неочевидные однокоренные)
   - Или реальный исторический/научный факт, связанный с этим словом/понятием
   - Или необычное применение/рекорд/статистика из реальной жизни

   ЗАПРЕЩЕНО:
   - Выдумывать факты. Если не уверен — лучше дай этимологию, она всегда интересна.
   - Банальности вроде "это слово часто используется в быту"
   - Общие фразы вроде "играет важную роль в культуре"
   - Повторять определение другими словами

3. ЧАСТОТНОСТЬ: Одно слово — "Частое", "Среднее" или "Редкое"

Ответь строго в JSON:
{"definition": "...", "fun_fact": "...", "frequency": "Частое|Среднее|Редкое"}

Только JSON, без маркдауна, без комментариев.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API ${response.status}`);
  }

  const data = await response.json();
  let text = '';
  for (const block of data.content || []) {
    if (block.type === 'text') text += block.text;
  }

  // Strip markdown code fences (handles ```json ... ``` and plain ``` ... ```)
  text = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }

  return {
    definition: parsed.definition || '',
    fun_fact:   parsed.fun_fact   || '',
    frequency:  parsed.frequency  || 'Среднее',
  };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const word = (req.query.word || '').toLowerCase().trim();
  if (!word) return res.status(400).json({ error: 'Missing word' });

  const category = req.query.category || '';

  try {
    // Check Supabase cache
    const { data: cached } = await supabase
      .from('word_info')
      .select('*')
      .eq('word', word)
      .single();

    if (cached) {
      return res.json({ ...cached, source: 'cache' });
    }

    // Call Claude
    const info = await callClaude(word);

    // Save to Supabase
    await supabase.from('word_info').upsert({
      word,
      category,
      definition: info.definition || '',
      fun_fact: info.fun_fact || '',
      frequency: info.frequency || 'unknown',
    });

    return res.json({
      word,
      category,
      definition: info.definition,
      fun_fact: info.fun_fact,
      frequency: info.frequency,
      source: 'api',
    });
  } catch (err) {
    console.error(`Error for "${word}":`, err.message);
    return res.status(500).json({ error: 'Failed to get word info' });
  }
}
