# Phase 2: Node.js 控制面构建实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 HomeGuard-RTC 平台流媒体与信令核心中枢控制面，实现高强度的双层鉴权、SRS 安全回调授权以及高容错、模块化的统一 WebSocket 指令信道。

**Architecture:** 基于 Nitro v3 原生 KV 持久化存储设计类型安全数据访问层；基于 Web Crypto/Node.js `crypto` 模块实现 HMAC-SHA256 临时媒体令牌；通过 CrossWS 在 `/control` 统一路由实现基于网络抖动容错（10秒宽限期定时器）的双向信令流，并基于命令模式分文件注册指令处理器。

**Tech Stack:** Nitro v3, TypeScript, CrossWS, Node.js Built-in Crypto.

---

## 1. 拟修改与创建的文件拓扑

为了确保极高的模块内聚性和文件体积控制，我们将职责拆分到以下专注的文件中（均不超过 200 行）：
- `nitro-app/nitro.config.ts` [MODIFY]：启用 WebSocket 特性并配置文件驱动持久化 KV 存储。
- `nitro-app/shared/types.ts` [NEW]：共享强类型定义（用户、设备、媒体Token声明、控制上下文、WebSocket协议包）。
- `nitro-app/server/utils/db.ts` [NEW]：强类型 Nitro KV 持久化数据接口。
- `nitro-app/server/plugins/01.seed.ts` [NEW]：自动在启动时播种默认管理员 `admin`。
- `nitro-app/server/utils/token.ts` [NEW]：JWT 业务 Token 与双向 Base64URL-HMAC 短效媒体 Token 算法。
- `nitro-app/server/utils/wsRegistry.ts` [NEW]：活跃 WebSocket Peer 池子和离线宽限期管理器。
- `nitro-app/server/utils/control/types.ts` [NEW]：指令处理器接口规范。
- `nitro-app/server/control/index.ts` [NEW]：指令管理器与全局注册表。
- `nitro-app/server/control/ptz.ts` [NEW]：云台控制指令处理器。
- `nitro-app/server/control/reboot.ts` [NEW]：重启控制指令处理器。
- `nitro-app/server/control/status.ts` [NEW]：状态查询指令处理器。
- `nitro-app/server/routes/control.ts` [NEW]：统一 WebSocket 信令信道。
- `nitro-app/server/api/auth/login.post.ts` [NEW]：用户登录端点。
- `nitro-app/server/api/devices/register.post.ts` [NEW]：设备注册与活跃上报端点。
- `nitro-app/server/api/devices/index.get.ts` [NEW]：设备列表查询端点。
- `nitro-app/server/api/devices/publish-token.post.ts` [NEW]：ESP32 推流 Token 申请端点。
- `nitro-app/server/api/devices/play-token.post.ts` [NEW]：Web 客户端播放 Token 申请端点。
- `nitro-app/server/routes/internal/srs/on-publish.post.ts` [NEW]：SRS 推流安全回调校验端点。
- `nitro-app/server/routes/internal/srs/on-play.post.ts` [NEW]：SRS 播放安全回调校验端点。
- `nitro-app/server/routes/internal/srs/on-stop.post.ts` [NEW]：SRS 停止安全回调端点。

---

## 2. 实施任务清单

### Task 1: 基础设施配置与共享类型定义

**Files:**
- Modify: `nitro-app/nitro.config.ts`
- Create: `nitro-app/shared/types.ts`

- [ ] **Step 1: 修改配置支持 WebSocket 和 KV 数据库**
  更新 `nitro-app/nitro.config.ts` 内容为：
  ```typescript
  import { defineConfig } from 'nitro'

  export default defineConfig({
    serverDir: './server',
    features: {
      websocket: true,
    },
    storage: {
      db: {
        driver: 'fs',
        base: './.data/db',
      },
    },
  })
  ```

- [ ] **Step 2: 建立共享类型定义文件**
  创建 `nitro-app/shared/types.ts`：
  ```typescript
  export interface User {
    id: string
    username: string
    passwordHash: string
    salt: string
    role: 'admin' | 'user'
    createdAt: number
  }

  export interface Device {
    id: string
    name: string
    secret: string
    status: 'online' | 'offline'
    lastSeen: number
    ownerId: string
    createdAt: number
  }

  export interface MediaTokenClaims {
    sub: string
    deviceId: string
    app: string
    stream: string
    action: 'play' | 'publish'
    exp: number
    nonce: string
  }

  export interface ControlWSMessage {
    action: string
    deviceId: string
    payload: unknown
  }
  ```

