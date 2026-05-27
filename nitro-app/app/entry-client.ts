import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '~/app/App.vue'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'

const app = createApp(App)
app.use(createPinia())

const router = createRouter({
  history: createWebHistory(),
  routes,
})
app.use(router)
app.mount('#app')
