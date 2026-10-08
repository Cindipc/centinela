import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'

export function useAuth() {
  const auth = useAuthStore()
  const { user, loading, error, isAuthenticated, role, homePath } = storeToRefs(auth)
  return {
    user,
    loading,
    error,
    isAuthenticated,
    role,
    homePath,
    signIn: auth.signIn,
    signOut: auth.signOut,
    restoreSession: auth.restoreSession,
  }
}