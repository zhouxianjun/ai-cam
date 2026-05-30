import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(
    typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null,
  )
  const isAuthenticated = computed(() => !!token.value)

  async function login(username: string, password: string): Promise<void> {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    if (!response.ok) {
      throw new Error('Authentication failed')
    }

    const data = (await response.json()) as { token: string }
    token.value = data.token
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('auth_token', data.token)
    }
  }

  function logout(): void {
    token.value = null
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('auth_token')
    }
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  return {
    token,
    isAuthenticated,
    login,
    logout,
  }
})