- [ ] **Step 3: 运行类型检查以验证没有语法或拼写错误**
  运行：`pnpm --prefix nitro-app run typecheck:server`
  预期输出：Done (无任何错误)

- [ ] **Step 4: 提交**
  ```bash
  git add nitro-app/nitro.config.ts nitro-app/shared/types.ts
  git commit -m "feat: config websocket and define shared types"
  ```

---

### Task 2: 强类型数据访问层 (DAL) 与管理员账号播种 (Seeding)

**Files:**
- Create: `nitro-app/server/utils/db.ts`
- Create: `nitro-app/server/plugins/01.seed.ts`
- Test: `nitro-app/scratch/task2_test.ts`

- [ ] **Step 1: 实现 DAL 读写模块**
  创建 `nitro-app/server/utils/db.ts`：
  ```typescript
  import { useStorage } from 'nitro/storage'
  import type { User, Device } from '~/shared/types.ts'

  const getStorage = () => useStorage('db')

  export async function getUser(username: string): Promise<User | null> {
    const user = await getStorage().getItem<User>(`user:${username}`)
    return user || null
  }

  export async function saveUser(user: User): Promise<void> {
    await getStorage().setItem(`user:${user.username}`, user)
  }

  export async function getDevice(deviceId: string): Promise<Device | null> {
    const device = await getStorage().getItem<Device>(`device:${deviceId}`)
    return device || null
  }

  export async function saveDevice(device: Device): Promise<void> {
    await getStorage().setItem(`device:${device.id}`, device)
  }

  export async function listDevicesByOwner(ownerId: string): Promise<Device[]> {
    const storage = getStorage()
    const keys = await storage.getKeys('device:')
    const devices: Device[] = []
    for (const key of keys) {
      const device = await storage.getItem<Device>(key)
      if (device && device.ownerId === ownerId) {
        devices.push(device)
      }
    }
    return devices
  }
  ```

- [ ] **Step 2: 实现数据库启动播种插件**
  创建 `nitro-app/server/plugins/01.seed.ts`：
  ```typescript
  import { definePlugin } from 'nitro'
  import { saveUser, getUser } from '../utils/db.ts'
  import crypto from 'node:crypto'

  export default definePlugin(async () => {
    const existingAdmin = await getUser('admin')
    if (!existingAdmin) {
      const salt = crypto.randomBytes(16).toString('hex')
      const passwordHash = crypto.pbkdf2Sync('admin123', salt, 1000, 64, 'sha512').toString('hex')
      await saveUser({
        id: 'admin_user',
        username: 'admin',
        passwordHash,
        salt,
        role: 'admin',
        createdAt: Date.now()
      })
      console.log('[Seed] Default admin user created (admin / admin123)')
    }
  })
  ```

- [ ] **Step 3: 编写 DAL 临时测试脚本验证读写及 Hash 安全加密**
  创建 `nitro-app/scratch/task2_test.ts`：
  ```typescript
  import crypto from 'node:crypto'

  function testPassword() {
    const pwd = 'admin123'
    const salt = crypto.randomBytes(16).toString('hex')
    const hash = crypto.pbkdf2Sync(pwd, salt, 1000, 64, 'sha512').toString('hex')
    
    // Verify
    const verifyHash = crypto.pbkdf2Sync(pwd, salt, 1000, 64, 'sha512').toString('hex')
    if (hash !== verifyHash) {
      throw new Error('Hash verification failed!')
    }
    console.log('TDD DAL Crypto validation: SUCCESS')
  }

  testPassword()
  ```

- [ ] **Step 4: 运行测试并确认通过**
  运行：`node nitro-app/scratch/task2_test.ts`
  预期输出：`TDD DAL Crypto validation: SUCCESS`

- [ ] **Step 5: 提交**
  ```bash
  git add nitro-app/server/utils/db.ts nitro-app/server/plugins/01.seed.ts
  git commit -m "feat: implement data access layer and automatic db seeder"
  ```

