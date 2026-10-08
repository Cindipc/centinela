<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useIncidentsStore } from '@/stores/incidents'
import { ageLabel } from '@/composables/useIncidentQueue'
import IncidentMap, { type MapPin } from '@/components/map/IncidentMap.vue'
import type { Incident } from '@backend/types'

const router = useRouter()
const store = useIncidentsStore()

// Solo la capa de seguridad y solo lo que sigue abierto.
const active = computed<Incident[]>(() =>
  store
    .byType('seguridad')
    .filter((i) => i.status === 'pendiente' || i.status === 'en_proceso')
    .filter((i) => !zoneFilter.value || i.zoneId === zoneFilter.value)
)

const pins = computed<MapPin[]>(() =>
  active.value
    .filter((i) => i.location)
    .map((i) => ({
      id: i.id,
      position: i.location!,
      label: `${i.code} · ${i.title}`,
      tone: i.priority === 'critical' ? 'critical' : i.priority === 'high' ? 'warning' : 'info',
    }))
)

const withoutCoords = computed(() => active.value.filter((i) => !i.location))

onMounted(() => {
  store.fetchIncidentsByType('seguridad')
  store.fetchReferences()
})

const zoneFilter = ref('')
</script>

<template>
  <div class="mapa">
    <header class="page-header">
      <div>
        <h1>Mapa de seguridad</h1>
        <p class="text-muted">{{ active.length }} incidentes activos · {{ pins.length }} con ubicación</p>
      </div>
      <div class="page-header__actions">
        <router-link class="btn btn--ghost" to="/seguridad/cola">← Volver a la cola</router-link>
      </div>
    </header>

    <IncidentMap :pins="pins" />

    <section class="mapa__list">
      <header class="mapa__filters">
        <select v-model="zoneFilter" class="mapa__select">
          <option value="">Todas las zonas</option>
          <option v-for="zone in store.zones" :key="zone.id" :value="zone.id">{{ zone.name }}</option>
        </select>
        <button class="btn btn--ghost btn--small" @click="zoneFilter = ''">Limpiar</button>
      </header>

      <button
        v-for="incident in active"
        :key="incident.id"
        class="card mapa__item"
        @click="router.push({ name: 'seguridad-detalle', params: { id: incident.id } })"
      >
        <span class="badge" :class="`priority--${incident.priority}`">{{ incident.priority }}</span>
        <span class="mapa__item-title">{{ incident.title }}</span>
        <span class="text-muted mapa__item-meta">
          {{ incident.zone ?? 'Sin zona' }} · {{ ageLabel(incident.createdAt) }}
          <template v-if="incident.location">
            · {{ incident.location.lat.toFixed(4) }}, {{ incident.location.lng.toFixed(4) }}
          </template>
        </span>
      </button>

      <div v-if="active.length === 0" class="text-muted mapa__empty">
        No hay incidentes de seguridad activos.
      </div>

      <p v-if="withoutCoords.length > 0" class="text-muted mapa__note">
        {{ withoutCoords.length }} activo(s) sin coordenadas (reportes sin GPS).
      </p>
    </section>
  </div>
</template>

<style scoped>
.mapa {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 980px;
}

.mapa__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mapa__filters {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 4px;
}

.mapa__select {
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 9px 12px;
  outline: none;
}

.mapa__item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 12px;
  align-items: center;
  padding: 12px 14px;
  text-align: left;
  color: var(--text);
}

.mapa__item:hover {
  border-color: var(--accent);
}

.mapa__item-title {
  font-size: 15px;
  font-weight: 600;
}

.mapa__item-meta {
  grid-column: 2;
  font-size: 12px;
}

.mapa__empty {
  text-align: center;
  padding: 30px 0;
}

.mapa__note {
  margin: 4px 0 0;
  font-size: 12px;
}

.btn--small {
  padding: 6px 12px;
  font-size: 13px;
}
</style>