<script setup lang="ts">
import type { LayerVisibility, MapLayerGroup } from '@backend/config/map'

const props = defineProps<{
  modelValue: LayerVisibility
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: LayerVisibility): void
}>()

const options: { key: MapLayerGroup; label: string; hint: string }[] = [
  { key: 'zones', label: 'Zonas', hint: 'Perímetros y conteo de abiertas' },
  { key: 'incidents', label: 'Incidencias', hint: 'Puntos con agrupación automática' },
  { key: 'heat', label: 'Mapa de calor', hint: 'Concentración por prioridad' },
  { key: 'panics', label: 'Pánico', hint: 'Alertas activas en tiempo real' },
]

function toggle(key: MapLayerGroup, checked: boolean): void {
  emit('update:modelValue', { ...props.modelValue, [key]: checked })
}
</script>

<template>
  <section class="layers" aria-label="Capas del mapa">
    <h3>Capas</h3>
    <label v-for="option in options" :key="option.key" class="layers__row">
      <span class="layers__text">
        <span class="layers__label">{{ option.label }}</span>
        <span class="layers__hint text-muted">{{ option.hint }}</span>
      </span>
      <input
        type="checkbox"
        :checked="modelValue[option.key]"
        @change="toggle(option.key, ($event.target as HTMLInputElement).checked)"
      />
    </label>
  </section>
</template>

<style scoped>
.layers {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.layers h3 {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.layers__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
}

.layers__text {
  display: flex;
  flex-direction: column;
}

.layers__label {
  font-size: 13px;
  font-weight: 600;
}

.layers__hint {
  font-size: 11.5px;
}

.layers__row input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}
</style>
