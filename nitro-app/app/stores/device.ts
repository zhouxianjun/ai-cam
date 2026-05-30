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
