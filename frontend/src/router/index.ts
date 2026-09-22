import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import DashboardView from '@/views/DashboardView.vue'
import IncidentsView from '@/views/IncidentsView.vue'
import NewReportView from '@/views/NewReportView.vue'
import EmergencyView from '@/views/EmergencyView.vue'
import InventoryView from '@/views/InventoryView.vue'
import NotificationsView from '@/views/NotificationsView.vue'
import SettingsView from '@/views/SettingsView.vue'
import LoginView from '@/views/LoginView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/incidents', name: 'incidents', component: IncidentsView },
    { path: '/new-report', name: 'new-report', component: NewReportView },
    { path: '/emergency', name: 'emergency', component: EmergencyView },
    { path: '/inventory', name: 'inventory', component: InventoryView },
    { path: '/notifications', name: 'notifications', component: NotificationsView },
    { path: '/settings', name: 'settings', component: SettingsView },
    { path: '/login', name: 'login', component: LoginView },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  const publicRoutes = ['login']
  if (!auth.isAuthenticated && !publicRoutes.includes(to.name as string)) {
    return { name: 'login' }
  }
  if (auth.isAuthenticated && to.name === 'login') {
    return { name: 'dashboard' }
  }
})

export default router