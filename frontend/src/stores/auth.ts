import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login, logout, getSession } from '@backend/api/authApi'
import { getMyContext } from '@backend/api/organizationsApi'
import { homePathFor } from '@/navigation/roleNav'
import type { MyContext, Profile, Role } from '@backend/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<Profile | null>(null)
  const context = ref<MyContext | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  /** true cuando ya se intentó recuperar la sesión (evita correr el guard sin datos). */
  const ready = ref(false)
  let restorePromise: Promise<void> | null = null

  const isAuthenticated = computed(() => user.value !== null)
  const role = computed<Role | null>(() => user.value?.role ?? null)
  const homePath = computed(() => homePathFor(role.value))
  const organizationCenter = computed(() => context.value?.organizationCenter ?? null)
  const license = computed(() => context.value?.license ?? null)

  async function refreshContext(): Promise<void> {
    try {
      context.value = await getMyContext()
    } catch {
      context.value = null
    }
  }

  async function signIn(email: string, password: string) {
    loading.value = true
    error.value = null
    try {
      user.value = await login(email, password)
      await refreshContext()
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
    context.value = null
  }

  async function restoreSession() {
    const session = await getSession()
    if (session) {
      user.value = session
      await refreshContext()
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
    context,
    loading,
    error,
    ready,
    isAuthenticated,
    role,
    homePath,
    organizationCenter,
    license,
    refreshContext,
    signIn,
    signOut,
    restoreSession,
    ensureReady,
  }
})