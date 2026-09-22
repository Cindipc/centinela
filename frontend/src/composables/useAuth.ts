import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'

export function useAuth() {
  const auth = useAuthStore()
  const { user, loading, error, isAuthenticated } = storeToRefs(auth)
  return {
    user,
    loading,
    error,
    isAuthenticated,
    signIn: auth.signIn,
    signOut: auth.signOut,
    restoreSession: auth.restoreSession,
  }
}