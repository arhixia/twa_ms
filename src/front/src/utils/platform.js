// src/utils/platform.js
import vkBridge from '@vkontakte/vk-bridge';

export const PLATFORMS = {
  TELEGRAM: 'telegram',
  VK: 'vk',
  WEB: 'web',
};

/**
 * Динамически загружает скрипт Telegram WebApp
 * Возвращает Promise, который резолвится, когда скрипт загружен
 */
export const loadTelegramScript = () => {
  return new Promise((resolve, reject) => {
    // Если скрипт уже загружен (например, после перезагрузки компонента)
    if (window.Telegram?.WebApp) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.async = true;
    
    script.onload = () => {
      console.log('Telegram SDK loaded');
      resolve();
    };
    
    script.onerror = () => {
      console.error('Failed to load Telegram SDK');
      reject(new Error('Failed to load Telegram SDK'));
    };

    document.head.appendChild(script);
  });
};

export const detectPlatform = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const isVk = urlParams.has('vk_platform') || 
               window.navigator.userAgent.includes('VKApp') || 
               window.navigator.userAgent.includes('vk.com');

  if (isVk) {
    return PLATFORMS.VK;
  }

  if (window.Telegram?.WebApp?.initData) {
    return PLATFORMS.TELEGRAM;
  }

  return PLATFORMS.WEB; 
};

export const getPlatformUserId = async () => {
  const platform = detectPlatform();

  if (platform === PLATFORMS.TELEGRAM) {
    const user = window.Telegram.WebApp.initDataUnsafe?.user;
    return { platform, id: user?.id ?? null, user };
  }

  if (platform === PLATFORMS.VK) {
    try {
      const response = await vkBridge.send('VKWebAppGetUserInfo');
      return { platform, id: response?.id ?? null, user: response };
    } catch (err) {
      console.warn('Не удалось получить VK user info:', err);
      return { platform, id: null, user: null };
    }
  }

  return { platform, id: null, user: null };
};

export { vkBridge };