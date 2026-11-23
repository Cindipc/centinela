import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'

export function useAuth() {
  const auth = useAuthStore()
  const {
    user,
    context,
    loading,
    error,
    isAuthenticated,
    role,
    homePath,
    organizationCenter,
    license,
  } = storeToRefs(auth)
  return {
    user,
    context,
    loading,
    error,
    isAuthenticated,
    role,
    homePath,
    organizationCenter,
    license,
    refreshContext: auth.refreshContext,
    signIn: auth.signIn,
    signOut: auth.signOut,
    restoreSession: auth.restoreSession,
  }
}