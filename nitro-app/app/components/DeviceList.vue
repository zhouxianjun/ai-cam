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
      <span
        class="text-[10px] bg-cyan-950 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20 font-mono"
      >
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
            : 'bg-slate-900/40 border-slate-800 hover:border-cyan-500/30',
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
                  : 'bg-slate-700',
              ]"
            ></span>
            <span
              class="text-[10px] uppercase font-bold tracking-wider"
              :class="[dev.status === 'online' ? 'text-emerald-400' : 'text-slate-500']"
            >
              {{ dev.status === 'online' ? '在线' : '离线' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