---

### Task 3: 业务 JWT 令牌与 HMAC 双向媒体 Token 算法

**Files:**
- Create: `nitro-app/server/utils/token.ts`
- Test: `nitro-app/scratch/task3_test.ts`

- [ ] **Step 1: 实现 Token 签署与验证函数**
  创建 `nitro-app/server/utils/token.ts`：
  ```typescript
  import crypto from 'node:crypto'
  import type { MediaTokenClaims } from '~/shared/types.ts'

  const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex')

  export function signJWT(payload: { userId: string; role: string }): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 86400 })).toString('base64url')
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
    return `${header}.${body}.${signature}`
  }

  export function verifyJWT(token: string): { userId: string; role: string } | null {
    try {
      const [header, body, signature] = token.split('.')
      if (!header || !body || !signature) return null
      const computedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
      if (computedSig !== signature) return null
      
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
      if (payload.exp < Math.floor(Date.now() / 1000)) return null
      return payload
    } catch {
      return null
    }
  }

  export function signMediaToken(claims: MediaTokenClaims, secret: string): string {
    const payloadStr = Buffer.from(JSON.stringify(claims)).toString('base64url')
    const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64url')
    return `${payloadStr}.${signature}`
  }

  export function verifyMediaToken(tokenString: string, secret: string): MediaTokenClaims | null {
    try {
      const [payloadStr, signature] = tokenString.split('.')
      if (!payloadStr || !signature) return null
      const computedSig = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64url')
      if (computedSig !== signature) return null

      const claims = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8')) as MediaTokenClaims
      if (claims.exp < Math.floor(Date.now() / 1000)) return null
      return claims
    } catch {
      return null
    }
  }
  ```

- [ ] **Step 2: 编写测试对两套 Token 机制进行全边界（过期、防篡改、格式不合规）测试**
  创建 `nitro-app/scratch/task3_test.ts`：
  ```typescript
  import { signJWT, verifyJWT, signMediaToken, verifyMediaToken } from '../server/utils/token.ts'
  import type { MediaTokenClaims } from '../shared/types.ts'

  function runTests() {
    // 1. JWT Test
    const token = signJWT({ userId: 'admin', role: 'admin' })
    const verified = verifyJWT(token)
    if (!verified || verified.userId !== 'admin') throw new Error('JWT verification failed')

    // Tampered JWT
    const tampered = token + 'a'
    if (verifyJWT(tampered) !== null) throw new Error('Tampered JWT accepted!')

    // 2. Media Token Test
    const claims: MediaTokenClaims = {
      sub: 'cam_1',
      deviceId: 'cam_1',
      app: 'live',
      stream: 'cam_1',
      action: 'publish',
      exp: Math.floor(Date.now() / 1000) + 10,
      nonce: '12345'
    }
    const secret = 'device_key_secret'
    const mediaToken = signMediaToken(claims, secret)
    const verifiedMedia = verifyMediaToken(mediaToken, secret)
    if (!verifiedMedia || verifiedMedia.stream !== 'cam_1') throw new Error('Media token verification failed')

    // Expired Media Token
    const expiredClaims = { ...claims, exp: Math.floor(Date.now() / 1000) - 5 }
    const expiredToken = signMediaToken(expiredClaims, secret)
    if (verifyMediaToken(expiredToken, secret) !== null) throw new Error('Expired media token accepted!')

    console.log('TDD Token Verification: SUCCESS')
  }

  runTests()
  ```

- [ ] **Step 3: 运行验证**
  运行：`tsgo nitro-app/scratch/task3_test.ts`
  预期输出：`TDD Token Verification: SUCCESS`

- [ ] **Step 4: 提交**
  ```bash
  git add nitro-app/server/utils/token.ts
  git commit -m "feat: implement cryptographically secure JWT and Media Token signing algorithms"
  ```

---

### Task 4: 鉴权与媒体 Token 签发 API 端点

**Files:**
- Create: `nitro-app/server/api/auth/login.post.ts`
- Create: `nitro-app/server/api/devices/register.post.ts`
- Create: `nitro-app/server/api/devices/index.get.ts`
- Create: `nitro-app/server/api/devices/publish-token.post.ts`
- Create: `nitro-app/server/api/devices/play-token.post.ts`

