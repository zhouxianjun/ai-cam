<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '~/app/stores/auth.ts'
import { useDeviceStore } from '~/app/stores/device.ts'
import { useAsyncState } from '@vueuse/core'
import DeviceList from '~/app/components/DeviceList.vue'
import VideoPlayer from '~/app/components/VideoPlayer.vue'
import PtzConsole from '~/app/components/PtzConsole.vue'
import type { Device } from '~/shared/types.ts'

const authStore = useAuthStore()
const deviceStore = useDeviceStore()

// Use stateful async fetch helper
const {
  state: devicesList,
  isLoading,
  error,
  execute,
} = useAsyncState<Device[]>(async () => {
  const res = await fetch('/api/devices', {
    headers: {
      Authorization: `Bearer ${authStore.token}`,
    },
  })
  if (!res.ok) throw new Error('Failed to load devices list')
  const data = (await res.json()) as { devices: Device[] }
  deviceStore.setDevices(data.devices)
  return data.devices
}, [])

onMounted(() => {
  execute()
})

function handleLogout() {
  authStore.logout()
}
</script>

<template>
  <div
    class="flex flex-col h-screen w-screen bg-[#0b0f19] text-slate-100 overflow-hidden font-sans select-none relative"
  >
    <!-- Glow ambient lighting -->
    <div
      class="absolute top-0 right-1/4 h-[400px] w-[600px] rounded-full bg-cyan-500/5 blur-[100px] pointer-events-none"
    ></div>

    <!-- Top Navbar Navigation Header -->
    <header
      class="h-16 border-b border-cyan-500/10 bg-[#10172a]/65 backdrop-blur-md px-6 flex items-center justify-between z-10"
    >
      <div class="flex items-center space-x-3">
        <div
          class="h-8 w-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div>
          <h1 class="text-sm font-bold uppercase tracking-widest text-slate-100">HomeGuard-RTC</h1>
          <p class="text-[9px] font-semibold text-slate-500 tracking-wider uppercase mt-0.5">
            工业级绝对加密监控终端
          </p>
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
        <div
          v-if="isLoading"
          class="flex h-full items-center justify-center text-slate-500 font-mono text-xs uppercase tracking-widest bg-[#10172a]/65 border-r border-cyan-500/10"
        >
          <span
            class="mr-2 h-4 w-4 border-2 border-slate-600 border-t-cyan-500 rounded-full animate-spin"
          ></span>
          加载拓扑集群...
        </div>
        <div
          v-else-if="error"
          class="flex flex-col h-full items-center justify-center p-6 text-center bg-[#10172a]/65 border-r border-cyan-500/10 text-orange-400 space-y-4"
        >
          <span class="text-xs uppercase tracking-widest font-bold">拓扑数据加载失败</span>
          <button
            @click="execute()"
            class="px-4 py-2 rounded border border-orange-500/20 bg-orange-950/10 text-xs font-bold tracking-widest uppercase hover:bg-orange-950/20 active:scale-95 transition-all cursor-pointer"
          >
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
            <svg
              class="h-16 w-16 mb-4 text-slate-800"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1"
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <span class="text-xs">等待选定监控视口以开启网络分流</span>
          </div>

          <!-- Cockpit System log output mock screen -->
          <div
            class="h-40 rounded-2xl border border-cyan-500/5 bg-slate-950/60 p-4 font-mono text-[10px] text-cyan-500/60 overflow-y-auto leading-normal space-y-1 select-text"
          >
            <div class="text-slate-400 font-bold mb-1 border-b border-cyan-500/5 pb-1 uppercase">
              系统控制台审计日志
            </div>
            <div>[SYSTEM] 安全沙箱审计模块初始化成功。</div>
            <div>[SYSTEM] 鉴权凭证建立状态: JWT 校验已完成。</div>
            <div v-if="deviceStore.selectedDeviceId">
              [MEDIA] 视口信道已分配: {{ deviceStore.selectedDeviceId }}。
            </div>
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
            <svg
              class="h-12 w-12 mb-2 text-slate-800"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
              />
            </svg>
            <span class="text-[10px]">控制设备未就绪</span>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
