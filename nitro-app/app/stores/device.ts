import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useAsyncState } from '@vueuse/core'
import type { Device } from '~/shared/types.ts'
import { useAuthStore } from '~/app/stores/auth.ts'

export const useDeviceStore = defineStore('device', () => {
  const selectedDeviceId = ref<string | null>(null)
  const authStore = useAuthStore()

  const {
    state: devices,
    isLoading,
    error,
    execute,
  } = useAsyncState<Device[], [], false>(
    async () => {
      const res = await fetch('/api/devices', {
        headers: {
          Authorization: `Bearer ${authStore.token}`,
        },
      })
      if (!res.ok) throw new Error('Failed to load devices list')
      const data = (await res.json()) as { devices: Device[] }
      return data.devices
    },
    [],
    { shallow: false },
  )

  const selectedDevice = computed(
    () => devices.value.find((d) => d.id === selectedDeviceId.value) || null,
  )

  async function loadDevices(): Promise<Device[]> {
    await execute()
    return devices.value
  }

  function updateDeviceStatus(deviceId: string, status: 'online' | 'offline'): void {
    const device = devices.value.find((d) => d.id === deviceId)
    if (device) {
      device.status = status
      device.lastSeen = Date.now()
    }
  }

  return {
    isLoading,
    error,
    devices,
    selectedDeviceId,
    selectedDevice,
    loadDevices,
    updateDeviceStatus,
  }
})
