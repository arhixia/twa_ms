import { detectPlatform } from './platform'

/**
 * Показать алерт (простое уведомление)
 */
export function showAlert(message) {
  const platform = detectPlatform()

  if (platform === 'telegram') {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showAlert(message)
      return
    }
  } 
  alert(message)
}

/**
 * Показать confirm (с подтверждением)
 * Возвращает Promise<boolean>
 */
export async function showConfirm(message) {
  const platform = detectPlatform()

  // 1. Telegram
  if (platform === 'telegram' && window.Telegram?.WebApp) {
    return new Promise((resolve) => {
      window.Telegram.WebApp.showConfirm(message, (result) => {
        resolve(!!result)
      })
    })
  }

  // 2. VK
  if (platform === 'vk' && window.vkBridge) {
    try {
      const response = await window.vkBridge.send('VKWebAppShowConfirmBox', {
        message: message,
        title: 'Подтверждение',
      })

      // Обрабатываем успешный ответ (может быть объектом или булевым)
      if (response && typeof response === 'object') {
        return !!response.result
      }
      return !!response
      
    } catch (error) {
      if (error?.error_data?.error_code === 6 || error?.error_type === 'client_error') {
        console.log('VK Native Confirm not supported, using browser confirm...')
        return window.confirm(message)
      }
      console.warn('VK Confirm error:', error)
      return false
    }
  }

  // 3. Веб (fallback по умолчанию)
  return window.confirm(message)
}