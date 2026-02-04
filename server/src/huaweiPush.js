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

  // ===== 诊断区域：启动时一次性输出所有关键信息 =====
  console.log(`[PushKit][diag] Node=${process.version}, OpenSSL=${process.versions.openssl}`)
  console.log(`[PushKit][diag] 环境变量长度=${raw.length}, 前40字符=${JSON.stringify(raw.slice(0, 40))}`)

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    console.error(`[PushKit][diag] JSON.parse 失败: ${e.message}`)
    console.error(`[PushKit][diag] 原始值前200字符: ${JSON.stringify(raw.slice(0, 200))}`)
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

  console.log(`[PushKit][diag] key_id=${parsed.key_id}, sub_account=${parsed.sub_account}`)

  // 私钥诊断
  let pk = parsed.private_key
  console.log(`[PushKit][diag] private_key 长度=${pk.length}`)
  console.log(`[PushKit][diag] private_key 前60字符=${JSON.stringify(pk.slice(0, 60))}`)
  console.log(`[PushKit][diag] private_key 后60字符=${JSON.stringify(pk.slice(-60))}`)
  console.log(`[PushKit][diag] 包含实际换行=${pk.includes('\n')}, 包含字面\\n=${pk.includes('\\n')}`)

  // 修正换行符：环境变量传输可能导致多种转义情况
  if (!pk.includes('\n') && pk.includes('\\n')) {
    pk = pk.replace(/\\n/g, '\n')
    console.log('[PushKit][diag] 已修正: 字面\\n → 实际换行')
  }
  parsed.private_key = pk

  // 尝试用 crypto 解析私钥
  try {
    const keyObj = crypto.createPrivateKey(pk)
    console.log(`[PushKit][diag] crypto 解析成功: type=${keyObj.type}, algo=${keyObj.asymmetricKeyType}`)
  } catch (e) {
    console.error(`[PushKit][diag] crypto 解析失败: ${e.message}`)
    console.error(`[PushKit][diag] 私钥 PEM 头=${JSON.stringify(pk.slice(0, 40))}`)
    console.error(`[PushKit][diag] 私钥 PEM 尾=${JSON.stringify(pk.slice(-40))}`)

    // 尝试手动重建 PEM（去除所有空白后重新分行）
    const b64Only = pk.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '')
    const rebuilt = '-----BEGIN PRIVATE KEY-----\n' +
      b64Only.match(/.{1,64}/g).join('\n') +
      '\n-----END PRIVATE KEY-----\n'
    try {
      crypto.createPrivateKey(rebuilt)
      console.log('[PushKit][diag] 手动重建 PEM 成功，使用重建后的密钥')
      parsed.private_key = rebuilt
    } catch (e2) {
      console.error(`[PushKit][diag] 手动重建 PEM 也失败: ${e2.message}`)
      console.error(`[PushKit][diag] base64 长度=${b64Only.length}, 前40=${b64Only.slice(0, 40)}`)
      serviceAccount = null
      return false
    }
  }

  // 尝试实际签名测试
  try {
    const testSig = crypto.sign('sha256', Buffer.from('test'), {
      key: parsed.private_key,
      padding: crypto.constants.RSA_PKCS1_PADDING
    })
    console.log(`[PushKit][diag] RS256 签名测试成功, 签名长度=${testSig.length}`)
  } catch (e) {
    console.error(`[PushKit][diag] RS256 签名测试失败: ${e.message}`)
    serviceAccount = null
    return false
  }
  // ===== 诊断区域结束 =====

  serviceAccount = parsed
  console.log('[PushKit] 华为 Push Kit V3 (Service Account JWT) 配置就绪')
  return true
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
