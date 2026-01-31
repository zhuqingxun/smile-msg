export class Constants {
  // 服务器地址
  static readonly SERVER_URL_DEV: string = 'ws://localhost:3000/ws?platform=harmony'
  static readonly SERVER_URL_PROD: string = 'wss://smile-msg.zeabur.app/ws?platform=harmony'

  // 根据构建类型选择（开发时可切换）
  static readonly SERVER_URL: string = Constants.SERVER_URL_PROD

  // 消息上限
  static readonly MAX_MESSAGES: number = 200

  // 重连配置
  static readonly RECONNECT_DELAY_INITIAL: number = 1000
  static readonly RECONNECT_DELAY_MAX: number = 5000

  // 心跳间隔
  static readonly HEARTBEAT_INTERVAL: number = 25000

  // 本地存储 key
  static readonly STORE_UUID: string = 'session_uuid'
  static readonly STORE_NICKNAME: string = 'session_nickname'
}
