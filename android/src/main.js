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
  const { reconnectIfNeeded } = useSocket()
  setupAppLifecycle({ onResume: reconnectIfNeeded })
  await initNotificationChannel()
  await requestNotificationPermission()
}

initNative().then(() => {
  createApp(App).mount('#app')
})