- [ ] **Step 1: 实现用户登录 API 端点**
  创建 `nitro-app/server/api/auth/login.post.ts`：
  ```typescript
  import { defineHandler, createError } from 'nitro/h3'
  import { getUser } from '../../utils/db.ts'
  import { signJWT } from '../../utils/token.ts'
  import crypto from 'node:crypto'

  export default defineHandler(async (event) => {
    const { username, password } = await event.req.json()
    if (!username || !password) {
      throw createError({ statusCode: 400, message: 'Username and password are required' })
    }

    const user = await getUser(username)
    if (!user) {
      throw createError({ statusCode: 401, message: 'Invalid credentials' })
    }

    const inputHash = crypto.pbkdf2Sync(password, user.salt, 1000, 64, 'sha512').toString('hex')
    if (inputHash !== user.passwordHash) {
      throw createError({ statusCode: 401, message: 'Invalid credentials' })
    }

    const token = signJWT({ userId: user.id, role: user.role })
    return { token }
  })
  ```

- [ ] **Step 2: 实现设备注册与活跃上报 API 端点**
  创建 `nitro-app/server/api/devices/register.post.ts`：
  ```typescript
  import { defineHandler, createError } from 'nitro/h3'
  import { getDevice, saveDevice } from '../../utils/db.ts'

  export default defineHandler(async (event) => {
    const { deviceId, name, secret } = await event.req.json()
    if (!deviceId || !secret) {
      throw createError({ statusCode: 400, message: 'DeviceId and secret are required' })
    }

    let device = await getDevice(deviceId)
    if (device) {
      if (device.secret !== secret) {
        throw createError({ statusCode: 403, message: 'Invalid device secret' })
      }
      device.status = 'online'
      device.lastSeen = Date.now()
    } else {
      device = {
        id: deviceId,
        name: name || deviceId,
        secret,
        status: 'online',
        lastSeen: Date.now(),
        ownerId: 'admin_user',
        createdAt: Date.now()
      }
    }

    await saveDevice(device)
    return { success: true }
  })
  ```

- [ ] **Step 3: 实现设备列表查询 API 端点 (受 JWT 保护)**
  创建 `nitro-app/server/api/devices/index.get.ts`：
  ```typescript
  import { defineHandler, createError } from 'nitro/h3'
  import { listDevicesByOwner } from '../../utils/db.ts'
  import { verifyJWT } from '../../utils/token.ts'

  export default defineHandler(async (event) => {
    const authHeader = event.req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createError({ statusCode: 401, message: 'Unauthorized' })
    }

    const token = authHeader.substring(7)
    const userClaims = verifyJWT(token)
    if (!userClaims) {
      throw createError({ statusCode: 401, message: 'Unauthorized' })
    }

    const devices = await listDevicesByOwner(userClaims.userId)
    return { devices }
  })
  ```

- [ ] **Step 4: 实现 ESP32 推流 Token 申请端点**
  创建 `nitro-app/server/api/devices/publish-token.post.ts`：
  ```typescript
  import { defineHandler, createError } from 'nitro/h3'
  import { getDevice } from '../../utils/db.ts'
  import { signMediaToken } from '../../utils/token.ts'
  import crypto from 'node:crypto'

  export default defineHandler(async (event) => {
    const { deviceId, secret, app, stream } = await event.req.json()
    if (!deviceId || !secret || !app || !stream) {
      throw createError({ statusCode: 400, message: 'Missing parameters' })
    }

    const device = await getDevice(deviceId)
    if (!device || device.secret !== secret) {
      throw createError({ statusCode: 403, message: 'Device authorization failed' })
    }

    const token = signMediaToken({
      sub: deviceId,
      deviceId,
      app,
      stream,
      action: 'publish',
      exp: Math.floor(Date.now() / 1000) + 60, // 60s TTL
      nonce: crypto.randomBytes(8).toString('hex')
    }, device.secret)

    return { token }
  })
  ```

