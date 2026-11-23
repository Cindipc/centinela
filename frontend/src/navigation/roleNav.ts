import type { Role } from '@backend/types'

// =========================================================
// Configuración de navegación y rutas por rol.
// La usan el router (guard) y la barra lateral / barra inferior,
// de modo que un rol nunca ve un enlace que no le corresponde.
// =========================================================

export interface NavItem {
  to: string
  label: string
  /** Se marca visualmente como acción principal (CTA). */
  primary?: boolean
  /** Si es false, el enlace solo aparece en escritorio (la barra móvil es corta). */
  mobile?: boolean
}

/** Destino al que se redirige tras iniciar sesión, según el rol del perfil. */
export const HOME_PATH_BY_ROLE: Record<Role, string> = {
  superadmin: '/superadmin',
  admin: '/dashboard',
  seguridad: '/seguridad/cola',
  ti: '/ti/tickets',
  usuario: '/inicio',
}

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: 'Superadmin',
  admin: 'Administrador',
  seguridad: 'Seguridad',
  ti: 'TI',
  usuario: 'Usuario',
}

const NAV: Record<Role, NavItem[]> = {
  superadmin: [
    { to: '/superadmin', label: 'Panel global' },
    { to: '/superadmin/universidades', label: 'Universidades' },
    { to: '/superadmin/licencias', label: 'Licencias' },
    { to: '/auditoria', label: 'Auditoría' },
    { to: '/mapa', label: 'Mapa global', mobile: false },
  ],
  admin: [
    { to: '/dashboard', label: 'Panel' },
    { to: '/mapa', label: 'Mapa', mobile: false },
    { to: '/incidents', label: 'Incidencias' },
    { to: '/new-report', label: 'Nuevo reporte', primary: true },
    { to: '/emergency', label: 'Emergencia', mobile: false },
    { to: '/inventory', label: 'Inventario', mobile: false },
    { to: '/notifications', label: 'Notificaciones' },
    { to: '/settings', label: 'Configuración' },
    { to: '/configuracion/usuarios', label: 'Usuarios', mobile: false },
    { to: '/auditoria', label: 'Auditoría', mobile: false },
  ],
  seguridad: [
    { to: '/seguridad/cola', label: 'Cola' },
    { to: '/mapa', label: 'Mapa' },
  ],
  ti: [
    { to: '/ti/tickets', label: 'Tickets' },
    { to: '/mapa', label: 'Mapa', mobile: false },
  ],
  usuario: [
    { to: '/inicio', label: 'Inicio' },
    { to: '/reportar', label: 'Reportar', primary: true },
    { to: '/mapa', label: 'Mapa', mobile: false },
    { to: '/mis-reportes', label: 'Mis reportes' },
    { to: '/perfil', label: 'Perfil' },
  ],
}

export function navItemsFor(role: Role | null | undefined): NavItem[] {
  return role ? NAV[role] : []
}

export function mobileNavItemsFor(role: Role | null | undefined): NavItem[] {
  return navItemsFor(role).filter((item) => item.mobile !== false)
}

export function homePathFor(role: Role | null | undefined): string {
  return role ? HOME_PATH_BY_ROLE[role] : '/login'
}

/** /seguridad/cola debe quedar activo en /seguridad/incidente/:id. */
export function isActivePath(currentPath: string, target: string): boolean {
  if (currentPath === target) return true
  return currentPath.startsWith(`${target}/`)
}