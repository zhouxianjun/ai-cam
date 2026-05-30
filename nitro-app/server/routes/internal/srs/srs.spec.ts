import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveDevice, getDevice } from '../../../utils/db.ts'
import { signMediaToken } from '../../../utils/token.ts'
import onPublishHandler from './on-publish.post.ts'
import onPlayHandler from './on-play.post.ts'
import onStopHandler from './on-stop.post.ts'

// 1. Mock useStorage globally before importing DB and handlers
const store = new Map<string, unknown>()

vi.mock('nitro/storage', () => {
  return {
    useStorage: () => ({
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: unknown) => {
        store.set(key, value)
      },
      getKeys: async (prefix: string) => {
        return Array.from(store.keys()).filter((k) => k.startsWith(prefix))
      },
    }),
  }
})

vi.mock('nitro/h3', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    getRequestIP: (event: any) => {
      return event.node?.req?.socket?.remoteAddress || ''
    },
  }
})

interface CallbackResult {
  code: number
  error?: string
}

describe('SRS HTTP Callbacks Unit Tests', () => {
  const deviceId = 'cam_001'
  const deviceSecret = 'my_super_secret_key'
  const appName = 'live'
  const streamName = 'cam_001_stream'

  // Helper to construct mocked H3Event type-safely
  function createMockEvent(remoteAddress: string, bodyData: Record<string, unknown>) {
    return {
      node: {
        req: {
          socket: { remoteAddress },
        },
      },
      req: {
        json: async () => bodyData,
      },
    } as unknown as Parameters<typeof onPublishHandler>[0]
  }

  beforeEach(async () => {
    store.clear()

    // Setup default test device
    await saveDevice({
      id: deviceId,
      name: 'Living Room Cam',
      secret: deviceSecret,
      status: 'online',
      lastSeen: Date.now(),
      ownerId: 'admin_user',
      createdAt: Date.now(),
    })
  })

  describe('on-publish.post.ts', () => {
    it('should reject requests with forbidden code 403 when remote IP is not local', async () => {
      const event = createMockEvent('8.8.8.8', {})
      const res = (await onPublishHandler(event)) as CallbackResult
      expect(res).toEqual({ code: 403, error: 'Forbidden' })
    })

    it('should reject request with 401 if missing parameters', async () => {
      const event = createMockEvent('127.0.0.1', {
        app: appName,
        stream: streamName,
      })
      const res = (await onPublishHandler(event)) as CallbackResult
      expect(res.code).toBe(401)
      expect(res.error).toContain('Missing media parameters')
    })

    it('should reject request with 401 if param has no token', async () => {
      const event = createMockEvent('::1', {
        app: appName,
        stream: streamName,
        param: 'foo=bar',
      })
      const res = (await onPublishHandler(event)) as CallbackResult
      expect(res.code).toBe(401)
      expect(res.error).toBe('Missing token')
    })

    it('should reject if token is malformed', async () => {
      const event = createMockEvent('127.0.0.1', {
        app: appName,
        stream: streamName,
        param: 'token=malformed_without_dot',
      })
      const res = (await onPublishHandler(event)) as CallbackResult
      expect(res.code).toBe(400)
      expect(res.error).toBe('Malformed token')
    })

    it('should reject if device is not found in database', async () => {
      const wrongToken = signMediaToken(
        {
          sub: 'unknown_cam',
          deviceId: 'unknown_cam',
          app: appName,
          stream: streamName,
          action: 'publish',
          exp: Math.floor(Date.now() / 1000) + 60,
          nonce: '123',
        },
        deviceSecret,
      )
      const event = createMockEvent('::ffff:127.0.0.1', {
        app: appName,
        stream: streamName,
        param: `token=${wrongToken}`,
      })
      const res = (await onPublishHandler(event)) as CallbackResult
      expect(res.code).toBe(404)
      expect(res.error).toBe('Device not found')
    })

    it('should reject if token signature is invalid', async () => {
      const invalidSigToken = signMediaToken(
        {
          sub: deviceId,
          deviceId,
          app: appName,
          stream: streamName,
          action: 'publish',
          exp: Math.floor(Date.now() / 1000) + 60,
          nonce: '123',
        },
        'wrong_secret_to_sign_with',
      )
      const event = createMockEvent('127.0.0.1', {
        app: appName,
        stream: streamName,
        param: `token=${invalidSigToken}`,
      })
      const res = (await onPublishHandler(event)) as CallbackResult
      expect(res.code).toBe(401)
      expect(res.error).toBe('Invalid or expired token')
    })

    it('should reject if token is expired', async () => {
      const expiredToken = signMediaToken(
        {
          sub: deviceId,
          deviceId,
          app: appName,
          stream: streamName,
          action: 'publish',
          exp: Math.floor(Date.now() / 1000) - 10,
          nonce: '123',
        },
        deviceSecret,
      )
      const event = createMockEvent('127.0.0.1', {
        app: appName,
        stream: streamName,
        param: `token=${expiredToken}`,
      })
      const res = (await onPublishHandler(event)) as CallbackResult
      expect(res.code).toBe(401)
      expect(res.error).toBe('Invalid or expired token')
    })

    it('should reject if action is mismatch', async () => {
      const playToken = signMediaToken(
        {
          sub: deviceId,
          deviceId,
          app: appName,
          stream: streamName,
          action: 'play',
          exp: Math.floor(Date.now() / 1000) + 60,
          nonce: '123',
        },
        deviceSecret,
      )
      const event = createMockEvent('127.0.0.1', {
        app: appName,
        stream: streamName,
        param: `token=${playToken}`,
      })
      const res = (await onPublishHandler(event)) as CallbackResult
      expect(res.code).toBe(403)
      expect(res.error).toBe('Permission mismatch')
    })

    it('should successfully authorize valid publish requests', async () => {
      const validToken = signMediaToken(
        {
          sub: deviceId,
          deviceId,
          app: appName,
          stream: streamName,
          action: 'publish',
          exp: Math.floor(Date.now() / 1000) + 60,
          nonce: '123',
        },
        deviceSecret,
      )
      const event = createMockEvent('127.0.0.1', {
        app: appName,
        stream: streamName,
        param: `token=${validToken}`,
      })
      const res = (await onPublishHandler(event)) as CallbackResult
      expect(res).toEqual({ code: 0 })
    })
  })

  describe('on-play.post.ts', () => {
    it('should reject requests with forbidden code 403 when remote IP is not local', async () => {
      const event = createMockEvent('8.8.8.8', {})
      const res = (await onPlayHandler(event)) as CallbackResult
      expect(res).toEqual({ code: 403, error: 'Forbidden' })
    })

    it('should reject requests with 401 if missing parameters', async () => {
      const event = createMockEvent('127.0.0.1', {
        app: appName,
      })
      const res = (await onPlayHandler(event)) as CallbackResult
      expect(res.code).toBe(401)
      expect(res.error).toBe('Missing media parameters')
    })

    it('should reject if token is invalid or action is mismatched', async () => {
      const publishToken = signMediaToken(
        {
          sub: deviceId,
          deviceId,
          app: appName,
          stream: streamName,
          action: 'publish',
          exp: Math.floor(Date.now() / 1000) + 60,
          nonce: '123',
        },
        deviceSecret,
      )
      const event = createMockEvent('127.0.0.1', {
        app: appName,
        stream: streamName,
        param: `token=${publishToken}`,
      })
      const res = (await onPlayHandler(event)) as CallbackResult
      expect(res.code).toBe(403)
      expect(res.error).toBe('Permission mismatch')
    })

    it('should successfully authorize valid play requests', async () => {
      const validToken = signMediaToken(
        {
          sub: deviceId,
          deviceId,
          app: appName,
          stream: streamName,
          action: 'play',
          exp: Math.floor(Date.now() / 1000) + 60,
          nonce: '123',
        },
        deviceSecret,
      )
      const event = createMockEvent('::1', {
        app: appName,
        stream: streamName,
        param: `?token=${validToken}`,
      })
      const res = (await onPlayHandler(event)) as CallbackResult
      expect(res).toEqual({ code: 0 })
    })
  })

  describe('on-stop.post.ts', () => {
    it('should reject requests with forbidden code 403 when remote IP is not local', async () => {
      const event = createMockEvent('8.8.8.8', {})
      const res = (await onStopHandler(event)) as CallbackResult
      expect(res).toEqual({ code: 403, error: 'Forbidden' })
    })

    it('should set device offline and update lastSeen when on_unpublish stops stream', async () => {
      // 1. Initial status is online
      const originalDevice = await getDevice(deviceId)
      expect(originalDevice?.status).toBe('online')

      const event = createMockEvent('127.0.0.1', {
        stream: deviceId,
        action: 'on_unpublish',
      })
      const res = (await onStopHandler(event)) as CallbackResult
      expect(res).toEqual({ code: 0 })

      // 2. Verified status is offline
      const updatedDevice = await getDevice(deviceId)
      expect(updatedDevice?.status).toBe('offline')
      expect(updatedDevice?.lastSeen).toBeGreaterThan(0)
    })

    it('should set device offline and update lastSeen when on_stop stops stream', async () => {
      // Reset device to online
      const device = await getDevice(deviceId)
      if (device) {
        device.status = 'online'
        await saveDevice(device)
      }

      const event = createMockEvent('127.0.0.1', {
        stream: deviceId,
        action: 'on_stop',
      })
      const res = (await onStopHandler(event)) as CallbackResult
      expect(res).toEqual({ code: 0 })

      const updatedDevice = await getDevice(deviceId)
      expect(updatedDevice?.status).toBe('offline')
    })
  })
})
