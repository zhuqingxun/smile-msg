// EntryAbility.ets

import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit'
import { hilog } from '@kit.PerformanceAnalysisKit'
import { window } from '@kit.ArkUI'
import { initAppState } from '../common/AppState'
import { initPreferences } from '../common/StorageHelper'
import { registerPushToken } from '../common/PushHelper'
import { notifyAppState, reconnectIfNeeded, setOnNewMessageCallback, setOnConversationCreatedCallback } from '../common/SocketService'
import { vibrateOnMessage } from '../common/NativeHelper'

export default class EntryAbility extends UIAbility {

  async onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): Promise<void> {
    hilog.info(0x0000, 'SmileMsg', 'onCreate')

    // 初始化全局状态
    initAppState()

    // 初始化本地存储
    await initPreferences(this.context)

    // 初始化 Push Kit（获取 Token）
    registerPushToken()

    // 注册原生反馈回调
    setOnNewMessageCallback(() => {
      vibrateOnMessage()
    })

    setOnConversationCreatedCallback(() => {
      vibrateOnMessage()
    })
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    hilog.info(0x0000, 'SmileMsg', 'onWindowStageCreate')
    windowStage.loadContent('pages/Index')
  }

  onForeground(): void {
    hilog.info(0x0000, 'SmileMsg', 'onForeground')
    notifyAppState(false)
    reconnectIfNeeded()
  }

  onBackground(): void {
    hilog.info(0x0000, 'SmileMsg', 'onBackground')
    notifyAppState(true)
  }

  onDestroy(): void {
    hilog.info(0x0000, 'SmileMsg', 'onDestroy')
  }
}
