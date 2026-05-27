import { describe, it, expect } from 'vitest'
import { signJWT, verifyJWT, signMediaToken, verifyMediaToken } from './token.ts'
import type { MediaTokenClaims } from '~/shared/types.ts'

describe('Token Verification Tests', () => {
  describe('JWT Tests', () => {
    it('should successfully sign and verify a JWT', () => {
      const payload = { userId: 'admin', role: 'admin' }
      const token = signJWT(payload)
      const verified = verifyJWT(token)
      expect(verified).not.toBeNull()
      expect(verified?.userId).toBe('admin')
      expect(verified?.role).toBe('admin')
    })

    it('should reject tampered JWTs', () => {
      const token = signJWT({ userId: 'admin', role: 'admin' })
      const tampered = token + 'a'
      expect(verifyJWT(tampered)).toBeNull()
    })

    it('should reject invalid JWT formats', () => {
      expect(verifyJWT('')).toBeNull()
      expect(verifyJWT('header.payload')).toBeNull()
      expect(verifyJWT('header.payload.signature.extra')).toBeNull()
    })
  })

  describe('Media Token Tests', () => {
    const claims: MediaTokenClaims = {
      sub: 'cam_1',
      deviceId: 'cam_1',
      app: 'live',
      stream: 'cam_1',
      action: 'publish',
      exp: Math.floor(Date.now() / 1000) + 10,
      nonce: '12345',
    }
    const secret = 'device_key_secret'

    it('should successfully sign and verify a Media Token', () => {
      const mediaToken = signMediaToken(claims, secret)
      const verifiedMedia = verifyMediaToken(mediaToken, secret)
      expect(verifiedMedia).not.toBeNull()
      expect(verifiedMedia?.stream).toBe('cam_1')
      expect(verifiedMedia?.deviceId).toBe('cam_1')
    })

    it('should reject tampered Media Tokens', () => {
      const mediaToken = signMediaToken(claims, secret)
      const tamperedMedia = mediaToken + 'b'
      expect(verifyMediaToken(tamperedMedia, secret)).toBeNull()
    })

    it('should reject expired Media Tokens', () => {
      const expiredClaims: MediaTokenClaims = { ...claims, exp: Math.floor(Date.now() / 1000) - 5 }
      const expiredToken = signMediaToken(expiredClaims, secret)
      expect(verifyMediaToken(expiredToken, secret)).toBeNull()
    })

    it('should reject invalid formats', () => {
      expect(verifyMediaToken('', secret)).toBeNull()
      expect(verifyMediaToken('payload', secret)).toBeNull()
    })
  })
})
