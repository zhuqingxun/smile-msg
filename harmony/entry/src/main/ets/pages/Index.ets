// Index.ets — 根据 phase 状态切换 LoginPage 和 ChatPage

import { LoginPage } from './LoginPage'
import { ChatPage } from './ChatPage'
import { disconnect, leaveConversation, tryRestoreSession } from '../common/SocketService'

@Entry
@Component
struct Index {
  @StorageLink('phase') phase: string = 'login'

  aboutToAppear(): void {
    // 尝试恢复会话
    tryRestoreSession()
  }

  // 返回手势/返回键处理
  onBackPress(): boolean {
    if (this.phase === 'chat') {
      leaveConversation()
      return true  // 拦截返回
    } else if (this.phase === 'idle') {
      disconnect()
      return true
    }
    return false   // 默认行为（退出应用）
  }

  build() {
    Stack() {
      if (this.phase === 'login') {
        LoginPage()
      } else {
        ChatPage()
      }
    }
    .width('100%')
    .height('100%')
  }
}
