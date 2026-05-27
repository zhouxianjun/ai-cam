import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Peer } from 'crossws'
import type { Device } from '~/shared/types.ts'
import { controlWebSocket } from './control.ts'
import { activeDevices, activeClients, deviceGraceTimers } from '../utils/wsRegistry.ts'
import { controlRegistry } from '../control/index.ts'

// In-memory mock database
const mockDevices = new Map<string, Device>()

vi.mock('../utils/token.ts', () => ({
  verifyJWT: vi.fn((token: string) => {
    if (token === 'valid-token') {
      return { userId: 'user-123', role: 'user' }
    }
    return null
  }),
}))

vi.mock('../utils/db.ts', () => ({
  getDevice: vi.fn(async (deviceId: string) => {
    return mockDevices.get(deviceId) || null
  }),
  saveDevice: vi.fn(async (device: Device) => {
    mockDevices.set(device.id, device)
  }),
}))

function createMockPeer(context: Record<string, unknown>): Peer {
  return {
    id: Math.random().toString(36).slice(2, 9),
    context,
    send: vi.fn(),
  } as unknown as Peer
}

function createMockMessage(payload: unknown) {
  return {
    json: <T>() => payload as T,
    text: () => JSON.stringify(payload),
  }
}

describe('WebSocket Signalling Service Route', () => {
  beforeEach(() => {
    activeDevices.clear()
    activeClients.clear()
    // Clear any active timers to prevent memory leaks or test pollution
    for (const timer of deviceGraceTimers.values()) {
      clearTimeout(timer)
    }
    deviceGraceTimers.clear()
    mockDevices.clear()

    // Setup initial mock devices
    mockDevices.set('device-abc', {
      id: 'device-abc',
      name: 'Cam 1',
      secret: 'device-secret-123',
      status: 'offline',
      lastSeen: 0,
      ownerId: 'user-123',
      createdAt: Date.now(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Upgrade Handshake', () => {
    it('should allow valid client upgrade', async () => {
      const request = {
        url: 'ws://localhost/control?role=client&token=valid-token',
      } as unknown as Request
      const res = await controlWebSocket.upgrade(request)
      expect(res).toBeDefined()
      expect(res?.context).toEqual({ type: 'client', userId: 'user-123' })
    })

    it('should reject client upgrade with missing token', async () => {
      const request = {
        url: 'ws://localhost/control?role=client',
      } as unknown as Request
      try {
        await controlWebSocket.upgrade(request)
        expect.fail('Should have thrown')
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Response)
        expect((err as Response).status).toBe(401)
      }
    })

    it('should reject client upgrade with invalid token', async () => {
      const request = {
        url: 'ws://localhost/control?role=client&token=invalid-token',
      } as unknown as Request
      try {
        await controlWebSocket.upgrade(request)
        expect.fail('Should have thrown')
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Response)
        expect((err as Response).status).toBe(401)
      }
    })

    it('should allow valid device upgrade', async () => {
      const request = {
        url: 'ws://localhost/control?role=device&deviceId=device-abc&token=device-secret-123',
      } as unknown as Request
      const res = await controlWebSocket.upgrade(request)
      expect(res).toBeDefined()
      expect(res?.context).toEqual({ type: 'device', deviceId: 'device-abc' })
    })

    it('should reject device upgrade with missing query parameters', async () => {
      const request1 = {
        url: 'ws://localhost/control?role=device&deviceId=device-abc',
      } as unknown as Request
      try {
        await controlWebSocket.upgrade(request1)
        expect.fail('Should have thrown')
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Response)
        expect((err as Response).status).toBe(401)
      }

      const request2 = {
        url: 'ws://localhost/control?role=device&token=device-secret-123',
      } as unknown as Request
      try {
        await controlWebSocket.upgrade(request2)
        expect.fail('Should have thrown')
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Response)
        expect((err as Response).status).toBe(401)
      }
    })

    it('should reject device upgrade with invalid credentials', async () => {
      const request = {
        url: 'ws://localhost/control?role=device&deviceId=device-abc&token=wrong-secret',
      } as unknown as Request
      try {
        await controlWebSocket.upgrade(request)
        expect.fail('Should have thrown')
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Response)
        expect((err as Response).status).toBe(401)
      }
    })

    it('should reject handshake with invalid or missing role', async () => {
      const request = {
        url: 'ws://localhost/control?role=unknown',
      } as unknown as Request
      try {
        await controlWebSocket.upgrade(request)
        expect.fail('Should have thrown')
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Response)
        expect((err as Response).status).toBe(400)
      }
    })
  })

  describe('Connection Open', () => {
    it('should register client and send welcome packet', async () => {
      const peer = createMockPeer({ type: 'client', userId: 'user-123' })
      await controlWebSocket.open(peer)

      const clients = activeClients.get('user-123')
      expect(clients).toBeDefined()
      expect(clients?.has(peer)).toBe(true)
      expect(peer.send).toHaveBeenCalledWith({
        type: 'welcome',
        message: 'HomeGuard control panel connected',
      })
    })

    it('should register device, mark DB online, clear timers, and notify clients', async () => {
      const clientPeer = createMockPeer({ type: 'client', userId: 'user-123' })
      await controlWebSocket.open(clientPeer) // register one client

      // Set a mock timer in grace timers
      const existingTimer = setTimeout(() => {}, 5000)
      deviceGraceTimers.set('device-abc', existingTimer)

      const devicePeer = createMockPeer({ type: 'device', deviceId: 'device-abc' })
      await controlWebSocket.open(devicePeer)

      expect(activeDevices.get('device-abc')).toBe(devicePeer)
      expect(deviceGraceTimers.has('device-abc')).toBe(false) // cleared

      const device = mockDevices.get('device-abc')
      expect(device?.status).toBe('online')
      expect(device?.lastSeen).toBeGreaterThan(0)

      expect(clientPeer.send).toHaveBeenCalledWith({
        type: 'device_status',
        deviceId: 'device-abc',
        status: 'online',
      })
    })
  })

  describe('Message Routing', () => {
    it('should process client messages and execute command handlers', async () => {
      const clientPeer = createMockPeer({ type: 'client', userId: 'user-123' })
      const spyExecute = vi.spyOn(controlRegistry.ptz, 'execute')

      const message = createMockMessage({
        action: 'ptz',
        deviceId: 'device-abc',
        payload: { pan: 10, tilt: 20 },
      })

      await controlWebSocket.message(clientPeer, message as any)

      expect(spyExecute).toHaveBeenCalledTimes(1)
      expect(spyExecute).toHaveBeenCalledWith({
        clientPeer,
        userId: 'user-123',
        deviceId: 'device-abc',
        payload: { pan: 10, tilt: 20 },
      })
    })

    it('should send access denied error if client does not own device', async () => {
      const clientPeer = createMockPeer({ type: 'client', userId: 'user-456' }) // wrong user
      const message = createMockMessage({
        action: 'ptz',
        deviceId: 'device-abc',
        payload: { pan: 10 },
      })

      await controlWebSocket.message(clientPeer, message as any)

      expect(clientPeer.send).toHaveBeenCalledWith({
        type: 'error',
        message: 'Access denied or device not found',
      })
    })

    it('should forward status report from device to owner clients', async () => {
      const clientPeer = createMockPeer({ type: 'client', userId: 'user-123' })
      await controlWebSocket.open(clientPeer) // register client

      const devicePeer = createMockPeer({ type: 'device', deviceId: 'device-abc' })
      const message = createMockMessage({
        type: 'status_report',
        payload: { temp: 42 },
      })

      await controlWebSocket.message(devicePeer, message as any)

      expect(clientPeer.send).toHaveBeenCalledWith({
        type: 'device_update',
        deviceId: 'device-abc',
        event: 'status_report',
        payload: { temp: 42 },
      })
    })
  })

  describe('Connection Close and Grace Period', () => {
    it('should remove client from active list on close', async () => {
      const clientPeer = createMockPeer({ type: 'client', userId: 'user-123' })
      await controlWebSocket.open(clientPeer)
      expect(activeClients.get('user-123')?.has(clientPeer)).toBe(true)

      await controlWebSocket.close(clientPeer, { code: 1000 })
      expect(activeClients.has('user-123')).toBe(false)
    })

    it('should immediately set device offline on normal close (code 1000)', async () => {
      const clientPeer = createMockPeer({ type: 'client', userId: 'user-123' })
      await controlWebSocket.open(clientPeer)

      const devicePeer = createMockPeer({ type: 'device', deviceId: 'device-abc' })
      await controlWebSocket.open(devicePeer)

      await controlWebSocket.close(devicePeer, { code: 1000 })

      expect(activeDevices.has('device-abc')).toBe(false)
      expect(deviceGraceTimers.has('device-abc')).toBe(false)

      const device = mockDevices.get('device-abc')
      expect(device?.status).toBe('offline')

      expect(clientPeer.send).toHaveBeenCalledWith({
        type: 'device_status',
        deviceId: 'device-abc',
        status: 'offline',
      })
    })

    it('should start 10s grace timer on abnormal close and only mark offline if timer expires', async () => {
      vi.useFakeTimers()
      const clientPeer = createMockPeer({ type: 'client', userId: 'user-123' })
      await controlWebSocket.open(clientPeer)

      const devicePeer = createMockPeer({ type: 'device', deviceId: 'device-abc' })
      await controlWebSocket.open(devicePeer)

      await controlWebSocket.close(devicePeer, { code: 1006, reason: 'Abnormal Disconnect' })

      // Active registry entry is deleted
      expect(activeDevices.has('device-abc')).toBe(false)
      // Grace timer is registered
      expect(deviceGraceTimers.has('device-abc')).toBe(true)
      // Database state remains online during grace period
      expect(mockDevices.get('device-abc')?.status).toBe('online')

      // Fast-forward time by 10 seconds
      await vi.advanceTimersByTimeAsync(10000)

      // Grace period expired, device is marked offline
      expect(mockDevices.get('device-abc')?.status).toBe('offline')
      expect(deviceGraceTimers.has('device-abc')).toBe(false)
      expect(clientPeer.send).toHaveBeenCalledWith({
        type: 'device_status',
        deviceId: 'device-abc',
        status: 'offline',
      })

      vi.useRealTimers()
    })
  })
})
