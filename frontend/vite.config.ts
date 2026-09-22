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
  // Lee el .env de la raíz del proyecto (compartido con backend/)
  envDir: path.resolve(__dirname, '..'),
  // Solo se exponen al navegador las variables VITE_*
  // (SUPABASE_SECRET_KEY queda fuera del bundle)
  envPrefix: ['VITE_'],
})