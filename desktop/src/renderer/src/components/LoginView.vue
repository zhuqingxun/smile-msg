<script setup>
import { ref } from 'vue'
import { useSocket } from '../composables/useSocket.js'

const { error, loading, login } = useSocket()
const nickname = ref('')

async function handleLogin() {
  if (!nickname.value.trim() || nickname.value.length > 20) return
  await login(nickname.value)
}
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-white">
    <h1 class="text-3xl font-bold text-gray-800 mb-8">SmileMsg</h1>

    <div class="w-72">
      <input
        v-model="nickname"
        type="text"
        placeholder="输入你的昵称"
        maxlength="20"
        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
        :disabled="loading"
        @keyup.enter="handleLogin"
      />
      <p v-if="error" class="mt-2 text-sm text-red-500">{{ error }}</p>

      <button
        class="w-full mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="loading || !nickname.trim()"
        @click="handleLogin"
      >
        {{ loading ? '登录中...' : '登录' }}
      </button>
    </div>
  </div>
</template>
