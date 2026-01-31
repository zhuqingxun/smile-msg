import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Preferences } from '@capacitor/preferences'
import { App } from '@capacitor/app'
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service'
import { FirebaseMessaging } from '@capacitor-firebase/messaging'

// 振动反馈
export async function vibrateOnMessage() {
  await Haptics.impact({ style: ImpactStyle.Medium })
}

// 状态栏通知
export async function notifyNewMessage(senderNickname, content) {
  await LocalNotifications.schedule({
    notifications: [{
      title: `${senderNickname} 发来消息`,
      body: content,
      id: Date.now() % 2147483647,
      channelId: 'messages'
    }]
  })
}

// 初始化通知渠道（Android 8+ 必需）
export async function initNotificationChannel() {
  await LocalNotifications.createChannel({
    id: 'messages',
    name: '新消息',
    description: 'SmileMsg 新消息通知',
    importance: 4,
    vibration: true
  })
}

// 请求通知权限（Android 13+ 必需）
export async function requestNotificationPermission() {
  const result = await LocalNotifications.requestPermissions()
  return result.display === 'granted'
}

// 本地持久化：保存会话状态
export async function saveSession(uuid, nickname) {
  await Preferences.set({ key: 'session_uuid', value: uuid })
  await Preferences.set({ key: 'session_nickname', value: nickname })
}

// 本地持久化：读取会话状态
export async function loadSession() {
  const uuid = await Preferences.get({ key: 'session_uuid' })
  const nickname = await Preferences.get({ key: 'session_nickname' })
  if (uuid.value && nickname.value) {
    return { uuid: uuid.value, nickname: nickname.value }
  }
  return null
}

// 本地持久化：清除会话状态（主动退出时调用）
export async function clearSession() {
  await Preferences.remove({ key: 'session_uuid' })
  await Preferences.remove({ key: 'session_nickname' })
}

// 检查 App 是否在前台
let isAppInForeground = true

export function setupAppLifecycle({ onResume, onPause } = {}) {
  App.addListener('pause', () => {
    isAppInForeground = false
    if (onPause) onPause()
  })
  App.addListener('resume', () => {
    isAppInForeground = true
    if (onResume) onResume()
  })
}

export function isInForeground() {
  return isAppInForeground
}

// 前台服务：提升进程优先级，防止系统杀死
export async function startForegroundService() {
  try {
    await ForegroundService.startForegroundService({
      id: 1,
      title: 'SmileMsg',
      body: '聊天连接保持中',
      smallIcon: 'ic_stat_notify',
    })
  } catch (e) {
    console.warn('前台服务启动失败:', e)
  }
}

export async function stopForegroundService() {
  try {
    await ForegroundService.stopForegroundService()
  } catch (e) {
    console.warn('前台服务停止失败:', e)
  }
}

// GMS 可用性检测
let gmsAvailable = null // null=未检测, true=有GMS, false=无GMS

/**
 * 检测 GMS 可用性。通过尝试获取 FCM token 判断：
 * - 成功获取 token → 有 GMS
 * - 返回 null 或抛异常 → 无 GMS（保守降级）
 * 结果缓存，同一会话内不重复检测。
 */
export async function checkGmsAvailability() {
  if (gmsAvailable !== null) {
    return { hasGms: gmsAvailable, token: gmsAvailable ? await getFcmToken() : null }
  }
  try {
    const token = await getFcmToken()
    gmsAvailable = !!token
    return { hasGms: gmsAvailable, token }
  } catch (e) {
    console.warn('GMS 检测失败，降级为无 GMS:', e)
    gmsAvailable = false
    return { hasGms: false, token: null }
  }
}

export function getGmsStatus() {
  return gmsAvailable
}

// 推送策略配置
const PUSH_STRATEGY_KEY = 'push_strategy'
export const STRATEGY_FOREGROUND_SERVICE = 'foreground_service'
export const STRATEGY_PASSIVE = 'passive'

export async function getPushStrategy() {
  const { value } = await Preferences.get({ key: PUSH_STRATEGY_KEY })
  return value || STRATEGY_FOREGROUND_SERVICE
}

export async function setPushStrategy(strategy) {
  await Preferences.set({ key: PUSH_STRATEGY_KEY, value: strategy })
}

// FCM 推送：获取当前 token
export async function getFcmToken() {
  try {
    const result = await FirebaseMessaging.getToken()
    return result.token
  } catch (e) {
    console.warn('获取 FCM token 失败:', e)
    return null
  }
}

// FCM 推送：监听 token 刷新，返回取消函数
let tokenRefreshListener = null

export async function onFcmTokenRefresh(callback) {
  // 移除旧监听
  if (tokenRefreshListener) {
    tokenRefreshListener.remove()
    tokenRefreshListener = null
  }

  tokenRefreshListener = await FirebaseMessaging.addListener('tokenReceived', (event) => {
    callback(event.token)
  })
}

// FCM 推送：清理 token 刷新监听
export function removeFcmTokenRefreshListener() {
  if (tokenRefreshListener) {
    tokenRefreshListener.remove()
    tokenRefreshListener = null
  }
}
