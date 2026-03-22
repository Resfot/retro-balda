# Multiplayer Improvements Design

**Date:** 2026-03-22
**Scope:** 4 multiplayer fixes/features for БАЛДА Telegram Mini App

## 1. Game Modes Parity

**Problem:** Multiplayer has 4 modes (classic, bonus, mixed, challenge). Solo has 5 — geo mode is missing from multiplayer.

**Solution:**
- Add `geo` to the `GAME_MODES` array in Lobby.jsx
- When creating a room with geo mode, set `game_mode: 'geo'` in the room record
- In MultiplayerGame.jsx, load `dictionary_geo.json` the same way App.jsx does:
  - Fetch geo dictionary on mount when `game_mode === 'geo'`
  - Strip geo words from the main dictionary set
  - Combine main + geo sets for the effective dictionary
- Both host and guest load the geo dictionary independently (no need to sync it — it's a static file)

## 2. Connection Fix

**Problem:** Guest gets stuck on "подключаемся" forever. Root cause: host broadcasts initial game state on a fixed 2.5s timer, but guest's Realtime subscription may not be ready.

**Solution:**

### 2a. Guest subscription before room update
- In Lobby.jsx `joinRoom()`: the room is updated to `'playing'` before MultiplayerGame mounts
- Ensure MultiplayerGame establishes its Realtime subscription immediately on mount
- The host detects guest join via Realtime (room status change to `'playing'` or `guest_id` set)

### 2b. Host detects guest join via Realtime
- Instead of a fixed 2.5s timer, host subscribes to room changes
- When host sees `guest_id` set (room updated to `'playing'`), broadcast initial state after 500ms delay
- This ensures the guest has already joined and subscription is likely ready

### 2c. Robust fallback
- Keep existing 1000ms fallback poll in MultiplayerGame
- After 10 seconds with no state received, show a "Повторить" (Retry) button instead of infinite spinner
- Retry button re-fetches room state from Supabase directly

### 2d. Atomic join
- Use Supabase `.eq('status', 'waiting')` in the update query itself (not check-then-update)
- If update affects 0 rows, room was already taken — show appropriate error
- Prevents two players from joining the same room simultaneously

## 3. Usernames in Multiplayer

**Problem:** During gameplay, players see "Вы" and "Соперник" — no actual names. Names exist in localStorage but are never synced.

**Solution:**

### 3a. Store names in room record
- Add `host_name` and `guest_name` fields to the room object
- Host sets `host_name` on room creation (from Lobby `name` state)
- Guest sets `guest_name` on join (from Lobby `name` state)

### 3b. Display in lobby
- Waiting screen: host sees guest's name when they join ("Алексей подключился!")
- Guest sees host's name on the waiting/connecting screen

### 3c. Display during gameplay
- Replace "Вы" / "Соперник" labels with actual player names next to scores
- Current player gets a visual indicator (highlight/border) to distinguish "which one is me"
- Both players see both names: e.g., "Алексей: 15" and "Мария: 12"

### 3d. Name source
- Use existing `name` state from Lobby.jsx (populated from localStorage or Telegram `first_name`)
- Pass name through to `createRoom()` and `joinRoom()` calls
- No new input fields needed — Lobby already has a name input

## 4. Chat System

**Problem:** No way for players to communicate during a multiplayer game.

**Solution:** New chat system with free text + quick reactions, displayed as a collapsible bottom panel.

### 4a. Database — `game_messages` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `room_id` | text (FK → game_rooms.id) | Which game room |
| `player_id` | text | Who sent it |
| `player_name` | text | Sender's display name |
| `message` | text (max 200) | Message content |
| `type` | text | `'text'` or `'reaction'` |
| `created_at` | timestamptz | Auto-generated |

- RLS policy: players can only insert messages for rooms they're in, and read messages from their rooms

### 4b. Realtime subscription
- Subscribe to `INSERT` events on `game_messages` filtered by `room_id`
- Use the same Supabase channel as game state (or a dedicated `chat-${roomId}` channel)
- On new message: append to local React state, auto-scroll to bottom

### 4c. Quick reactions
- Preset buttons: "Хорошее слово!", "Ого!", "Ну ты даёшь!", "GG", "Удачи!"
- Sent as messages with `type: 'reaction'`
- Displayed as styled badges/chips (visually distinct from plain text messages)

### 4d. UI — Collapsible bottom panel
- **Collapsed (default):** Thin bar showing latest message preview + sender name + unread count badge. Tap to expand.
- **Expanded:**
  - Scrollable message list (max height ~40% of viewport)
  - Messages styled left/right aligned (you vs opponent), like a messenger
  - Quick reaction buttons row above the text input
  - Text input + send button at the bottom
- Chat available only during `'playing'` status

### 4e. Limits
- Max 200 characters per message
- Client-side rate limit: 1 message per 2 seconds (throttle)
- No profanity filter initially

## Supabase Migration Required

1. Add `host_name` (text, nullable) and `guest_name` (text, nullable) columns to `game_rooms`
2. Create `game_messages` table with schema from section 4a
3. Set up RLS policies for `game_messages`

## Files to Modify

| File | Changes |
|------|---------|
| `src/Lobby.jsx` | Add geo mode, pass names to create/join, atomic join |
| `src/MultiplayerGame.jsx` | Geo dict loading, connection fix, show names, chat UI + logic |
| `src/supabase.js` | Chat message helpers (sendMessage, subscribeToMessages) |
| `src/App.jsx` | Pass geo dictionary to MultiplayerGame if needed |
| New: `src/GameChat.jsx` | Chat component (collapsible panel, messages, reactions) |
