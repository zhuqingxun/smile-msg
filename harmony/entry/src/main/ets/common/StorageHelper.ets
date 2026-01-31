import preferences from '@ohos.data.preferences'
import { Constants } from './Constants'
import { common } from '@kit.AbilityKit'

export class SessionInfo {
  uuid: string = ''
  nickname: string = ''
}

const PREFERENCES_NAME = 'smilemsg_prefs'

let prefs: preferences.Preferences | null = null

export async function initPreferences(context: common.UIAbilityContext): Promise<void> {
  prefs = await preferences.getPreferences(context, PREFERENCES_NAME)
}

export async function saveSession(uuid: string, nickname: string): Promise<void> {
  if (!prefs) return
  await prefs.put(Constants.STORE_UUID, uuid)
  await prefs.put(Constants.STORE_NICKNAME, nickname)
  await prefs.flush()
}

export async function loadSession(): Promise<SessionInfo | null> {
  if (!prefs) return null
  const uuid = await prefs.get(Constants.STORE_UUID, '') as string
  const nickname = await prefs.get(Constants.STORE_NICKNAME, '') as string
  if (uuid && nickname) {
    const info = new SessionInfo()
    info.uuid = uuid
    info.nickname = nickname
    return info
  }
  return null
}

export async function clearSession(): Promise<void> {
  if (!prefs) return
  await prefs.delete(Constants.STORE_UUID)
  await prefs.delete(Constants.STORE_NICKNAME)
  await prefs.flush()
}
