// Telegram Bot Webhook Handler
// Handles /start, /help, /invite commands

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MINI_APP_URL = 'https://retro-balda.vercel.app';

async function sendMessage(chatId, text, replyMarkup) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getPlayButton(startParam) {
  const url = startParam
    ? `${MINI_APP_URL}?startapp=${startParam}`
    : MINI_APP_URL;

  return {
    inline_keyboard: [[
      {
        text: '🎮 Играть в БАЛДУ',
        web_app: { url },
      },
    ]],
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  try {
    const update = req.body;
    const message = update?.message;

    if (!message) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text || '';
    const firstName = message.from?.first_name || 'Друг';

    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const param = parts[1] || '';

      if (param.startsWith('ref_')) {
        // Referral deep link
        const referrerId = param.substring(4);
        await sendMessage(
          chatId,
          `👋 Привет, ${firstName}!\n\n🅱 <b>БАЛДА</b> — русская игра в слова!\n\n🎁 Тебя пригласил друг — ты получишь <b>+5 Букв</b> после первой игры!\n\n📖 Ставь буквы на поле, составляй слова, набирай очки\n🤖 Играй против бота или друзей\n🎯 21 тематическая категория\n💡 Узнавай значения слов\n\nНажми кнопку и начинай!`,
          getPlayButton(param)
        );
      } else if (param.startsWith('room_')) {
        // Room invite deep link
        await sendMessage(
          chatId,
          `👋 Привет, ${firstName}!\n\n🅱 Тебя пригласили сыграть в <b>БАЛДУ</b>!\n\n🎮 Нажми кнопку чтобы сразу войти в игру с другом!`,
          getPlayButton(param)
        );
      } else {
        // Plain /start
        await sendMessage(
          chatId,
          `👋 Привет, ${firstName}!\n\n🅱 <b>БАЛДА</b> — русская игра в слова!\n\n📖 Ставь буквы на поле, составляй слова, набирай очки\n🤖 Играй против бота или друзей\n🎯 21 тематическая категория\n💡 Узнавай значения слов\n\nНажми кнопку и начинай!`,
          getPlayButton()
        );
      }
    } else if (text === '/help') {
      await sendMessage(
        chatId,
        `📖 <b>Правила БАЛДЫ</b>\n\n1️⃣ На поле 5×5 клеток. В центре — случайное слово\n2️⃣ По очереди добавляй букву в пустую клетку рядом с уже заполненными\n3️⃣ Новая буква должна образовать новое слово\n4️⃣ Слово можно читать в любом направлении (→ ← ↑ ↓)\n5️⃣ Нельзя использовать уже сыгранные слова\n6️⃣ Побеждает тот, кто набрал больше очков\n\n💡 Буквы — игровая валюта для подсказок и бонусов\n🎯 Категории слов дают бонусные очки\n\n/start — начать игру\n/invite — пригласить друга`
      );
    } else if (text === '/invite') {
      const playerId = message.from?.id;
      const inviteLink = `https://t.me/balda_word_bot?start=ref_tg_${playerId}`;
      await sendMessage(
        chatId,
        `📨 <b>Пригласи друга в БАЛДУ!</b>\n\nТвоя ссылка:\n<code>${inviteLink}</code>\n\n🎁 Ты получишь <b>+5 Букв</b> когда друг сыграет первую игру!`
      );
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Bot webhook error:', err);
    res.status(200).json({ ok: true });
  }
}
