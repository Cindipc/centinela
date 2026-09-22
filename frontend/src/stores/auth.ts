import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login, logout, getSession } from '@backend/api/authApi'
import type { Profile } from '@backend/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<Profile | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => user.value !== null)

  async function signIn(email: string, password: string) {
    loading.value = true
    error.value = null
    try {
      user.value = await login(email, password)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Error al iniciar sesión'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function signOut() {
    await logout()
    user.value = null
  }

  async function restoreSession() {
    const session = await getSession()
    if (session) {
      user.value = session
    }
  }

  return { user, loading, error, isAuthenticated, signIn, signOut, restoreSession }
})