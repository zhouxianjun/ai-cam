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
  <div
    class="flex flex-col h-full justify-between p-6 bg-[#10172a]/65 backdrop-blur-xl rounded-2xl border border-cyan-500/10"
  >
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
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3m-3-3v12"
            />
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
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M5 15l7-7 7 7"
            />
          </svg>
        </button>

        <!-- Down -->
        <button
          @click="triggerPtz('down')"
          :disabled="disabled"
          class="absolute bottom-2 w-16 h-10 flex items-center justify-center text-slate-500 hover:text-cyan-400 cursor-pointer disabled:cursor-not-allowed select-none active:scale-95 transition-transform"
        >
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        <!-- Left -->
        <button
          @click="triggerPtz('left')"
          :disabled="disabled"
          class="absolute left-2 h-16 w-10 flex items-center justify-center text-slate-500 hover:text-cyan-400 cursor-pointer disabled:cursor-not-allowed select-none active:scale-95 transition-transform"
        >
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        <!-- Right -->
        <button
          @click="triggerPtz('right')"
          :disabled="disabled"
          class="absolute right-2 h-16 w-10 flex items-center justify-center text-slate-500 hover:text-cyan-400 cursor-pointer disabled:cursor-not-allowed select-none active:scale-95 transition-transform"
        >
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M9 5l7 7-7 7"
            />
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
