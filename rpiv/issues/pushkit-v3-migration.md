---
title: "Push Kit V2→V3 迁移：HarmonyOS NEXT 推送失败"
status: implemented
created_at: 2026-02-02
updated_at: 2026-02-02
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

## 已排除的原因

| 排查项 | 结果 |
|--------|------|
| HUAWEI_APP_ID | 正确 (`691759641700955072`) |
| HUAWEI_APP_SECRET | 正确（应用级 OAuth 2.0 Secret） |
| HUAWEI_PROJECT_ID | 正确 (`101653523863528270`) |
| AGC SHA-256 公钥指纹 | 正确（AGC 提取的公钥指纹与证书管理中的发布证书一致） |
| Push Kit 服务开通 | 已开通，项目状态正常 |

### 指纹排查说明

AGC 显示的 SHA-256 是**公钥指纹**（从 .p12 密钥对提取），`keytool -printcert` 显示的是**证书指纹**（.cer 文件哈希），两者是不同维度的值，不能直接对比。AGC 中发布证书和调试证书公钥指纹相同，说明它们使用了同一个密钥对。

## 修复方案

### 1. AGC 创建 Service Account

- AGC → 项目设置 → Server SDK → 创建服务账号 → 生成并下载 JSON 密钥文件

### 2. 改造 `server/src/huaweiPush.js`

- 将 API URL 从 `/v2/` 改为 `/v3/`
- 将鉴权方式从 OAuth Client Credentials 改为 Service Account JWT
- 添加 `push-type: 1` 请求头
- 更新消息体格式（如有差异）

### 3. 部署配置

- 将 Service Account JSON 密钥内容配置到 Zeabur 环境变量
- 移除不再需要的 `HUAWEI_APP_SECRET`（如果 V3 不再使用）

## 参考

- [华为 Push Kit V3 简介](https://blog.csdn.net/pisceshsu/article/details/142433770)
- [HarmonyOS Push Kit 开通与配置](https://blog.csdn.net/pisceshsu/article/details/142433805)
- [HarmonyOS NEXT Push 接入](https://blog.csdn.net/fwt336/article/details/139465587)
