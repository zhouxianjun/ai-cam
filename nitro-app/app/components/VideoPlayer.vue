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
watch(
  () => props.deviceId,
  (newId) => {
    if (newId) {
      play(newId)
    }
  },
)

onMounted(() => {
  if (props.deviceId) {
    play(props.deviceId)
  }
})
</script>

<template>
  <div
    class="relative w-full aspect-video rounded-2xl border border-cyan-500/10 bg-slate-950 overflow-hidden shadow-2xl"
  >
    <!-- Target video tag -->
    <video ref="videoRef" autoplay playsinline muted class="h-full w-full object-contain"></video>

    <!-- Stats overlay dashboard -->
    <div
      v-if="showStats && status === 'playing'"
      class="absolute top-4 left-4 p-4 rounded-xl border border-cyan-500/20 bg-slate-950/80 text-[10px] font-mono text-cyan-400 tracking-wider space-y-1.5 backdrop-blur-md z-10 min-w-[140px]"
    >
      <div class="font-bold border-b border-cyan-500/20 pb-1 mb-1.5 text-slate-300 uppercase">
        实时流媒体参数
      </div>
      <div>帧率: {{ stats.fps }} FPS</div>
      <div>延时: {{ stats.latency }} ms</div>
      <div>数据量: {{ (stats.bytesReceived / 1024 / 1024).toFixed(2) }} MB</div>
    </div>

    <!-- Action control panel bar overlay -->
    <div class="absolute top-4 right-4 flex space-x-2 z-10">
      <button
        @click="showStats = !showStats"
        class="h-8 w-8 flex items-center justify-center rounded-lg border bg-slate-900/60 text-slate-400 transition-colors backdrop-blur-md cursor-pointer"
        :class="[
          showStats ? 'border-cyan-500/50 text-cyan-400' : 'border-slate-800 hover:text-cyan-400',
        ]"
        title="数据看板"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
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
          <div
            class="absolute inset-0 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin"
          ></div>
        </div>
        <span class="text-xs uppercase tracking-widest text-cyan-400 font-bold animate-pulse"
          >SDP 协商安全建立中...</span
        >
      </div>

      <!-- Connection Error Display -->
      <div
        v-else-if="status === 'error'"
        class="flex flex-col items-center space-y-3 p-6 text-center max-w-sm"
      >
        <div class="h-10 w-10 text-orange-500 mb-2">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <span class="text-sm font-bold text-orange-400 uppercase tracking-wide">通道连接中断</span>
        <p class="text-xs text-slate-500 mt-1 leading-relaxed">{{ errorMsg }}</p>
        <button
          @click="play(deviceId)"
          class="mt-4 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white tracking-widest uppercase hover:bg-cyan-500 active:scale-95 transition-all"
        >
          重试连接
        </button>
      </div>

      <!-- Idle Status Placeholder -->
      <div
        v-else
        class="flex flex-col items-center space-y-2 text-slate-500 uppercase tracking-widest"
      >
        <svg
          class="h-12 w-12 mb-2 text-slate-700 animate-pulse"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        <span class="text-xs font-semibold select-none">请选择一个摄像头以开启实时监控</span>
      </div>
    </div>
  </div>
</template>
