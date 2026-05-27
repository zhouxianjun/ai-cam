# HomeGuard-RTC Agent Guide

> Welcome, AI Coding Agent! Please read this guide and the referenced files fully before making any edits or responding to tasks.

## 1. Core References (MUST READ FIRST)

To ensure your implementation aligns with this project's architecture and quality standards, you **MUST** read and follow these three documents:

- 📋 **[Project Overview](./OVERVIEW.md)**: Global topology, core vision, tech stack, and media/control data flows.
- 🖥️ **[Server-Side Specs (Nitro v3)](./developer.server.md)**: Nitro v3 guidelines, server folder roles, strict TypeScript guidelines (no `any`), error handling, and API wrappers.
- 🎨 **[Frontend Specs (Vue 3)](./developer.app.md)**: Vue 3, Pinia setup store, TailwindCSS v4, Element Plus, file-based routing, stateful request patterns (`useAsyncState`), and component structures.

---

## 2. Nitro v3 Reference

Your pre-existing training knowledge about Nitro v3 API is likely outdated! Before editing the backend, refer to the local documentation:

- 📖 **Local Docs Path**: `node_modules/nitro/dist/docs/README.md`
- ⚠️ **Key Update**: `readBody(event)` is deprecated. Use `await event.req.json()` instead.

---

## 3. Directory Structures

```
shared/                 → Shared types, constants, and pure functions (no environment-specific imports)
server/                 → Server-side (Nitro v3)
  ├── api/              → API routes (prefixed with /api)
  ├── routes/           → Non-prefixed routes (e.g. WebSocket, SSE)
  ├── middleware/       → Order-numbered middleware (e.g. 01.auth.ts)
  ├── plugins/          → Startup plugins
  └── utils/            → Backend-only utility functions
app/                    → Frontend-side (Vue 3 client-side SPA)
  ├── entry-client.ts   → SPA mount entry
  ├── pages/            → File-based routing (pages/index.vue -> /)
  ├── components/       → Reusable UI components
  ├── composables/      → Composable hooks (useXxx)
  └── stores/           → Pinia stores (Setup Store syntax)
```

> **Warning for Frontend Pages**: Any non-route files (such as sub-components or local utilities) placed under `app/pages/` **must** be stored inside double-underscores directories (e.g., `app/pages/dashboard/__components__/`) to prevent the file-based router from mapping them to URL paths.

---

## 4. Key Engineering Standards

- **Strict TypeScript**: No `any`. Use `unknown` with type assertions/guards or generic constraints.
- **No `if (...) return` guard chains**: Replace flat conditional chains with early validator blocks, maps, dictionary records, or factory patterns to maintain declarative control flow.
- **No reinvented wheels**: Prioritize using `es-toolkit` (modern lodash alternative) and `@vueuse/core` (reactive state utils).
- **Context7 MCP**: When using third-party libraries (e.g. SRS, Vue, Element Plus), run the Context7 MCP tool to lookup actual documentation instead of guessing APIs.
- **Single File Limits**: Limit individual files to `~200` lines. If a file exceeds this, extract responsibilities.
