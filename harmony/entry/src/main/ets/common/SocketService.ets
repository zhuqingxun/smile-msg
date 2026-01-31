// SocketService.ets — 单例 WebSocket 通信层

import { webSocket } from '@kit.NetworkKit'
import { BusinessError } from '@kit.BasicServicesKit'
import { util } from '@kit.ArkTS'
import { Constants } from './Constants'
import {
  addMessage, clearMessages,
  ChatMessage
} from './AppState'
import { loadSession, saveSession, clearSession } from './StorageHelper'

// ========== ArkTS 严格模式所需的类型定义 ==========

class WsMessage {
  type: string = ''
  event: string = ''
  data: object = new Object()
  ackId: number = 0
}

class LoginData {
  uuid: string = ''
  nickname: string = ''
}

class PushTokenData {
  token: string = ''
}

class ChatTargetData {
  targetNickname: string = ''
}

class SendMessageData {
  conversationId: string = ''
  content: string = ''
}

class LeaveConversationData {
  conversationId: string = ''
}

class AppStateData {
  inBackground: boolean = false
}

export class ActionResult {
  success: boolean = false
  error: string = ''
}

class SystemMessage implements ChatMessage {
  id: string = ''
  type: string = 'system'
  content: string = '对方已离线'

  constructor() {
    this.id = `sys_${Date.now()}`
  }
}

let ws: webSocket.WebSocket | null = null
let ackCounter: number = 0
let ackCallbacks: Map<number, (data: object) => void> = new Map()
let reconnectTimer: number = -1
let reconnectDelay: number = Constants.RECONNECT_DELAY_INITIAL
let isDestroyed: boolean = false

/**
 * 生成 UUID v4
 */
function generateUuid(): string {
  return util.generateRandomUUID(true)
}

/**
 * 获取或创建 UUID
 */
export function getOrCreateUuid(): string {
  let uuid = AppStorage.get<string>('myUuid') || ''
  if (!uuid) {
    uuid = generateUuid()
    AppStorage.set('myUuid', uuid)
  }
  return uuid
}

/**
 * 发送 JSON 消息到 WebSocket
 */
function wsSend(msg: WsMessage): void {
  if (ws) {
    ws.send(JSON.stringify(msg))
  }
}

function buildMsg(type: string, event: string = '', data: object = new Object(), ackId: number = 0): WsMessage {
  const m = new WsMessage()
  m.type = type
  m.event = event
  m.data = data
  m.ackId = ackId
  return m
}

/**
 * 发送带 ACK 的事件，返回 Promise
 */
function emitWithAck(event: string, data: object): Promise<object> {
  return new Promise((resolve, reject) => {
    const ackId = ++ackCounter
    ackCallbacks.set(ackId, resolve)
    wsSend(buildMsg('event', event, data, ackId))

    // 10 秒超时
    setTimeout(() => {
      if (ackCallbacks.has(ackId)) {
        ackCallbacks.delete(ackId)
        reject(new Error('ACK timeout'))
      }
    }, 10000)
  })
}

/**
 * 发送无需 ACK 的事件
 */
function emit(event: string, data: object): void {
  wsSend(buildMsg('event', event, data))
}

/**
 * 处理服务端消息
 */
function handleMessage(raw: string | ArrayBuffer): void {
  let msg: Record<string, Object>
  try {
    const text = typeof raw === 'string' ? raw : new util.TextDecoder().decodeToString(new Uint8Array(raw as ArrayBuffer))
    msg = JSON.parse(text) as Record<string, Object>
  } catch {
    return
  }

  const type = msg['type'] as string

  // 心跳（不打日志，避免刷屏）
  if (type === 'ping') {
    wsSend(buildMsg('pong'))
    return
  }

  // ACK 响应
  if (type === 'ack') {
    const ackId = msg['ackId'] as number
    const callback = ackCallbacks.get(ackId)
    if (callback) {
      ackCallbacks.delete(ackId)
      callback(msg['data'] as object)
    }
    return
  }

  // 事件
  if (type === 'event') {
    const event = msg['event'] as string
    const data = msg['data'] as Record<string, Object>
    handleServerEvent(event, data)
  }
}

/**
 * 处理服务端推送事件
 */
function handleServerEvent(event: string, data: Record<string, Object>): void {
  switch (event) {
    case 'new_message': {
      const convId = data['conversationId'] as string
      const message = data['message'] as ChatMessage
      const myConvId = AppStorage.get<string>('conversationId') || ''
      if (convId === myConvId) {
        addMessage(message)
        // 触发原生反馈（振动/通知）
        onNewMessageReceived(message)
      }
      break
    }
    case 'conversation_created': {
      const convId = data['conversationId'] as string
      const target = data['target'] as Record<string, string>
      AppStorage.set('conversationId', convId)
      AppStorage.set('peerNickname', target['nickname'] || '')
      AppStorage.set('phase', 'chat')
      AppStorage.set('peerIsOffline', false)
      clearMessages()
      // 被动接收邀请时振动
      onConversationCreated()
      break
    }
    case 'peer_offline': {
      const convId = data['conversationId'] as string
      if (convId === AppStorage.get<string>('conversationId')) {
        AppStorage.set('peerIsOffline', true)
        addMessage(new SystemMessage())
      }
      break
    }
    case 'force_disconnect': {
      destroyAndReset()
      break
    }
  }
}

