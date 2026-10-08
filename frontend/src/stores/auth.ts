import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login, logout, getSession } from '@backend/api/authApi'
import { homePathFor } from '@/navigation/roleNav'
import type { Profile, Role } from '@backend/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<Profile | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  /** true cuando ya se intentó recuperar la sesión (evita correr el guard sin datos). */
  const ready = ref(false)
  let restorePromise: Promise<void> | null = null

  const isAuthenticated = computed(() => user.value !== null)
  const role = computed<Role | null>(() => user.value?.role ?? null)
  const homePath = computed(() => homePathFor(role.value))

  async function signIn(email: string, password: string) {
    loading.value = true
    error.value = null
    try {
      user.value = await login(email, password)
      return user.value
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

  /** El router guard espera esto antes de evaluar sesión y rol. */
  function ensureReady(): Promise<void> {
    if (ready.value) return Promise.resolve()
    if (!restorePromise) {
      restorePromise = restoreSession().finally(() => {
        ready.value = true
      })
    }
    return restorePromise
  }

  return {
    user,
    loading,
    error,
    ready,
    isAuthenticated,
    role,
    homePath,
    signIn,
    signOut,
    restoreSession,
    ensureReady,
  }
})