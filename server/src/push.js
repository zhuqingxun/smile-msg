import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'

const require = createRequire(import.meta.url)

let messaging = null

/**
 * 初始化 Firebase Admin SDK
 * 优先级：环境变量 FIREBASE_SERVICE_ACCOUNT（JSON 字符串）
 *       → 环境变量 FIREBASE_SERVICE_ACCOUNT_PATH（文件路径）
 *       → 默认路径 server/firebase-service-account.json
 */
export function initFirebase() {
  try {
    const admin = require('firebase-admin')

    let serviceAccount

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    } else {
      const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
        || path.resolve(process.cwd(), 'firebase-service-account.json')

      if (!fs.existsSync(keyPath)) {
        console.warn('[FCM] firebase-service-account.json 未找到，推送功能禁用')
        return false
      }

      serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf-8'))
    }

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
  if (!messaging || !token) {
    console.log(`[FCM] 跳过推送: messaging=${!!messaging}, token=${!!token}`)
    return false
  }

  console.log(`[FCM] 准备推送 → token=${token.slice(0, 20)}..., sender=${senderNickname}, convId=${conversationId}`)

  try {
    const truncatedContent = content.length > 100 ? content.slice(0, 100) + '...' : content

    await messaging.send({
      token,
      notification: {
        title: `${senderNickname} 发来消息`,
        body: truncatedContent
      },
      data: {
        type: 'new_message',
        senderNickname,
        content: truncatedContent,
        conversationId
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'messages'
        }
      }
    })
    console.log(`[FCM] 推送成功 ✓ → token=${token.slice(0, 20)}...`)
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
