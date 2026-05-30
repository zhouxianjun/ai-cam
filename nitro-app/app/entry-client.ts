import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '~/app/App.vue'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import { useAuthStore } from '~/app/stores/auth.ts'

const app = createApp(App)
app.use(createPinia())

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Global Access ACL Route Guard
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  if (to.path !== '/login' && !authStore.isAuthenticated) {
    next('/login')
  } else if (to.path === '/login' && authStore.isAuthenticated) {
    next('/')
  } else {
    next()
  }
})

app.use(router)
app.mount('#app')
