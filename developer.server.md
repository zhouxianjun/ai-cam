# Server 端开发规范

> Nitro v3 · TypeScript · Node.js

## 框架文档

**Nitro v3 的 API 与你的已有知识大概率不同，动手前必读：**

```
nitro-app/node_modules/nitro/dist/docs/README.md          ← 文档目录索引
nitro-app/node_modules/nitro/dist/docs/0.docs/3.routing.md ← 路由 & 中间件
nitro-app/node_modules/nitro/dist/docs/0.docs/14.websocket.md ← WebSocket & SSE
nitro-app/node_modules/nitro/dist/docs/0.docs/12.plugins.md   ← 插件 & 生命周期 Hooks
nitro-app/node_modules/nitro/dist/docs/0.docs/8.configuration.md ← runtimeConfig & 环境变量
nitro-app/node_modules/nitro/dist/docs/0.docs/6.storage.md    ← KV Storage
nitro-app/node_modules/nitro/dist/docs/0.docs/10.lifecycle.md  ← 请求生命周期
```

## 项目约定

| 约定       | 规则                                                                        |
| ---------- | --------------------------------------------------------------------------- |
| 路径别名   | `~/*` 映射项目根目录（tsconfig.json）                                       |
| 导入扩展名 | 始终写 `.ts` 后缀                                                           |
| 代码风格   | 见 `.oxfmtrc.json`：单引号、无分号、尾逗号 all                              |
| 格式化     | `pnpm fmt`（oxfmt）· `pnpm lint`（oxlint）· `pnpm typecheck:server`（tsgo） |

## 目录职责

```
nitro-app/
  ├── shared/     → 前后端共享：类型、常量、纯函数。禁止导入任何端专属包
  ├── server/     → 服务端逻辑
  │     ├── api/  → /api 前缀路由。按业务用 (group)/ 分组，不影响 URL
  │     ├── routes/ → 无前缀路由（WebSocket 入口等）
  │     ├── middleware/ → 全局中间件，数字前缀排序：01.xxx.ts, 02.xxx.ts
  │     ├── plugins/    → 启动时执行一次，数字前缀排序
  │     ├── utils/      → 仅服务端的工具函数
  │     ├── types/      → 仅服务端的类型
  │     └── constants/  → 仅服务端的常量
  └── app/        → 前端代码
```

> 类型 / 常量 / 纯函数若前后端都用 → 放 `nitro-app/shared/`，不要在 `server/` 和 `app/` 里各写一份。

## 代码质量

- **禁止 `any`** — 用 `unknown` + 类型收窄，或泛型约束
- **避免 `if (...) return` 卫语句链** — 用 Map/Record 映射、策略模式、或 early validation 层集中处理
- **拆函数做抽象** — 路由处理器只做：解析入参 → 调用业务函数 → 返回结果。业务逻辑抽到 `utils/` 或 `shared/`
- **用工厂 / 映射替代 if-else / switch**：

```typescript
// ✅ 映射表
const handlers: Record<string, (p: Payload) => Result> = {
  'device:register': handleRegister,
  'device:heartbeat': handleHeartbeat,
}
const fn = handlers[msg.type]

// ❌ if-return 链
if (msg.type === 'device:register') return handleRegister(msg)
if (msg.type === 'device:heartbeat') return handleHeartbeat(msg)
```

- **优先使用第三方工具函数** — `es-toolkit` 已安装，通用工具函数（数组/对象/函数式）优先用它，不要手写
- **文件不要太大** — 单个 `.ts` 超过 ~200 行时，按单一职责拆分到独立模块

## 第三方文档查阅

不确定第三方库的 API 用法时，使用 **Context7 MCP** 查阅最新文档，不要凭记忆猜测。

## 关键 API 速查

```typescript
// 定义处理器 / WebSocket / 插件
import { defineHandler, defineWebSocketHandler } from 'nitro'
import { definePlugin } from 'nitro'

// 运行时配置 & 存储
import { useRuntimeConfig } from 'nitro/runtime-config'
import { useStorage } from 'nitro/storage'

// h3 工具
import { createError, createEventStream } from 'nitro/h3'

// 读请求体 / 路由参数
const body = await event.req.json()
const { id } = event.context.params
```

> ⚠️ `readBody(event)` 等旧 API 已废弃，以 `nitro-app/node_modules/nitro/dist/docs/` 内文档为准。
