<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '~/app/stores/auth.ts'
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const router = useRouter()

const username = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref<string | null>(null)

async function handleLogin() {
  if (!username.value || !password.value) {
    errorMessage.value = '请输入凭证！'
    return
  }

  loading.value = true
  errorMessage.value = null

  try {
    await authStore.login(username.value, password.value)
    await router.push('/')
  } catch (err: unknown) {
    errorMessage.value = '连接凭证失效，请重新输入。'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    class="relative flex min-h-screen items-center justify-center bg-[#0b0f19] p-4 font-sans text-slate-100 overflow-hidden"
  >
    <!-- Cyber lighting beam -->
    <div
      class="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none"
    ></div>
    <div
      class="absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none"
    ></div>

    <!-- Obsidian Card -->
    <div
      class="relative w-full max-w-md overflow-hidden rounded-2xl border border-cyan-500/20 bg-slate-900/65 p-8 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-cyan-500/40"
    >
      <!-- Laser top border -->
      <div
        class="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-transparent via-cyan-500 to-transparent"
      ></div>

      <div class="mb-8 text-center">
        <div
          class="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mb-4 animate-pulse"
        >
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <h2 class="text-2xl font-bold tracking-wider text-slate-100 uppercase">HomeGuard RTC</h2>
        <p class="text-xs text-slate-400 mt-1 tracking-widest uppercase">安全监控控制台</p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-6">
        <div>
          <label class="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2"
            >安全签名 (用户名)</label
          >
          <input
            type="text"
            v-model="username"
            required
            class="w-full rounded-lg border border-slate-800 bg-[#0d1321] px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none transition-all focus:border-cyan-500/50 focus:shadow-[0_0_12px_rgba(6,182,212,0.15)]"
            placeholder="请输入操作签名"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2"
            >准入密钥 (密码)</label
          >
          <input
            type="password"
            v-model="password"
            required
            class="w-full rounded-lg border border-slate-800 bg-[#0d1321] px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none transition-all focus:border-cyan-500/50 focus:shadow-[0_0_12px_rgba(6,182,212,0.15)]"
            placeholder="请输入验证密钥"
          />
        </div>

        <!-- Alert -->
        <Transition name="fade">
          <div
            v-if="errorMessage"
            class="rounded-lg border border-orange-500/20 bg-orange-950/20 px-4 py-3 text-xs text-orange-400"
          >
            {{ errorMessage }}
          </div>
        </Transition>

        <button
          type="submit"
          :disabled="loading"
          class="relative flex w-full items-center justify-center rounded-lg bg-cyan-600 px-4 py-3 text-sm font-semibold tracking-wider text-white transition-all hover:bg-cyan-500 active:scale-[0.98] disabled:bg-cyan-800 disabled:cursor-not-allowed uppercase"
        >
          <span
            v-if="loading"
            class="mr-2 h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
          ></span>
          {{ loading ? '校验信令中...' : '建立安全连接' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
