// storageCheck.js — проверка лимитов хранилища (особенно iOS Safari PWA)
// В iOS Safari в PWA-режиме лимит ~50MB, в обычной вкладке может быть больше.
// Этот модуль предупреждает пользователя при приближении к лимиту.

const THRESHOLD_RATIO = 0.85; // предупреждаем при 85% заполнения
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 минут

let lastWarningAt = 0;
let checkTimer = null;

/**
 * Проверяет использование хранилища.
 * Возвращает { usage, quota, ratio, warning } или null если API недоступно.
 */
export async function checkStorageUsage() {
  if (!navigator?.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const ratio = quota > 0 ? usage / quota : 0;
    const warning = ratio >= THRESHOLD_RATIO;
    return {
      usage,
      quota,
      ratio,
      warning,
      usageMB: Math.round(usage / 1024 / 1024),
      quotaMB: Math.round(quota / 1024 / 1024)
    };
  } catch (_) {
    return null;
  }
}

/**
 * Определяет, является ли текущая среда iOS Safari / PWA с ограниченным лимитом.
 */
export function isIOSSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  return isIOS && isSafari;
}

/**
 * Определяет, запущено ли в standalone-режиме (PWA installed)
 */
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator?.standalone === true;
}

/**
 * Запускает периодическую проверку хранилища.
 * @param {Function} onWarning — колбэк при приближении к лимиту
 * @returns {Function} cancel — функция для остановки проверок
 */
export function startStorageMonitor(onWarning) {
  if (checkTimer) clearInterval(checkTimer);

  const run = async () => {
    const result = await checkStorageUsage();
    if (!result) return;
    if (!result.warning) return;

    const now = Date.now();
    // Не спамим — предупреждаем максимум раз в 30 минут
    if (now - lastWarningAt < 30 * 60 * 1000) return;
    lastWarningAt = now;

    if (typeof onWarning === 'function') {
      onWarning(result);
    }
  };

  // Начальная проверка через 10с после запуска
  setTimeout(run, 10_000);
  checkTimer = setInterval(run, CHECK_INTERVAL);

  return () => {
    if (checkTimer) {
      clearInterval(checkTimer);
      checkTimer = null;
    }
  };
}

/**
 * Запрашивает persistent storage (помогает на некоторых браузерах
 * увеличить лимит и защитить данные от автоочистки).
 */
export async function requestPersistentStorage() {
  if (!navigator?.storage?.persist) return false;
  try {
    const persisted = await navigator.storage.persisted();
    if (persisted) return true;
    return await navigator.storage.persist();
  } catch (_) {
    return false;
  }
}