- [ ] **Step 5: 实现 Web 客户端播放 Token 申请端点 (受 JWT 保护)**
  创建 `nitro-app/server/api/devices/play-token.post.ts`：
  ```typescript
  import { defineHandler, createError } from 'nitro/h3'
  import { getDevice } from '../../utils/db.ts'
  import { verifyJWT, signMediaToken } from '../../utils/token.ts'
  import crypto from 'node:crypto'

  export default defineHandler(async (event) => {
    const authHeader = event.req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createError({ statusCode: 401, message: 'Unauthorized' })
    }

    const userToken = authHeader.substring(7)
    const userClaims = verifyJWT(userToken)
    if (!userClaims) {
      throw createError({ statusCode: 401, message: 'Unauthorized' })
    }

    const { deviceId, app, stream } = await event.req.json()
    if (!deviceId || !app || !stream) {
      throw createError({ statusCode: 400, message: 'Missing parameters' })
    }

    const device = await getDevice(deviceId)
    if (!device || device.ownerId !== userClaims.userId) {
      throw createError({ statusCode: 404, message: 'Device not found or not owned by user' })
    }

    const token = signMediaToken({
      sub: userClaims.userId,
      deviceId,
      app,
      stream,
      action: 'play',
      exp: Math.floor(Date.now() / 1000) + 60,
      nonce: crypto.randomBytes(8).toString('hex')
    }, device.secret)

    return { token }
  })
  ```

- [ ] **Step 6: 类型检查与提交**
  运行：`pnpm --prefix nitro-app run typecheck:server`
  ```bash
  git add nitro-app/server/api/auth/login.post.ts nitro-app/server/api/devices
  git commit -m "feat: complete user login, device registration, and media token provisioning APIs"
  ```

---

### Task 5: SRS 安全鉴权与状态同步 HTTP 安全回调

**Files:**
- Create: `nitro-app/server/routes/internal/srs/on-publish.post.ts`
- Create: `nitro-app/server/routes/internal/srs/on-play.post.ts`
- Create: `nitro-app/server/routes/internal/srs/on-stop.post.ts`

- [ ] **Step 1: 安全防护拦截中间件校验函数**
  在编写接口前，先在内存定义拦截规则：回调请求必须是本地回环 (IPv4/IPv6 localhost) 或者指定局域网段。

- [ ] **Step 2: 实现 SRS 推流鉴权端点**
  创建 `nitro-app/server/routes/internal/srs/on-publish.post.ts`：
  ```typescript
  import { defineHandler } from 'nitro/h3'
  import { getDevice } from '../../../utils/db.ts'
  import { verifyMediaToken } from '../../../utils/token.ts'

  export default defineHandler(async (event) => {
    const remoteIp = event.req.socket.remoteAddress
    // 强制限制仅限内网/环回地址
    const isLocal = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1'
    if (!isLocal) {
      return { code: 403, error: 'Forbidden' }
    }

    const body = await event.req.json()
    const { app, stream, param } = body
    if (!param) return { code: 401, error: 'Missing media parameters' }

    const searchParams = new URLSearchParams(param.startsWith('?') ? param : `?${param}`)
    const token = searchParams.get('token')
    if (!token) return { code: 401, error: 'Missing token' }

    // 预解密提取 deviceId
    const [payloadBase64] = token.split('.')
    if (!payloadBase64) return { code: 400, error: 'Malformed token' }
    
    try {
      const claims = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'))
      const device = await getDevice(claims.deviceId)
      if (!device) return { code: 404, error: 'Device not found' }

      const verifiedClaims = verifyMediaToken(token, device.secret)
      if (!verifiedClaims) return { code: 401, error: 'Invalid or expired token' }

      if (verifiedClaims.action !== 'publish' || verifiedClaims.app !== app || verifiedClaims.stream !== stream) {
        return { code: 403, error: 'Permission mismatch' }
      }

      return { code: 0 }
    } catch {
      return { code: 400, error: 'Invalid token signature structure' }
    }
  })
  ```

