import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useTheme } from './composables/useTheme'
import './assets/styles.css'

const app = createApp(App)

useTheme()

console.log('SUPABASE URL:', import.meta.env.VITE_SUPABASE_URL)
console.log(
  'SUPABASE KEY EXISTE:',
  !!import.meta.env.VITE_SUPABASE_ANON_KEY
)

app.use(createPinia())
app.use(router)

app.mount('#app')