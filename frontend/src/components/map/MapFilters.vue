<script setup lang="ts">
import { useMapStore, type MapTimeRange } from '@/stores/map.store'
import type { IncidentPriority, IncidentStatus, IncidentType } from '@backend/types'

const mapStore = useMapStore()

const typeOptions: { value: '' | IncidentType; label: string }[] = [
  { value: '', label: 'Todos los tipos' },
  { value: 'seguridad', label: 'Seguridad' },
  { value: 'equipo', label: 'Equipo / TI' },
]

const statusOptions: { value: '' | IncidentStatus; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'resuelto', label: 'Resuelto' },
  { value: 'falsa_alarma', label: 'Falsa alarma' },
]

const priorityOptions: { value: '' | IncidentPriority; label: string }[] = [
  { value: '', label: 'Toda prioridad' },
  { value: 'critical', label: 'Crítica' },
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Media' },
  { value: 'low', label: 'Baja' },
]

const rangeOptions: { value: MapTimeRange; label: string }[] = [
  { value: 'all', label: 'Todo el tiempo' },
  { value: '24h', label: 'Últimas 24 h' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
]
</script>

<template>
  <section class="map-filters" aria-label="Filtros del mapa">
    <div class="map-filters__field">
      <label for="map-filter-type">Tipo</label>
      <select
        id="map-filter-type"
        :value="mapStore.filters.type"
        @change="mapStore.setFilter('type', ($event.target as HTMLSelectElement).value as '' | IncidentType)"
      >
        <option v-for="option in typeOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>

    <div class="map-filters__field">
      <label for="map-filter-status">Estado</label>
      <select
        id="map-filter-status"
        :value="mapStore.filters.status"
        @change="mapStore.setFilter('status', ($event.target as HTMLSelectElement).value as '' | IncidentStatus)"
      >
        <option v-for="option in statusOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>

    <div class="map-filters__field">
      <label for="map-filter-priority">Prioridad</label>
      <select
        id="map-filter-priority"
        :value="mapStore.filters.priority"
        @change="mapStore.setFilter('priority', ($event.target as HTMLSelectElement).value as '' | IncidentPriority)"
      >
        <option v-for="option in priorityOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>

    <div class="map-filters__field">
      <label for="map-filter-range">Rango</label>
      <select
        id="map-filter-range"
        :value="mapStore.filters.range"
        @change="mapStore.setFilter('range', ($event.target as HTMLSelectElement).value as MapTimeRange)"
      >
        <option v-for="option in rangeOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>

    <div class="map-filters__field map-filters__search">
      <label for="map-filter-search">Buscar</label>
      <input
        id="map-filter-search"
        type="search"
        placeholder="Código o título…"
        :value="mapStore.filters.search"
        @input="mapStore.setFilter('search', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <button
      v-if="mapStore.hasActiveFilters()"
      class="btn btn--ghost map-filters__clear"
      type="button"
      @click="mapStore.reset()"
    >
      Limpiar filtros
    </button>
  </section>
</template>

<style scoped>
.map-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  padding: 12px;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.map-filters__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 140px;
  flex: 1 1 140px;
}

.map-filters__search {
  flex: 2 1 220px;
}

.map-filters label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.map-filters select,
.map-filters input {
  background: var(--input-solid, var(--bg-card));
  color: var(--text);
  border: 1px solid var(--input-border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
}

.map-filters__clear {
  flex: 0 0 auto;
  align-self: flex-end;
  margin-bottom: 0;
}
</style>
