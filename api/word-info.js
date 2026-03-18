import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const MODEL = 'claude-haiku-4-5-20251001';

async function callClaude(word) {
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
      messages: [
        {
          role: 'user',
          content: `Дай краткую информацию о русском слове "${word}". Ответь ТОЛЬКО в формате JSON без markdown:
{
  "definition": "краткое определение слова (1 предложение, max 15 слов)",
  "fun_fact": "интересный факт, этимология, или необычное использование этого слова (1-2 предложения, max 30 слов)",
  "frequency": "common|intermediate|advanced|rare"
}

Частотность: common = топ-3000 слов, intermediate = 3000-10000, advanced = 10000-30000, rare = остальные.
Факт должен быть познавательным и увлекательным — этимология, история, связь с другими языками, необычные значения.`,
        },
      ],
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

  text = text.trim();
  if (text.startsWith('```')) text = text.split('\n').slice(1).join('\n');
  if (text.endsWith('```')) text = text.slice(0, -3);
  return JSON.parse(text.trim());
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
