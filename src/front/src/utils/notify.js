// src/utils/notify.js
import { detectPlatform, PLATFORMS } from './platform';

// Глобальные хендлеры — подменяются через registerModalHandlers
let _showAlert = (msg) => window.alert(msg);
let _showConfirm = (msg) => Promise.resolve(window.confirm(msg));

export function registerModalHandlers({ showAlert, showConfirm }) {
  _showAlert = showAlert;
  _showConfirm = showConfirm;
}

export function showAlert(message) {
  const platform = detectPlatform();

  // Telegram — нативный алерт
  if (platform === PLATFORMS.TELEGRAM && window.Telegram?.WebApp) {
    return new Promise((resolve) => {
      window.Telegram.WebApp.showAlert(message, resolve);
    });
  }

  return _showAlert(message);
}

export async function showConfirm(message) {
  const platform = detectPlatform();

  // Telegram — нативный confirm
  if (platform === PLATFORMS.TELEGRAM && window.Telegram?.WebApp) {
    return new Promise((resolve) => {
      window.Telegram.WebApp.showConfirm(message, resolve);
    });
  }

  return _showConfirm(message);
}