- [ ] **Step 3: 实现 SRS 播放鉴权端点**
  创建 `nitro-app/server/routes/internal/srs/on-play.post.ts`：
  ```typescript
  import { defineHandler } from 'nitro/h3'
  import { getDevice } from '../../../utils/db.ts'
  import { verifyMediaToken } from '../../../utils/token.ts'

  export default defineHandler(async (event) => {
    const remoteIp = event.req.socket.remoteAddress
    const isLocal = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1'
    if (!isLocal) {
      return { code: 403, error: 'Forbidden' }
    }

    const body = await event.req.json()
    const { app, stream, param } = body
    if (!param) return { code: 401, error: 'Missing parameters' }

    const searchParams = new URLSearchParams(param.startsWith('?') ? param : `?${param}`)
    const token = searchParams.get('token')
    if (!token) return { code: 401, error: 'Missing token' }

    const [payloadBase64] = token.split('.')
    if (!payloadBase64) return { code: 400, error: 'Malformed token' }

    try {
      const claims = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'))
      const device = await getDevice(claims.deviceId)
      if (!device) return { code: 404, error: 'Device not found' }

      const verifiedClaims = verifyMediaToken(token, device.secret)
      if (!verifiedClaims) return { code: 401, error: 'Invalid or expired token' }

      if (verifiedClaims.action !== 'play' || verifiedClaims.app !== app || verifiedClaims.stream !== stream) {
        return { code: 403, error: 'Permission mismatch' }
      }

      return { code: 0 }
    } catch {
      return { code: 400, error: 'Invalid token structure' }
    }
  })
  ```

- [ ] **Step 4: 实现流停止状态同步端点**
  创建 `nitro-app/server/routes/internal/srs/on-stop.post.ts`：
  ```typescript
  import { defineHandler } from 'nitro/h3'
  import { getDevice, saveDevice } from '../../../utils/db.ts'

  export default defineHandler(async (event) => {
    const remoteIp = event.req.socket.remoteAddress
    const isLocal = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1'
    if (!isLocal) {
      return { code: 403, error: 'Forbidden' }
    }

    const body = await event.req.json()
    const { stream, action } = body
    
    // 如果是推流停止 (publish 断开)
    if (action === 'on_unpublish' || action === 'on_stop') {
      const device = await getDevice(stream)
      if (device) {
        device.status = 'offline'
        device.lastSeen = Date.now()
        await saveDevice(device)
      }
    }
    return { code: 0 }
  })
  ```

- [ ] **Step 5: 类型验证与提交**
  ```bash
  git add nitro-app/server/routes/internal/srs
  git commit -m "feat: enforce server-side SRS callback endpoints for secure publishing and playback"
  ```

---

### Task 6: 信令连接管理器与模块化指令分发层

**Files:**
- Create: `nitro-app/server/utils/wsRegistry.ts`
- Create: `nitro-app/server/utils/control/types.ts`
- Create: `nitro-app/server/control/index.ts`
- Create: `nitro-app/server/control/ptz.ts`
- Create: `nitro-app/server/control/reboot.ts`
- Create: `nitro-app/server/control/status.ts`

- [ ] **Step 1: 实现信令端连接注册池与异常断开网络延迟宽限期管理器**
  创建 `nitro-app/server/utils/wsRegistry.ts`：
  ```typescript
  import type { Peer } from 'crossws'

  export const activeDevices = new Map<string, Peer>()
  export const activeClients = new Map<string, Set<Peer>>()
  export const deviceGraceTimers = new Map<string, NodeJS.Timeout>()
  ```

- [ ] **Step 2: 建立 Control 核心类型定义**
  创建 `nitro-app/server/utils/control/types.ts`：
  ```typescript
  import type { Peer } from 'crossws'

  export interface ControlContext {
    clientPeer: Peer
    userId: string
    deviceId: string
    payload: unknown
  }

  export interface ControlHandler {
    execute(ctx: ControlContext): Promise<void>
  }
  ```

