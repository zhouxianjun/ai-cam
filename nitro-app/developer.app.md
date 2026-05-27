# 前端开发规范

> Vue 3 · Pinia · Element Plus · TailwindCSS v4 · vue-router (file-based)

## 技术栈文档

```
Vue 3         → https://vuejs.org/
Pinia         → https://pinia.vuejs.org/
Element Plus  → https://element-plus.org/
TailwindCSS 4 → https://tailwindcss.com/docs
vue-router    → 文件路由由 vue-router/vite 插件自动生成，见 typed-router.d.ts
```

## 项目约定

| 约定       | 规则                                                                        |
| ---------- | --------------------------------------------------------------------------- |
| 路径别名   | `~/*` 映射项目根目录（tsconfig.json）                                       |
| 导入扩展名 | 始终写 `.ts` / `.vue` 后缀                                                  |
| 代码风格   | 见 `.oxfmtrc.json`：单引号、无分号、尾逗号 all                              |
| 格式化     | `pnpm fmt`（oxfmt）· `pnpm lint`（oxlint）· `pnpm typecheck:app`（vue-tsc） |
| 自动导入   | vue / vue-router / @vueuse/core 的 API 由 unplugin-auto-import 自动导入     |
| 组件导入   | Element Plus 组件由 unplugin-vue-components 自动按需注册                    |

## 目录职责

```
shared/               → 前后端共享：类型、常量、纯函数。禁止导入任何端专属包
app/
  entry-client.ts     → 客户端入口：createApp / Pinia / Router 挂载
  App.vue             → 根组件（仅放 <router-view> + 全局过渡）
  pages/              → 文件路由页面（vue-router/vite 自动扫描）
  components/         → 可复用 UI 组件
  composables/        → 组合式函数（useXxx）
  stores/             → Pinia store
  assets/             → 静态资源（CSS / 图片 / 字体）
  types/              → 仅前端的类型定义
```

> 类型 / 常量 / 纯函数若前后端都用 → 放 `shared/`，不要在 `app/` 和 `server/` 里各写一份。

## 文件路由

页面文件放 `app/pages/`，路径即路由：

```
pages/
  index.vue           → /
  login.vue           → /login
  dashboard/
    index.vue         → /dashboard
    [id].vue          → /dashboard/:id
```

**重要**：`pages/` 目录下所有非页面文件（组件、工具等）必须放在 `__xxx__` 目录中（双下划线包裹），否则会被自动路由系统识别为路由路径。

路由类型自动生成到 `typed-router.d.ts`，使用 `<router-link>` 和 `useRouter()` 均有类型提示。

## 组件规范

- **SFC 结构顺序**: `<script setup>` → `<template>` → `<style>`
- **命名**: 文件用 `PascalCase.vue`，模板中用 `<PascalCase />` 或 `<kebab-case />`
- **props**: 用 `defineProps<T>()` 泛型写法，不用运行时声明
- **emits**: 用 `defineEmits<T>()` 泛型写法

```vue
<script setup lang="ts">
interface Props {
  deviceId: string
  status?: DeviceStatus
}
const props = withDefaults(defineProps<Props>(), {
  status: 'offline',
})

const emit = defineEmits<{
  select: [id: string]
}>()
</script>
```

## 状态管理 (Pinia)

- 一个业务域一个 store，文件放 `app/stores/`
- 使用 Setup Store 语法（`defineStore('name', () => { ... })`）
- 与 API 交互的逻辑封装在 store 的 action 中，组件不直接调 fetch

## 样式规范

- **TailwindCSS** 作为主要样式方案，直接在模板中使用
- **Element Plus** 主题定制通过 SCSS 变量覆盖（已配置 sass/sass-embedded）
- **组件私有样式** 使用 `<style scoped>`，避免全局污染
- **共享样式** 放 `app/assets/`

## 代码质量

- **禁止 `any`** — 用 `unknown` + 类型收窄，或泛型约束
- **避免 `if (...) return` 卫语句链** — 用映射表、computed 或策略模式
- **拆函数做抽象** — 组件只做视图绑定，业务逻辑抽到 `composables/` 或 `stores/`
- **用映射替代 if-else / switch**（同 server 端规范）
- **优先使用第三方工具函数** — 不要手写已有轮子：
  - `@vueuse/core` — 响应式工具（自动导入，无需 import）
  - `es-toolkit` — 通用工具函数（替代 lodash）
- **请求带状态用 `useAsyncState`** — 不要手动管理 loading / error / data：

```typescript
// ✅
const { state, isLoading, error, execute } = useAsyncState(
  () => fetch('/api/devices').then((r) => r.json()),
  [],
)

// ❌ 手动管理
const loading = ref(false)
const data = ref([])
loading.value = true
data.value = await fetch(...)
loading.value = false
```

- **文件不要太大** — 单个 `.vue` / `.ts` 文件超过 ~200 行时，拆分为：
  - 单一职责子组件（`components/`）
  - 组合式函数（`composables/useXxx.ts`）

## 第三方文档查阅

不确定第三方库的 API 用法时，使用 **Context7 MCP** 查阅最新文档，不要凭记忆猜测。
