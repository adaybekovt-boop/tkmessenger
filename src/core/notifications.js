// notifications.js — Notification API для P2P-мессенджера
// Используем Notification API без Push (т.к. нет сервера для push-токенов).
// Уведомления показываются только когда вкладка открыта, но не в фокусе.

const STORAGE_KEY = 'orbits_notif_settings_v1';

function getSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: true, sound: true };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { enabled: true, sound: true };
  } catch (_) {
    return { enabled: true, sound: true };
  }
}

export function saveNotifSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (_) {
  }
}

export function getNotifSettings() {
  return getSettings();
}

/**
 * Проверяет, поддерживаются ли уведомления и есть ли разрешение.
 */
export function canShowNotifications() {
  if (typeof Notification === 'undefined') return false;
  return Notification.permission === 'granted';
}

/**
 * Запрашивает разрешение на уведомления.
 * @returns {'granted' | 'denied' | 'default'}
 */
export async function requestPermission() {
  if (typeof Notification === 'undefined') return 'default';
  try {
    return await Notification.requestPermission();
  } catch (_) {
    return 'default';
  }
}

/**
 * Показывает уведомление о новом сообщении.
 * Показывает только если:
 *  - уведомления разрешены и включены
 *  - вкладка не в фокусе (нет смысла показывать если юзер и так смотрит)
 */
export function notifyNewMessage({ from, text, tag }) {
  const settings = getSettings();
  if (!settings.enabled) return;
  if (!canShowNotifications()) return;

  // Не показывать если вкладка в фокусе
  if (typeof document !== 'undefined' && !document.hidden) return;

  const body = String(text || '').slice(0, 200);
  const title = `Orbits — ${String(from || 'Собеседник').slice(0, 64)}`;

  try {
    const notif = new Notification(title, {
      body,
      tag: tag || `orbits-msg-${Date.now()}`,
      icon: './pwa-192x192.svg',
      badge: './pwa-192x192.svg',
      silent: !settings.sound,
      renotify: true
    });

    // При клике на уведомление — фокус на вкладку
    notif.onclick = () => {
      try {
        window.focus();
        notif.close();
      } catch (_) {
      }
    };

    // Let the OS manage notification lifetime. The user will see it in
    // their notification center even if they come back minutes later.
    // On click the handler above focuses the window and closes it.
  } catch (_) {
  }
}

/**
 * Показывает уведомление о входящем звонке.
 */
export function notifyIncomingCall({ from }) {
  const settings = getSettings();
  if (!settings.enabled) return;
  if (!canShowNotifications()) return;
  if (typeof document !== 'undefined' && !document.hidden) return;

  try {
    const notif = new Notification('Orbits — Входящий звонок', {
      body: `Звонит ${String(from || 'Собеседник').slice(0, 64)}`,
      tag: 'orbits-incoming-call',
      icon: './pwa-192x192.svg',
      requireInteraction: true,
      silent: false
    });

    notif.onclick = () => {
      try {
        window.focus();
        notif.close();
      } catch (_) {
      }
    };
  } catch (_) {
  }
}