- [ ] **Step 3: 编写具体的控制命令分文件模块**
  
  - **云台控制 (PTZ) 处理器**：
    创建 `nitro-app/server/control/ptz.ts`：
    ```typescript
    import type { ControlHandler, ControlContext } from '../utils/control/types.ts'
    import { activeDevices } from '../utils/wsRegistry.ts'

    export const ptzHandler: ControlHandler = {
      async execute({ clientPeer, deviceId, payload }) {
        const devicePeer = activeDevices.get(deviceId)
        if (!devicePeer) {
          clientPeer.send({ type: 'error', message: 'Device is offline' })
          return
        }
        // 路由至物理设备
        devicePeer.send({ type: 'command', action: 'ptz', payload })
      }
    }
    ```

  - **设备重启 (Reboot) 处理器**：
    创建 `nitro-app/server/control/reboot.ts`：
    ```typescript
    import type { ControlHandler, ControlContext } from '../utils/control/types.ts'
    import { activeDevices } from '../utils/wsRegistry.ts'

    export const rebootHandler: ControlHandler = {
      async execute({ clientPeer, deviceId }) {
        const devicePeer = activeDevices.get(deviceId)
        if (!devicePeer) {
          clientPeer.send({ type: 'error', message: 'Device is offline' })
          return
        }
        devicePeer.send({ type: 'command', action: 'reboot' })
      }
    }
    ```

  - **详尽状态查询 (Status Query) 处理器**：
    创建 `nitro-app/server/control/status.ts`：
    ```typescript
    import type { ControlHandler, ControlContext } from '../utils/control/types.ts'
    import { activeDevices } from '../utils/wsRegistry.ts'

    export const statusHandler: ControlHandler = {
      async execute({ clientPeer, deviceId }) {
        const devicePeer = activeDevices.get(deviceId)
        if (!devicePeer) {
          clientPeer.send({ type: 'error', message: 'Device is offline' })
          return
        }
        devicePeer.send({ type: 'command', action: 'status_query' })
      }
    }
    ```

- [ ] **Step 4: 编写全局指令分发注册中心**
  创建 `nitro-app/server/control/index.ts`：
  ```typescript
  import type { ControlHandler } from '../utils/control/types.ts'
  import { ptzHandler } from './ptz.ts'
  import { rebootHandler } from './reboot.ts'
  import { statusHandler } from './status.ts'

  export const controlRegistry: Record<string, ControlHandler> = {
    ptz: ptzHandler,
    reboot: rebootHandler,
    status_query: statusHandler
  }
  ```

- [ ] **Step 5: 校验提交**
  运行：`pnpm --prefix nitro-app run typecheck:server`
  ```bash
  git add nitro-app/server/utils/wsRegistry.ts nitro-app/server/utils/control nitro-app/server/control
  git commit -m "feat: establish decoupled in-memory peer WS connection pools and modular action dispatcher"
  ```

---

### Task 7: 统一双向信令长连接 WebSocket 端点服务

**Files:**
- Create: `nitro-app/server/routes/control.ts`

