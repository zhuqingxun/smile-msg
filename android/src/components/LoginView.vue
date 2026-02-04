<script setup>
import { ref } from 'vue'
import { useSocket } from '../composables/useSocket.js'

const { error, loading, login, clientConfig } = useSocket()
const nickname = ref('')

async function handleLogin() {
  if (!nickname.value.trim() || nickname.value.length > clientConfig.value.maxNicknameLength) return
  await login(nickname.value)
}
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-dvh bg-white px-6 safe-area-inset">
    <h1 class="text-4xl font-bold text-gray-800 mb-10">SmileMsg</h1>

    <div class="w-full max-w-sm">
      <input
        v-model="nickname"
        type="text"
        placeholder="输入你的昵称"
        :maxlength="clientConfig.maxNicknameLength"
        autocomplete="off"
        enterkeyhint="go"
        class="w-full px-4 py-3 text-lg border border-gray-300 rounded-xl focus:outline-none focus:border-blue-500"
        :disabled="loading"
        @keyup.enter="handleLogin"
      />
      <p v-if="error" class="mt-2 text-sm text-red-500">{{ error }}</p>

      <button
        class="w-full mt-5 px-4 py-3 text-lg bg-blue-500 text-white rounded-xl active:bg-blue-700 disabled:opacity-50"
        :disabled="loading || !nickname.trim()"
        @click="handleLogin"
      >
        {{ loading ? '登录中...' : '登录' }}
      </button>
    </div>
  </div>
</template>
