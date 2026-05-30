# Phase 5: Web 客户端接入设计规格说明书 (Web Client Design Spec)

## 1. 业务愿景与核心设计目标

本设计文档旨在为 **HomeGuard-RTC** 的 **Phase 5: Web 客户端接入** 制定清晰的架构蓝图与实现规范。

作为家庭安全监控控制台，Web 客户端秉持**“极致隐私、绝对掌控”**的核心原则，其设计目标为：
- **无感安全防御**：以最轻量化的方式将 JWT 身份验证与短生命周期 Media Action Token 无缝融入 WebRTC 与 WebSocket 网络层。
- **卓越交互体验**：提供极致低延时的视频渲染与零卡顿的云台遥杆微操指令反馈。
- **赛博极客美学**：采用黑曜石太空灰色调、霓虹状态呼吸灯、毛玻璃（Glassmorphism）质感，展现高度专业且极富视觉张力的安全座舱。

---

## 2. 页面布局与交互逻辑 (Unified Layout)

整个 Web 应用采用单页全屏（`h-screen overflow-hidden`）的专业安防控制台视口，不进行冗余的页面跳转（除了独立的 `/login` 登录页面）。

### 2.1 路由架构 (Routes)
- **`/login`**：独立的身份建立终端，采用 3D 毛玻璃登录面板与动态发光边界，未授权用户的重定向终点。
- **`/` (Dashboard)**：主座舱，在挂载时进行授权验证，若未通过则无缝重定向至 `/login`。

### 2.2 Dashboard 页面布局 (Dashboard Grid)
全屏采用三栏式流式布局，结构如下：
1.  **顶部导航栏 (Navbar)**：展示 HomeGuard-RTC 标志、当前网络连接指示器（实时计算 WS 延迟）及登出按钮。
2.  **左侧设备侧边舱 (Device Sidebar)**：设备搜索框 + 滚动设备列表（以微型呼吸指示灯区分在线与离线设备）。
3.  **右侧监控大厅 (Monitor Hall)**：
    *   **视口大厅 (Center - Video Viewport)**：大屏幕 (16:9) WebRTC 视频流渲染视口，带有一体化的底层流指标悬浮看板。
    *   **控制台舱 (Right - Action Console)**：放置圆形的云台（PTZ）D-Pad 转向控制舵，以及系统重启等设备行为动作按钮组。

---

## 3. 视觉设计系统与 UI tokens

我们基于 TailwindCSS 4 构建专有的“赛博安防舱”设计变量系统：

```css
/* nitro-app/app/assets/main.css */
:root {
  /* 基础背景色 */
  --color-bg-space: #0b0f19;         /* 深邃太空黑 */
  --color-bg-panel: rgba(16, 23, 42, 0.65);  /* 太空蓝毛玻璃底色 */
  --color-bg-card: rgba(30, 41, 59, 0.4);    /* 设备卡片底色 */
  
  /* 核心赛博霓虹点缀色 */
  --color-cyber-cyan: #06b6d4;       /* 极客青 (控制激活、主高亮) */
  --color-cyber-green: #10b981;      /* 荧光绿 (设备在线、健康状态) */
  --color-cyber-orange: #f97316;     /* 警示橙 (设备离线、异常警告) */
  --color-cyber-blue: #3b82f6;       /* 科技蓝 */

  /* 边框与磨砂毛玻璃效用 */
  --border-cyber: 1px solid rgba(6, 182, 212, 0.15);
  --border-cyber-active: 1px solid rgba(6, 182, 212, 0.6);
  --glass-effect: backdrop-filter: blur(12px) saturate(180%);
}
```

---

## 4. 前端逻辑与状态设计 (Pinia Setup Stores)

为了严格遵守 `AGENTS.md` 中 **“单文件限制 ~200 行”** 与 **“拆函数做抽象”** 的原则，我们将状态、多媒体传输、信令收发完全解耦，采用 **“Pinia Setup Store + Composeable 逻辑组合”** 的开发范式。

### 4.1 Pinia Setup Stores (`nitro-app/app/stores/`)

#### 4.1.1 身份凭证中心 (`stores/auth.ts`)
*   **职责**：管理用户 Session 的建立、保持与销毁，完成持久化。
*   **结构**：
    ```typescript
    import { ref, computed } from 'vue'
    import { defineStore } from 'pinia'
    import { useRouter } from 'vue-router'

    export const useAuthStore = defineStore('auth', () => {
      const token = ref<string | null>(localStorage.getItem('auth_token'))
      const isAuthenticated = computed(() => !!token.value)
      const router = useRouter()

      async function login(username: string, password: string) {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        })
        if (!response.ok) throw new Error('Authentication failed')
        const data = await response.json()
        token.value = data.token
        localStorage.setItem('auth_token', data.token)
        router.push('/')
      }

      function logout() {
        token.value = null
        localStorage.removeItem('auth_token')
        router.push('/login')
      }

      return { token, isAuthenticated, login, logout }
    })
    ```

