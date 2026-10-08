<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useIncidentQueue, ageLabel } from '@/composables/useIncidentQueue'
import { useEmergencyStore } from '@/stores/emergency'
import IncidentQueue from '@/components/queues/IncidentQueue.vue'
import type { Incident } from '@backend/types'

const router = useRouter()
const emergency = useEmergencyStore()

// Cola de seguridad: solo incidents.type = 'seguridad' (RLS lo refuerza).
const { store, items, zoneFilter, statusFilter, hideClosed, pendingCount, inProgressCount } =
  useIncidentQueue('seguridad')

onMounted(() => {
  store.fetchIncidentsByType('seguridad')
  store.fetchReferences()
  store.listenRealtime()
  emergency.fetchPanics()
})

function open(incident: Incident) {
  router.push({ name: 'seguridad-detalle', params: { id: incident.id } })
}
</script>

<template>
  <div class="cola">
    <header class="page-header">
      <div>
        <h1>Cola de incidentes</h1>
        <p class="text-muted">
          {{ pendingCount }} pendientes · {{ inProgressCount }} en proceso
          <template v-if="emergency.activePanics.length > 0">
            · 🚨 {{ emergency.activePanics.length }} alertas de pánico
          </template>
        </p>
      </div>
      <div class="page-header__actions">
        <router-link class="btn btn--ghost" to="/seguridad/mapa">🗺️ Ver mapa</router-link>
      </div>
    </header>

    <section v-if="emergency.activePanics.length > 0" class="card cola__panics">
      <h2>Alertas de pánico activas</h2>
      <div v-for="panic in emergency.activePanics" :key="panic.id" class="cola__panic">
        <div>
          <strong>{{ panic.userName ?? 'Usuario' }}</strong>
          <span class="text-muted"> · {{ panic.zone ?? 'sin zona' }} · {{ ageLabel(panic.createdAt) }}</span>
          <p v-if="panic.latitude !== null" class="text-muted cola__coords">
            {{ panic.latitude.toFixed(5) }}, {{ panic.longitude?.toFixed(5) }}
          </p>
        </div>
        <button class="btn btn--ghost btn--small" @click="emergency.closePanic(panic.id, 'atendido')">
          Marcar atendido
        </button>
      </div>
    </section>

    <IncidentQueue
      v-model:zone-filter="zoneFilter"
      v-model:status-filter="statusFilter"
      v-model:hide-closed="hideClosed"
      :incidents="items"
      :zones="store.zones"
      empty-label="No hay incidentes de seguridad con estos filtros."
      @select="open"
    />
  </div>
</template>

<style scoped>
.cola {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 900px;
}

.cola__panics {
  padding: 16px;
  border-color: rgba(255, 71, 87, 0.45);
  background: rgba(255, 71, 87, 0.08);
}

.cola__panics h2 {
  margin: 0 0 10px;
  font-size: 15px;
}

.cola__panic {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 14px;
}

.cola__coords {
  margin: 2px 0 0;
  font-size: 12px;
  font-family: monospace;
}

.btn--small {
  padding: 6px 12px;
  font-size: 13px;
}
</style>