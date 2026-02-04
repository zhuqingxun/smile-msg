import crypto from 'crypto'
import { runtimeConfig } from './store.js'

let serviceAccount = null

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
 * 生成 Service Account JWT（RS256 签名）
 */
function generateJWT() {
  const now = Math.floor(Date.now() / 1000)

  const header = {
    alg: 'RS256',
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
    padding: crypto.constants.RSA_PKCS1_PADDING
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

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    console.error(`[PushKit] JSON.parse 失败: ${e.message}`)
    serviceAccount = null
    return false
  }

  const required = ['project_id', 'key_id', 'private_key', 'sub_account', 'token_uri']
  const missing = required.filter(k => !parsed[k])
  if (missing.length > 0) {
    console.warn(`[PushKit] HUAWEI_SERVICE_ACCOUNT 缺少必要字段: ${missing.join(', ')}`)
    serviceAccount = null
    return false
  }

  // 修正换行符：环境变量传输可能将 \n 变为字面 \\n
  let pk = parsed.private_key
  if (!pk.includes('\n') && pk.includes('\\n')) {
    pk = pk.replace(/\\n/g, '\n')
  }
  parsed.private_key = pk

  // 验证私钥可用
  try {
    crypto.createPrivateKey(pk)
  } catch (e) {
    // 尝试手动重建 PEM（去除所有空白后重新分行）
    const b64Only = pk.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '')
    const rebuilt = '-----BEGIN PRIVATE KEY-----\n' +
      b64Only.match(/.{1,64}/g).join('\n') +
      '\n-----END PRIVATE KEY-----\n'
    try {
      crypto.createPrivateKey(rebuilt)
      parsed.private_key = rebuilt
    } catch (e2) {
      console.error(`[PushKit] 私钥解析失败: ${e2.message}`)
      serviceAccount = null
      return false
    }
  }

  serviceAccount = parsed
  console.log('[PushKit] 华为 Push Kit V3 (Service Account JWT) 配置就绪')
  return true
}

export function isHuaweiPushEnabled() {
  return serviceAccount !== null
}

/**
 * 发送 Push Kit V3 推送通知（JWT 直接鉴权，不经过 token 交换）
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
    const jwt = generateJWT()
    const truncatedContent = content.length > 100 ? content.slice(0, 100) + '...' : content

    const url = `${HUAWEI_PUSH_V3_URL}/${serviceAccount.project_id}/messages:send`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
        'push-type': '0'
      },
      body: JSON.stringify({
        payload: {
          notification: {
            category: 'IM',
            importance: runtimeConfig.huaweiImportance,
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
    console.warn(`[PushKit] 完整响应: ${JSON.stringify(result)}`)
    return false
  } catch (e) {
    console.warn('[PushKit] V3 推送异常:', e.message)
    return false
  }
}
