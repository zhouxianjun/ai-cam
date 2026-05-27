import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Peer } from 'crossws'
import { activeDevices } from '../utils/wsRegistry.ts'
import { controlRegistry } from './index.ts'

function createMockPeer(): Peer {
  const send = vi.fn()
  return {
    id: Math.random().toString(36).slice(2, 9),
    send,
  } as unknown as Peer
}

describe('Control Command Router Tests', () => {
  beforeEach(() => {
    activeDevices.clear()
  })

  describe('Registry Exports', () => {
    it('should export all required handlers', () => {
      expect(controlRegistry.ptz).toBeDefined()
      expect(controlRegistry.reboot).toBeDefined()
      expect(controlRegistry.status_query).toBeDefined()
    })
  })

  describe('Device Online Routing', () => {
    it('should route PTZ command to device when device is online', async () => {
      const deviceId = 'device-101'
      const devicePeer = createMockPeer()
      activeDevices.set(deviceId, devicePeer)

      const clientPeer = createMockPeer()
      const payload = { pan: 1.5, tilt: -0.8 }

      await controlRegistry.ptz.execute({
        clientPeer,
        userId: 'user-1',
        deviceId,
        payload,
      })

      // Verify the device peer received the correct action and payload
      expect(devicePeer.send).toHaveBeenCalledTimes(1)
      expect(devicePeer.send).toHaveBeenCalledWith({
        type: 'command',
        action: 'ptz',
        payload,
      })

      // Verify client was not sent an offline error
      expect(clientPeer.send).not.toHaveBeenCalled()
    })

    it('should route Reboot command to device when device is online', async () => {
      const deviceId = 'device-102'
      const devicePeer = createMockPeer()
      activeDevices.set(deviceId, devicePeer)

      const clientPeer = createMockPeer()

      await controlRegistry.reboot.execute({
        clientPeer,
        userId: 'user-1',
        deviceId,
        payload: null,
      })

      // Verify the device peer received the reboot action
      expect(devicePeer.send).toHaveBeenCalledTimes(1)
      expect(devicePeer.send).toHaveBeenCalledWith({
        type: 'command',
        action: 'reboot',
      })

      // Verify client was not sent an offline error
      expect(clientPeer.send).not.toHaveBeenCalled()
    })

    it('should route Status Query command to device when device is online', async () => {
      const deviceId = 'device-103'
      const devicePeer = createMockPeer()
      activeDevices.set(deviceId, devicePeer)

      const clientPeer = createMockPeer()

      await controlRegistry.status_query.execute({
        clientPeer,
        userId: 'user-1',
        deviceId,
        payload: null,
      })

      // Verify the device peer received the status query action
      expect(devicePeer.send).toHaveBeenCalledTimes(1)
      expect(devicePeer.send).toHaveBeenCalledWith({
        type: 'command',
        action: 'status_query',
      })

      // Verify client was not sent an offline error
      expect(clientPeer.send).not.toHaveBeenCalled()
    })
  })

  describe('Device Offline Failure Routing', () => {
    it('should return offline error to client when device is offline for PTZ', async () => {
      const deviceId = 'device-offline-ptz'
      const clientPeer = createMockPeer()
      const payload = { pan: 1.0, tilt: 1.0 }

      await controlRegistry.ptz.execute({
        clientPeer,
        userId: 'user-1',
        deviceId,
        payload,
      })

      // Verify client peer was notified with offline error
      expect(clientPeer.send).toHaveBeenCalledTimes(1)
      expect(clientPeer.send).toHaveBeenCalledWith({
        type: 'error',
        message: 'Device is offline',
      })
    })

    it('should return offline error to client when device is offline for Reboot', async () => {
      const deviceId = 'device-offline-reboot'
      const clientPeer = createMockPeer()

      await controlRegistry.reboot.execute({
        clientPeer,
        userId: 'user-1',
        deviceId,
        payload: null,
      })

      // Verify client peer was notified with offline error
      expect(clientPeer.send).toHaveBeenCalledTimes(1)
      expect(clientPeer.send).toHaveBeenCalledWith({
        type: 'error',
        message: 'Device is offline',
      })
    })

    it('should return offline error to client when device is offline for Status Query', async () => {
      const deviceId = 'device-offline-status'
      const clientPeer = createMockPeer()

      await controlRegistry.status_query.execute({
        clientPeer,
        userId: 'user-1',
        deviceId,
        payload: null,
      })

      // Verify client peer was notified with offline error
      expect(clientPeer.send).toHaveBeenCalledTimes(1)
      expect(clientPeer.send).toHaveBeenCalledWith({
        type: 'error',
        message: 'Device is offline',
      })
    })
  })
})
