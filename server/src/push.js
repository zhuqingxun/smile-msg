import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import { sendHuaweiPush, isHuaweiPushEnabled, initHuaweiPush } from './huaweiPush.js'

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
  if (!messaging || !token) return false

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
    return true
  } catch (e) {
    if (e.code === 'messaging/registration-token-not-registered' ||
        e.code === 'messaging/invalid-registration-token') {
      console.log(`[FCM] token 已失效: ${token.slice(0, 20)}...`)
      return 'token_invalid'
    }
    console.warn('[FCM] 推送失败:', e.message)
    return false
  }
}

/**
 * 检查 FCM 是否可用
 */
export function isFcmEnabled() {
  return messaging !== null
}

/**
 * 统一推送入口：根据平台路由到 FCM 或 Push Kit
 * @param {string} token - 推送 token
 * @param {string} platform - 'android' | 'harmony' | 其他
 * @param {object} payload - { senderNickname, content, conversationId }
 */
export async function sendPush(token, platform, payload) {
  if (platform === 'harmony') {
    return sendHuaweiPush(token, payload)
  }
  return sendPushNotification(token, payload) // 现有 FCM
}

/**
 * 统一初始化所有推送通道
 */
export function initPush() {
  const fcm = initFirebase()
  const pushkit = initHuaweiPush()
  return { fcm, pushkit }
}

/**
 * 检查指定平台的推送是否可用
 */
export function isPushEnabled(platform) {
  if (platform === 'harmony') return isHuaweiPushEnabled()
  return isFcmEnabled()
}
