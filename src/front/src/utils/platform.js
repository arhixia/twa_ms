// src/utils/platform.js
import vkBridge from '@vkontakte/vk-bridge';

export const PLATFORMS = {
  TELEGRAM: 'telegram',
  VK: 'vk',
  WEB: 'web',
};

export const detectPlatform = () => {
  if (window.Telegram?.WebApp?.initData) {
    return PLATFORMS.TELEGRAM;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const isVk = urlParams.has('vk_platform') || 
               window.navigator.userAgent.includes('VKApp') || 
               window.navigator.userAgent.includes('vk.com');

  if (isVk) {
    return PLATFORMS.VK;
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