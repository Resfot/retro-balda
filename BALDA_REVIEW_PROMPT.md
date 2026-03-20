# БАЛДА — Full Review & Fix Prompt

You are working on БАЛДА (Balda) — a Russian word game deployed as a Telegram Mini App.

**Live:** https://retro-balda.vercel.app/
**Bot:** @balda_word_bot
**Repo:** https://github.com/Resfot/retro-balda
**Stack:** React 18, Vite 5, Supabase (multiplayer + cache), Vercel (hosting + serverless)

---

## TASK 1: Full Code Audit

Go through every file in the project and check:

### Files to review:
- `index.html` — Telegram SDK script tag, viewport meta
- `package.json` — dependencies (should NOT have xp.css)
- `vercel.json` — build config
- `vite.config.js` — proxy config for local dev
- `api/word-info.js` — Vercel serverless function (Claude API + Supabase cache)
- `src/main.jsx` — entry point, Telegram init
- `src/App.jsx` — main game component (~1100 lines)
- `src/App.css` — all styles (Flash/Miniclip theme)
- `src/game-logic.js` — game engine, AI, hints, categories
- `src/WordInfo.jsx` — word definition display
- `src/Lobby.jsx` — multiplayer lobby with Telegram share
- `src/MultiplayerGame.jsx` — multiplayer game with Supabase Realtime
- `src/supabase.js` — Supabase client + player identity
- `src/telegram.js` — Telegram WebApp SDK (haptics, share, deep links)
- `src/referral.js` — friend invite reward system
- `public/dictionary.json` — flat word list (~37K)
- `public/dictionary_categorized.json` — categorized dict (~48K words, 24 categories)

### What to check:
1. **Build errors** — any missing imports, broken references, unused imports
2. **Runtime bugs** — state management issues, race conditions, memory leaks (intervals/subscriptions not cleaned up)
3. **Telegram integration** — does `initTelegram()` run correctly? Does `getStartParam()` parse `room_` and `ref_` prefixes? Does the back button work?
4. **Multiplayer** — does Supabase Realtime subscription clean up on unmount? Does auto-join from deep link work?
5. **Referral system** — does `initUser()` correctly handle first-time users? Does `onGameComplete()` trigger rewards?
6. **CSS conflicts** — any leftover XP.css references? Any `!important` overrides that shouldn't be there?
7. **Mobile issues** — does 7×7 grid fit on small screens (320px-375px width)? Does the letter picker show 8 columns?

Fix every issue you find. Don't just report — fix it.

---

## TASK 2: UI/UX Overhaul — Flash Game / Miniclip Style

The current UI is close but needs polish to truly feel like a 2000s Flash game. Here are the specific references:

### Visual References (look these up):
- **Bookworm** (PopCap, 2003) — letter tiles on a colorful board, glossy buttons, warm colors
- **TextTwist** (GameHouse, 2001) — dark blue background, bright letter tiles, chunky fonts
- **Bejeweled** (PopCap, 2001) — glowing gems, particle effects, score popups
- **Zuma** (PopCap, 2003) — deep rich backgrounds, golden accents, satisfying animations
- **Any Miniclip.com game circa 2005-2008** — rounded glossy buttons with shine gradients, bold chunky fonts, dark themed backgrounds with bright accents, score counters with gold numbers

### Specific UI fixes needed:

**Fonts:**
- Use `Fredoka` (already imported) for ALL display text: titles, scores, grid letters, buttons
- Use `Rubik` for body text only: descriptions, rules, word definitions
- Grid letters should be LARGE and BOLD — at least 50% of cell size
- Score numbers should feel chunky and satisfying

**Colors & Theme:**
- Background: deep blue-purple gradient (currently good, keep it)
- Grid cells: should look like 3D tiles with depth — bright face, darker edges, subtle inner glow
- Empty cells: subtle but visible, not too transparent
- Selected path: bright green glow trail
- Placed letter: golden/orange with pulse animation
- Score numbers: gold with text-shadow glow
- Buttons: glossy gradient with a "shine" strip across the top (like a glass reflection)

