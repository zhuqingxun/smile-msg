let accessToken = null
let tokenExpiry = 0

const HUAWEI_APP_ID = process.env.HUAWEI_APP_ID
const HUAWEI_APP_SECRET = process.env.HUAWEI_APP_SECRET
const HUAWEI_PROJECT_ID = process.env.HUAWEI_PROJECT_ID
const HUAWEI_AUTH_URL = process.env.HUAWEI_AUTH_URL || 'https://oauth-login.cloud.huawei.com/oauth2/v3/token'
const HUAWEI_PUSH_URL = process.env.HUAWEI_PUSH_URL || (HUAWEI_PROJECT_ID ? `https://push-api.cloud.huawei.com/v2/${HUAWEI_PROJECT_ID}/messages:send` : null)

/**
 * 初始化 Push Kit（检查环境变量）
 */
export function initHuaweiPush() {
  if (!HUAWEI_APP_ID || !HUAWEI_APP_SECRET || !HUAWEI_PROJECT_ID) {
    console.warn('[PushKit] HUAWEI_APP_ID、HUAWEI_APP_SECRET 或 HUAWEI_PROJECT_ID 未配置，Push Kit 推送禁用')
    return false
  }
  console.log('[PushKit] 华为 Push Kit 配置就绪')
  return true
}

export function isHuaweiPushEnabled() {
  return !!HUAWEI_APP_ID && !!HUAWEI_APP_SECRET && !!HUAWEI_PROJECT_ID
}

/**
 * 获取 OAuth 2.0 Access Token（自动缓存，过期前 5 分钟刷新）
 */
async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry - 300000) {
    return accessToken
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: HUAWEI_APP_ID,
    client_secret: HUAWEI_APP_SECRET
  })

  const res = await fetch(HUAWEI_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  if (!res.ok) {
    throw new Error(`OAuth token 获取失败: ${res.status} ${await res.text()}`)
  }

  const json = await res.json()
  accessToken = json.access_token
  tokenExpiry = Date.now() + json.expires_in * 1000
  console.log(`[PushKit] Access Token 获取成功，有效期 ${json.expires_in}s`)
  return accessToken
}

/**
 * 发送 Push Kit 推送通知
 * @param {string} token - 目标设备的 Push Token
 * @param {object} payload - { senderNickname, content, conversationId }
 * @returns {Promise<boolean|'token_invalid'>}
 */
export async function sendHuaweiPush(token, { senderNickname, content, conversationId }) {
  if (!isHuaweiPushEnabled() || !token) {
    console.log(`[PushKit] 推送跳过: enabled=${isHuaweiPushEnabled()}, hasToken=${!!token}`)
    return false
  }
  console.log(`[PushKit] 推送请求发出: token=${token.slice(0, 20)}..., sender=${senderNickname}`)

  try {
    const at = await getAccessToken()
    const truncatedContent = content.length > 100 ? content.slice(0, 100) + '...' : content

    const res = await fetch(HUAWEI_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${at}`
      },
      body: JSON.stringify({
        message: {
          token: [token],
          notification: {
            title: `${senderNickname} 发来消息`,
            body: truncatedContent
          },
          data: JSON.stringify({
            type: 'new_message',
            senderNickname,
            content: truncatedContent,
            conversationId
          }),
          android: {
            notification: {
              click_action: { type: 1 },
              foreground_show: false,
              category: 'IM'
            }
          }
        }
      })
    })

    const result = await res.json()
    if (result.code === '80000000') {
      console.log(`[PushKit] 推送成功 → token=${token.slice(0, 20)}...`)
      return true
    }

    // Token 失效处理
    if (result.code === '80100003' || result.code === '80300007') {
      console.log(`[PushKit] token 已失效: code=${result.code}, msg=${result.msg}, token=${token.slice(0, 20)}...`)
      return 'token_invalid'
    }

    console.warn(`[PushKit] 推送失败: code=${result.code}, msg=${result.msg}, requestId=${result.requestId || 'N/A'}`)
    return false
  } catch (e) {
    console.warn('[PushKit] 推送异常:', e.message)
    return false
  }
}
