// LoginPage.ets

import { login } from '../common/SocketService'

@Component
export struct LoginPage {
  @StorageLink('errorMsg') errorMsg: string = ''
  @StorageLink('loading') loading: boolean = false
  @State nickname: string = ''

  build() {
    Column() {
      Text('SmileMsg')
        .fontSize(28)
        .fontWeight(FontWeight.Bold)
        .fontColor('#1f2937')
        .margin({ bottom: 40 })

      TextInput({ placeholder: '输入你的昵称', text: this.nickname })
        .width('80%')
        .height(44)
        .maxLength(20)
        .enabled(!this.loading)
        .onChange((value: string) => {
          this.nickname = value
        })
        .onSubmit(() => {
          this.handleLogin()
        })

      if (this.errorMsg) {
        Text(this.errorMsg)
          .fontSize(14)
          .fontColor('#ef4444')
          .margin({ top: 8 })
      }

      Button(this.loading ? '登录中...' : '登录')
        .width('80%')
        .height(44)
        .margin({ top: 16 })
        .backgroundColor('#3b82f6')
        .enabled(!this.loading && this.nickname.trim().length > 0)
        .onClick(() => {
          this.handleLogin()
        })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor('#ffffff')
  }

  async handleLogin(): Promise<void> {
    if (!this.nickname.trim() || this.nickname.length > 20) return
    await login(this.nickname)
  }
}
