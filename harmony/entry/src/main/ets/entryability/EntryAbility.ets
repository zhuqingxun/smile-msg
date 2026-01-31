// EntryAbility.ets

import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit'
import { hilog } from '@kit.PerformanceAnalysisKit'
import { KeyboardAvoidMode, window } from '@kit.ArkUI'
import { initAppState, ChatMessage } from '../common/AppState'
import { initPreferences } from '../common/StorageHelper'
import { registerPushToken } from '../common/PushHelper'
import { notifyAppState, reconnectIfNeeded, setOnNewMessageCallback, setOnConversationCreatedCallback } from '../common/SocketService'
import { vibrateOnMessage, requestNotificationPermission, createNotificationSlot, cancelAllNotifications, publishLocalNotification } from '../common/NativeHelper'

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
    setOnNewMessageCallback((msg: ChatMessage) => {
      vibrateOnMessage()
      // 前台通知判断：不在当前聊天页面时发布本地通知
      const phase = AppStorage.get<string>('phase') || ''
      if (phase !== 'chat') {
        publishLocalNotification(msg.senderNickname || '新消息', msg.content)
      }
    })

    setOnConversationCreatedCallback(() => {
      vibrateOnMessage()
    })
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    hilog.info(0x0000, 'SmileMsg', 'onWindowStageCreate')

    windowStage.loadContent('pages/Index', async () => {
      // 键盘弹出时缩小窗口而非整体上推，保持顶部栏可见
      const mainWindow = windowStage.getMainWindowSync()
      mainWindow.getUIContext().setKeyboardAvoidMode(KeyboardAvoidMode.RESIZE)

      // 先申请通知权限，再创建通知通道（确保权限就绪后通道可用）
      await requestNotificationPermission(this.context)
      await createNotificationSlot()
    })
  }

  onForeground(): void {
    hilog.info(0x0000, 'SmileMsg', 'onForeground')
    cancelAllNotifications()
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
