import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5174
  },
  build: {
    rollupOptions: {
      // @capacitor-firebase/messaging 的 Web 实现依赖 firebase/messaging，
      // Android 原生项目不需要 Web 端 Firebase，标记为 external 避免构建报错
      external: ['firebase/messaging']
    }
  }
})
