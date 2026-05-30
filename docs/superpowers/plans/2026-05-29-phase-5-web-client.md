# Phase 5 Web Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a high-performance, secure, and visually stunning Vue 3 Web dashboard ("Cyber Security Dark Console") to manage, play, and control ESP32 cameras over WebRTC and WebSocket channels via the single Nginx port-443 stream gateway.

**Architecture:** We use a decoupled composed architecture. Pinia Setup Stores manage auth tokens and device records. Composables (`useWhep` and `useControlWS`) isolate low-level network operations from the view. The UI follows a cohesive black-obsidian and cyber-neon aesthetic with frosted-glass containers, real-time metrics, and tactile joystick controls.

**Tech Stack:** Vue 3, Pinia (Setup Store), Element Plus, TailwindCSS v4, Vitest.

---

### Task 1: Front-end Setup Stores & Unit Tests

**Files:**
* Create: `nitro-app/app/stores/auth.ts`
* Create: `nitro-app/app/stores/device.ts`
* Create: `nitro-app/app/stores/auth.spec.ts`
* Create: `nitro-app/app/stores/device.spec.ts`

- [ ] **Step 1: Implement Pinia Setup Store for Authentication**
  
  Write the following Setup Store in `nitro-app/app/stores/auth.ts` to manage JWT authentication:
  ```typescript
  import { ref, computed } from 'vue'
  import { defineStore } from 'pinia'

  export const useAuthStore = defineStore('auth', () => {
    const token = ref<string | null>(localStorage.getItem('auth_token'))
    const isAuthenticated = computed(() => !!token.value)

    async function login(username: string, password: string): Promise<void> {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })

      if (!response.ok) {
        throw new Error('Authentication failed')
      }

      const data = await response.json() as { token: string }
      token.value = data.token
      localStorage.setItem('auth_token', data.token)
    }

    function logout(): void {
      token.value = null
      localStorage.removeItem('auth_token')
    }

    return {
      token,
      isAuthenticated,
      login,
      logout
    }
  })
  ```

