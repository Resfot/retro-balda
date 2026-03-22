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

// Chat helpers
export async function sendChatMessage(roomId, playerId, playerName, message, type = 'text') {
  if (!supabase) return;
  return supabase.from('game_messages').insert({
    room_id: roomId,
    player_id: playerId,
    player_name: playerName,
    message: message.slice(0, 200),
    type,
  });
}

export async function fetchChatMessages(roomId) {
  if (!supabase) return [];
  const { data } = await supabase
    .from('game_messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(100);
  return data || [];
}

export function subscribeToChatMessages(roomId, onMessage) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`chat-${roomId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'game_messages',
      filter: `room_id=eq.${roomId}`,
    }, (payload) => {
      onMessage(payload.new);
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}
