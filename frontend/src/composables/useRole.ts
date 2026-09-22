import { computed } from 'vue'
import { useAuth } from './useAuth'
import type { Role } from '@backend/types'

export function useRole() {
  const { user } = useAuth()

  const role = computed<Role | null>(() => user.value?.role ?? null)
  const isAdmin = computed(() => role.value === 'admin')
  const isSecurity = computed(() => role.value === 'seguridad' || role.value === 'admin')
  const isTecnology = computed(() => role.value === 'ti' || role.value === 'admin')
  const canReportIncidents = computed(() => ['admin', 'seguridad', 'ti'].includes(role.value ?? ''))
  const canManageEquipment = computed(() => role.value === 'admin' || role.value === 'ti')
  const canScanQr = computed(() => ['admin', 'seguridad', 'ti'].includes(role.value ?? ''))

  return { role, isAdmin, isSecurity, isTecnology, canReportIncidents, canManageEquipment, canScanQr }
}