- [ ] **Step 2: Implement Pinia Setup Store for Devices**
  
  Write the following Setup Store in `nitro-app/app/stores/device.ts` to manage device listing and status:
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

    function setDevices(list: Device[]): void {
      devices.value = list
    }

    function updateDeviceStatus(deviceId: string, status: 'online' | 'offline'): void {
      const device = devices.value.find(d => d.id === deviceId)
      if (device) {
        device.status = status
        device.lastSeen = Date.now()
      }
    }

    return {
      devices,
      selectedDeviceId,
      selectedDevice,
      setDevices,
      updateDeviceStatus
    }
  })
  ```

- [ ] **Step 3: Write Unit Test for Auth Store**
  
  Create `nitro-app/app/stores/auth.spec.ts` with the following test cases:
  ```typescript
  import { describe, it, expect, beforeEach, vi } from 'vitest'
  import { setActivePinia, createPinia } from 'pinia'
  import { useAuthStore } from './auth.ts'

  describe('Auth Store', () => {
    beforeEach(() => {
      setActivePinia(createPinia())
      localStorage.clear()
      vi.stubGlobal('fetch', vi.fn())
    })

    it('should initialize with no token', () => {
      const store = useAuthStore()
      expect(store.token).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })

    it('should store token and authenticate on successful login', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'mock-jwt-token' })
      })
      vi.stubGlobal('fetch', mockFetch)

      const store = useAuthStore()
      await store.login('admin', 'password')

      expect(store.token).toBe('mock-jwt-token')
      expect(store.isAuthenticated).toBe(true)
      expect(localStorage.getItem('auth_token')).toBe('mock-jwt-token')
    })

    it('should clear token and logout', () => {
      localStorage.setItem('auth_token', 'initial-token')
      const store = useAuthStore()
      expect(store.isAuthenticated).toBe(true)

      store.logout()
      expect(store.token).toBeNull()
      expect(store.isAuthenticated).toBe(false)
      expect(localStorage.getItem('auth_token')).toBeNull()
    })
  })
  ```

- [ ] **Step 4: Write Unit Test for Device Store**
  
  Create `nitro-app/app/stores/device.spec.ts` with the following test cases:
  ```typescript
  import { describe, it, expect, beforeEach } from 'vitest'
  import { setActivePinia, createPinia } from 'pinia'
  import { useDeviceStore } from './device.ts'
  import type { Device } from '~/shared/types.ts'

  const mockDevices: Device[] = [
    {
      id: 'cam1',
      name: 'Living Room',
      secret: 'secret1',
      status: 'offline',
      lastSeen: 1000,
      ownerId: 'admin_user',
      createdAt: 500
    }
  ]

  describe('Device Store', () => {
    beforeEach(() => {
      setActivePinia(createPinia())
    })

    it('should set devices and handle selection', () => {
      const store = useDeviceStore()
      store.setDevices(mockDevices)
      expect(store.devices).toHaveLength(1)

      store.selectedDeviceId = 'cam1'
      expect(store.selectedDevice).toEqual(mockDevices[0])
    })

    it('should update device status and lastSeen reactively', () => {
      const store = useDeviceStore()
      store.setDevices(mockDevices)
      
      const beforeTime = Date.now()
      store.updateDeviceStatus('cam1', 'online')

      expect(store.devices[0].status).toBe('online')
      expect(store.devices[0].lastSeen).toBeGreaterThanOrEqual(beforeTime)
    })
  })
  ```

- [ ] **Step 5: Run Unit Tests**
  
  Run vitest to verify stores are solid:
  ```powershell
  pnpm --prefix nitro-app run test
  ```
  Expected output: 2 spec files passed.

- [ ] **Step 6: Commit**
  
  ```bash
  git add nitro-app/app/stores/*
  git commit -m "feat: add Pinia stores for authentication and device status with unit tests"
  ```

---

### Task 2: Core Composables Implementation

**Files:**
* Create: `nitro-app/app/composables/useWhep.ts`
* Create: `nitro-app/app/composables/useControlWS.ts`

- [ ] **Step 1: Implement WHEP WebRTC Playback Composable**
  
  Create `nitro-app/app/composables/useWhep.ts` to coordinate SDP exchanges and track lifetime:
  ```typescript
  import { ref, type Ref, onUnmounted, watch } from 'vue'
  import { useAuthStore } from '~/app/stores/auth.ts'

  export function useWhep(videoElement: Ref<HTMLVideoElement | null>) {
    const authStore = useAuthStore()
    const status = ref<'idle' | 'connecting' | 'playing' | 'error'>('idle')
    const errorMsg = ref<string | null>(null)
    const stats = ref<{ fps: number; bytesReceived: number; latency: number }>({
      fps: 0,
      bytesReceived: 0,
      latency: 0
    })

    let pc: RTCPeerConnection | null = null
    let statsInterval: number | null = null

    async function play(deviceId: string): Promise<void> {
      stop()
      status.value = 'connecting'
      errorMsg.value = null

      try {
        // 1. Get play token
        const tokenRes = await fetch('/api/devices/play-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authStore.token}`
          },
          body: JSON.stringify({ deviceId, app: 'live', stream: deviceId })
        })

        if (!tokenRes.ok) {
          throw new Error('Failed to obtain WHEP authorization token')
        }

        const { token } = await tokenRes.json() as { token: string }
        const whepUrl = `https://media.local.test/rtc/v1/whep/?app=live&stream=${deviceId}&token=${token}`

        // 2. Initialize PeerConnection
        pc = new RTCPeerConnection()
        pc.addTransceiver('video', { direction: 'recvonly' })
        pc.addTransceiver('audio', { direction: 'recvonly' })

        pc.ontrack = (event) => {
          if (videoElement.value && event.streams[0]) {
            videoElement.value.srcObject = event.streams[0]
            status.value = 'playing'
            startStatsQuery()
          }
        }

        pc.oniceconnectionstatechange = () => {
          if (pc?.iceConnectionState === 'failed') {
            status.value = 'error'
            errorMsg.value = 'ICE Negotiation failed'
          }
        }

        // 3. Create Offer
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        // 4. Negotiate via WHEP POST
        const sdpRes = await fetch(whepUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: offer.sdp
        })

        if (!sdpRes.ok) {
          throw new Error('SDP exchange with media server failed')
        }

        const answerSdp = await sdpRes.text()
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }))

      } catch (err) {
        status.value = 'error'
        errorMsg.value = err instanceof Error ? err.message : 'Unknown playback error'
        stop()
      }
    }

    function stop(): void {
      if (statsInterval) {
        clearInterval(statsInterval)
        statsInterval = null
      }
      if (pc) {
        pc.ontrack = null
        pc.oniceconnectionstatechange = null
        pc.close()
        pc = null
      }
      if (videoElement.value) {
        videoElement.value.srcObject = null
      }
      if (status.value !== 'error') {
        status.value = 'idle'
      }
    }

    function startStatsQuery(): void {
      let lastBytes = 0
      let lastTime = Date.now()

      statsInterval = window.setInterval(async () => {
        if (!pc) return
        try {
          const reports = await pc.getStats()
          reports.forEach((report) => {
            if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
              const currentBytes = report.bytesReceived as number
              const currentTime = Date.now()
              const durationSec = (currentTime - lastTime) / 1000

              if (durationSec > 0) {
                const bps = (currentBytes - lastBytes) / durationSec
                stats.value.bytesReceived = currentBytes
                stats.value.fps = Math.round(report.framesPerSecond || 0)
                stats.value.latency = Math.round((report.jitter || 0) * 1000)
              }
              lastBytes = currentBytes
              lastTime = currentTime
            }
          })
        } catch {
          // Silent catch stats failure
        }
      }, 2000)
    }

    onUnmounted(() => {
      stop()
    })

    return {
      status,
      errorMsg,
      stats,
      play,
      stop
    }
  }
  ```

- [ ] **Step 2: Implement WebSocket Control Channel Composable**
  
  Create `nitro-app/app/composables/useControlWS.ts` to manage D-Pad cloud control and online sync:
  ```typescript
  import { onUnmounted, watch } from 'vue'
  import { useWebSocket } from '@vueuse/core'
  import { useAuthStore } from '~/app/stores/auth.ts'
  import { useDeviceStore } from '~/app/stores/device.ts'

  interface WSMessage {
    type: string
    deviceId: string
    status?: 'online' | 'offline'
    event?: string
    payload?: unknown
  }

  export function useControlWS() {
    const authStore = useAuthStore()
    const deviceStore = useDeviceStore()

    const wsUrl = computed(() => {
      if (!authStore.token) return null
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${protocol}//${window.location.host}/control?role=client&token=${authStore.token}`
    })

    const { status, send, close, open } = useWebSocket(
      wsUrl,
      {
        autoReconnect: {
          retries: 5,
          delay: 3000,
          onFailed() {
            console.error('[WS] Control channel connection failed after 5 retries.')
          }
        },
        heartbeat: {
          message: JSON.stringify({ action: 'heartbeat' }),
          interval: 20000,
          pongTimeout: 5000
        },
        onMessage(_ws, event) {
          try {
            const msg = JSON.parse(event.data) as WSMessage
            if (msg.type === 'device_status' && msg.status) {
              deviceStore.updateDeviceStatus(msg.deviceId, msg.status)
            }
          } catch {
            // Ignore format errors
          }
        }
      }
    )

    function sendPtz(deviceId: string, direction: 'up' | 'down' | 'left' | 'right'): void {
      send(JSON.stringify({
        action: 'ptz',
        deviceId,
        payload: { direction, speed: 5 }
      }))
    }

    function sendReboot(deviceId: string): void {
      send(JSON.stringify({
        action: 'reboot',
        deviceId
      }))
    }

    onUnmounted(() => {
      close()
    })

    return {
      status,
      sendPtz,
      sendReboot
    }
  }
  ```

- [ ] **Step 3: Commit**
  
  ```bash
  git add nitro-app/app/composables/*
  git commit -m "feat: implement useWhep and useControlWS composables for play/control"
  ```

---

### Task 3: Login View & Route Protection

**Files:**
* Create: `nitro-app/app/pages/login.vue`
* Modify: `nitro-app/app/entry-client.ts`

- [ ] **Step 1: Write Cyber Security Login View**
  
  Create `nitro-app/app/pages/login.vue` with an obsidian frosted glass block and interactive indicators:
  ```vue
  <script setup lang="ts">
  import { ref } from 'vue'
  import { useAuthStore } from '~/app/stores/auth.ts'
  import { useRouter } from 'vue-router'

  const authStore = useAuthStore()
  const router = useRouter()

  const username = ref('')
  const password = ref('')
  const loading = ref(false)
  const errorMessage = ref<string | null>(null)

  async function handleLogin() {
    if (!username.value || !password.value) {
      errorMessage.value = '请输入凭证！'
      return
    }

    loading.value = true
    errorMessage.value = null

    try {
      await authStore.login(username.value, password.value)
      router.push('/')
    } catch (err) {
      errorMessage.value = '连接凭证失效，请重新输入。'
    } finally {
      loading.value = false
    }
  }
  </script>

  <template>
    <div class="relative flex min-h-screen items-center justify-center bg-[#0b0f19] p-4 font-sans text-slate-100 overflow-hidden">
      <!-- Cyber lighting beam -->
      <div class="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none"></div>
      <div class="absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none"></div>

      <!-- Obsidian Card -->
      <div class="relative w-full max-w-md overflow-hidden rounded-2xl border border-cyan-500/20 bg-slate-900/65 p-8 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-cyan-500/40">
        <!-- Laser top border -->
        <div class="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-transparent via-cyan-500 to-transparent"></div>

        <div class="mb-8 text-center">
          <div class="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mb-4 animate-pulse">
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 class="text-2xl font-bold tracking-wider text-slate-100 uppercase">HomeGuard RTC</h2>
          <p class="text-xs text-slate-400 mt-1 tracking-widest uppercase">安全监控控制台</p>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-6">
          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">安全签名 (用户名)</label>
            <input
              type="text"
              v-model="username"
              required
              class="w-full rounded-lg border border-slate-800 bg-[#0d1321] px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none transition-all focus:border-cyan-500/50 focus:shadow-[0_0_12px_rgba(6,182,212,0.15)]"
              placeholder="请输入操作签名"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">准入密钥 (密码)</label>
            <input
              type="password"
              v-model="password"
              required
              class="w-full rounded-lg border border-slate-800 bg-[#0d1321] px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none transition-all focus:border-cyan-500/50 focus:shadow-[0_0_12px_rgba(6,182,212,0.15)]"
              placeholder="请输入验证密钥"
            />
          </div>

          <!-- Alert -->
          <Transition name="fade">
            <div v-if="errorMessage" class="rounded-lg border border-orange-500/20 bg-orange-950/20 px-4 py-3 text-xs text-orange-400">
              {{ errorMessage }}
            </div>
          </Transition>

          <button
            type="submit"
            :disabled="loading"
            class="relative flex w-full items-center justify-center rounded-lg bg-cyan-600 px-4 py-3 text-sm font-semibold tracking-wider text-white transition-all hover:bg-cyan-500 active:scale-[0.98] disabled:bg-cyan-800 disabled:cursor-not-allowed uppercase"
          >
            <span v-if="loading" class="mr-2 h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            {{ loading ? '校验信令中...' : '建立安全连接' }}
          </button>
        </form>
      </div>
    </div>
  </template>

  <style scoped>
  .fade-enter-active,
  .fade-leave-active {
    transition: opacity 0.2s ease;
  }
  .fade-enter-from,
  .fade-leave-to {
    opacity: 0;
  }
  </style>
  ```

- [ ] **Step 2: Install Global Routing Guard**
  
  Replace `nitro-app/app/entry-client.ts` content to shield Dashboard from unauthorized access:
  ```typescript
  import { createApp } from 'vue'
  import { createPinia } from 'pinia'
  import App from '~/app/App.vue'
  import { createRouter, createWebHistory } from 'vue-router'
  import { routes } from 'vue-router/auto-routes'
  import { useAuthStore } from '~/app/stores/auth.ts'

  const app = createApp(App)
  app.use(createPinia())

  const router = createRouter({
    history: createWebHistory(),
    routes,
  })

  // Global Access ACL Route Guard
  router.beforeEach((to, from, next) => {
    const authStore = useAuthStore()
    if (to.path !== '/login' && !authStore.isAuthenticated) {
      next('/login')
    } else if (to.path === '/login' && authStore.isAuthenticated) {
      next('/')
    } else {
      next()
    }
  })

  app.use(router)
  app.mount('#app')
  ```

- [ ] **Step 3: Commit**
  
  ```bash
  git add nitro-app/app/pages/login.vue nitro-app/app/entry-client.ts
  git commit -m "feat: build secure login vault page and implement navigation routing guard"
  ```

---

### Task 4: UI Components Layer

**Files:**
* Create: `nitro-app/app/components/DeviceList.vue`
* Create: `nitro-app/app/components/VideoPlayer.vue`
* Create: `nitro-app/app/components/PtzConsole.vue`

- [ ] **Step 1: Build Sidebar Device List Component**
  
  Create `nitro-app/app/components/DeviceList.vue` with neon respiration index dots:
  ```vue
  <script setup lang="ts">
  import { useDeviceStore } from '~/app/stores/device.ts'
  import type { Device } from '~/shared/types.ts'

  const deviceStore = useDeviceStore()

  defineProps<{
    devices: Device[]
  }>()

  function selectDevice(id: string) {
    deviceStore.selectedDeviceId = id
  }
  </script>

  <template>
    <div class="flex flex-col h-full bg-[#10172a]/65 border-r border-cyan-500/10 backdrop-blur-xl">
      <!-- Sidebar Title -->
      <div class="p-6 border-b border-cyan-500/10 flex items-center justify-between">
        <h3 class="text-sm font-bold uppercase tracking-wider text-cyan-400">摄像头集群</h3>
        <span class="text-[10px] bg-cyan-950 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20 font-mono">
          {{ devices.length }} 设备
        </span>
      </div>

      <!-- Scrollable list -->
      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        <div
          v-for="dev in devices"
          :key="dev.id"
          @click="selectDevice(dev.id)"
          class="relative p-4 rounded-xl border transition-all cursor-pointer select-none group"
          :class="[
            deviceStore.selectedDeviceId === dev.id
              ? 'bg-cyan-950/20 border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.1)]'
              : 'bg-slate-900/40 border-slate-800 hover:border-cyan-500/30'
          ]"
        >
          <!-- Active highlight glow -->
          <div
            v-if="deviceStore.selectedDeviceId === dev.id"
            class="absolute top-3 left-0 w-[3px] h-2/3 bg-cyan-500 rounded-r"
          ></div>

          <div class="flex items-center justify-between">
            <div>
              <h4 class="font-bold text-sm tracking-wide group-hover:text-cyan-400 transition-colors">
                {{ dev.name }}
              </h4>
              <p class="text-[10px] text-slate-500 font-mono mt-1 select-all">{{ dev.id }}</p>
            </div>

            <!-- Neon status circle -->
            <div class="flex items-center space-x-2">
              <span
                class="h-2 w-2 rounded-full"
                :class="[
                  dev.status === 'online'
                    ? 'bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse'
                    : 'bg-slate-700'
                ]"
              ></span>
              <span class="text-[10px] uppercase font-bold tracking-wider" :class="[dev.status === 'online' ? 'text-emerald-400' : 'text-slate-500']">
                {{ dev.status === 'online' ? '在线' : '离线' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
  ```

- [ ] **Step 2: Build WebRTC Video Player Component**
  
  Create `nitro-app/app/components/VideoPlayer.vue` incorporating stats overlay:
  ```vue
  <script setup lang="ts">
  import { ref, watch, onMounted } from 'vue'
  import { useWhep } from '~/app/composables/useWhep.ts'

  const props = defineProps<{
    deviceId: string
  }>()

  const videoRef = ref<HTMLVideoElement | null>(null)
  const showStats = ref(false)

  const { status, errorMsg, stats, play, stop } = useWhep(videoRef)

  // Watch for device change to reload stream
  watch(() => props.deviceId, (newId) => {
    if (newId) {
      play(newId)
    }
  })

  onMounted(() => {
    if (props.deviceId) {
      play(props.deviceId)
    }
  })
  </script>

  <template>
    <div class="relative w-full aspect-video rounded-2xl border border-cyan-500/10 bg-slate-950 overflow-hidden shadow-2xl">
      <!-- Target video tag -->
      <video
        ref="videoRef"
        autoplay
        playsinline
        muted
        class="h-full w-full object-contain"
      ></video>

      <!-- Stats overlay dashboard -->
      <div
        v-if="showStats && status === 'playing'"
        class="absolute top-4 left-4 p-4 rounded-xl border border-cyan-500/20 bg-slate-950/80 text-[10px] font-mono text-cyan-400 tracking-wider space-y-1.5 backdrop-blur-md z-10 min-w-[140px]"
      >
        <div class="font-bold border-b border-cyan-500/20 pb-1 mb-1.5 text-slate-300 uppercase">实时流媒体参数</div>
        <div>帧率: {{ stats.fps }} FPS</div>
        <div>延时: {{ stats.latency }} ms</div>
        <div>数据量: {{ (stats.bytesReceived / 1024 / 1024).toFixed(2) }} MB</div>
      </div>

      <!-- Action control panel bar overlay -->
      <div class="absolute top-4 right-4 flex space-x-2 z-10">
        <button
          @click="showStats = !showStats"
          class="h-8 w-8 flex items-center justify-center rounded-lg border bg-slate-900/60 text-slate-400 transition-colors backdrop-blur-md cursor-pointer"
          :class="[showStats ? 'border-cyan-500/50 text-cyan-400' : 'border-slate-800 hover:text-cyan-400']"
          title="数据看板"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </button>
      </div>

      <!-- Glassmorphic loading states overlays -->
      <div
        v-if="status !== 'playing'"
        class="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm transition-all"
      >
        <!-- Connecting spinner -->
        <div v-if="status === 'connecting'" class="flex flex-col items-center space-y-4">
          <div class="relative h-12 w-12">
            <div class="absolute inset-0 rounded-full border-4 border-cyan-500/10"></div>
            <div class="absolute inset-0 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin"></div>
          </div>
          <span class="text-xs uppercase tracking-widest text-cyan-400 font-bold animate-pulse">SDP 协商安全建立中...</span>
        </div>

        <!-- Connection Error Display -->
        <div v-else-if="status === 'error'" class="flex flex-col items-center space-y-3 p-6 text-center max-w-sm">
          <div class="h-10 w-10 text-orange-500 mb-2">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <span class="text-sm font-bold text-orange-400 uppercase tracking-wide">通道连接中断</span>
          <p class="text-xs text-slate-500 mt-1 leading-relaxed">{{ errorMsg }}</p>
          <button @click="play(deviceId)" class="mt-4 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white tracking-widest uppercase hover:bg-cyan-500 active:scale-95 transition-all">
            重试连接
          </button>
        </div>

        <!-- Idle Status Placeholder -->
        <div v-else class="flex flex-col items-center space-y-2 text-slate-500 uppercase tracking-widest">
          <svg class="h-12 w-12 mb-2 text-slate-700 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span class="text-xs font-semibold select-none">请选择一个摄像头以开启实时监控</span>
        </div>
      </div>
    </div>
  </template>
  ```

- [ ] **Step 3: Build Circular Cloud PTZ Control D-Pad**
  
  Create `nitro-app/app/components/PtzConsole.vue` offering interactive directions and reboot trigger:
  ```vue
  <script setup lang="ts">
  import { useControlWS } from '~/app/composables/useControlWS.ts'

  const props = defineProps<{
    deviceId: string
    disabled?: boolean
  }>()

  const { sendPtz, sendReboot } = useControlWS()

  function triggerPtz(direction: 'up' | 'down' | 'left' | 'right') {
    if (props.disabled) return
    sendPtz(props.deviceId, direction)
  }

  function triggerReboot() {
    if (props.disabled) return
    sendReboot(props.deviceId)
  }
  </script>

  <template>
    <div class="flex flex-col h-full justify-between p-6 bg-[#10172a]/65 backdrop-blur-xl rounded-2xl border border-cyan-500/10">
      <!-- Section header -->
      <div>
        <h3 class="text-sm font-bold uppercase tracking-wider text-cyan-400 mb-1">物理控制台</h3>
        <p class="text-[10px] text-slate-500 tracking-wider">远程操控机械云台与基础设备控制</p>
      </div>

      <!-- D-Pad Direction Rocker Console -->
      <div class="flex items-center justify-center my-6">
        <div
          class="relative h-44 w-44 rounded-full border border-cyan-500/10 bg-slate-900/60 flex items-center justify-center shadow-2xl overflow-hidden group transition-all"
          :class="[disabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-cyan-500/30']"
        >
          <!-- Center Button (Reboot) -->
          <button
            @click="triggerReboot"
            :disabled="disabled"
            class="h-14 w-14 rounded-full bg-slate-950 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shadow-md active:scale-95 transition-all select-none z-10 cursor-pointer disabled:cursor-not-allowed hover:bg-cyan-950/30"
            title="重启设备"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3m-3-3v12" />
            </svg>
          </button>

          <!-- 4-Directions Buttons -->
          <!-- Up -->
          <button
            @click="triggerPtz('up')"
            :disabled="disabled"
            class="absolute top-2 w-16 h-10 flex items-center justify-center text-slate-500 hover:text-cyan-400 cursor-pointer disabled:cursor-not-allowed select-none active:scale-95 transition-transform"
          >
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7" />
            </svg>
          </button>

          <!-- Down -->
          <button
            @click="triggerPtz('down')"
            :disabled="disabled"
            class="absolute bottom-2 w-16 h-10 flex items-center justify-center text-slate-500 hover:text-cyan-400 cursor-pointer disabled:cursor-not-allowed select-none active:scale-95 transition-transform"
          >
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <!-- Left -->
          <button
            @click="triggerPtz('left')"
            :disabled="disabled"
            class="absolute left-2 h-16 w-10 flex items-center justify-center text-slate-500 hover:text-cyan-400 cursor-pointer disabled:cursor-not-allowed select-none active:scale-95 transition-transform"
          >
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <!-- Right -->
          <button
            @click="triggerPtz('right')"
            :disabled="disabled"
            class="absolute right-2 h-16 w-10 flex items-center justify-center text-slate-500 hover:text-cyan-400 cursor-pointer disabled:cursor-not-allowed select-none active:scale-95 transition-transform"
          >
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Quick Action Buttons -->
      <div class="space-y-3">
        <button
          @click="triggerReboot"
          :disabled="disabled"
          class="w-full py-2.5 rounded-lg border border-red-500/20 bg-red-950/10 text-xs font-bold tracking-widest text-red-400 uppercase select-none transition-all active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-950/20 cursor-pointer"
        >
          紧急重启指令
        </button>
      </div>
    </div>
  </template>
  ```

- [ ] **Step 4: Commit**
  
  ```bash
  git add nitro-app/app/components/*
  git commit -m "feat: complete UI component suite including DeviceList, VideoPlayer, and PtzConsole"
  ```

---

### Task 5: Main Dashboard View Assembly

**Files:**
* Modify: `nitro-app/app/pages/index.vue`

- [ ] **Step 1: Write Full Dashboard Page Assembly**
  
  Replace the entire content of `nitro-app/app/pages/index.vue` with:
  ```vue
  <script setup lang="ts">
  import { onMounted } from 'vue'
  import { useAuthStore } from '~/app/stores/auth.ts'
  import { useDeviceStore } from '~/app/stores/device.ts'
  import { useAsyncState } from '@vueuse/core'
  import DeviceList from '~/app/components/DeviceList.vue'
  import VideoPlayer from '~/app/components/VideoPlayer.vue'
  import PtzConsole from '~/app/components/PtzConsole.vue'

  const authStore = useAuthStore()
  const deviceStore = useDeviceStore()

  // Use stateful async fetch helper
  const { state: devicesList, isLoading, error, execute } = useAsyncState(
    async () => {
      const res = await fetch('/api/devices', {
        headers: {
          'Authorization': `Bearer ${authStore.token}`
        }
      })
      if (!res.ok) throw new Error('Failed to load devices list')
      const data = await res.json() as { devices: any[] }
      deviceStore.setDevices(data.devices)
      return data.devices
    },
    []
  )

  onMounted(() => {
    execute()
  })

  function handleLogout() {
    authStore.logout()
  }
  </script>

  <template>
    <div class="flex flex-col h-screen w-screen bg-[#0b0f19] text-slate-100 overflow-hidden font-sans select-none relative">
      <!-- Glow ambient lighting -->
      <div class="absolute top-0 right-1/4 h-[400px] w-[600px] rounded-full bg-cyan-500/5 blur-[100px] pointer-events-none"></div>

      <!-- Top Navbar Navigation Header -->
      <header class="h-16 border-b border-cyan-500/10 bg-[#10172a]/65 backdrop-blur-md px-6 flex items-center justify-between z-10">
        <div class="flex items-center space-x-3">
          <div class="h-8 w-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 class="text-sm font-bold uppercase tracking-widest text-slate-100">HomeGuard-RTC</h1>
            <p class="text-[9px] font-semibold text-slate-500 tracking-wider uppercase mt-0.5">工业级绝对加密监控终端</p>
          </div>
        </div>

        <div class="flex items-center space-x-4">
          <button
            @click="handleLogout"
            class="text-xs font-bold uppercase tracking-widest border border-slate-800 bg-slate-900/60 hover:bg-red-950/20 hover:border-red-500/30 text-slate-400 hover:text-red-400 px-4 py-2 rounded-lg transition-colors cursor-pointer select-none"
          >
            注销连接
          </button>
        </div>
      </header>

      <!-- Main cockpit body split -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Left Devices Sidebar -->
        <aside class="w-80 h-full flex-shrink-0">
          <div v-if="isLoading" class="flex h-full items-center justify-center text-slate-500 font-mono text-xs uppercase tracking-widest bg-[#10172a]/65 border-r border-cyan-500/10">
            <span class="mr-2 h-4 w-4 border-2 border-slate-600 border-t-cyan-500 rounded-full animate-spin"></span>
            加载拓扑集群...
          </div>
          <div v-else-if="error" class="flex flex-col h-full items-center justify-center p-6 text-center bg-[#10172a]/65 border-r border-cyan-500/10 text-orange-400 space-y-4">
            <span class="text-xs uppercase tracking-widest font-bold">拓扑数据加载失败</span>
            <button @click="execute()" class="px-4 py-2 rounded border border-orange-500/20 bg-orange-950/10 text-xs font-bold tracking-widest uppercase hover:bg-orange-950/20 active:scale-95 transition-all cursor-pointer">
              重试加载
            </button>
          </div>
          <DeviceList v-else :devices="deviceStore.devices" />
        </aside>

        <!-- Right Main Viewport Grid -->
        <main class="flex-1 p-6 flex flex-col md:flex-row gap-6 overflow-y-auto">
          <!-- Live monitor workspace -->
          <div class="flex-1 flex flex-col space-y-6">
            <VideoPlayer
              v-if="deviceStore.selectedDeviceId"
              :deviceId="deviceStore.selectedDeviceId"
            />
            <div
              v-else
              class="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-2xl p-12 text-center text-slate-600 uppercase tracking-widest bg-slate-950/10"
            >
              <svg class="h-16 w-16 mb-4 text-slate-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span class="text-xs">等待选定监控视口以开启网络分流</span>
            </div>

            <!-- Cockpit System log output mock screen -->
            <div class="h-40 rounded-2xl border border-cyan-500/5 bg-slate-950/60 p-4 font-mono text-[10px] text-cyan-500/60 overflow-y-auto leading-normal space-y-1 select-text">
              <div class="text-slate-400 font-bold mb-1 border-b border-cyan-500/5 pb-1 uppercase">系统控制台审计日志</div>
              <div>[SYSTEM] 安全沙箱审计模块初始化成功。</div>
              <div>[SYSTEM] 鉴权凭证建立状态: JWT 校验已完成。</div>
              <div v-if="deviceStore.selectedDeviceId">[MEDIA] 视口信道已分配: {{ deviceStore.selectedDeviceId }}。</div>
            </div>
          </div>

          <!-- D-pad control console sidebar -->
          <div class="w-full md:w-90 flex-shrink-0">
            <PtzConsole
              v-if="deviceStore.selectedDeviceId"
              :deviceId="deviceStore.selectedDeviceId"
              :disabled="deviceStore.selectedDevice?.status !== 'online'"
            />
            <div
              v-else
              class="h-full flex flex-col items-center justify-center p-8 border border-dashed border-slate-800 rounded-2xl bg-slate-950/10 text-slate-700 uppercase tracking-widest text-center"
            >
              <svg class="h-12 w-12 mb-2 text-slate-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <span class="text-[10px]">控制设备未就绪</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  </template>
  ```

- [ ] **Step 2: Verify Code Quality & Build Checks**
  
  Run linting and formatting tasks to verify front-end code health:
  ```powershell
  pnpm --prefix nitro-app run check:all
  ```
  Expected output: zero errors across oxfmt, oxlint, and vue-tsc compiler checks.

- [ ] **Step 3: Commit**
  
  ```bash
  git add nitro-app/app/pages/index.vue
  git commit -m "feat: assemble main cockpit dashboard index page linking player and ptz control consoles"
  ```
