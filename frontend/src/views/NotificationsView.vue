<script setup lang="ts">
import { onMounted } from 'vue'
import { useNotificationsStore } from '@/stores/notifications'

const store = useNotificationsStore()

onMounted(() => {
  store.fetchNotifications()
})

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'ahora mismo'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} d`
}
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <h1>Notificaciones</h1>
        <p class="text-muted">{{ store.unreadCount }} sin leer</p>
      </div>
      <button
        v-if="store.unreadCount > 0"
        class="btn btn--ghost"
        @click="store.markAll()"
      >
        Marcar todas como leídas
      </button>
    </header>

    <section class="notifications">
      <article
        v-for="n in store.notifications"
        :key="n.id"
        class="card notification"
        :class="{ 'notification--unread': !n.read }"
        @click="store.markOne(n.id)"
      >
        <div class="notification__icon" :class="{ 'notify--critical': !!n.relatedIncidentId }">{{
          n.relatedIncidentId ? '🚨' : '🔔'
        }}</div>
        <div class="notification__body">
          <div class="notification__title">
            <strong>{{ n.title }}</strong>
            <span class="text-muted notification__time">{{ relTime(n.createdAt) }}</span>
          </div>
          <p class="notification__msg">{{ n.message }}</p>
        </div>
      </article>

      <div v-if="store.notifications.length === 0" class="text-muted notifications__empty">
        No hay notificaciones.
      </div>
    </section>
  </div>
</template>

<style scoped>
.notifications {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notification {
  display: flex;
  gap: 14px;
  padding: 16px;
  cursor: pointer;
  transition: border-color 0.15s;
}

.notification:hover {
  border-color: var(--accent);
}

.notification--unread {
  border-left: 3px solid var(--accent);
}

.notification__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  background: var(--bg-raised);
  flex-shrink: 0;
}

.notify--critical { background: rgba(255, 71, 87, 0.15); }
.notify--warning { background: rgba(255, 165, 2, 0.15); }
.notify--info { background: rgba(24, 185, 242, 0.15); }

.notification__body {
  flex: 1;
}

.notification__title {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.notification__time {
  font-size: 12px;
}

.notification__msg {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}

.notifications__empty {
  text-align: center;
  padding: 40px 0;
}
</style>