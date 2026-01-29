<script setup>
import { ref, watch, nextTick, computed } from 'vue'
import { useSocket } from '../composables/useSocket.js'

const {
  phase, myUuid, peerNickname, peerIsOffline, messages, error, loading,
  createChat, sendMessage, disconnect
} = useSocket()

const targetInput = ref('')
const messageInput = ref('')
const messagesContainer = ref(null)

const isIdle = computed(() => phase.value === 'idle')
const isChat = computed(() => phase.value === 'chat')
const canSend = computed(() => isChat.value && !peerIsOffline.value)

async function handleConnect() {
  if (!targetInput.value.trim() || targetInput.value.length > 20) return
  await createChat(targetInput.value)
}

function handleSend() {
  const content = messageInput.value
  if (!content.trim()) return
  sendMessage(content)
  messageInput.value = ''
}

function handleDisconnect() {
  disconnect()
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

// 新消息自动滚动到底部
watch(messages, async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}, { deep: true })
</script>

<template>
  <div class="flex flex-col h-screen bg-white">
    <!-- 顶部栏 -->
    <div class="flex items-center gap-2 p-3 border-b border-gray-200">
      <template v-if="isIdle">
        <input
          v-model="targetInput"
          type="text"
          placeholder="输入对方昵称"
          maxlength="20"
          class="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
          :disabled="loading"
          @keyup.enter="handleConnect"
        />
        <button
          class="px-4 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          :disabled="loading || !targetInput.trim()"
          @click="handleConnect"
        >
          {{ loading ? '连接中...' : '连接' }}
        </button>
      </template>
      <template v-else>
        <span class="flex-1 font-medium text-gray-800">{{ peerNickname }}</span>
        <button
          class="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          @click="handleDisconnect"
        >
          断开
        </button>
      </template>
    </div>
    <p v-if="error && isIdle" class="px-3 pt-1 text-sm text-red-500">{{ error }}</p>

    <!-- 消息区域 -->
    <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-3">
      <template v-for="msg in messages" :key="msg.id">
        <!-- 系统消息 -->
        <div v-if="msg.type === 'system'" class="text-center text-sm text-gray-400">
          —— {{ msg.content }} ——
        </div>
        <!-- 对方消息 -->
        <div v-else-if="msg.senderUuid !== myUuid" class="flex justify-start">
          <div class="max-w-xs px-3 py-2 bg-gray-100 rounded-lg text-gray-800 whitespace-pre-wrap break-words">
            {{ msg.content }}
          </div>
        </div>
        <!-- 我的消息 -->
        <div v-else class="flex justify-end">
          <div class="max-w-xs px-3 py-2 bg-blue-500 text-white rounded-lg whitespace-pre-wrap break-words">
            {{ msg.content }}
          </div>
        </div>
      </template>
    </div>

    <!-- 输入区域 -->
    <div class="p-3 border-t border-gray-200">
      <textarea
        v-model="messageInput"
        rows="2"
        placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
        class="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
        :disabled="!canSend"
        @keydown="handleKeydown"
      ></textarea>
    </div>
  </div>
</template>
