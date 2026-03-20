// Referral & User Stats System
import { supabase, getPlayerId } from './supabase';
import { getReferrerId, isTelegram } from './telegram';

const REFERRAL_REWARD = 5; // Букв for both referrer and referred

// Initialize user — check referral, create stats record
export async function initUser() {
  if (!supabase) return { isNew: false, referralReward: 0 };
  
  const playerId = getPlayerId();
  let isNew = false;
  let referralReward = 0;

  try {
    // Check if user exists
    const { data: existing } = await supabase
      .from('user_stats')
      .select('*')
      .eq('player_id', playerId)
      .single();

    if (!existing) {
      // New user — create record
      isNew = true;
      const referrerId = getReferrerId();
      
      await supabase.from('user_stats').insert({
        player_id: playerId,
        referred_by: referrerId || null,
        games_played: 0,
        currency: 5,
      });

      // Record referral if came from invite link
      if (referrerId && referrerId !== playerId) {
        await supabase.from('referrals').upsert(
          { referrer_id: referrerId, referred_id: playerId, rewarded: false },
          { onConflict: 'referrer_id,referred_id', ignoreDuplicates: true }
        );
      }
    }
  } catch (err) {
    console.warn('initUser error:', err.message);
  }

  return { isNew, referralReward };
}

// Called after a game ends — check if this triggers referral reward
export async function onGameComplete(scores, playerNumber) {
  if (!supabase) return 0;
  
  const playerId = getPlayerId();
  let reward = 0;

  try {
    // Update user stats
    const { data: stats } = await supabase
      .from('user_stats')
      .select('*')
      .eq('player_id', playerId)
      .single();

    const newGamesPlayed = (stats?.games_played || 0) + 1;
    
    await supabase.from('user_stats').upsert({
      player_id: playerId,
      games_played: newGamesPlayed,
      total_score: (stats?.total_score || 0) + (scores[playerNumber - 1] || 0),
      updated_at: new Date().toISOString(),
    });

    // If this is the user's FIRST game and they were referred — trigger rewards
    if (newGamesPlayed === 1 && stats?.referred_by) {
      const referrerId = stats.referred_by;

      // Check if reward already given
      const { data: ref } = await supabase
        .from('referrals')
        .select('*')
        .eq('referrer_id', referrerId)
        .eq('referred_id', playerId)
        .single();

      if (ref && !ref.rewarded) {
        // Mark as rewarded
        await supabase.from('referrals')
          .update({ rewarded: true })
          .eq('referrer_id', referrerId)
          .eq('referred_id', playerId);

        // Credit referred user (current player)
        reward = REFERRAL_REWARD;

        // Credit referrer
        const { data: referrerStats } = await supabase
          .from('user_stats')
          .select('currency')
          .eq('player_id', referrerId)
          .single();

        if (referrerStats) {
          await supabase.from('user_stats')
            .update({ currency: (referrerStats.currency || 0) + REFERRAL_REWARD })
            .eq('player_id', referrerId);
        }
      }
    }
  } catch (err) {
    console.warn('onGameComplete error:', err.message);
  }

  return reward;
}

// Get referral stats for display
export async function getReferralStats() {
  if (!supabase) return { total: 0, rewarded: 0, pending: 0 };
  
  const playerId = getPlayerId();
  
  try {
    const { data: refs } = await supabase
      .from('referrals')
      .select('*')
      .eq('referrer_id', playerId);

    if (!refs) return { total: 0, rewarded: 0, pending: 0 };

    return {
      total: refs.length,
      rewarded: refs.filter(r => r.rewarded).length,
      pending: refs.filter(r => !r.rewarded).length,
    };
  } catch {
    return { total: 0, rewarded: 0, pending: 0 };
  }
}

// Sync currency to Supabase (call periodically)
export async function syncCurrency(amount) {
  if (!supabase) return;
  const playerId = getPlayerId();
  
  try {
    await supabase.from('user_stats')
      .upsert({
        player_id: playerId,
        currency: amount,
        updated_at: new Date().toISOString(),
      });
  } catch {}
}

// Load currency from Supabase (for cross-device sync)
export async function loadCurrency() {
  if (!supabase) return null;
  const playerId = getPlayerId();
  
  try {
    const { data } = await supabase
      .from('user_stats')
      .select('currency')
      .eq('player_id', playerId)
      .single();
    
    return data?.currency ?? null;
  } catch {
    return null;
  }
}
