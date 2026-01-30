import { ref, readonly } from 'vue'
import { io } from 'socket.io-client'

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

function generateUuid() {
  return crypto.randomUUID()
}

function getOrCreateUuid() {
  if (!myUuid.value) {
    myUuid.value = generateUuid()
  }
  return myUuid.value
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
    reconnectionDelayMax: 5000
  })

  socket.on('connect', () => {
    connected.value = true

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
    }
  })

  socket.on('conversation_created', ({ conversationId: convId, target }) => {
    conversationId.value = convId
    peerNickname.value = target.nickname
    phase.value = 'chat'
    peerIsOffline.value = false
    messages.value = []
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
  destroyAndReset()
}

/**
 * 彻底销毁 socket 并重置所有状态
 */
function destroyAndReset() {
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
    disconnect
  }
}
