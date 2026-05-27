import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '~': resolve(__dirname, '.'),
    },
  },
  test: {
    include: ['server/tests/**/*.test.ts', 'server/**/*.spec.ts'],
    fileParallelism: false,
  },
})
