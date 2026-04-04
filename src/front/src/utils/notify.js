// src/utils/notify.js
import { detectPlatform, PLATFORMS, vkBridge } from './platform';

/**
 * Показать алерт (простое уведомление)
 */
export function showAlert(message) {
  const platform = detectPlatform();

  if (platform === PLATFORMS.TELEGRAM) {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showAlert(message);
      return;
    }
  } 
  alert(message);
}

/**
 * Показать confirm (с подтверждением)
 * Возвращает Promise<boolean>
 */
export async function showConfirm(message) {
  const platform = detectPlatform();

  
  if (platform === PLATFORMS.TELEGRAM && window.Telegram?.WebApp) {
    return new Promise((resolve) => {
      window.Telegram.WebApp.showConfirm(message, (result) => {
        resolve(!!result);
      });
    });
  }

  if (platform === PLATFORMS.VK) {
    try {
      const response = await vkBridge.send('VKWebAppShowConfirmBox', {
        message: message,
        title: 'Подтверждение',
      });

      if (response && typeof response === 'object') {
        return !!response.result;
      }
      return !!response;
      
    } catch (error) {
      console.warn('VK Confirm error:', error);
      return window.confirm(message);
    }
  }

  return window.confirm(message);
}