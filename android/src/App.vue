<script setup>
import { onMounted } from 'vue'
import { App as CapApp } from '@capacitor/app'
import { useSocket } from './composables/useSocket.js'
import LoginView from './components/LoginView.vue'
import ChatView from './components/ChatView.vue'

const { phase, disconnect, leaveConversation, tryRestoreSession } = useSocket()

onMounted(async () => {
  // Android 返回键处理
  CapApp.addListener('backButton', () => {
    if (phase.value === 'chat') {
      leaveConversation()
    } else if (phase.value === 'idle') {
      disconnect()
    } else {
      CapApp.exitApp()
    }
  })

  // App 生命周期：回到前台时触发 socket 重连检查
  // Socket.io 自身的 reconnection 机制会自动处理

  // 尝试从本地持久化恢复会话
  await tryRestoreSession()
})
</script>

<template>
  <LoginView v-if="phase === 'login'" />
  <ChatView v-else />
</template>
