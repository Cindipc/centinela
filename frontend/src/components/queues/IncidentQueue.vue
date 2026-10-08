<script setup lang="ts">
import type { Incident, IncidentStatus, Zone } from '@backend/types'
import { STATUS_LABELS, ageLabel } from '@/composables/useIncidentQueue'

defineProps<{
  incidents: Incident[]
  zones: Zone[]
  zoneFilter: string
  statusFilter: IncidentStatus | ''
  hideClosed: boolean
  emptyLabel?: string
}>()

const emit = defineEmits<{
  select: [incident: Incident]
  'update:zoneFilter': [value: string]
  'update:statusFilter': [value: IncidentStatus | '']
  'update:hideClosed': [value: boolean]
}>()
</script>

<template>
  <section class="queue">
    <header class="queue__filters">
      <select
        :value="zoneFilter"
        class="queue__select"
        @change="emit('update:zoneFilter', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">Todas las zonas</option>
        <option v-for="zone in zones" :key="zone.id" :value="zone.id">{{ zone.name }}</option>
      </select>

      <select
        :value="statusFilter"
        class="queue__select"
        @change="emit('update:statusFilter', ($event.target as HTMLSelectElement).value as IncidentStatus | '')"
      >
        <option value="">Todos los estados</option>
        <option v-for="(label, value) in STATUS_LABELS" :key="value" :value="value">{{ label }}</option>
      </select>

      <label class="queue__toggle">
        <input
          :checked="hideClosed"
          type="checkbox"
          @change="emit('update:hideClosed', ($event.target as HTMLInputElement).checked)"
        />
        Solo abiertas
      </label>
    </header>

    <ul class="queue__list">
      <li v-for="incident in incidents" :key="incident.id">
        <button class="queue__item" @click="emit('select', incident)">
          <div class="queue__item-head">
            <span class="badge" :class="`priority--${incident.priority}`">{{ incident.priority }}</span>
            <span class="badge" :class="`status--${incident.status}`">
              {{ STATUS_LABELS[incident.status] }}
            </span>
            <span class="queue__age">{{ ageLabel(incident.createdAt) }}</span>
          </div>
          <span class="queue__title">{{ incident.title }}</span>
          <span class="queue__meta text-muted">
            {{ incident.code }} · {{ incident.zone ?? 'Sin zona' }}
            <template v-if="incident.assignedToName"> · {{ incident.assignedToName }}</template>
            <template v-else-if="incident.status !== 'resuelto'"> · sin asignar</template>
          </span>
        </button>
      </li>

      <li v-if="incidents.length === 0" class="queue__empty text-muted">
        {{ emptyLabel ?? 'No hay nada en la cola con estos filtros.' }}
      </li>
    </ul>
  </section>
</template>

<style scoped>
.queue {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.queue__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.queue__select {
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 9px 12px;
  outline: none;
}

.queue__select:focus {
  border-color: var(--accent);
}

.queue__toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-muted);
}

.queue__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.queue__item {
  width: 100%;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: var(--radius);
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
}

.queue__item:hover {
  border-color: var(--accent);
}

.queue__item-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.queue__age {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-muted);
}

.queue__title {
  font-size: 15px;
  font-weight: 600;
}

.queue__meta {
  font-size: 12px;
}

.queue__empty {
  text-align: center;
  padding: 36px 0;
}
</style>