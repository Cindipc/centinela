<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useIncidentsStore } from '@/stores/incidents'
import { useNotificationsStore } from '@/stores/notifications'
import { useAuth } from '@/composables/useAuth'
import StatsCard from '@/components/dashboard/StatsCard.vue'
import ZoneActivityList from '@/components/dashboard/ZoneActivityList.vue'
import MapCanvas from '@/components/map/MapCanvas.vue'
import AiInsightsPanel from '@/components/dashboard/AiInsightsPanel.vue'
import { useRole } from '@/composables/useRole'
import { DEFAULT_LAYER_VISIBILITY } from '@backend/config/map'

const incidentsStore = useIncidentsStore()
const notificationsStore = useNotificationsStore()
const { user, organizationCenter, license } = useAuth()
const { isAdmin } = useRole()
const canvas = ref<InstanceType<typeof MapCanvas> | null>(null)
const visibility = ref({ ...DEFAULT_LAYER_VISIBILITY })

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
      <div>
        <h1>Panel de control</h1>
        <p class="dashboard__subtitle">
          {{ user?.organizationName ?? 'Universidad' }} — {{ new Date().toLocaleString('es-ES') }}
        </p>
      </div>
      <div v-if="license" class="license-chip" :class="`license-chip--${license.status}`">
        <strong>{{ license.plan }}</strong>
        <span>Licencia {{ license.status }} · vence {{ license.endDate }}</span>
      </div>
    </header>

    <section class="stats-grid">
      <StatsCard label="Incidencias abiertas" :value="openIncidents.length" tone="warning" />
      <StatsCard label="Críticas activas" :value="criticalIncidents.length" tone="danger" />
      <StatsCard label="Notificaciones no leídas" :value="notificationsStore.unreadCount" tone="info" />
      <StatsCard label="Incidencias totales" :value="incidentsStore.incidents.length" tone="success" />
    </section>

    <AiInsightsPanel v-if="isAdmin" />

    <section class="dashboard__grid">
      <MapCanvas
        ref="canvas"
        class="dashboard__map"
        :incidents="incidentsStore.incidents"
        :zones="incidentsStore.zones"
        :panics="[]"
        :satellite="false"
        :visibility="visibility"
        :picking="false"
        :zone-editing="false"
        :center="organizationCenter"
        @map-ready="canvas?.fitToZones()"
      />
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

.dashboard__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
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

.license-chip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-card);
  font-size: 12px;
  color: var(--text-muted);
}

.license-chip strong {
  color: var(--text);
  font-size: 13px;
}

.license-chip--activa { border-color: rgba(85, 224, 176, 0.45); }
.license-chip--vencida,
.license-chip--suspendida { border-color: rgba(255, 122, 136, 0.45); }
.license-chip--pendiente { border-color: rgba(245, 194, 107, 0.45); }

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