<script setup lang="ts">
import type { Incident } from '@backend/types'
import { STATUS_LABELS } from '@/composables/useIncidentQueue'

defineProps<{ incident: Incident }>()

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <article class="card summary">
    <header class="summary__head">
      <div>
        <h2 class="summary__title">{{ incident.title }}</h2>
        <p class="summary__code text-muted">{{ incident.code }} · {{ incident.category ?? 'Sin categoría' }}</p>
      </div>
      <div class="summary__badges">
        <span class="badge" :class="`priority--${incident.priority}`">{{ incident.priority }}</span>
        <span class="badge" :class="`status--${incident.status}`">
          {{ STATUS_LABELS[incident.status] }}
        </span>
      </div>
    </header>

    <p class="summary__desc">{{ incident.description ?? 'Sin descripción.' }}</p>

    <img v-if="incident.photoUrl" :src="incident.photoUrl" :alt="incident.title" class="summary__photo" />

    <dl class="summary__grid">
      <div>
        <dt>Zona</dt>
        <dd>{{ incident.zone ?? '—' }}</dd>
      </div>
      <div>
        <dt>Reportado por</dt>
        <dd>{{ incident.reportedByName ?? '—' }}</dd>
      </div>
      <div>
        <dt>Asignado a</dt>
        <dd>{{ incident.assignedToName ?? 'Sin asignar' }}</dd>
      </div>
      <div>
        <dt>Creado</dt>
        <dd>{{ formatDate(incident.createdAt) }}</dd>
      </div>
      <div v-if="incident.resolvedAt">
        <dt>Resuelto</dt>
        <dd>{{ formatDate(incident.resolvedAt) }}</dd>
      </div>
      <div v-if="incident.location">
        <dt>Coordenadas</dt>
        <dd class="summary__coords">
          {{ incident.location.lat.toFixed(5) }}, {{ incident.location.lng.toFixed(5) }}
        </dd>
      </div>
    </dl>

    <div v-if="incident.resolutionNote" class="summary__resolution">
      <strong>Resolución:</strong> {{ incident.resolutionNote }}
    </div>
  </article>
</template>

<style scoped>
.summary {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.summary__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.summary__title {
  margin: 0;
  font-size: 19px;
}

.summary__code {
  margin: 4px 0 0;
  font-size: 12px;
}

.summary__badges {
  display: flex;
  gap: 8px;
}

.summary__desc {
  margin: 0;
  color: var(--text-muted);
  font-size: 14px;
  white-space: pre-wrap;
}

.summary__photo {
  width: 100%;
  max-height: 260px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.summary__grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.summary__grid dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--text-muted);
}

.summary__grid dd {
  margin: 2px 0 0;
  font-size: 14px;
}

.summary__coords {
  font-family: monospace;
  font-size: 13px;
}

.summary__resolution {
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(46, 213, 115, 0.1);
  border: 1px solid rgba(46, 213, 115, 0.35);
  font-size: 14px;
}
</style>