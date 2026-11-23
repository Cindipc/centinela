<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useNotificationsStore } from '@/stores/notifications'
import { isActivePath, navItemsFor, ROLE_LABELS } from '@/navigation/roleNav'

const route = useRoute()
const notificationsStore = useNotificationsStore()
const { user } = useAuth()

// Solo se listan los enlaces del rol: nunca aparece uno inaccesible.
const navItems = computed(() => navItemsFor(user.value?.role))
const unread = computed(() => notificationsStore.unreadCount)
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar__brand">
      <img src="/src/assets/logo.png" alt="Centinela" width="34" height="34" />
      <span class="sidebar__title">Centinela</span>
    </div>

    <nav class="sidebar__nav">
      <router-link
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="sidebar__link"
        :class="{ 'sidebar__link--active': isActivePath(route.path, item.to) }"
      >
        <span>{{ item.label }}</span>
        <span v-if="item.to === '/notifications' && unread > 0" class="sidebar__dot">
          {{ unread }}
        </span>
      </router-link>
    </nav>

    <div class="sidebar__footer">
      <div v-if="user" class="sidebar__role">{{ ROLE_LABELS[user.role] }}</div>
      <div v-if="user?.organizationName" class="sidebar__org">{{ user.organizationName }}</div>
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
  background: var(--shell-bg);
  backdrop-filter: blur(12px);
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

.sidebar__brand img {
  filter: drop-shadow(0 0 10px var(--accent-soft));
}

.sidebar__title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  background: linear-gradient(180deg, var(--heading-from), var(--steel-2));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
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
  background: var(--accent-soft);
  color: var(--accent);
}

.sidebar__link--active {
  background: linear-gradient(180deg, #5df0f7, var(--primary));
  color: #032029;
  font-weight: 700;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 0 18px rgba(47, 224, 234, 0.35);
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
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sidebar__role {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}

.sidebar__org {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  box-shadow: 0 0 0 4px rgba(85, 224, 176, 0.2), 0 0 10px rgba(85, 224, 176, 0.6);
}

@media (max-width: 768px) {
  .sidebar {
    display: none;
  }
}
</style>