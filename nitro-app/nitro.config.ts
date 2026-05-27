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
