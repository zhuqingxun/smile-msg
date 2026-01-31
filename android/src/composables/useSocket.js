import { ref, readonly } from 'vue'
import { io } from 'socket.io-client'
import {
  vibrateOnMessage,
  notifyNewMessage,
  isInForeground,
  saveSession,
  loadSession,
  clearSession,
  startForegroundService,
  stopForegroundService,
  checkGmsAvailability,
  getPushStrategy,
  STRATEGY_FOREGROUND_SERVICE,
  onFcmTokenRefresh,
  removeFcmTokenRefreshListener
} from './useNativeFeatures.js'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || ''

// 单例 socket 实例
let socket = null

// 全局响应式状态
const connected = ref(false)
const myUuid = ref('')
const myNickname = ref('')
const peerNickname = ref('')
const conversationId = ref('')
const messages = ref([])
const phase = ref('login') // 'login' | 'idle' | 'chat'
const peerIsOffline = ref(false)
const error = ref('')
const loading = ref(false)

const MAX_MESSAGES = 200
let keepaliveTimer = null

function getOrCreateUuid() {
  if (!myUuid.value) {
    myUuid.value = crypto.randomUUID()
  }
  return myUuid.value
}

// 收到新消息时的原生反馈
function onNewMessage(message) {
  if (isInForeground()) {
    vibrateOnMessage()
  } else {
    notifyNewMessage(peerNickname.value || '新消息', message.content || '').catch(e => {
      console.warn('[msg] 本地通知失败:', e?.message || e)
    })
  }
}

// 后台心跳保活：定期发 ping 防止 WebView 网络被系统切断
function startKeepalive() {
  stopKeepalive()
  keepaliveTimer = setInterval(() => {
    if (socket && socket.connected) {
      socket.volatile.emit('ping_keepalive')
    } else if (socket && myNickname.value) {
      socket.connect()
    }
  }, 25000)
}

function stopKeepalive() {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer)
    keepaliveTimer = null
  }
}

// GMS 检测 + 推送策略决策 + 条件启动前台服务 + FCM 注册
async function registerPushAndDecideStrategy() {
  if (!socket || !socket.connected) return

  try {
    const { hasGms, token } = await checkGmsAvailability()
    console.log(`[push] GMS=${hasGms}, token=${token ? 'yes' : 'no'}`)

    if (token) {
      socket.emit('register_push_token', { token })
    }

    // 无 GMS 时根据策略决定是否启动前台服务
    if (!hasGms) {
      const strategy = await getPushStrategy()
      if (strategy === STRATEGY_FOREGROUND_SERVICE) {
        await startForegroundService()
      }
    }

    // Token 刷新监听（仅有 GMS 时有意义）
    if (hasGms) {
      onFcmTokenRefresh((newToken) => {
        if (socket && socket.connected) {
          socket.emit('register_push_token', { token: newToken })
        }
      })
    }
  } catch (e) {
    console.error('[push] 推送策略初始化失败:', e?.message || e)
  }
}

function initSocket() {
  // 如果 socket 已存在（无论连接状态），直接复用
  if (socket) {
    if (!socket.connected) {
      socket.connect()
    }
    return
  }

  // 首次创建 socket
  socket = io(SERVER_URL, {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    transports: ['websocket']
  })

  socket.on('connect', () => {
    connected.value = true
    startKeepalive()

    // 断线重连时自动重新登录
    if (myNickname.value) {
      socket.emit('login', {
        uuid: myUuid.value,
        nickname: myNickname.value
      }, (res) => {
        if (res.success && res.restored) {
          conversationId.value = res.conversationId
          peerNickname.value = res.target?.nickname || ''
          phase.value = res.target ? 'chat' : 'idle'
          peerIsOffline.value = false
        }
        // 重连后重新执行推送策略
        if (res.success) {
          registerPushAndDecideStrategy()
        }
      })
    }
  })

  socket.on('disconnect', () => {
    connected.value = false
  })

  socket.on('new_message', ({ conversationId: convId, message }) => {
    if (convId === conversationId.value) {
      messages.value.push(message)
      if (messages.value.length > MAX_MESSAGES) {
        messages.value = messages.value.slice(-MAX_MESSAGES)
      }
      onNewMessage(message)
    }
  })

  socket.on('conversation_created', ({ conversationId: convId, target }) => {
    conversationId.value = convId
    peerNickname.value = target.nickname
    phase.value = 'chat'
    peerIsOffline.value = false
    messages.value = []
    // 被动收到会话创建通知时也触发振动
    if (isInForeground()) {
      vibrateOnMessage()
    } else {
      notifyNewMessage(target.nickname, '发起了聊天')
    }
  })

  socket.on('peer_offline', ({ conversationId: convId }) => {
    if (convId === conversationId.value) {
      peerIsOffline.value = true
      messages.value.push({
        id: `sys_${Date.now()}`,
        type: 'system',
        content: '对方已离线'
      })
    }
  })

  socket.on('force_disconnect', () => {
    destroyAndReset()
  })

  socket.connect()
}

