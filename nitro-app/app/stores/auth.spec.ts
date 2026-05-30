import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from './auth.ts'

describe('Auth Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())

    const storeMap = new Map<string, string>()
    const localStorageMock = {
      getItem: vi.fn((key: string) => storeMap.get(key) || null),
      setItem: vi.fn((key: string, value: string) => {
        storeMap.set(key, String(value))
      }),
      removeItem: vi.fn((key: string) => {
        storeMap.delete(key)
      }),
      clear: vi.fn(() => {
        storeMap.clear()
      }),
    }
    vi.stubGlobal('localStorage', localStorageMock)

    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('should initialize with no token', () => {
    const store = useAuthStore()
    expect(store.token).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('should store token and authenticate on successful login', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'mock-jwt-token' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const store = useAuthStore()
    await store.login('admin', 'password')

    expect(store.token).toBe('mock-jwt-token')
    expect(store.isAuthenticated).toBe(true)
    expect(localStorage.getItem('auth_token')).toBe('mock-jwt-token')
  })

  it('should clear token and logout', () => {
    localStorage.setItem('auth_token', 'initial-token')
    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(true)

    store.logout()
    expect(store.token).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(localStorage.getItem('auth_token')).toBeNull()
  })
})
