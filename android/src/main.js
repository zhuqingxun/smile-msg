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

initNative().then(() => {
  createApp(App).mount('#app')
})