// 原生反馈回调（由 NativeHelper 注册）
let onNewMessageCallback: ((msg: ChatMessage) => void) | null = null
let onConversationCreatedCallback: (() => void) | null = null

export function setOnNewMessageCallback(cb: (msg: ChatMessage) => void): void {
  onNewMessageCallback = cb
}

export function setOnConversationCreatedCallback(cb: () => void): void {
  onConversationCreatedCallback = cb
}

function onNewMessageReceived(msg: ChatMessage): void {
  if (onNewMessageCallback) onNewMessageCallback(msg)
}

function onConversationCreated(): void {
  if (onConversationCreatedCallback) onConversationCreatedCallback()
}

/**
 * 初始化 WebSocket 连接
 */
export function initSocket(): void {
  if (isDestroyed) return
  if (ws) return

  ws = webSocket.createWebSocket()

  ws.on('open', () => {
    console.info('[WS] 连接已建立')
    AppStorage.set('connected', true)
    reconnectDelay = Constants.RECONNECT_DELAY_INITIAL

    // 断线重连时自动重新登录
    const nickname = AppStorage.get<string>('myNickname') || ''
    if (nickname) {
      autoReLogin()
    }
  })

  ws.on('message', (err: BusinessError, data: string | ArrayBuffer) => {
    if (!err) {
      handleMessage(data)
    }
  })

  ws.on('close', () => {
    console.info('[WS] 连接关闭')
    AppStorage.set('connected', false)
    ws = null
    scheduleReconnect()
  })

  ws.on('error', (err: BusinessError) => {
    console.error('[WS] 连接错误:', err.message)
  })

  ws.connect(Constants.SERVER_URL)
}

/**
 * 指数退避重连
 */
function scheduleReconnect(): void {
  if (isDestroyed) return
  if (reconnectTimer !== -1) return

  console.info(`[WS] ${reconnectDelay}ms 后重连...`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = -1
    if (!isDestroyed && !ws) {
      initSocket()
    }
  }, reconnectDelay)

  reconnectDelay = Math.min(reconnectDelay * 1.5, Constants.RECONNECT_DELAY_MAX)
}

/**
 * 自动重新登录（重连后）
 */
async function autoReLogin(): Promise<void> {
  const uuid = AppStorage.get<string>('myUuid') || ''
  const nickname = AppStorage.get<string>('myNickname') || ''
  if (!uuid || !nickname) return

  try {
    const loginData = new LoginData()
    loginData.uuid = uuid
    loginData.nickname = nickname
    const res = await emitWithAck('login', loginData) as Record<string, Object>
    if (res['success']) {
      if (res['restored']) {
        AppStorage.set('conversationId', (res['conversationId'] as string) || '')
        const target = res['target'] as Record<string, string> | null
        AppStorage.set('peerNickname', target?.['nickname'] || '')
        AppStorage.set('phase', target ? 'chat' : 'idle')
        AppStorage.set('peerIsOffline', false)
      }
      // 重连成功后重新注册 Push Token
      registerPushTokenIfAvailable()
    }
  } catch (e) {
    console.error('[WS] 自动登录失败:', (e as Error).message)
  }
}

/**
 * 注册 Push Token（由 PushHelper 调用）
 */
let cachedPushToken: string = ''

export function setCachedPushToken(token: string): void {
  cachedPushToken = token
}

function registerPushTokenIfAvailable(): void {
  if (cachedPushToken) {
    const tokenData = new PushTokenData()
    tokenData.token = cachedPushToken
    emit('register_push_token', tokenData)
  }
}

// ========== 业务方法（供 UI 调用）==========

/**
 * 登录
 */
