import { computed } from 'vue'
import { useAuth } from './useAuth'
import { homePathFor } from '@/navigation/roleNav'
import type { Role } from '@backend/types'

export function useRole() {
  const { user, role } = useAuth()

  const isSuperadmin = computed(() => role.value === 'superadmin')
  const isAdmin = computed(() => role.value === 'admin')
  const isSecurity = computed(() => role.value === 'seguridad')
  const isTecnology = computed(() => role.value === 'ti')
  const isEmployee = computed(() => role.value === 'usuario')
  const canReportIncidents = computed(() => !isSuperadmin.value && user.value !== null)
  const canManageEquipment = computed(() => isAdmin.value || isTecnology.value)
  const canScanQr = computed(() => isAdmin.value || isTecnology.value)
  /** Alta de usuarios de una universidad (la valida de nuevo la Edge Function). */
  const canCreateUsers = computed(() => isAdmin.value || isSuperadmin.value)
  /** Panel global, universidades y licencias. */
  const canManageOrganizations = computed(() => isSuperadmin.value)
  /** Auditoría de la propia universidad (admin) o global (superadmin). */
  const canViewAudit = computed(() => isAdmin.value || isSuperadmin.value)
  /** Botón de pánico propio: disponible para empleados y staff. */
  const canUsePanicButton = computed(() => !isSuperadmin.value && user.value !== null)

  const homePath = computed(() => homePathFor(role.value as Role | null))

  return {
    role,
    isSuperadmin,
    isAdmin,
    isSecurity,
    isTecnology,
    isEmployee,
    canReportIncidents,
    canManageEquipment,
    canScanQr,
    canCreateUsers,
    canManageOrganizations,
    canViewAudit,
    canUsePanicButton,
    homePath,
  }
}