import { defineConfig } from 'vite'
import { nitro } from 'nitro/vite'
import tailwindcss from '@tailwindcss/vite'
import Vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import VueRouter from 'vue-router/vite'
import { VueRouterAutoImports } from 'vue-router/unplugin'

export default defineConfig({
  plugins: [
    !process.env.VITEST && nitro(),
    VueRouter({
      routesFolder: 'app/pages',
      exclude: '**/__*__/**',
    }),
    Vue(),
    tailwindcss(),
    AutoImport({
      imports: ['vue', VueRouterAutoImports, '@vueuse/core'],
      resolvers: [ElementPlusResolver({ importStyle: 'sass' })],
      dts: true,
    }),
    Components({
      dirs: [],
      resolvers: [ElementPlusResolver({ importStyle: 'sass' })],
    }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 3000,
    host: true,
    allowedHosts: ['app.local.test', 'media.local.test', 'host.docker.internal'],
  },
})
