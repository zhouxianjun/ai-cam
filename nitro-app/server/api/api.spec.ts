import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'node:crypto'

// 1. Mock useStorage globally before importing DB and handlers
const store = new Map<string, any>()

vi.mock('nitro/storage', () => {
  return {
    useStorage: () => ({
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: any) => {
        store.set(key, value)
      },
      getKeys: async (prefix: string) => {
        return Array.from(store.keys()).filter((k) => k.startsWith(prefix))
      },
    }),
  }
})

// 2. Import DB and token helpers
import { saveUser, saveDevice } from '../utils/db.ts'
import { signJWT, verifyMediaToken } from '../utils/token.ts'

// 3. Import API handlers
import loginHandler from './auth/login.post.ts'
import registerHandler from './devices/register.post.ts'
import indexHandler from './devices/index.get.ts'
import publishTokenHandler from './devices/publish-token.post.ts'
import playTokenHandler from './devices/play-token.post.ts'

describe('API Endpoints Unit Tests (H3 Mocking)', () => {
  const createMockHeaders = (headers: Record<string, string>) => ({
    get: (name: string) => headers[name.toLowerCase()] ?? null,
  })

  const testUser = {
    id: 'admin_user',
    username: 'admin',
    passwordHash: '',
    salt: '',
    role: 'admin' as const,
    createdAt: Date.now(),
  }

  const userPassword = 'supersecretpassword'

  beforeEach(async () => {
    store.clear()

    // Setup a default test user
    const salt = crypto.randomBytes(16).toString('hex')
    const passwordHash = crypto.pbkdf2Sync(userPassword, salt, 1000, 64, 'sha512').toString('hex')
    testUser.salt = salt
    testUser.passwordHash = passwordHash

    await saveUser(testUser)
  })

  describe('POST /api/auth/login', () => {
    it('should login successfully with correct credentials', async () => {
      const event = {
        req: {
          json: async () => ({
            username: 'admin',
            password: userPassword,
          }),
        },
      } as any

      const response = await loginHandler(event)
      expect(response).toHaveProperty('token')
      expect(typeof response.token).toBe('string')
    })

    it('should fail with missing parameters', async () => {
      const event = {
        req: {
          json: async () => ({
            username: 'admin',
          }),
        },
      } as any

      await expect(loginHandler(event)).rejects.toThrow('Username and password are required')
    })

    it('should fail with incorrect password', async () => {
      const event = {
        req: {
          json: async () => ({
            username: 'admin',
            password: 'wrongpassword',
          }),
        },
      } as any

      await expect(loginHandler(event)).rejects.toThrow('Invalid credentials')
    })

    it('should fail with non-existent user', async () => {
      const event = {
        req: {
          json: async () => ({
            username: 'nonexistent',
            password: userPassword,
          }),
        },
      } as any

      await expect(loginHandler(event)).rejects.toThrow('Invalid credentials')
    })
  })

  describe('POST /api/devices/register', () => {
    it('should register a new device successfully', async () => {
      const event = {
        req: {
          json: async () => ({
            deviceId: 'cam_001',
            name: 'Living Room Camera',
            secret: 'cam_secret_123',
          }),
        },
      } as any

      const response = await registerHandler(event)
      expect(response).toEqual({ success: true })

      const deviceInDb = store.get('device:cam_001')
      expect(deviceInDb).toBeDefined()
      expect(deviceInDb.name).toBe('Living Room Camera')
      expect(deviceInDb.secret).toBe('cam_secret_123')
      expect(deviceInDb.status).toBe('online')
    })

    it('should fallback to deviceId if name is omitted', async () => {
      const event = {
        req: {
          json: async () => ({
            deviceId: 'cam_002',
            secret: 'secret_456',
          }),
        },
      } as any

      await registerHandler(event)
      const deviceInDb = store.get('device:cam_002')
      expect(deviceInDb.name).toBe('cam_002')
    })

    it('should update online status for existing device with correct secret', async () => {
      await saveDevice({
        id: 'cam_001',
        name: 'Cam 1',
        secret: 'cam_secret_123',
        status: 'offline',
        lastSeen: 0,
        ownerId: 'admin_user',
        createdAt: Date.now(),
      })

      const event = {
        req: {
          json: async () => ({
            deviceId: 'cam_001',
            secret: 'cam_secret_123',
          }),
        },
      } as any

      const response = await registerHandler(event)
      expect(response).toEqual({ success: true })

      const deviceInDb = store.get('device:cam_001')
      expect(deviceInDb.status).toBe('online')
      expect(deviceInDb.lastSeen).toBeGreaterThan(0)
    })

    it('should fail registration of existing device with incorrect secret', async () => {
      await saveDevice({
        id: 'cam_001',
        name: 'Cam 1',
        secret: 'cam_secret_123',
        status: 'offline',
        lastSeen: 0,
        ownerId: 'admin_user',
        createdAt: Date.now(),
      })

      const event = {
        req: {
          json: async () => ({
            deviceId: 'cam_001',
            secret: 'wrong_secret',
          }),
        },
      } as any

      await expect(registerHandler(event)).rejects.toThrow('Invalid device secret')
    })

    it('should fail with missing parameters', async () => {
      const event = {
        req: {
          json: async () => ({
            deviceId: 'cam_001',
          }),
        },
      } as any

      await expect(registerHandler(event)).rejects.toThrow('DeviceId and secret are required')
    })
  })

  describe('GET /api/devices', () => {
    it('should list devices owned by the user when authorized', async () => {
      const userToken = signJWT({ userId: 'admin_user', role: 'admin' })

      await saveDevice({
        id: 'cam_001',
        name: 'Cam 1',
        secret: 'secret_1',
        status: 'online',
        lastSeen: Date.now(),
        ownerId: 'admin_user',
        createdAt: Date.now(),
      })

      await saveDevice({
        id: 'cam_002',
        name: 'Cam 2',
        secret: 'secret_2',
        status: 'online',
        lastSeen: Date.now(),
        ownerId: 'other_user',
        createdAt: Date.now(),
      })

      const event = {
        req: {
          headers: createMockHeaders({
            authorization: `Bearer ${userToken}`,
          }),
        },
      } as any

      const response = await indexHandler(event)
      expect(response).toHaveProperty('devices')
      expect(response.devices).toHaveLength(1)
      expect(response.devices[0].id).toBe('cam_001')
    })

    it('should fail list devices if unauthorized', async () => {
      const event = {
        req: {
          headers: createMockHeaders({}),
        },
      } as any

      await expect(indexHandler(event)).rejects.toThrow('Unauthorized')
    })

    it('should fail list devices with invalid token', async () => {
      const event = {
        req: {
          headers: createMockHeaders({
            authorization: 'Bearer invalid_token_xyz',
          }),
        },
      } as any

      await expect(indexHandler(event)).rejects.toThrow('Unauthorized')
    })
  })

  describe('POST /api/devices/publish-token', () => {
    beforeEach(async () => {
      await saveDevice({
        id: 'cam_001',
        name: 'Cam 1',
        secret: 'cam_secret_123',
        status: 'online',
        lastSeen: Date.now(),
        ownerId: 'admin_user',
        createdAt: Date.now(),
      })
    })

    it('should sign publish token for device successfully', async () => {
      const event = {
        req: {
          json: async () => ({
            deviceId: 'cam_001',
            secret: 'cam_secret_123',
            app: 'live',
            stream: 'cam_001_stream',
          }),
        },
      } as any

      const response = await publishTokenHandler(event)
      expect(response).toHaveProperty('token')

      const verified = verifyMediaToken(response.token, 'cam_secret_123')
      expect(verified).not.toBeNull()
      expect(verified?.deviceId).toBe('cam_001')
      expect(verified?.action).toBe('publish')
      expect(verified?.app).toBe('live')
      expect(verified?.stream).toBe('cam_001_stream')
    })

    it('should fail if device secret is incorrect', async () => {
      const event = {
        req: {
          json: async () => ({
            deviceId: 'cam_001',
            secret: 'wrong_secret',
            app: 'live',
            stream: 'cam_001_stream',
          }),
        },
      } as any

      await expect(publishTokenHandler(event)).rejects.toThrow('Device authorization failed')
    })

    it('should fail if device is not found', async () => {
      const event = {
        req: {
          json: async () => ({
            deviceId: 'cam_nonexistent',
            secret: 'secret',
            app: 'live',
            stream: 'stream',
          }),
        },
      } as any

      await expect(publishTokenHandler(event)).rejects.toThrow('Device authorization failed')
    })

    it('should fail if parameters are missing', async () => {
      const event = {
        req: {
          json: async () => ({
            deviceId: 'cam_001',
            secret: 'cam_secret_123',
          }),
        },
      } as any

      await expect(publishTokenHandler(event)).rejects.toThrow('Missing parameters')
    })
  })

  describe('POST /api/devices/play-token', () => {
    let userToken: string

    beforeEach(async () => {
      userToken = signJWT({ userId: 'admin_user', role: 'admin' })

      await saveDevice({
        id: 'cam_001',
        name: 'Cam 1',
        secret: 'cam_secret_123',
        status: 'online',
        lastSeen: Date.now(),
        ownerId: 'admin_user',
        createdAt: Date.now(),
      })
    })

    it('should sign play token successfully for owned device', async () => {
      const event = {
        req: {
          headers: createMockHeaders({
            authorization: `Bearer ${userToken}`,
          }),
          json: async () => ({
            deviceId: 'cam_001',
            app: 'live',
            stream: 'cam_001_stream',
          }),
        },
      } as any

      const response = await playTokenHandler(event)
      expect(response).toHaveProperty('token')

      const verified = verifyMediaToken(response.token, 'cam_secret_123')
      expect(verified).not.toBeNull()
      expect(verified?.deviceId).toBe('cam_001')
      expect(verified?.action).toBe('play')
      expect(verified?.app).toBe('live')
      expect(verified?.stream).toBe('cam_001_stream')
    })

    it('should fail if user is not authorized', async () => {
      const event = {
        req: {
          headers: createMockHeaders({}),
          json: async () => ({
            deviceId: 'cam_001',
            app: 'live',
            stream: 'cam_001_stream',
          }),
        },
      } as any

      await expect(playTokenHandler(event)).rejects.toThrow('Unauthorized')
    })

    it('should fail if device is not owned by the user', async () => {
      await saveDevice({
        id: 'cam_002',
        name: 'Cam 2',
        secret: 'cam_secret_2',
        status: 'online',
        lastSeen: Date.now(),
        ownerId: 'other_user',
        createdAt: Date.now(),
      })

      const event = {
        req: {
          headers: createMockHeaders({
            authorization: `Bearer ${userToken}`,
          }),
          json: async () => ({
            deviceId: 'cam_002',
            app: 'live',
            stream: 'cam_002_stream',
          }),
        },
      } as any

      await expect(playTokenHandler(event)).rejects.toThrow('Device not found or not owned by user')
    })

    it('should fail if parameters are missing', async () => {
      const event = {
        req: {
          headers: createMockHeaders({
            authorization: `Bearer ${userToken}`,
          }),
          json: async () => ({
            deviceId: 'cam_001',
          }),
        },
      } as any

      await expect(playTokenHandler(event)).rejects.toThrow('Missing parameters')
    })
  })
})
