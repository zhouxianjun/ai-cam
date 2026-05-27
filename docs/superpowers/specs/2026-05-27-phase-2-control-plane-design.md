# HomeGuard-RTC Phase 2: Node.js 控制面构建设计方案

本文档定义了 HomeGuard-RTC 项目第二阶段（Phase 2: Node.js 控制面构建）的完整技术设计与实现规范。

---

## 1. 业务目标与边界

本阶段的核心是构建流媒体平台的核心大脑（控制面），主要负责以下三大边界职责：
1. **持久化与账号管理**：基于 Nitro v3 轻量级持久化存储，建立用户及设备的基本注册、认证体系。
2. **安全接入控制（流媒体防火墙）**：实现基于双层 Token（业务 JWT + 短期 HMAC 媒体 Token）的安全访问控制，并提供 SRS 流媒体服务器的回调授权验证接口（`/internal/srs/*`）。
3. **高效率双向信令长连接**：基于 CrossWS 与 Node.js 内存长连接池，建立客户端与摄像头设备之间的秒级双向控制通道。

---

## 2. 第一部分：持久化与数据层设计

### 2.1 技术选型
本系统采用 **Nitro v3 原生内置的 KV 存储驱动 (基于 `unstorage`)** 作为主持久化引擎。
* **数据目录**：`.data/db/` (项目根目录下自动创建的本地目录)
* **存储命名空间**：`db`
* **配置文件**：
  在 `nitro-app/nitro.config.ts` 中配置存储驱动：
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
        base: './.data/db'
      }
    }
  })
  ```

### 2.2 实体 Schema 定义 (定义在 `nitro-app/shared/types.ts`)

#### 2.2.1 用户实体 (`User`)
```typescript
export interface User {
  id: string
  username: string
  passwordHash: string // SHA-256 带盐存储
  salt: string
  role: 'admin' | 'user'
  createdAt: number
}
```

#### 2.2.2 设备实体 (`Device`)
```typescript
export interface Device {
  id: string          // 设备唯一 ID (如 camera_home)
  name: string        // 设备名称 (如 "客厅摄像头")
  secret: string      // 设备预共享密钥 (用于鉴权与签名)
  status: 'online' | 'offline'
  lastSeen: number    // 上次活跃时间戳
  ownerId: string     // 关联的用户ID
  createdAt: number
}
```

### 2.3 数据访问层 DAL 接口 (`server/utils/db.ts`)
```typescript
import { useStorage } from 'nitro/storage'

const getStorage = () => useStorage('db')

