import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'

const require = createRequire(import.meta.url)

let messaging = null

/**
 * 初始化 Firebase Admin SDK
 * 需要环境变量 FIREBASE_SERVICE_ACCOUNT_PATH 或 server/firebase-service-account.json
 */
export function initFirebase() {
  try {
    const admin = require('firebase-admin')

    const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
      || path.resolve(process.cwd(), 'firebase-service-account.json')

    if (!fs.existsSync(keyPath)) {
      console.warn('[FCM] firebase-service-account.json 未找到，推送功能禁用')
      return false
    }

    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf-8'))

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    })

    messaging = admin.messaging()
    console.log('[FCM] Firebase 初始化成功')
    return true
  } catch (e) {
    console.warn('[FCM] Firebase 初始化失败:', e.message)
    return false
  }
}

/**
 * 通过 FCM 发送推送通知
 * @param {string} token - 目标设备的 FCM token
 * @param {object} payload - { senderNickname, content, conversationId }
 */
export async function sendPushNotification(token, { senderNickname, content, conversationId }) {
  if (!messaging || !token) return false

  try {
    await messaging.send({
      token,
      // data message：由原生 Service 处理，不依赖 WebView
      data: {
        type: 'new_message',
        senderNickname,
        content: content.length > 100 ? content.slice(0, 100) + '...' : content,
        conversationId
      },
      android: {
        priority: 'high'
      }
    })
    return true
  } catch (e) {
    // token 失效时清理（常见于卸载重装）
    if (e.code === 'messaging/registration-token-not-registered' ||
        e.code === 'messaging/invalid-registration-token') {
      console.log(`[FCM] token 已失效，需清理: ${token.slice(0, 20)}...`)
      return 'token_invalid'
    }
    console.warn('[FCM] 推送发送失败:', e.message)
    return false
  }
}

/**
 * 检查 FCM 是否可用
 */
export function isFcmEnabled() {
  return messaging !== null
}