function login(nickname) {
  return new Promise((resolve) => {
    error.value = ''
    loading.value = true
    const uuid = getOrCreateUuid()

    initSocket()

    const doLogin = () => {
      socket.emit('login', { uuid, nickname: nickname.trim() }, (res) => {
        loading.value = false
        if (res.success) {
          myNickname.value = nickname.trim()
          if (res.restored) {
            conversationId.value = res.conversationId
            peerNickname.value = res.target?.nickname || ''
            phase.value = res.target ? 'chat' : 'idle'
            peerIsOffline.value = false
          } else {
            phase.value = 'idle'
          }
          // 登录成功后持久化会话，检测 GMS 并按策略分流
          saveSession(myUuid.value, myNickname.value)
          registerPushAndDecideStrategy()
          resolve({ success: true })
        } else {
          error.value = res.error
          resolve({ success: false, error: res.error })
        }
      })
    }

    if (socket.connected) {
      doLogin()
    } else {
      socket.once('connect', doLogin)
    }
  })
}

function createChat(targetNickname) {
  return new Promise((resolve) => {
    error.value = ''
    loading.value = true
    socket.emit('create_private_chat', { targetNickname: targetNickname.trim() }, (res) => {
      loading.value = false
      if (res.success) {
        conversationId.value = res.conversationId
        peerNickname.value = res.target.nickname
        phase.value = 'chat'
        peerIsOffline.value = false
        messages.value = []
        resolve({ success: true })
      } else {
        error.value = res.error
        resolve({ success: false, error: res.error })
      }
    })
  })
}

function sendMessage(content) {
  if (!content || !content.trim() || !conversationId.value) return
  socket.emit('send_message', {
    conversationId: conversationId.value,
    content
  })
}

function leaveConversation() {
  if (!conversationId.value || !socket?.connected) return
  socket.emit('leave_conversation', { conversationId: conversationId.value })
  conversationId.value = ''
  peerNickname.value = ''
  messages.value = []
  phase.value = 'idle'
  peerIsOffline.value = false
}

function disconnect() {
  // 主动退出时清除持久化数据并停止前台服务
  clearSession()
  stopForegroundService()
  destroyAndReset()
}

/**
 * 彻底销毁 socket 并重置所有状态
 */
function destroyAndReset() {
  stopKeepalive()
  removeFcmTokenRefreshListener()
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
  connected.value = false
  myUuid.value = ''
  myNickname.value = ''
  peerNickname.value = ''
  conversationId.value = ''
  messages.value = []
  phase.value = 'login'
  peerIsOffline.value = false
  error.value = ''
  loading.value = false
}

/**
 * 尝试从本地持久化恢复会话
 */
async function tryRestoreSession() {
  const session = await loadSession()
  if (!session) return

  // 恢复 UUID 和昵称，尝试登录
  myUuid.value = session.uuid
  const result = await login(session.nickname)
  if (!result.success) {
    // 恢复失败，清除持久化数据
    await clearSession()
    myUuid.value = ''
  }
}

/**
 * App 回到前台时立即检查连接状态并重连
 */
function reconnectIfNeeded() {
  if (socket && !socket.connected && myNickname.value) {
    socket.connect()
  }
}

function notifyBackground() {
  if (socket && socket.connected) {
    socket.emit('app_state', { inBackground: true })
  }
}

function notifyForeground() {
  if (socket && socket.connected) {
    socket.emit('app_state', { inBackground: false })
  }
}

export function useSocket() {
  return {
    // 状态（只读）
    connected: readonly(connected),
    myUuid: readonly(myUuid),
    myNickname: readonly(myNickname),
    peerNickname: readonly(peerNickname),
    conversationId: readonly(conversationId),
    messages: readonly(messages),
    phase: readonly(phase),
    peerIsOffline: readonly(peerIsOffline),
    error: readonly(error),
    loading: readonly(loading),
    // 方法
    login,
    createChat,
    sendMessage,
    leaveConversation,
    disconnect,
    tryRestoreSession,
    reconnectIfNeeded,
    notifyBackground,
    notifyForeground
  }
}
