---
title: "Push Kit V2→V3 迁移：HarmonyOS NEXT 推送失败"
status: open
created_at: 2026-02-02T00:00:00
updated_at: 2026-02-05T00:00:00
---

# Push Kit V2→V3 迁移：HarmonyOS NEXT 推送失败

## 问题现象

鸿蒙应用在后台时，Push Kit 推送始终失败，服务端日志报错：

```
[PushKit] token 已失效: code=80300007, msg=All the tokens are invalid
```

完整错误链：
1. 设备端 `pushService.getToken()` 成功获取 token
2. 服务端使用该 token 调用 Push Kit API → 返回 80300007
3. 服务端标记 token 失效并清空
4. 后续推送全部跳过（无 token）

## 根本原因

**服务端使用的是 Push Kit V2 API，而 HarmonyOS NEXT (5.0+) 设备的 push token 属于 V3 体系，V2 API 无法识别。**

当前服务端代码 (`server/src/huaweiPush.js`)：
- API URL: `https://push-api.cloud.huawei.com/v2/${HUAWEI_PROJECT_ID}/messages:send`
- 鉴权: OAuth 2.0 Client Credentials (`client_id` + `client_secret`)

HarmonyOS NEXT 需要 V3 API：
- API URL: `https://push-api.cloud.huawei.com/v3/${HUAWEI_PROJECT_ID}/messages:send`
- 鉴权: **Service Account JWT**（不是 OAuth Client Credentials）
- 额外请求头: `push-type: 1`

## 影响范围

- HarmonyOS NEXT (5.0+) 设备的离线推送功能完全不可用
- 仅影响鸿蒙平台，Android FCM 推送不受影响

## 已知 Workaround

无

## 已尝试的方案

- 验证 HUAWEI_APP_ID、HUAWEI_APP_SECRET、HUAWEI_PROJECT_ID 均正确：无效，非配置问题
- 验证 AGC SHA-256 公钥指纹与证书管理一致：无效，非签名问题
- 确认 Push Kit 服务已开通且项目状态正常：无效，非权限问题
- 对比 AGC 公钥指纹与 keytool 证书指纹：两者是不同维度的值（公钥指纹 vs 证书哈希），不能直接对比，已排除

## 修复记录

**修复时间**: 2026-02-02 18:29:24

### 修改文件

| 文件 | 修改说明 |
|------|---------|
| server/src/huaweiPush.js | API 从 V2 升级到 V3，鉴权从 OAuth Client Credentials 改为 Service Account JWT，添加 `push-type: 1` 请求头（初始误用 PS256，后修正为 RS256） |

### 修复说明

将 Push Kit API 从 `/v2/` 升级到 `/v3/`，鉴权方式从 OAuth 2.0 Client Credentials 改为 Service Account JWT（RS256 签名）。环境变量从三个（HUAWEI_APP_ID / APP_SECRET / PROJECT_ID）简化为一个 `HUAWEI_SERVICE_ACCOUNT` JSON。

Service Account 密钥的创建位置是**华为开发者联盟管理中心的 API Console**（非 AGC 控制台）：

| 操作 | 平台与路径 |
|------|-----------|
| 创建服务账号密钥 | **华为开发者联盟** → 管理中心 → API 服务 → 凭证 → 服务账号密钥 → 创建凭证 → 生成公私钥 → 下载 JSON |
| 开通推送服务 | AGC → 我的项目 → 增长 → 推送服务 → 立即开通 |
| 获取 Client ID | AGC → 我的项目 → 项目设置 → 应用信息 |

下载的 JSON 密钥文件包含 `project_id`、`key_id`、`private_key`、`sub_account`、`token_uri` 等字段，整体作为 `HUAWEI_SERVICE_ACCOUNT` 环境变量配置到 Zeabur。

### 验证结果

~~部署后 HarmonyOS NEXT 设备离线推送恢复正常，error 80300007 不再出现。~~

实际未生效，JWT 签名算法错误导致 token 交换始终失败（见下方二次修复）。

---

## 二次修复：JWT 签名算法 PS256→RS256

**问题时间**: 2026-02-04
**错误日志**:
```
[PushKit] V3 推送异常: JWT token 交换失败: 400 {"error":1101,"error_description":"jwt verify error","sub_error":20504}
```

### 根因分析

首次修复时参考了错误的文档信息（部分 CSDN 文章称使用 PS256），导致 JWT 签名算法设为 **PS256 (RSASSA-PSS)**。实际华为 token 端点 `https://oauth-login.cloud.huawei.com/oauth2/v3/token` 要求 **RS256 (RSASSA-PKCS1-v1_5)**。

诊断过程：
1. 本地 JWT 签名验证通过（签名本身无误），排除私钥损坏
2. 重新创建服务账号密钥（新 key_id `60addb637ce54cfaab061f07af0aa17d`），仍然失败，排除密钥不匹配
3. 三种 PSS saltLength 均失败，排除 salt 参数问题
4. 切换为 RS256 后**立即成功**获取 Access Token

### 修改文件

| 文件 | 修改说明 |
|------|---------|
| server/src/huaweiPush.js | JWT 签名算法从 PS256 (RSA-PSS) 改为 RS256 (PKCS1 v1.5) |

### 关键代码变更

```diff
- alg: 'PS256'
- padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
- saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
+ alg: 'RS256'
+ padding: crypto.constants.RSA_PKCS1_PADDING
```

### 部署步骤

1. 更新 Zeabur 环境变量 `HUAWEI_SERVICE_ACCOUNT` 为新密钥 JSON（key_id: `60addb637ce54cfaab061f07af0aa17d`）
2. 部署代码变更（RS256 签名算法）

### 验证结果

待部署后验证。

## 参考

- [华为 Push Kit V3 简介](https://blog.csdn.net/pisceshsu/article/details/142433770)
- [HarmonyOS Push Kit 开通与配置](https://blog.csdn.net/pisceshsu/article/details/142433805)
- [HarmonyOS NEXT Push 接入](https://blog.csdn.net/fwt336/article/details/139465587)