**Animations (this is what makes it feel like Flash):**
- Letter placement: bouncy scale animation (overshoot then settle)
- Word submission success: score number flies up and fades (+6 floats above the grid)
- Word submission error: brief red shake on the message bar
- AI thinking: animated dots or a fun spinner
- Game over: scores count up from 0 to final, winner announcement with fanfare feel
- Button hover: subtle scale(1.03) + glow increase
- New turn: smooth transition

**Grid:**
- Cells should have rounded corners (8-10px)
- Filled cells should look like raised tiles (box-shadow for depth)
- The grid container should have a subtle inset shadow (like the board is recessed)
- Cell gap should be visible (3-4px) so tiles feel separate

**Game HUD (score bar, currency, timer):**
- Score bar should feel like a game HUD — compact, always visible
- Currency (Буквы) should have a coin-like icon treatment
- Timer should pulse when getting low (already does, verify it works)

**Mobile (CRITICAL):**
- 7×7 grid MUST fit on 375px wide screen (iPhone SE/Mini)
- Calculate: (375px - 24px padding - 6×3px gaps) / 7 = ~47px per cell — verify this
- Letter picker modal should fill width, 8 columns, large tap targets
- No horizontal scroll ever

**Word Info Card:**
- Should feel like a "loot drop" or achievement popup
- Slide in from bottom with a bounce
- Category badge should glow if it's a bonus category word

Run the dev server, test on mobile viewport (375×667), screenshot issues and fix them.

---

## TASK 3: Dictionary Category Audit

The file `public/dictionary_categorized.json` has ~48K words with category tags. Users report miscategorizations. Run a systematic review using Claude Haiku API.

### Setup:
You have access to the Anthropic API. The key is in Vercel env vars, or use `$ANTHROPIC_API_KEY` if set locally.

### Audit Process:

**Step 1: Find suspicious categorizations**
Write a Python script that:
1. Loads dictionary_categorized.json
2. For each thematic category (animal, food, sport, tech, music, transport, profession, science, nature, tool, body, clothing, building, home, art, weapon, slang, geo), sample 50 random words
3. Send each batch to Claude Haiku: "Here are words tagged as [category]. Which ones are WRONG? Only list the wrong ones with their correct category."
4. Collect all errors

**Step 2: Known problem patterns to check specifically:**
- Words that are both a name AND something else: "лев" (name AND animal), "вера" (name AND concept), "марс" (name AND planet)
- Food words in "other"/"general": блин, щи, борщ, каша, квас, etc.
- Animals in "name": кит, карп, линь, etc.
- Sport equipment/places in "building" or "tool": корт, ринг, мяч, клюшка
- Body parts in "general": палец, локоть, колено
- Modern tech words in old categories
- Professions that are also common nouns

**Step 3: Fix and save**
Apply all corrections to dictionary_categorized.json. Print a summary of changes.

**Step 4: Category balance check**
After fixes, print category counts. Flag any category with fewer than 30 words (too small to be playable). Merge tiny categories into their parent:
- agriculture → nature
- textile → clothing  
- biology → science
- medical → body
- plant → nature
- toy → home
- sound → music
- material → tool
- education → science
- fuel → tech
- organization → general
- measure → science

### API call format:
```python
import anthropic
client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-haiku-4-5-20251001",
    max_tokens=1024,
    messages=[{"role": "user", "content": prompt}]
)
```

### Budget: Keep it under $2 total. Haiku is cheap — ~$0.001 per batch of 50 words.

---

## Output:
1. List of all bugs found and fixed
2. Updated CSS with proper Flash/Miniclip styling  
3. Dictionary audit report: how many words changed, from what to what
4. All files saved and ready to commit

After all fixes, run `npm run build` to verify it compiles cleanly.
