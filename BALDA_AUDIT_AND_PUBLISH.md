# БАЛДА — Audit & Prepare for Telegram Apps Center

## Context

БАЛДА is a Russian word game (React 18 + Vite 5) deployed as a Telegram Mini App.
- **Repo:** https://github.com/Resfot/retro-balda  
- **Live:** https://retro-balda.vercel.app/
- **Bot:** @balda_word_bot
- **Hosting:** Vercel (frontend + serverless functions)
- **DB:** Supabase (multiplayer rooms, word cache, referrals, user stats)

The game WORKS and is deployed. The goal now is to prepare it for submission to the Telegram Apps Center catalog (@app_moderation_bot).

---

## STEP 1: Clone and Audit

Clone the repo and check what files actually exist:

```bash
git clone https://github.com/Resfot/retro-balda.git
cd retro-balda
```

### Expected file structure (complete project):

```
retro-balda/
├── index.html                       ← Must have Telegram SDK script
├── package.json                     ← React 18, Supabase. Must NOT have xp.css
├── vercel.json                      ← Build config + API rewrites
├── vite.config.js                   ← Dev proxy for /api
├── server.js                        ← Local dev server (Express + SQLite)
├── .gitignore                       ← node_modules, dist, .env, *.db
├── api/
│   ├── word-info.js                 ← Serverless: Claude API word definitions + Supabase cache
│   └── bot.js                       ← NEW: Telegram bot webhook handler
├── src/
│   ├── main.jsx                     ← Entry point, imports App.css, calls initTelegram()
│   ├── App.jsx                      ← Main game (~1100 lines). Imports: telegram.js, referral.js, supabase.js
│   ├── App.css                      ← Flash/Miniclip theme (Fredoka + Rubik fonts, dark blue gradient)
│   ├── game-logic.js                ← Game engine, AI, hints, category scoring
│   ├── WordInfo.jsx                 ← Word definition display component
│   ├── Lobby.jsx                    ← Multiplayer lobby. Must accept autoJoinCode prop
│   ├── MultiplayerGame.jsx          ← Multiplayer game with Supabase Realtime
│   ├── supabase.js                  ← Supabase client, uses getPlayerIdTG() from telegram.js
│   ├── telegram.js                  ← Telegram WebApp SDK wrapper (haptics, share, deep links)
│   └── referral.js                  ← Friend invite reward system (Supabase tracking)
└── public/
    ├── dictionary.json              ← Flat word list (~37K words)
    ├── dictionary_categorized.json  ← Categorized dict (~48K words, 24 categories, 219 slang)
    └── privacy.html                 ← NEW: Privacy policy page (required for catalog)
```

### Check each file exists. Report what's MISSING or OUTDATED.

Common issues from prior deploys:
- `src/referral.js` was missing (caused build failure: "Could not resolve ./referral")
- `src/telegram.js` may be an older version without `getRoomCodeFromStart()` and `shareGame()`
- `api/bot.js` likely doesn't exist yet (NEW file needed)
- `public/privacy.html` likely doesn't exist yet (NEW file needed)
- `vercel.json` may be missing the `/api/bot` rewrite
- `package.json` may still list `xp.css` as dependency (must be removed)
- `main.jsx` may still import `xp.css` (must not)

---

## STEP 2: Fix Missing / Broken Files

### 2A: If `api/bot.js` is MISSING — create it

This is the Telegram bot webhook handler. It must:
- Respond to `/start` with a welcome message + "🎮 Играть в БАЛДУ" inline button (web_app type)
- Parse start parameters: `ref_XXXX` (referral) and `room_XXXX` (multiplayer room invite)  
- Respond to `/help` with game rules
- Respond to `/invite` with the user's personal referral link
- Use `process.env.TELEGRAM_BOT_TOKEN` for the bot token
- The Mini App URL is `https://retro-balda.vercel.app`

The welcome message for plain `/start` should be in Russian:
```
👋 Привет, {firstName}!

🅱 БАЛДА — русская игра в слова!

📖 Ставь буквы на поле, составляй слова, набирай очки
🤖 Играй против бота или друзей
🎯 21 тематическая категория
💡 Узнавай значения слов

Нажми кнопку и начинай!
```

For `ref_` starts: mention the +5 Букв bonus.
For `room_` starts: mention they were invited to play.

