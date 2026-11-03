<script setup lang="ts">
import { PANIC_COLOR, PRIORITY_COLORS, ZONE_COLOR } from '@backend/config/map'
import type { IncidentPriority } from '@backend/types'

const priorities: { key: IncidentPriority; label: string; color: string }[] = [
  { key: 'critical', label: 'Crítica', color: PRIORITY_COLORS.critical },
  { key: 'high', label: 'Alta', color: PRIORITY_COLORS.high },
  { key: 'medium', label: 'Media', color: PRIORITY_COLORS.medium },
  { key: 'low', label: 'Baja', color: PRIORITY_COLORS.low },
]
</script>

<template>
  <section class="legend" aria-label="Leyenda del mapa">
    <h3>Leyenda</h3>

    <ul class="legend__list">
      <li v-for="item in priorities" :key="item.key" class="legend__item">
        <span class="legend__dot" :style="{ background: item.color }"></span>
        Prioridad {{ item.label }}
      </li>
      <li class="legend__item">
        <span class="legend__dot" :style="{ background: ZONE_COLOR, opacity: 0.35 }"></span>
        Zona del campus
      </li>
      <li class="legend__item">
        <span class="legend__dot legend__dot--panic" :style="{ background: PANIC_COLOR }"></span>
        Alerta de pánico activa
      </li>
    </ul>

    <p class="legend__hint text-muted">
      Círculo con borde claro = ticket de equipo · Círculo sencillo = incidencia de seguridad ·
      Clic en un agrupador para expandirlo.
    </p>
  </section>
</template>

<style scoped>
.legend {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.legend h3 {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.legend__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 13px;
}

.legend__item {
  display: flex;
  align-items: center;
  gap: 9px;
}

.legend__dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend__dot--panic {
  box-shadow: 0 0 8px rgba(255, 45, 85, 0.7);
}

.legend__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
}
</style>
