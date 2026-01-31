import { createApp } from 'vue'
import App from './App.vue'
import './assets/main.css'
import {
  initNotificationChannel,
  requestNotificationPermission,
  setupAppLifecycle
} from './composables/useNativeFeatures.js'
import { useSocket } from './composables/useSocket.js'

async function initNative() {
  const { reconnectIfNeeded, notifyBackground, notifyForeground } = useSocket()
  setupAppLifecycle({
    onResume: () => { reconnectIfNeeded(); notifyForeground() },
    onPause: () => { notifyBackground() }
  })

  await initNotificationChannel()
  await requestNotificationPermission()
}

initNative().catch((e) => {
  console.error('[init] 原生初始化失败:', e?.message || e)
}).finally(() => {
  createApp(App).mount('#app')
})
