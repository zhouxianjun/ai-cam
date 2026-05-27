# Claude Developer Guide

Please refer to the following files to align with the project design and developer rules:

- 📋 **Project Overview**: [OVERVIEW.md](./OVERVIEW.md)
- 🖥️ **Server-Side Specs (Nitro v3)**: [developer.server.md](./developer.server.md)
- 🎨 **Frontend Specs (Vue 3)**: [developer.app.md](./developer.app.md)
- 🤖 **Agent Guide**: [AGENTS.md](./AGENTS.md)

## Core Development Commands

- **Start Dev Server**: `pnpm run dev`
- **Code Formatter**: `pnpm run fmt` (uses oxfmt)
- **Code Linter**: `pnpm run lint` (uses oxlint)
- **Type Check Server**: `pnpm run typecheck:server`
- **Type Check App**: `pnpm run typecheck:app`
- **Check All**: `pnpm run check:all`
- **Build Server/Client**: `pnpm run build`

## Crucial Code Quality Rules

1. **No `any`**: Strictly use precise TypeScript types or `unknown` with runtime guards.
2. **File Size Limit**: Keep individual `.ts` and `.vue` files below `~200` lines. Extract logic cleanly.
3. **File-Based Routing Route Guard**: Non-route files in `app/pages/` must go in double-underscored subdirectories (e.g. `__components__/`).
4. **Explicit Extensions**: Always include explicit extensions (`.ts`, `.vue`) in import paths.
5. **No Redundant Helpers**: Use `es-toolkit` (modern lodash replacement) and `@vueuse/core` functions.
6. **Stateful Fetch**: Use `useAsyncState` to handle loading/error/data states for API requests.
7. **Query Docs**: Use Context7 MCP to query third-party docs when using unfamiliar APIs.
