// NativeHelper.ets — 振动和通知

import { vibrator } from '@kit.SensorServiceKit'
import { notificationManager } from '@kit.NotificationKit'
import { wantAgent, WantAgent, common } from '@kit.AbilityKit'
import { BusinessError } from '@kit.BasicServicesKit'

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

/**
 * 检查并申请通知权限
 */
export async function requestNotificationPermission(context: common.UIAbilityContext): Promise<void> {
  try {
    const enabled = await notificationManager.isNotificationEnabled()
    if (!enabled) {
      await notificationManager.requestEnableNotification(context)
      console.info('[Notification] 通知权限已授权')
    } else {
      console.info('[Notification] 通知权限已开启')
    }
  } catch (err) {
    const e = err as BusinessError
    if (e.code === 1600004) {
      console.warn('[Notification] 用户拒绝通知权限')
    } else {
      console.error('[Notification] 请求通知权限失败:', e.code, e.message)
    }
  }
}

/**
 * 创建社交通信类通知通道
 */
export async function createNotificationSlot(): Promise<void> {
  try {
    await notificationManager.addSlot(notificationManager.SlotType.SOCIAL_COMMUNICATION)
    console.info('[Notification] 社交通信通知通道创建成功')
  } catch (err) {
    const e = err as BusinessError
    console.error('[Notification] 通知通道创建失败:', e.code, e.message)
  }
}

let notificationId: number = 0

/**
 * 发布本地通知（前台非当前会话时调用）
 */
export async function publishLocalNotification(senderNickname: string, content: string): Promise<void> {
  try {
    // 构造 WantAgent：点击通知拉起应用
    const wantAgentInfo: wantAgent.WantAgentInfo = {
      wants: [
        {
          bundleName: 'smilemsg.zqx.huawei',
          abilityName: 'EntryAbility'
        }
      ],
      actionType: wantAgent.OperationType.START_ABILITY,
      requestCode: 0,
      actionFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG]
    }
    const wantAgentObj: WantAgent = await wantAgent.getWantAgent(wantAgentInfo)

    // 截断内容
    const truncatedContent = content.length > 100 ? content.substring(0, 100) + '...' : content

    // 发布通知
    const request: notificationManager.NotificationRequest = {
      id: notificationId++,
      slotType: notificationManager.SlotType.SOCIAL_COMMUNICATION,
      content: {
        notificationContentType: notificationManager.ContentType.NOTIFICATION_CONTENT_BASIC_TEXT,
        normal: {
          title: `${senderNickname} 发来消息`,
          text: truncatedContent
        }
      },
      wantAgent: wantAgentObj
    }

    await notificationManager.publish(request)
    console.info('[Notification] 本地通知已发布:', senderNickname)
  } catch (err) {
    const e = err as BusinessError
    console.error('[Notification] 发布通知失败:', e.code, e.message)
  }
}

/**
 * 取消所有通知（进入前台时调用）
 */
export function cancelAllNotifications(): void {
  notificationManager.cancelAll().catch((err: BusinessError) => {
    console.error('[Notification] 取消通知失败:', err.code, err.message)
  })
}
