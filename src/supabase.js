import { createClient } from '@supabase/supabase-js';
import { getPlayerIdTG, getPlayerNameTG } from './telegram';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase env vars missing — multiplayer disabled');
}

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Player ID — uses Telegram ID when available, localStorage fallback
export function getPlayerId() {
  return getPlayerIdTG();
}

export function getPlayerName() {
  return getPlayerNameTG();
}

export function setPlayerName(name) {
  localStorage.setItem('balda_player_name', name);
}
