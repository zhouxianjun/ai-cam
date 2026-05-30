import { onUnmounted, computed } from 'vue'
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
    if (!authStore.token || typeof window === 'undefined') return undefined
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/control?role=client&token=${authStore.token}`
  })

  const { status, send, close } = useWebSocket(wsUrl, {
    autoReconnect: {
      retries: 5,
      delay: 3000,
      onFailed() {
        console.error('[WS] Control channel connection failed after 5 retries.')
      },
    },
    heartbeat: {
      message: JSON.stringify({ action: 'heartbeat' }),
      interval: 20000,
      pongTimeout: 5000,
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
    },
  })

  function sendPtz(deviceId: string, direction: 'up' | 'down' | 'left' | 'right'): void {
    send(
      JSON.stringify({
        action: 'ptz',
        deviceId,
        payload: { direction, speed: 5 },
      }),
    )
  }

  function sendReboot(deviceId: string): void {
    send(
      JSON.stringify({
        action: 'reboot',
        deviceId,
      }),
    )
  }

  onUnmounted(() => {
    close()
  })

  return {
    status,
    sendPtz,
    sendReboot,
  }
}
