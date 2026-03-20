// One-time webhook registration helper.
// Call GET /api/setup-webhook?secret=YOUR_BOT_TOKEN to register the webhook.
// After the webhook is set, this endpoint is no longer needed.

const WEBHOOK_URL = 'https://retro-balda.vercel.app/api/bot';

export default async function handler(req, res) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

  if (!BOT_TOKEN) {
    return res.status(500).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN env var not set in Vercel' });
  }

  // Simple protection: require the token as a query param to prevent accidental calls
  const { secret } = req.query;
  if (secret !== BOT_TOKEN) {
    return res.status(403).json({ ok: false, error: 'Wrong secret' });
  }

  try {
    // First, get current webhook info
    const infoRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    const info = await infoRes.json();

    // Set the webhook
    const setRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: WEBHOOK_URL,
          allowed_updates: ['message'],
          drop_pending_updates: true,
        }),
      }
    );
    const setData = await setRes.json();

    return res.json({
      previous_webhook: info.result?.url || '(none)',
      new_webhook: WEBHOOK_URL,
      result: setData,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
