import crypto from 'crypto'

let serviceAccount = null
let accessToken = null
let tokenExpiry = 0

const HUAWEI_PUSH_V3_URL = 'https://push-api.cloud.huawei.com/v3'

/**
 * base64url 编码（JWT 标准）
 */
function base64url(data) {
  return Buffer.from(data).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * 生成 Service Account JWT（PS256 签名）
 */
function generateJWT() {
  const now = Math.floor(Date.now() / 1000)

  const header = {
    alg: 'PS256',
    typ: 'JWT',
    kid: serviceAccount.key_id
  }

  const payload = {
    iss: serviceAccount.sub_account,
    aud: serviceAccount.token_uri,
    iat: now,
    exp: now + 3600
  }

  const headerB64 = base64url(JSON.stringify(header))
  const payloadB64 = base64url(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`

  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: serviceAccount.private_key,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
  })

  return `${signingInput}.${base64url(signature)}`
}

/**
 * 初始化 Push Kit V3（读取 Service Account 配置）
 */
export function initHuaweiPush() {
  const raw = process.env.HUAWEI_SERVICE_ACCOUNT
  if (!raw) {
    console.warn('[PushKit] HUAWEI_SERVICE_ACCOUNT 未配置，Push Kit 推送禁用')
    return false
  }

  try {
    serviceAccount = JSON.parse(raw)
    const required = ['project_id', 'key_id', 'private_key', 'sub_account', 'token_uri']
    const missing = required.filter(k => !serviceAccount[k])
    if (missing.length > 0) {
      console.warn(`[PushKit] HUAWEI_SERVICE_ACCOUNT 缺少必要字段: ${missing.join(', ')}`)
      serviceAccount = null
      return false
    }
    console.log('[PushKit] 华为 Push Kit V3 (Service Account JWT) 配置就绪')
    return true
  } catch (e) {
    console.warn('[PushKit] HUAWEI_SERVICE_ACCOUNT JSON 解析失败:', e.message)
    serviceAccount = null
    return false
  }
}

export function isHuaweiPushEnabled() {
  return serviceAccount !== null
}

/**
 * 用 JWT 换取 Access Token（自动缓存，过期前 5 分钟刷新）
 */
async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry - 300000) {
    return accessToken
  }

  const jwt = generateJWT()

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt
  })

  const res = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`JWT token 交换失败: ${res.status} ${text}`)
  }

  const json = await res.json()
  accessToken = json.access_token
  tokenExpiry = Date.now() + json.expires_in * 1000
  console.log(`[PushKit] Access Token 获取成功 (JWT)，有效期 ${json.expires_in}s`)
  return accessToken
}

/**
 * 发送 Push Kit V3 推送通知
 * @param {string} token - 目标设备的 Push Token
 * @param {object} payload - { senderNickname, content, conversationId }
 * @returns {Promise<boolean|'token_invalid'>}
 */
export async function sendHuaweiPush(token, { senderNickname, content, conversationId }) {
  if (!isHuaweiPushEnabled() || !token) {
    console.log(`[PushKit] 推送跳过: enabled=${isHuaweiPushEnabled()}, hasToken=${!!token}`)
    return false
  }
  console.log(`[PushKit] V3 推送请求: token=${token.slice(0, 20)}..., sender=${senderNickname}`)

  try {
    const at = await getAccessToken()
    const truncatedContent = content.length > 100 ? content.slice(0, 100) + '...' : content

    const url = `${HUAWEI_PUSH_V3_URL}/${serviceAccount.project_id}/messages:send`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${at}`,
        'push-type': '0'
      },
      body: JSON.stringify({
        payload: {
          notification: {
            category: 'IM',
            title: `${senderNickname} 发来消息`,
            body: truncatedContent,
            clickAction: {
              actionType: 0
            }
          }
        },
        target: {
          token: [token]
        }
      })
    })

    const result = await res.json()
    if (result.code === '80000000') {
      console.log(`[PushKit] V3 推送成功 → token=${token.slice(0, 20)}...`)
      return true
    }

    if (result.code === '80100003' || result.code === '80300007') {
      console.log(`[PushKit] token 已失效: code=${result.code}, msg=${result.msg}, token=${token.slice(0, 20)}...`)
      return 'token_invalid'
    }

    console.warn(`[PushKit] V3 推送失败: code=${result.code}, msg=${result.msg}, requestId=${result.requestId || 'N/A'}`)
    return false
  } catch (e) {
    console.warn('[PushKit] V3 推送异常:', e.message)
    return false
  }
}
