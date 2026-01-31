// AppState.ets — 使用 AppStorage 实现跨页面共享的全局响应式状态

// 初始化 AppStorage 默认值（在 EntryAbility.onCreate 中调用）
export function initAppState(): void {
  AppStorage.setOrCreate('connected', false)
  AppStorage.setOrCreate('myUuid', '')
  AppStorage.setOrCreate('myNickname', '')
  AppStorage.setOrCreate('peerNickname', '')
  AppStorage.setOrCreate('conversationId', '')
  AppStorage.setOrCreate('phase', 'login')         // 'login' | 'idle' | 'chat'
  AppStorage.setOrCreate('peerIsOffline', false)
  AppStorage.setOrCreate('errorMsg', '')
  AppStorage.setOrCreate('loading', false)
  AppStorage.setOrCreate('messages', '[]')          // JSON 字符串存储消息数组
}

// 消息对象接口
export interface ChatMessage {
  id: string
  senderUuid?: string
  senderNickname?: string
  content: string
  timestamp?: number
  type: string                                      // 'text' | 'system'
}

// 消息列表操作辅助函数
export function getMessages(): ChatMessage[] {
  const raw = AppStorage.get<string>('messages') || '[]'
  return JSON.parse(raw) as ChatMessage[]
}

export function setMessages(msgs: ChatMessage[]): void {
  AppStorage.set('messages', JSON.stringify(msgs))
}

export function addMessage(msg: ChatMessage, maxMessages: number = 200): void {
  const msgs = getMessages()
  msgs.push(msg)
  if (msgs.length > maxMessages) {
    setMessages(msgs.slice(-maxMessages))
  } else {
    setMessages(msgs)
  }
}

export function clearMessages(): void {
  setMessages([])
}