The inline button must use `web_app: { url: "https://retro-balda.vercel.app" }` format.

### 2B: If `public/privacy.html` is MISSING — create it

Simple HTML page with:
- What data is collected (Telegram user ID, game scores, words played, currency balance)
- What is NOT collected (phone, contacts, messages, location)
- No third-party sharing
- Data deletion policy (90 days inactivity or on request)
- Contact: @balda_word_bot

### 2C: If `vercel.json` is missing `/api/bot` rewrite — add it

Must have both rewrites:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/api/word-info", "destination": "/api/word-info" },
    { "source": "/api/bot", "destination": "/api/bot" }
  ]
}
```

### 2D: Verify imports chain doesn't break

Run this check — every import in App.jsx must resolve to a real file:
```bash
grep "from '\./\|from \"\.\/" src/App.jsx | while read line; do
  file=$(echo "$line" | grep -oP "'\./[^']+'" | tr -d "'" | sed 's|^./||')
  if [ -n "$file" ]; then
    found=$(ls src/${file}.js src/${file}.jsx 2>/dev/null | head -1)
    if [ -z "$found" ]; then echo "MISSING: src/$file"; fi
  fi
done
```

Do the same for Lobby.jsx, MultiplayerGame.jsx, main.jsx.

### 2E: Verify no xp.css references

```bash
grep -rn "xp.css\|XP.css\|xp-window\|title-bar-text\|window-body" src/ index.html package.json
```

If any found — remove them. `main.jsx` should NOT import xp.css. `package.json` should NOT have xp.css in dependencies.

### 2F: Run build test

```bash
npm install
npm run build
```

Must complete with zero errors. Fix any issues.

---

## STEP 3: Verify Telegram Integration

Check these functions exist in `src/telegram.js`:
- `initTelegram()` — calls tg.expand(), tg.ready(), sets header/bg color
- `isTelegram` — boolean export
- `hapticImpact(style)`, `hapticNotification(type)`, `hapticSelection()`
- `getStartParam()` — returns tg.initDataUnsafe.start_param
- `getRoomCodeFromStart()` — parses `room_XXXX` from start param
- `getReferrerId()` — parses `ref_XXXX` from start param
- `shareGame(roomCode)` — opens Telegram share with `t.me/balda_word_bot?start=room_CODE`
- `shareInvite(playerId)` — opens share with `t.me/balda_word_bot?start=ref_ID`
- `getInviteLink(playerId)` — returns the referral URL string
- `onBackButton(callback)` — shows/hides Telegram back button
- `getPlayerIdTG()` — returns `tg_USERID` or localStorage fallback

If any are missing, add them.

Check `src/App.jsx` uses:
- `getRoomCodeFromStart` import
- An effect that checks for room code on startup and sets `screen` to `'lobby'`
- `autoJoinCode` state passed to `<Lobby>`

Check `src/Lobby.jsx`:
- Accepts `autoJoinCode` and `onAutoJoinConsumed` props
- Has an effect that auto-joins when `autoJoinCode` is set

---

## STEP 4: Verify Referral System

Check `src/referral.js` exists and exports:
- `initUser()` — creates user_stats record, records referral
- `onGameComplete(scores, playerNumber)` — triggers referral reward on first game
- `getReferralStats()` — returns {total, rewarded, pending}
- `syncCurrency(amount)` — saves currency to Supabase
- `loadCurrency()` — loads currency from Supabase

Check `src/App.jsx` has:
- Import of all 5 functions from referral.js
- `initUser()` called in useEffect on mount
- `onGameComplete()` called in the gameOver effect
- Invite section in the menu with "📨 Пригласить в Telegram" button
- `refStats` state displaying invite counts

---

## STEP 5: Summary Report

After all checks and fixes, output:

1. **Files that were MISSING** and what you created
2. **Files that were OUTDATED** and what you changed  
3. **Build result** — does `npm run build` pass?
4. **Remaining manual steps** for the developer:
   - Add `TELEGRAM_BOT_TOKEN` env var to Vercel
   - Set webhook URL: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://retro-balda.vercel.app/api/bot`
   - BotFather commands: /setdescription, /setabouttext, /setcommands, /setuserpic
   - Submit to @app_moderation_bot

Commit all changes:
```bash
git add .
git commit -m "prepare for Telegram Apps Center: bot webhook + privacy policy + fixes"
git push
```
