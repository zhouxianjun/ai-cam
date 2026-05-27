# HomeGuard-RTC 项目总览

## 1. 项目愿景与核心定位

**HomeGuard-RTC** 是一款专为家庭安全设计的、具备**工业级安全防御能力**的自主网络监控平台。
项目核心宗旨是“极致隐私、绝对掌控”。通过将流媒体核心隐藏于网关之后、全链路收敛至单端口（443 TCP）以及端到端强鉴权手段，彻底杜绝传统商用摄像头数据泄露、外网扫描窃听的风险，实现可直接平替部署至公网云端的高性能、低延迟监控解决方案。

---

## 2. 核心技术栈

项目采用前后端分离及硬件嵌入式协同开发，整体架构基于现代化全 TCP 协议闭环：

- **硬件采集端**：ESP32-S3 单片机 + ESP-IDF + `esp-webrtc-solution`（核心协议栈）
- **边缘/云端网关**：Nginx（作为四层/七层统一流量控制中心）
- **业务中台服务**：Node.js + TypeScript + Nitro + WebSocket（负责业务逻辑、安全ACL与指令转发）
- **流媒体中枢**：SRS 6.0 (Simple Realtime Server) —— 开启 WebRTC over TCP 模式
- **多端全功能前端**：
  - **Web/H5 客户端**：Nitro app（Vite 8 + TS + Vue 3 + element-plus + tailwindcss）
  - **微信小程序端**：微信原生 `<live-player>` 高性能组件（走 HTTP-FLV 低延迟协议转换流）

---

## 3. 全局技术拓扑与数据边界

系统在物理网络上**严格仅向外暴露 443 (HTTPS) 及 8000 (TCP 媒体复用) 端口**（若进一步收敛，可通过 Nginx 四层合并至单 443 入口）。流媒体服务器（SRS）与业务核心完全常驻于受保护的内网环境。

### 核心数据流向

1. **控制流 (Control Plane)**：
   `手机/微信小程序` ⇄ `Nginx (443)` ⇄ `Node.js (3000)` ⇄ `内网控制总线 (WebSocket)` ⇄ `ESP32 采集端`
2. **音视频推流 (Ingress Media)**：
   `ESP32 摄像头` ➔ `Nginx (443)` ➔ `SRS 媒体中心 (8000 TCP)`
3. **音视频拉流 (Egress Media - Web端)**：
   `Web客户端` ➔ `Nginx (443/8000)` ➔ `SRS 媒体中心 (WebRTC over TCP)`
4. **音视频拉流 (Egress Media - 小程序端)**：
   `SRS (FLV内存转换)` ➔ `Node.js (安全注入管道)` ➔ `Nginx (443)` ➔ `小程序 <live-player>`
