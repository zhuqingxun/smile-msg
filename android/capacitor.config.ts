import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.smilemsg.app',
  appName: 'SmileMsg',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: {
      enabled: false
    }
  }
}

export default config
