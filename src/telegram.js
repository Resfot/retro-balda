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
    tg.setHeaderColor('#1a0a3e');
    tg.setBackgroundColor('#0d1b4a');
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
  if (!tg) return;
  
  const botUsername = 'balda_word_bot';
  const url = `https://t.me/${botUsername}?start=join_${roomCode}`;
  const text = `Играем в БАЛДУ! Заходи по коду: ${roomCode.toUpperCase()}`;
  
  // Use Telegram's native share
  try {
    tg.switchInlineQuery(text, ['users', 'groups', 'channels']);
  } catch {
    // Fallback: open share URL
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
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
  if (!tg?.initDataUnsafe?.start_param) return null;
  return tg.initDataUnsafe.start_param;
}

// Get referrer ID from start param (format: ref_PLAYERID)
export function getReferrerId() {
  const param = getStartParam();
  if (!param || !param.startsWith('ref_')) return null;
  return param.substring(4);
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
