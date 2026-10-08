import type { Role } from '@backend/types'

// =========================================================
// Configuración de navegación y rutas por rol.
// La usan el router (guard) y la barra lateral / barra inferior,
// de modo que un rol nunca ve un enlace que no le corresponde.
// =========================================================

export interface NavItem {
  to: string
  label: string
  icon: string
  /** Se marca visualmente como acción principal (CTA). */
  primary?: boolean
  /** Si es false, el enlace solo aparece en escritorio (la barra móvil es corta). */
  mobile?: boolean
}

/** Destino al que se redirige tras iniciar sesión, según el rol del perfil. */
export const HOME_PATH_BY_ROLE: Record<Role, string> = {
  admin: '/dashboard',
  seguridad: '/seguridad/cola',
  ti: '/ti/tickets',
  usuario: '/inicio',
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  seguridad: 'Seguridad',
  ti: 'TI',
  usuario: 'Usuario',
}

const NAV: Record<Role, NavItem[]> = {
  admin: [
    { to: '/dashboard', label: 'Panel', icon: '📊' },
    { to: '/incidents', label: 'Incidencias', icon: '⚠️' },
    { to: '/new-report', label: 'Nuevo reporte', icon: '➕', primary: true },
    { to: '/emergency', label: 'Emergencia', icon: '🚨', mobile: false },
    { to: '/inventory', label: 'Inventario', icon: '📷', mobile: false },
    { to: '/notifications', label: 'Notificaciones', icon: '🔔' },
    { to: '/settings', label: 'Configuración', icon: '⚙️' },
    { to: '/configuracion/usuarios', label: 'Usuarios', icon: '🧑', mobile: false },
  ],
  seguridad: [
    { to: '/seguridad/cola', label: 'Cola', icon: '🛡️' },
    { to: '/seguridad/mapa', label: 'Mapa', icon: '🗺️' },
  ],
  ti: [{ to: '/ti/tickets', label: 'Tickets', icon: '🧰' }],
  usuario: [
    { to: '/inicio', label: 'Inicio', icon: '🏠' },
    { to: '/reportar', label: 'Reportar', icon: '➕', primary: true },
    { to: '/mis-reportes', label: 'Mis reportes', icon: '📄' },
    { to: '/perfil', label: 'Perfil', icon: '👤' },
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