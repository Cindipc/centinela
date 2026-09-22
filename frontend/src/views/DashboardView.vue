<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useIncidentsStore } from '@/stores/incidents'
import { useNotificationsStore } from '@/stores/notifications'
import StatsCard from '@/components/dashboard/StatsCard.vue'
import ZoneActivityList from '@/components/dashboard/ZoneActivityList.vue'
import CampusMap from '@/components/map/CampusMap.vue'

const incidentsStore = useIncidentsStore()
const notificationsStore = useNotificationsStore()

onMounted(() => {
  incidentsStore.fetchIncidents()
  incidentsStore.fetchReferences()
  incidentsStore.listenRealtime()
  notificationsStore.fetchNotifications()
  notificationsStore.listenRealtime()
})

const isOpen = (s: string) => s !== 'resuelto' && s !== 'falsa_alarma'

const openIncidents = computed(() => incidentsStore.incidents.filter((i) => isOpen(i.status)))
const criticalIncidents = computed(() =>
  incidentsStore.incidents.filter((i) => i.priority === 'critical' && isOpen(i.status))
)

function relTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'ahora mismo'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} d`
}

const zoneActivity = computed(() => {
  const byZone = new Map<string, { count: number; last: string; title: string }>()
  for (const inc of incidentsStore.incidents) {
    const name = inc.zone ?? 'Sin zona'
    const entry = byZone.get(name) ?? { count: 0, last: '2000-01-01T00:00:00Z', title: '' }
    entry.count += 1
    if (inc.createdAt > entry.last) {
      entry.last = inc.createdAt
      entry.title = inc.title
    }
    byZone.set(name, entry)
  }
  return [...byZone.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([zone, e]) => ({
      zone,
      incidentCount: e.count,
      lastEventTitle: e.title,
      lastEventAt: relTime(e.last),
    }))
})
</script>

<template>
  <div class="dashboard">
    <header class="dashboard__header">
      <h1>Panel de control</h1>
      <p class="dashboard__subtitle">
        Estado general del campus — {{ new Date().toLocaleString('es-ES') }}
      </p>
    </header>

    <section class="stats-grid">
      <StatsCard label="Incidencias abiertas" :value="openIncidents.length" tone="warning" icon="⚠️" />
      <StatsCard label="Críticas activas" :value="criticalIncidents.length" tone="danger" icon="🚨" />
      <StatsCard label="Notificaciones no leídas" :value="notificationsStore.unreadCount" tone="info" icon="🔔" />
      <StatsCard label="Equipos en servicio" :value="92" tone="success" icon="📷" suffix="%" />
    </section>

    <section class="dashboard__grid">
      <CampusMap class="dashboard__map" />
      <ZoneActivityList :zones="zoneActivity" />
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.dashboard__header h1 {
  margin: 0;
  font-size: 24px;
}

.dashboard__subtitle {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 14px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.dashboard__grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 16px;
}

.dashboard__map {
  min-height: 340px;
}

@media (max-width: 900px) {
  .dashboard__grid {
    grid-template-columns: 1fr;
  }
}
</style>