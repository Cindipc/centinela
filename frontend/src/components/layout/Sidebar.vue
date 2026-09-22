<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useNotificationsStore } from '@/stores/notifications'
import { computed } from 'vue'

const route = useRoute()
const notificationsStore = useNotificationsStore()

const navItems = [
  { to: '/', label: 'Panel', icon: '📊' },
  { to: '/incidents', label: 'Incidencias', icon: '⚠️' },
  { to: '/new-report', label: 'Nuevo reporte', icon: '➕' },
  { to: '/emergency', label: 'Emergencia', icon: '🚨' },
  { to: '/inventory', label: 'Inventario', icon: '📷' },
  { to: '/notifications', label: 'Notificaciones', icon: '🔔' },
  { to: '/settings', label: 'Configuración', icon: '⚙️' },
]

const unread = computed(() => notificationsStore.unreadCount)

function isActive(to: string) {
  return route.path === to
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar__brand">
      <img src="/src/assets/logo.svg" alt="Centinela" width="34" height="34" />
      <span class="sidebar__title">Centinela</span>
    </div>

    <nav class="sidebar__nav">
      <router-link
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="sidebar__link"
        :class="{ 'sidebar__link--active': isActive(item.to) }"
      >
        <span class="sidebar__icon">{{ item.icon }}</span>
        <span>{{ item.label }}</span>
        <span v-if="item.to === '/notifications' && unread > 0" class="sidebar__dot">
          {{ unread }}
        </span>
      </router-link>
    </nav>

    <div class="sidebar__footer">
      <div class="sidebar__status">
        <span class="sidebar__pulse"></span>
        Sistema en línea
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 228px;
  flex-shrink: 0;
  background: var(--bg-raised);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
}

.sidebar__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px 18px;
}

.sidebar__title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.sidebar__link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  color: var(--text-muted);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.15s, color 0.15s;
}

.sidebar__link:hover {
  background: var(--bg-card);
  color: var(--text);
}

.sidebar__link--active {
  background: var(--accent);
  color: #fff;
}

.sidebar__icon {
  width: 20px;
  text-align: center;
}

.sidebar__dot {
  margin-left: auto;
  background: var(--danger);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  min-width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
}

.sidebar__footer {
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.sidebar__status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.sidebar__pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 0 4px rgba(46, 213, 115, 0.2);
}
</style>