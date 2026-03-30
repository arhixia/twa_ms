// src/utils/platform.js

export const detectPlatform = () => {
  if (window?.Telegram?.WebApp?.initData) return 'telegram'
  if (window?.vkBridge) return 'vk'
  return 'web'
}

export const getPlatformUserId = async () => {
  const platform = detectPlatform()

  if (platform === 'telegram') {
    const id = window.Telegram.WebApp.initDataUnsafe?.user?.id
    return { platform, id: id ?? null }
  }

  if (platform === 'vk') {
    try {
      const user = await window.vkBridge.send('VKWebAppGetUserInfo')
      return { platform, id: user.id ?? null }
    } catch (err) {
      console.warn('Не удалось получить VK user info:', err)
      return { platform, id: null }
    }
  }

  return { platform, id: null }
}