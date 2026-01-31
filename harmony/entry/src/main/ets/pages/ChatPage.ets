// ChatPage.ets — idle 态（输入对方昵称）+ chat 态（消息列表+输入框）

import { createChat, sendMessage, leaveConversation } from '../common/SocketService'
import { ChatMessage } from '../common/AppState'

@Component
export struct ChatPage {
  @StorageLink('phase') phase: string = 'idle'
  @StorageLink('peerNickname') peerNickname: string = ''
  @StorageLink('peerIsOffline') peerIsOffline: boolean = false
  @StorageLink('errorMsg') errorMsg: string = ''
  @StorageLink('loading') loading: boolean = false
  @StorageLink('messages') @Watch('onMessagesChange') messagesJson: string = '[]'
  @StorageLink('myUuid') myUuid: string = ''

  @State targetInput: string = ''
  @State messageInput: string = ''
  @State messageList: ChatMessage[] = []

  private scroller: Scroller = new Scroller()

  build() {
    Column() {
      // 顶部栏
      Row() {
        if (this.phase === 'idle') {
          TextInput({ placeholder: '输入对方昵称', text: this.targetInput })
            .layoutWeight(1)
            .height(36)
            .maxLength(20)
            .enabled(!this.loading)
            .onChange((value: string) => { this.targetInput = value })
            .onSubmit(() => { this.handleConnect() })

          Button(this.loading ? '连接中...' : '连接')
            .height(36)
            .margin({ left: 8 })
            .backgroundColor('#3b82f6')
            .enabled(!this.loading && this.targetInput.trim().length > 0)
            .onClick(() => { this.handleConnect() })
        } else {
          Text(this.peerNickname)
            .layoutWeight(1)
            .fontSize(16)
            .fontWeight(FontWeight.Medium)
            .fontColor('#1f2937')

          Button('断开')
            .height(36)
            .backgroundColor('#e5e7eb')
            .fontColor('#374151')
            .onClick(() => { leaveConversation() })
        }
      }
      .width('100%')
      .padding(12)
      .borderWidth({ bottom: 1 })
      .borderColor('#e5e7eb')

      // 错误提示
      if (this.errorMsg && this.phase === 'idle') {
        Text(this.errorMsg)
          .fontSize(13)
          .fontColor('#ef4444')
          .padding({ left: 12, top: 4 })
      }

      // 消息列表
      List({ scroller: this.scroller }) {
        ForEach(this.messageList, (msg: ChatMessage) => {
          ListItem() {
            if (msg.type === 'system') {
              // 系统消息
              Row() {
                Text(`—— ${msg.content} ——`)
                  .fontSize(13)
                  .fontColor('#9ca3af')
              }.width('100%').justifyContent(FlexAlign.Center)
            } else if (msg.senderUuid !== this.myUuid) {
              // 对方消息
              Row() {
                Text(msg.content)
                  .fontSize(15)
                  .fontColor('#1f2937')
                  .padding(10)
                  .backgroundColor('#f3f4f6')
                  .borderRadius(12)
                  .constraintSize({ maxWidth: '70%' })
              }.width('100%').justifyContent(FlexAlign.Start)
            } else {
              // 我的消息
              Row() {
                Text(msg.content)
                  .fontSize(15)
                  .fontColor('#ffffff')
                  .padding(10)
                  .backgroundColor('#3b82f6')
                  .borderRadius(12)
                  .constraintSize({ maxWidth: '70%' })
              }.width('100%').justifyContent(FlexAlign.End)
            }
          }.padding({ left: 16, right: 16, top: 4, bottom: 4 })
        }, (msg: ChatMessage): string => msg.id)  // keyGenerator 确保列表性能
      }
      .layoutWeight(1)

      // 输入区域
      Row() {
        TextInput({ placeholder: '输入消息...', text: this.messageInput })
          .layoutWeight(1)
          .height(40)
          .enabled(this.phase === 'chat' && !this.peerIsOffline)
          .onChange((value: string) => { this.messageInput = value })
          .onSubmit(() => { this.handleSend() })
          .onFocus(() => { this.scrollToBottom() })

        Button('发送')
          .height(40)
          .margin({ left: 8 })
          .backgroundColor('#3b82f6')
          .enabled(this.phase === 'chat' && !this.peerIsOffline && this.messageInput.trim().length > 0)
          .onClick(() => { this.handleSend() })
      }
      .width('100%')
      .padding(12)
      .borderWidth({ top: 1 })
      .borderColor('#e5e7eb')
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#ffffff')
  }

  // 消息列表变化时解析 JSON 并更新 @State 数组
  onMessagesChange(): void {
    try {
      if (this.messagesJson) {
        this.messageList = JSON.parse(this.messagesJson) as ChatMessage[]
      } else {
        this.messageList = []
      }
    } catch {
      this.messageList = []
    }
    if (this.messageList.length > 0) {
      setTimeout(() => {
        this.scroller.scrollToIndex(this.messageList.length - 1)
      }, 50)
    }
  }

  aboutToAppear(): void {
    // 初始化时从 AppStorage 同步消息列表
    if (this.messagesJson) {
      this.onMessagesChange()
    }
  }

  async handleConnect(): Promise<void> {
    if (!this.targetInput.trim() || this.targetInput.length > 20) return
    await createChat(this.targetInput)
  }

  scrollToBottom(): void {
    if (this.messageList.length > 0) {
      // 延迟等待键盘弹出后布局完成
      setTimeout(() => {
        this.scroller.scrollToIndex(this.messageList.length - 1)
      }, 150)
    }
  }

  handleSend(): void {
    const content = this.messageInput
    if (!content.trim()) return
    sendMessage(content)
    this.messageInput = ''
  }
}
