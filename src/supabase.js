import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase env vars missing — multiplayer disabled');
}

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Player ID — persistent per browser
export function getPlayerId() {
  let id = localStorage.getItem('balda_player_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('balda_player_id', id);
  }
  return id;
}

export function getPlayerName() {
  return localStorage.getItem('balda_player_name') || 'Игрок';
}

export function setPlayerName(name) {
  localStorage.setItem('balda_player_name', name);
}