export async function login(nickname: string): Promise<ActionResult> {
  AppStorage.set('errorMsg', '')
  AppStorage.set('loading', true)
  const uuid = getOrCreateUuid()

  initSocket()

  // 等待连接建立
  if (!AppStorage.get<boolean>('connected')) {
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (AppStorage.get<boolean>('connected')) {
          clearInterval(check)
          resolve()
        }
      }, 100)
      // 10 秒超时
      setTimeout(() => { clearInterval(check); resolve() }, 10000)
    })
  }

  try {
    const loginData = new LoginData()
    loginData.uuid = uuid
    loginData.nickname = nickname.trim()
    const res = await emitWithAck('login', loginData) as Record<string, Object>
    AppStorage.set('loading', false)

    if (res['success']) {
      AppStorage.set('myNickname', nickname.trim())
      // 登录成功后持久化
      saveSession(uuid, nickname.trim())
      // 注册推送
      registerPushTokenIfAvailable()

      if (res['restored']) {
        AppStorage.set('conversationId', (res['conversationId'] as string) || '')
        const target = res['target'] as Record<string, string> | null
        AppStorage.set('peerNickname', target?.['nickname'] || '')
        AppStorage.set('phase', target ? 'chat' : 'idle')
        AppStorage.set('peerIsOffline', false)
      } else {
        AppStorage.set('phase', 'idle')
      }
      const result = new ActionResult()
      result.success = true
      return result
    } else {
      AppStorage.set('errorMsg', (res['error'] as string) || '登录失败')
      const result = new ActionResult()
      result.error = res['error'] as string
      return result
    }
  } catch (e) {
    AppStorage.set('loading', false)
    AppStorage.set('errorMsg', '连接超时')
    const result = new ActionResult()
    result.error = '连接超时'
    return result
  }
}

/**
 * 发起私聊
 */
export async function createChat(targetNickname: string): Promise<ActionResult> {
  AppStorage.set('errorMsg', '')
  AppStorage.set('loading', true)

  try {
    const chatData = new ChatTargetData()
    chatData.targetNickname = targetNickname.trim()
    const res = await emitWithAck('create_private_chat', chatData) as Record<string, Object>
    AppStorage.set('loading', false)

    if (res['success']) {
      const convId = (res['conversationId'] as string) || ''
      AppStorage.set('conversationId', convId)
      const target = res['target'] as Record<string, string>
      AppStorage.set('peerNickname', target['nickname'] || '')
      AppStorage.set('phase', 'chat')
      AppStorage.set('peerIsOffline', false)
      clearMessages()
      const result = new ActionResult()
      result.success = true
      return result
    } else {
      AppStorage.set('errorMsg', (res['error'] as string) || '连接失败')
      const result = new ActionResult()
      result.error = res['error'] as string
      return result
    }
  } catch (e) {
    AppStorage.set('loading', false)
    const result = new ActionResult()
    result.error = '操作超时'
    return result
  }
}

/**
 * 发送消息
 */
export function sendMessage(content: string): void {
  const convId = AppStorage.get<string>('conversationId') || ''
  if (!content || !content.trim() || !convId) return
  const msgData = new SendMessageData()
  msgData.conversationId = convId
  msgData.content = content
  emit('send_message', msgData)
}

/**
 * 离开会话
 */
export function leaveConversation(): void {
  const convId = AppStorage.get<string>('conversationId') || ''
  if (!convId) return
  const leaveData = new LeaveConversationData()
  leaveData.conversationId = convId
  emit('leave_conversation', leaveData)
  AppStorage.set('conversationId', '')
  AppStorage.set('peerNickname', '')
  AppStorage.set('phase', 'idle')
  AppStorage.set('peerIsOffline', false)
  clearMessages()
}

/**
 * 主动退出（断开连接 + 清理状态）
 */
export function disconnect(): void {
  clearSession()
  destroyAndReset()
}

/**
 * 通知服务端前后台状态
 */
export function notifyAppState(inBackground: boolean): void {
  const stateData = new AppStateData()
  stateData.inBackground = inBackground
  emit('app_state', stateData)
}

/**
 * 彻底销毁连接并重置状态
 */
export function destroyAndReset(): void {
  isDestroyed = true
  if (reconnectTimer !== -1) {
    clearTimeout(reconnectTimer)
    reconnectTimer = -1
  }
  ackCallbacks.clear()
  if (ws) {
    ws.close()
    ws = null
  }
  AppStorage.set('connected', false)
  AppStorage.set('myUuid', '')
  AppStorage.set('myNickname', '')
  AppStorage.set('peerNickname', '')
  AppStorage.set('conversationId', '')
  AppStorage.set('phase', 'login')
  AppStorage.set('peerIsOffline', false)
  AppStorage.set('errorMsg', '')
  AppStorage.set('loading', false)
  clearMessages()
  // 允许后续重新初始化
  isDestroyed = false
}

/**
 * App 回到前台时检查连接
 */
export function reconnectIfNeeded(): void {
  if (!ws && AppStorage.get<string>('myNickname')) {
    isDestroyed = false
    initSocket()
  }
}

/**
 * 尝试从本地持久化恢复会话
 */
export async function tryRestoreSession(): Promise<void> {
  const session = await loadSession()
  if (!session) return

  // 恢复 UUID 和昵称
  AppStorage.set('myUuid', session.uuid)
  const result = await login(session.nickname)
  if (result.success) {
    await saveSession(session.uuid, session.nickname)
    registerPushTokenIfAvailable()
  } else {
    await clearSession()
    AppStorage.set('myUuid', '')
  }
}
