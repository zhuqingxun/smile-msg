<script setup>
import { useSocket } from './composables/useSocket.js'
import LoginView from './components/LoginView.vue'
import ChatView from './components/ChatView.vue'

const { phase } = useSocket()
</script>

<template>
  <LoginView v-if="phase === 'login'" />
  <ChatView v-else />
</template>
