import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@backend': path.resolve(__dirname, '../backend'),
    },
  },
  // Lee el .env de la carpeta del frontend (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
  // Solo se exponen al navegador las variables VITE_*.
  envPrefix: ['VITE_'],
})