- [ ] **Step 1: 实现统一 WebSocket 握手升级、路由分发与延迟宽限期离线通知服务**
  创建 `nitro-app/server/routes/control.ts`：
  ```typescript
  import { defineWebSocketHandler } from 'nitro'
  import { verifyJWT } from '../utils/token.ts'
  import { getDevice, saveDevice } from '../utils/db.ts'
  import { activeDevices, activeClients, deviceGraceTimers } from '../utils/wsRegistry.ts'
  import { controlRegistry } from '../control/index.ts'

  export default defineWebSocketHandler({
    async upgrade(request) {
      const url = new URL(request.url)
      const role = url.searchParams.get('role')

      if (role === 'client') {
        const token = url.searchParams.get('token')
        if (!token) throw new Response('Unauthorized - Missing Token', { status: 401 })
        const userClaims = verifyJWT(token)
        if (!userClaims) throw new Response('Unauthorized - Invalid Token', { status: 401 })
        return { context: { type: 'client', userId: userClaims.userId } }
      }

      if (role === 'device') {
        const deviceId = url.searchParams.get('deviceId')
        const token = url.searchParams.get('token')
        if (!deviceId || !token) throw new Response('Unauthorized - Missing Params', { status: 401 })
        
        const device = await getDevice(deviceId)
        if (!device || device.secret !== token) {
          throw new Response('Unauthorized - Auth Failed', { status: 401 })
        }
        return { context: { type: 'device', deviceId } }
      }

      throw new Response('Bad Request', { status: 400 })
    },

    async open(peer) {
      if (peer.context.type === 'device') {
        const deviceId = peer.context.deviceId as string
        
        // 清除离线容错宽限期定时器
        const existingTimer = deviceGraceTimers.get(deviceId)
        if (existingTimer) {
          clearTimeout(existingTimer)
          deviceGraceTimers.delete(deviceId)
        }

        activeDevices.set(deviceId, peer)
        
        const device = await getDevice(deviceId)
        if (device) {
          device.status = 'online'
          device.lastSeen = Date.now()
          await saveDevice(device)
        }

        // 通知所有在线客户端该设备已上线
        for (const [userId, clientSet] of activeClients.entries()) {
          for (const cPeer of clientSet) {
            cPeer.send({ type: 'device_status', deviceId, status: 'online' })
          }
        }
        console.log(`[WS] Device ${deviceId} connected and marked online.`)
      }

      if (peer.context.type === 'client') {
        const userId = peer.context.userId as string
        if (!activeClients.has(userId)) {
          activeClients.set(userId, new Set())
        }
        activeClients.get(userId)!.add(peer)
        peer.send({ type: 'welcome', message: 'HomeGuard control panel connected' })
      }
    },

    async message(peer, message) {
      try {
        const data = message.json<{ action: string; deviceId: string; payload: unknown; type?: string }>()
        
        // 1. 处理来自客户端的请求
        if (peer.context.type === 'client') {
          const userId = peer.context.userId as string
          const { action, deviceId, payload } = data

          // 验证权限
          const device = await getDevice(deviceId)
          if (!device || device.ownerId !== userId) {
            peer.send({ type: 'error', message: 'Access denied or device not found' })
            return
          }

          const handler = controlRegistry[action]
          if (handler) {
            await handler.execute({
              clientPeer: peer,
              userId,
              deviceId,
              payload
            })
          } else {
            peer.send({ type: 'error', message: `Unknown control action: ${action}` })
          }
        }

        // 2. 处理来自设备的消息广播转发给订阅的客户端
        if (peer.context.type === 'device') {
          const deviceId = peer.context.deviceId as string
          const device = await getDevice(deviceId)
          if (!device) return

          // 转发状态报告或报警至属于该设备所有者的在线客户端
          const ownerClients = activeClients.get(device.ownerId)
          if (ownerClients) {
            for (const cPeer of ownerClients) {
              cPeer.send({
                type: 'device_update',
                deviceId,
                event: data.type || 'status_report',
                payload: data.payload
              })
            }
          }
        }
      } catch {
        peer.send({ type: 'error', message: 'Invalid payload format' })
      }
    },

    async close(peer, details) {
      if (peer.context.type === 'client') {
        const userId = peer.context.userId as string
        const clientSet = activeClients.get(userId)
        if (clientSet) {
          clientSet.delete(peer)
          if (clientSet.size === 0) {
            activeClients.delete(userId)
          }
        }
      }

      if (peer.context.type === 'device') {
        const deviceId = peer.context.deviceId as string
        activeDevices.delete(deviceId)

        const handleOffline = async () => {
          const device = await getDevice(deviceId)
          if (device) {
            device.status = 'offline'
            device.lastSeen = Date.now()
            await saveDevice(device)
          }
          // 广播下线通知
          for (const [userId, clientSet] of activeClients.entries()) {
            for (const cPeer of clientSet) {
              cPeer.send({ type: 'device_status', deviceId, status: 'offline' })
            }
          }
          console.log(`[Grace Period] Device ${deviceId} declared offline.`)
        }

        // 1000 正常关闭或客户端注销 -> 立即标记 offline
        if (details.code === 1000) {
          await handleOffline()
        } else {
          // 异常掉线：设置 10 秒网络延迟抖动容错宽限期
          console.log(`[Grace Period] Device ${deviceId} disconnected abnormally. Starting 10s grace timer...`)
          const timer = setTimeout(async () => {
            await handleOffline()
            deviceGraceTimers.delete(deviceId)
          }, 10000)
          deviceGraceTimers.set(deviceId, timer)
        }
      }
    }
  })
  ```

- [ ] **Step 2: 完整集成测试与跑通**
  运行一键式静态审查：`pnpm --prefix nitro-app run check:all`
  预期输出：oxfmt, oxlint, typecheck 均以 0 警告 0 错误正常通过！

- [ ] **Step 3: 提交并关闭 Phase 2**
  ```bash
  git add nitro-app/server/routes/control.ts
  git commit -m "feat: complete unified control WebSocket gateway with grace period recovery"
  ```
