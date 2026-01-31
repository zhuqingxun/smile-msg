// PushHelper.ets — 华为 Push Kit Token 获取

import { pushService } from '@kit.PushKit'
import { BusinessError } from '@kit.BasicServicesKit'
import { setCachedPushToken } from './SocketService'

/**
 * 获取 Push Token 并缓存
 */
export async function initPushToken(): Promise<string | null> {
  try {
    const token: string = await pushService.getToken()
    console.info('[Push] Token 获取成功:', token.substring(0, 20) + '...')
    setCachedPushToken(token)
    return token
  } catch (err) {
    const e = err as BusinessError
    console.error('[Push] Token 获取失败:', e.code, e.message)
    return null
  }
}

/**
 * 注册 Push Token 到服务端（登录成功后调用）
 */
export function registerPushToken(): void {
  initPushToken().catch((e: Error) => {
    console.error('[Push] registerPushToken 异常:', e.message)
  })
}
