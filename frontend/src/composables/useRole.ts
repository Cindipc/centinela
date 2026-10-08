import { computed } from 'vue'
import { useAuth } from './useAuth'
import { homePathFor } from '@/navigation/roleNav'
import type { Role } from '@backend/types'

export function useRole() {
  const { user, role } = useAuth()

  const isAdmin = computed(() => role.value === 'admin')
  const isSecurity = computed(() => role.value === 'seguridad')
  const isTecnology = computed(() => role.value === 'ti')
  const isEmployee = computed(() => role.value === 'usuario')
  const canReportIncidents = computed(() => user.value !== null)
  const canManageEquipment = computed(() => isAdmin.value || isTecnology.value)
  const canScanQr = computed(() => isAdmin.value || isTecnology.value)
  /** Alta de usuarios: solo admin (la valida de nuevo la Edge Function). */
  const canCreateUsers = computed(() => isAdmin.value)
  /** Botón de pánico propio: disponible para empleados y staff. */
  const canUsePanicButton = computed(() => user.value !== null)

  const homePath = computed(() => homePathFor(role.value as Role | null))

  return {
    role,
    isAdmin,
    isSecurity,
    isTecnology,
    isEmployee,
    canReportIncidents,
    canManageEquipment,
    canScanQr,
    canCreateUsers,
    canUsePanicButton,
    homePath,
  }
}