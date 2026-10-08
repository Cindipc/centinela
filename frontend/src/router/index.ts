import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { homePathFor } from '@/navigation/roleNav'
import type { Role } from '@backend/types'
import DashboardView from '@/views/DashboardView.vue'
import IncidentsView from '@/views/IncidentsView.vue'
import NewReportView from '@/views/NewReportView.vue'
import EmergencyView from '@/views/EmergencyView.vue'
import InventoryView from '@/views/InventoryView.vue'
import NotificationsView from '@/views/NotificationsView.vue'
import SettingsView from '@/views/SettingsView.vue'
import UsersView from '@/views/admin/UsersView.vue'
import LoginView from '@/views/LoginView.vue'
import InicioView from '@/views/usuario/InicioView.vue'
import ReportarView from '@/views/usuario/ReportarView.vue'
import MisReportesView from '@/views/usuario/MisReportesView.vue'
import PerfilView from '@/views/usuario/PerfilView.vue'
import ColaSeguridadView from '@/views/seguridad/ColaSeguridadView.vue'
import DetalleIncidenteView from '@/views/seguridad/DetalleIncidenteView.vue'
import MapaSeguridadView from '@/views/seguridad/MapaSeguridadView.vue'
import ColaTicketsView from '@/views/ti/ColaTicketsView.vue'
import DetalleTicketView from '@/views/ti/DetalleTicketView.vue'

const ADMIN: Role[] = ['admin']
const SEGURIDAD: Role[] = ['seguridad']
const TI: Role[] = ['ti']
const USUARIO: Role[] = ['usuario']

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    // ---- Entry point: cada rol aterriza en su propia vista ----
    { path: '/', name: 'home', redirect: () => homePathFor(useAuthStore().user?.role) },

    // ---- Login (única pantalla de acceso para todos los roles) ----
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },

    // ---- Vistas de administración ----
    { path: '/dashboard', name: 'dashboard', component: DashboardView, meta: { roles: ADMIN } },
    { path: '/incidents', name: 'incidents', component: IncidentsView, meta: { roles: ADMIN } },
    { path: '/new-report', name: 'new-report', component: NewReportView, meta: { roles: ADMIN } },
    { path: '/emergency', name: 'emergency', component: EmergencyView, meta: { roles: ADMIN } },
    { path: '/inventory', name: 'inventory', component: InventoryView, meta: { roles: ADMIN } },
    { path: '/notifications', name: 'notifications', component: NotificationsView, meta: { roles: ADMIN } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { roles: ADMIN } },
    { path: '/configuracion/usuarios', name: 'users', component: UsersView, meta: { roles: ADMIN } },

    // ---- Rol usuario ----
    { path: '/inicio', name: 'inicio', component: InicioView, meta: { roles: USUARIO } },
    { path: '/reportar', name: 'reportar', component: ReportarView, meta: { roles: USUARIO } },
    { path: '/mis-reportes', name: 'mis-reportes', component: MisReportesView, meta: { roles: USUARIO } },
    { path: '/perfil', name: 'perfil', component: PerfilView, meta: { roles: USUARIO } },

    // ---- Rol seguridad ----
    { path: '/seguridad/cola', name: 'seguridad-cola', component: ColaSeguridadView, meta: { roles: SEGURIDAD } },
    {
      path: '/seguridad/incidente/:id',
      name: 'seguridad-detalle',
      component: DetalleIncidenteView,
      meta: { roles: SEGURIDAD },
      props: true,
    },
    { path: '/seguridad/mapa', name: 'seguridad-mapa', component: MapaSeguridadView, meta: { roles: SEGURIDAD } },

    // ---- Rol TI ----
    { path: '/ti/tickets', name: 'ti-tickets', component: ColaTicketsView, meta: { roles: TI } },
    {
      path: '/ti/ticket/:id',
      name: 'ti-ticket',
      component: DetalleTicketView,
      meta: { roles: TI },
      props: true,
    },

    { path: '/:pathMatch(.*)*', name: 'not-found', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.ensureReady()

  const home = homePathFor(auth.user?.role)

  // Sin sesión: todo (menos el login) es inaccesible.
  if (!auth.isAuthenticated) {
    return to.meta.public ? true : { name: 'login', query: { redirect: to.fullPath } }
  }

  // Con sesión: el login y la raíz redirigen a la vista del rol.
  if (to.meta.public || to.name === 'home') {
    return home
  }

  // Rutas restringidas por rol (ej. /dashboard o /configuracion/usuarios).
  const allowed = to.meta.roles as Role[] | undefined
  if (allowed && !allowed.includes(auth.user!.role)) {
    return home
  }

  return true
})

export default router