export async function getUser(username: string): Promise<User | null> { ... }
export async function saveUser(user: User): Promise<void> { ... }
export async function getDevice(deviceId: string): Promise<Device | null> { ... }
export async function saveDevice(device: Device): Promise<void> { ... }
export async function listDevicesByOwner(ownerId: string): Promise<Device[]> { ... }
```

### 2.4 默认管理员种子生成 (Seeding)
利用 Nitro 启动插件 `server/plugins/01.seed.ts`：
* 系统启动时，检测 `db` 中是否存在用户。
* 若无任何用户，系统自动创建一个默认的 `admin` 账号，密码设为 `admin123`（自动进行 SHA-256 + salt 加密存储）。

---

## 3. 第二部分：安全隔离与流媒体回调鉴权

本系统推行**双层安全令牌机制**，实现高强度的权限隔离：

### 3.1 双层 Token 机制

#### 3.1.1 业务层 Token (Session JWT)
* **生成**：用户登录 `/api/auth/login` 成功后，Node.js 使用 `JWT_SECRET`（服务器启动时生成或环境变量配置）签发标准 JWT。
* **有效期**：1天。
* **用途**：Web 客户端访问普通 API，以及连接信令 WebSocket 时作为 `Authorization` 校验凭证。

#### 3.1.2 临时媒体 Action Token
* **有效期**：60 秒（极短生存期，仅用于握手）。
* **Token Claims 结构**：
  ```typescript
  export interface MediaTokenClaims {
    sub: string         // 发起者 ID
    deviceId: string    // 目标设备 ID
    app: string         // 流应用名称 (如 "live")
    stream: string      // 流名称 (如 "camera_home")
    action: 'play' | 'publish' // 严格限制的操作类别
    exp: number         // 过期绝对时间戳
    nonce: string       // 随机值 (防重放)
  }
  ```
* **签名实现**：
  1. 将 Claims 声明通过 `JSON.stringify` 序列化，并进行 `Base64URL` 编码。
  2. 使用对应设备的 `Device.secret` 作为 HMAC 密钥。
  3. 通过 Node.js 内置 `crypto` 计算 HMAC-SHA256 签名并转换为 `Base64URL`。
  4. 最终拼接格式：`Base64URL(payload).Base64URL(signature)`。

### 3.2 媒体 Token 申请 API 接口

#### 3.2.1 摄像头推流 Token (`POST /api/devices/:deviceId/publish-token`)
* **请求者**：ESP32
* **鉴权**：通过请求体携带设备密匙 `secret` 校验身份。
* **作用**：校验成功后，签发包含 `action: 'publish'` 和绑定流名的短效媒体 Token。

#### 3.2.2 客户端拉流 Token (`POST /api/devices/:deviceId/play-token`)
* **请求者**：Web 客户端
* **鉴权**：通过 Header 中携带的业务 JWT 进行校验。
* **作用**：校验该用户对该设备的访问权后，签发包含 `action: 'play'` 和绑定播放流名的短效媒体 Token。

### 3.3 SRS 内部 HTTP 安全回调

> [!IMPORTANT]
> `/internal/srs/*` 接口只能允许 SRS 所在的本地 IP (127.0.0.1) 或安全受信任的容器内网 IP 访问，禁止对公网暴露。

#### 3.3.1 推流鉴权 (`POST /internal/srs/on-publish`)
当 SRS 接收到 ESP32 发起的 WebRTC WHIP 推流请求时触发。
* **参数提取**：解析请求体中 `app`、`stream` 以及推流参数中的 `token`。
* **解密校验**：
  1. 解码 Token 得到 Claims。
  2. 获取 `deviceId`，从 KV 中拉取对应的 `Device.secret`。
  3. 比对签名是否合法。
  4. 校验 `exp > Date.now()` 且 `action === 'publish'` 且流名称及应用名完全一致。
* **返回**：鉴权通过返回 `{ "code": 0 }`，拒绝推流返回非零。

#### 3.3.2 播放鉴权 (`POST /internal/srs/on-play`)
当 SRS 接收到客户端发起的 WHEP 播放请求时触发。
* **校验逻辑**：大体同上，但必须严格限制 `action === 'play'`。

#### 3.3.3 流停止状态更新 (`POST /internal/srs/on-stop`)
当推流连接断开时，更新设备在存储中的状态为 `offline`。

---

## 4. 第三部分：信令长连接与模块化指令分发

信令双向传输全部收敛在统一的长连接端点。

### 4.1 长连接管理器 (`server/utils/wsRegistry.ts`)
```typescript
import type { Peer } from 'crossws'

// 活跃的设备连接：deviceId -> Peer
export const activeDevices = new Map<string, Peer>()

// 活跃的客户端连接：userId -> Set<Peer>
export const activeClients = new Map<string, Set<Peer>>()
```

### 4.2 统一信令端点处理器 (`routes/control.ts`)

#### 4.2.1 握手与类型化升级 (`upgrade` Hook)
根据 Query 参数分流与校验：
* **客户端**：升级 URL 包含 `?role=client&token=<user_jwt>`。
  * 提取 `userId`，成功则绑定到 `peer.context = { type: 'client', userId }`。
* **设备端**：升级 URL 包含 `?role=device&deviceId=<id>&token=<device_secret>`。
  * 验证密钥正确性，成功则绑定到 `peer.context = { type: 'device', deviceId }`。

#### 4.2.2 建立长连接 (`open` Hook)
* 将对应的 Peer 实例注册到 `wsRegistry.ts` 连接池中。
* 如果是设备端上线，清除它可能存在的离线宽限期定时器（参见 4.2.4 容错设计），更新 KV 状态为 `online`，并广播通知关联用户。

#### 4.2.3 模块化指令注册与分发 (`message` Hook)
采用**命令模式 (Command Pattern)** 隔离复杂的指令逻辑，杜绝巨石处理器文件。

* **接口定义** (`server/utils/control/types.ts`)：
  ```typescript
  import type { Peer } from 'crossws'

  export interface ControlContext {
    clientPeer: Peer     // 发起控制的客户端
    userId: string       // 用户 ID
    deviceId: string     // 目标设备 ID
    payload: unknown     // 协议内容数据
  }

  export interface ControlHandler {
    execute(ctx: ControlContext): Promise<void>
  }
  ```
* **指令目录映射** (`server/control/index.ts`)：
  分文件独立编写每个控制动作，并在注册表中进行统一注册：
  * `server/control/ptz.ts` -> 处理云台控制（PTZ）。
  * `server/control/reboot.ts` -> 处理重启摄像头。
  * `server/control/status.ts` -> 查询当前摄像头详尽硬件状态。
  ```typescript
  import { ptzHandler } from './ptz.ts'
  import { rebootHandler } from './reboot.ts'
  import { statusHandler } from './status.ts'

  export const controlRegistry: Record<string, ControlHandler> = {
    ptz: ptzHandler,
    reboot: rebootHandler,
    status_query: statusHandler
  }
  ```
* **分发逻辑**：
  在主长连接 `message` 接收到客户端消息（格式：`{ action: string, deviceId: string, payload: unknown }`）后，通过 `controlRegistry[action]` 直接分发执行。

#### 4.2.4 断开机制与网络抖动容错设计 (`close` Hook)
发生连接断开时，区分网络异常断开和主动退出：
* **设备端正常退出 (Code 1000 或主动注销)**：
  立即从 `wsRegistry` 移除，将设备状态在数据库中置为 `offline` 并向所有关联的在线客户端广播离线通知。
* **设备端异常网络断开 (非 1000 断开/心跳超时)**：
  1. 不立刻判定下线。
  2. 启动一个 **10 秒的离线延迟宽限期定时器 (Grace Period Timer)**。
  3. 若设备在 10 秒内成功进行 WebSoket 重连且鉴权通过，则复用会话，销毁该定时器，整个过程客户端无感知。
  4. 若 10 秒倒计时结束设备仍未重连，执行断开下线，更新 KV 状态为 `offline`，并进行全网广播。

---

## 5. 阶段二验证方案

1. **静态代码分析**：
   运行 `pnpm run check:all` 确保没有 TypeScript 编译和 Linter 问题。
2. **自动化集成测试**：
   编写测试脚本模拟：
   - 用户登录与 JWT 校验。
   - 设备注册与状态流转。
   - HMAC 媒体 Token 签名与 SRS hook 安全回调拦截验证。
   - 模拟网络异常断开（10秒宽限期验证）和主动退出的差异表现。
   - 验证统一信令端点的分文件指令注册与转发是否正常。