#### 4.1.2 设备信息管理 (`stores/device.ts`)
*   **职责**：管理当前用户所拥有的设备状态及切换。
*   **结构**：
    ```typescript
    import { ref, computed } from 'vue'
    import { defineStore } from 'pinia'
    import type { Device } from '~/shared/types.ts'

    export const useDeviceStore = defineStore('device', () => {
      const devices = ref<Device[]>([])
      const selectedDeviceId = ref<string | null>(null)
      const selectedDevice = computed(() => 
        devices.value.find(d => d.id === selectedDeviceId.value) || null
      )

      function setDevices(list: Device[]) {
        devices.value = list
      }

      function updateDeviceStatus(deviceId: string, status: 'online' | 'offline') {
        const device = devices.value.find(d => d.id === deviceId)
        if (device) {
          device.status = status
          device.lastSeen = Date.now()
        }
      }

      return { devices, selectedDeviceId, selectedDevice, setDevices, updateDeviceStatus }
    })
    ```

---

## 5. 网络连接与媒体层设计 (Composables)

### 5.1 WebRTC (WHEP) 播放逻辑组合 (`composables/useWhep.ts`)
*   **设计原则**：100% 零外部依赖，使用原生浏览器 `RTCPeerConnection` API，生命周期严格与组件绑定，防止多媒体通道内存泄漏。
*   **工作机制**：
    1.  监听选中的 `deviceId`，若变更则自动关闭前一个播放连接。
    2.  调用 `POST /api/devices/:id/play-token`（请求头携带用户的 Bearer Token）换取包含短期 Media Token 的 WHEP 拉流地址：`https://media.local.test/rtc/v1/whep/?app=live&stream=<stream>&token=<MediaToken>`。
    3.  初始化 `RTCPeerConnection`，声明 `addTransceiver('video', { direction: 'recvonly' })` 与 `addTransceiver('audio', { direction: 'recvonly' })`。
    4.  通过 `createOffer()` 产生 SDP，并 `setLocalDescription(offer)`。
    5.  向 SRS WHEP 接口发起 HTTP POST 提交 Offer SDP。
    6.  将 SRS 返回的 Answer SDP 注入 `setRemoteDescription()`，协商通道建立。
    7.  当触发 `ontrack` 回调时，将 `event.streams[0]` 赋予 `<video>` 的 `srcObject`。

### 5.2 WebSocket 信令控制组合 (`composables/useControlWS.ts`)
*   **设计原则**：利用 `@vueuse/core` 中的 `useWebSocket` 进行保活重连包装，建立在 HTTPS 单端口 `443` 上。
*   **通信地址**：`wss://app.local.test/control?role=client&token=<user_jwt>`。
*   **信令流向**：
    *   **客户端指令发送**：
        *   PTZ 云台转向：发送 `{ action: 'ptz', deviceId, payload: { direction: 'up' | 'down' | 'left' | 'right' } }`。
        *   设备重启：发送 `{ action: 'reboot', deviceId }`。
    *   **服务端广播接收**：
        *   设备状态上线/下线广播：接收 `{ type: 'device_status', deviceId, status: 'online' | 'offline' }` -> 触发 `deviceStore.updateDeviceStatus()` 并同步影响播放状态。
        *   设备运行时指标：接收 `{ type: 'device_update', deviceId, event: 'status_report', payload }` -> 注入播放器右上角悬浮性能看板。

---

## 6. 安全设计与生产合规 (Security Specs)

- **传输链路保密**：生产环境及本地开发（依靠 `mkcert` 签发的本地根 CA）强制要求全链路使用 HTTPS/WSS 传输，彻底防止中间人窃听与 Session 截获。
- **防越权播放校验**：
  - WHEP 播放 Token 在 Node.js 层面与用户的 JWT 所有权进行严格 ACL 检查，确认请求的 `deviceId` 确为该用户所有。
  - WHEP 播放 Token 具备 **60秒** 超短生命周期（TTL），防范泄露重放。
- **WebSocket 越权防护**：
  - 服务器路由处理器 `routes/control.ts` 在连接建立阶段通过校验 JWT 确定用户身份。
  - 每次收到客户端的 `action`（如 `ptz`）时，再次从内存中拉取设备配置，核对 `device.ownerId === userId`，实现双层防御姿态。

---

## 7. 自动化测试与验证机制 (Verification Plan)

### 7.1 自动化单元测试 (Vitest)
我们将为 Pinia stores 与 Composables 构建健全的单元测试，并在提交前运行：
*   **运行命令**：`pnpm --prefix nitro-app run test`
*   **用例定义**：
    *   `auth.spec.ts`：测试 `login` 触发 API 调用，并把 Token 存入 localStorage；测试 `logout` 时数据清空与路由调用。
    *   `device.spec.ts`：测试设备列表的正确拉取，以及在接收到 `updateDeviceStatus` 时列表数据是否发生反应式改变。

### 7.2 手动集成联调与 WebRTC 监控
*   **Vite 本地开发验证**：启动 `pnpm --prefix nitro-app run dev`，配置 hosts `app.local.test`。
*   **SDP 协商监测**：在 Chrome 中打开 `chrome://webrtc-internals/` 持续跟踪 `RTCPeerConnection` 的连接状态与 ICE 候选者，确认 WebRTC 媒体流经由 Nginx Gateway TCP 单端口分发完成。
