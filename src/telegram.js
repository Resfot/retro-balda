// Telegram Web App Integration
// Handles: user identity, haptic feedback, theme, viewport, payments

const tg = window.Telegram?.WebApp;

// Is this running inside Telegram?
export const isTelegram = !!tg?.initData;

// Initialize Telegram Web App
export function initTelegram() {
  if (!tg) return;
  
  // Expand to full height
  tg.expand();
  tg.isVerticalSwipesEnabled = false;
  
  // Set header color to match our theme
  try {
    tg.setHeaderColor('#0e1e40');
    tg.setBackgroundColor('#020308');
  } catch {}

  // Tell Telegram the app is ready
  tg.ready();
}

// Get Telegram user data
export function getTelegramUser() {
  if (!tg?.initDataUnsafe?.user) return null;
  const user = tg.initDataUnsafe.user;
  return {
    id: String(user.id),
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    username: user.username || '',
    displayName: user.first_name + (user.last_name ? ' ' + user.last_name : ''),
    languageCode: user.language_code || 'ru',
    photoUrl: user.photo_url || '',
  };
}

// Get unique player ID — Telegram user ID or fallback to localStorage
export function getPlayerIdTG() {
  const tgUser = getTelegramUser();
  if (tgUser) return `tg_${tgUser.id}`;
  
  // Fallback for browser
  let id = localStorage.getItem('balda_player_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('balda_player_id', id);
  }
  return id;
}

// Get display name
export function getPlayerNameTG() {
  const tgUser = getTelegramUser();
  if (tgUser) return tgUser.displayName;
  return localStorage.getItem('balda_player_name') || 'Игрок';
}

// Haptic feedback
export function hapticImpact(style = 'light') {
  // style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
  try {
    tg?.HapticFeedback?.impactOccurred(style);
  } catch {}
}

export function hapticNotification(type = 'success') {
  // type: 'error' | 'success' | 'warning'
  try {
    tg?.HapticFeedback?.notificationOccurred(type);
  } catch {}
}

export function hapticSelection() {
  try {
    tg?.HapticFeedback?.selectionChanged();
  } catch {}
}

// Telegram Stars payment for Буквы
export function buyBukvyWithStars(amount, starsPrice) {
  return new Promise((resolve, reject) => {
    if (!tg) {
      reject(new Error('Not in Telegram'));
      return;
    }

    // This requires a backend invoice link from your bot
    // For now, we'll use the showPopup as a placeholder
    tg.showPopup({
      title: `${amount} Букв`,
      message: `Купить ${amount} Букв за ${starsPrice} ⭐?`,
      buttons: [
        { id: 'buy', type: 'default', text: `Купить за ${starsPrice} ⭐` },
        { id: 'cancel', type: 'cancel' },
      ],
    }, (buttonId) => {
      if (buttonId === 'buy') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

// Show confirm dialog
export function showConfirm(message) {
  return new Promise((resolve) => {
    if (tg) {
      tg.showConfirm(message, (confirmed) => resolve(confirmed));
    } else {
      resolve(window.confirm(message));
    }
  });
}

// Close the app
export function closeApp() {
  if (tg) {
    tg.close();
  }
}

// Share game invite
export function shareGame(roomCode) {
  const botUsername = 'balda_word_bot';
  const url = `https://t.me/${botUsername}?startapp=room_${roomCode}`;
  const text = '🎮 Го в БАЛДУ! Жми ссылку и заходи в игру!';
  
  if (tg) {
    try {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
    } catch {
      navigator.clipboard?.writeText(url);
    }
  } else {
    // Browser fallback
    navigator.clipboard?.writeText(url);
  }
}

// Get safe area insets (for notch phones)
export function getSafeAreaInsets() {
  if (tg?.safeAreaInset) {
    return tg.safeAreaInset;
  }
  return { top: 0, bottom: 0, left: 0, right: 0 };
}

// Back button handler
export function onBackButton(callback) {
  if (!tg?.BackButton) return () => {};
  
  tg.BackButton.show();
  tg.BackButton.onClick(callback);
  
  return () => {
    tg.BackButton.hide();
    tg.BackButton.offClick(callback);
  };
}

// Get start parameter (for referral links)
export function getStartParam() {
  // Primary: set by Telegram when app is opened via ?startapp= direct link
  if (tg?.initDataUnsafe?.start_param) return tg.initDataUnsafe.start_param;

  // Fallback: Telegram injects tgWebAppStartParam into the URL hash
  try {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const hashVal = hashParams.get('tgWebAppStartParam');
    if (hashVal) return hashVal;
  } catch {}

  // Fallback: when opened via bot's web_app button, the param is in the URL query string
  try {
    const searchVal = new URLSearchParams(window.location.search).get('startapp');
    if (searchVal) return searchVal;
  } catch {}

  return null;
}

// Get referrer ID from start param (format: ref_PLAYERID)
export function getReferrerId() {
  const param = getStartParam();
  if (!param || !param.startsWith('ref_')) return null;
  return param.substring(4);
}

// Get room code from start param (format: room_ABCDEF)
export function getRoomCodeFromStart() {
  const param = getStartParam();
  if (!param || !param.startsWith('room_')) return null;
  return param.substring(5);
}

// Generate invite link for sharing
export function getInviteLink(playerId) {
  const botUsername = 'balda_word_bot';
  return `https://t.me/${botUsername}?start=ref_${playerId}`;
}

// Share invite via Telegram
export function shareInvite(playerId) {
  if (!tg) return;
  const link = getInviteLink(playerId);
  const text = '🎮 Играем в БАЛДУ! Составляй слова, учи новое и получи бонус!';
  
  try {
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
  } catch {
    navigator.clipboard?.writeText(link);
  }
}

export default tg;
