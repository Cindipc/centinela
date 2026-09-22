<script setup lang="ts">
import type { Incident } from '@backend/types'

defineProps<{
  incident: Incident
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <article class="card incident-card">
    <div class="incident-card__head">
      <span class="badge" :class="`priority--${incident.priority}`">{{ incident.priority }}</span>
      <span class="badge" :class="`status--${incident.status}`">{{ statusLabels[incident.status] }}</span>
    </div>
    <h3 class="incident-card__title">{{ incident.title }}</h3>
    <p class="incident-card__desc">{{ incident.description ?? 'Sin descripción.' }}</p>
    <div class="incident-card__meta">
      <span>{{ incident.code }}</span>
      <span class="sep">·</span>
      <span>{{ typeLabels[incident.type] }}</span>
      <span class="sep">·</span>
      <span>{{ incident.zone ?? 'Sin zona' }}</span>
      <span class="sep">·</span>
      <span>{{ formatDate(incident.createdAt) }}</span>
    </div>
  </article>
</template>

<style scoped>
.incident-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.incident-card__head {
  display: flex;
  gap: 8px;
}

.incident-card__title {
  margin: 0;
  font-size: 16px;
}

.incident-card__desc {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.incident-card__meta {
  display: flex;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

.sep {
  opacity: 0.5;
}
</style>