<script setup lang="ts">
import type { Incident } from '@backend/types'

const emit = defineEmits<{
  select: [incident: Incident]
  changeStatus: [incident: Incident, status: Incident['status']]
}>()

const typeLabels: Record<string, string> = {
  seguridad: 'Seguridad',
  equipo: 'Equipo',
}

const statusLabels: Record<string, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  resuelto: 'Resuelta',
  falsa_alarma: 'Falsa alarma',
}

defineProps<{
  incidents: Incident[]
}>()

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusClass(status: Incident['status']): string {
  return `status--${status}`
}

function onChangeStatus(incident: Incident, event: Event) {
  const value = (event.target as HTMLSelectElement).value as Incident['status']
  emit('changeStatus', incident, value)
}
</script>

<template>
  <div class="card table-wrap">
    <table class="table">
      <thead>
        <tr>
          <th>Incidencia</th>
          <th>Prioridad</th>
          <th>Estado</th>
          <th>Zona</th>
          <th>Reportada</th>
          <th>Actualizado</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="incident in incidents" :key="incident.id" @click="emit('select', incident)">
          <td class="table__title">
            <strong>{{ incident.title }}</strong>
            <span class="text-muted">{{ incident.code }} · {{ typeLabels[incident.type] }}</span>
          </td>
          <td><span class="badge" :class="`priority--${incident.priority}`">{{ incident.priority }}</span></td>
          <td>
            <select
              class="table__status"
              :class="statusClass(incident.status)"
              :value="incident.status"
              :disabled="incident.status === 'resuelto' || incident.status === 'falsa_alarma'"
              @click.stop
              @change="onChangeStatus(incident, $event)"
            >
              <option v-for="(label, value) in statusLabels" :key="value" :value="value">{{ label }}</option>
            </select>
          </td>
          <td>{{ incident.zone ?? '—' }}</td>
          <td class="text-muted">{{ formatDate(incident.createdAt) }}</td>
          <td class="text-muted">{{ formatDate(incident.updatedAt) }}</td>
          <td>
            <span v-if="incident.assignedToName" class="text-muted table__assignee">→ {{ incident.assignedToName }}</span>
          </td>
        </tr>
        <tr v-if="incidents.length === 0">
          <td colspan="7" class="text-muted table__empty">No hay incidencias que coincidan con el filtro.</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-wrap {
  overflow-x: auto;
  padding: 4px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.table th,
.table td {
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.table th {
  color: var(--text-muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.table tbody tr {
  cursor: pointer;
  transition: background 0.12s;
}

.table tbody tr:hover {
  background: var(--bg-raised);
}

.table__title {
  display: flex;
  flex-direction: column;
  white-space: normal;
}

.table__title span {
  font-size: 12px;
}

.table__status {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.table__status.status--resuelto { color: var(--success); }
.table__status.status--falsa_alarma { color: var(--text-muted); }

.table__assignee {
  font-size: 12px;
}

.table__empty {
  text-align: center;
  padding: 40px 0;
}
</style>