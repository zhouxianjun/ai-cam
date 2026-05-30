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
