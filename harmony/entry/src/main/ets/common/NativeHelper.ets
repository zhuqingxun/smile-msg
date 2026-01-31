// NativeHelper.ets — 振动和通知

import { vibrator } from '@kit.SensorServiceKit'

/**
 * 消息振动反馈
 */
export function vibrateOnMessage(): void {
  try {
    vibrator.startVibration({
      type: 'time',
      duration: 100
    }, {
      id: 0,
      usage: 'notification'
    })
  } catch (e) {
    console.error('[vibrate] 振动失败:', (e as Error).message)
  }
}
