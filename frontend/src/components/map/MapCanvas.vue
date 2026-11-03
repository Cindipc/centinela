<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useCampusMap, type CampusMapController, type EditableZone } from '@/composables/useCampusMap'
import { useTheme } from '@/composables/useTheme'
import {
  countOpenByZone,
  incidentsToGeoJson,
  isUsablePoint,
  zonesToGeoJson,
  activePanicsWithCoords,
  type MapFeatureCollection,
} from '@backend/utils/mapGeo'
import type { LayerVisibility } from '@backend/config/map'
import type { GeoPoint, Incident, PanicAlert, Zone } from '@backend/types'

const props = defineProps<{
  incidents: Incident[]
  zones: Zone[]
  panics: PanicAlert[]
  satellite: boolean
  visibility: LayerVisibility
  /** Modo "Reportar aquí": el clic en el mapa emite el punto en vez de seleccionar. */
  picking: boolean
  /** Modo edición de zonas (admin): marcadores arrastrables por zona. */
  zoneEditing: boolean
}>()

const emit = defineEmits<{
  (e: 'select-incident', id: string): void
  (e: 'map-ready'): void
  (e: 'pick-point', point: GeoPoint): void
  (e: 'zone-move', zoneId: string, point: GeoPoint): void
}>()

const { theme } = useTheme()

const token = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ?? ''
const hasToken = computed(() => token.trim().length > 0)

const container = ref<HTMLElement | null>(null)
const controller = shallowRef<CampusMapController | null>(null)

const zonesGeo = computed<MapFeatureCollection>(() =>
  zonesToGeoJson(props.zones, countOpenByZone(props.incidents))
)
const incidentsGeo = computed<MapFeatureCollection>(() => incidentsToGeoJson(props.incidents))
const panicsVisible = computed<PanicAlert[]>(() => activePanicsWithCoords(props.panics))

const editableZones = computed<EditableZone[]>(() =>
  props.zones
    .filter((zone): zone is Zone & { location: GeoPoint } => isUsablePoint(zone.location))
    .map((zone) => ({ id: zone.id, name: zone.name, point: zone.location }))
)

function syncData(): void {
  const current = controller.value
  if (!current) return
  current.setZones(zonesGeo.value)
  current.setIncidents(incidentsGeo.value)
  current.setPanics(panicsVisible.value)
  current.setVisibility(props.visibility)
  current.setBaseStyle(props.satellite)
  current.setPicking(props.picking)
  current.setZoneEditing(props.zoneEditing, editableZones.value)
}

onMounted(() => {
  if (!hasToken.value || !container.value) return
  const instance = useCampusMap({
    token,
    container: container.value,
    theme: theme.value,
    onIncidentClick: (id) => emit('select-incident', id),
    onPickPoint: (point) => emit('pick-point', point),
    onZoneMove: (zoneId, point) => emit('zone-move', zoneId, point),
  })
  controller.value = instance
  syncData()
  watch(
    () => instance.ready.value,
    (isReady) => {
      if (!isReady) return
      syncData()
      emit('map-ready')
    },
    { immediate: true }
  )
})

watch(zonesGeo, (value) => controller.value?.setZones(value))
watch(incidentsGeo, (value) => controller.value?.setIncidents(value))
watch(panicsVisible, (value) => controller.value?.setPanics(value))
watch(
  () => props.visibility,
  (value) => controller.value?.setVisibility(value),
  { deep: true }
)
watch(
  () => props.satellite,
  (value) => controller.value?.setBaseStyle(value)
)
watch(
  () => props.picking,
  (value) => controller.value?.setPicking(value)
)
watch(
  () => props.zoneEditing,
  (value) => controller.value?.setZoneEditing(value, editableZones.value)
)
watch(editableZones, (value) => {
  if (props.zoneEditing) controller.value?.setZoneEditing(true, value)
})

onBeforeUnmount(() => {
  controller.value?.destroy()
  controller.value = null
})

defineExpose({
  fitToZones: () => controller.value?.fitToZones(),
  focusPoint: (point: { lat: number; lng: number }, zoom?: number) =>
    controller.value?.focusPoint(point, zoom),
})
</script>

<template>
  <div class="map-canvas">
    <!-- Sin token: estado claro y accionable, sin renderizar el mapa. -->
    <div v-if="!hasToken" class="map-canvas__state card">
      <h3>Mapa sin configurar</h3>
      <p class="text-muted">
        Define <code>VITE_MAPBOX_TOKEN</code> en <code>frontend/.env</code> (copia
        <code>frontend/.env.example</code>) y restringe el token por URL en tu panel de Mapbox.
        Reinicia el servidor de desarrollo después de guardar.
      </p>
    </div>

    <template v-else>
      <div ref="container" class="map-canvas__map" data-testid="campus-map"></div>

      <div v-if="controller?.error.value" class="map-canvas__state card" role="alert">
        <h3>No se pudo cargar el mapa</h3>
        <p class="text-muted">{{ controller.error.value }}</p>
      </div>

      <div v-else-if="controller && !controller.ready.value" class="map-canvas__state card">
        <h3>Cargando mapa…</h3>
        <p class="text-muted">Preparando capas del campus.</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.map-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 420px;
  border-radius: var(--radius);
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--bg-raised);
  box-shadow: var(--shadow-card);
}

.map-canvas__map {
  position: absolute;
  inset: 0;
}

.map-canvas__state {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  text-align: center;
}

.map-canvas__state h3 {
  margin: 0;
  font-size: 16px;
}

.map-canvas__state p {
  margin: 0;
  max-width: 420px;
  font-size: 13px;
}

.map-canvas__state code {
  background: var(--bg-card);
  padding: 1px 6px;
  border-radius: 4px;
}
</style>

<style>
/* Estilos globales: los marcadores de pánico se crean con JS y no llevan
   el atributo de scope del componente. */
.panic-marker {
  position: relative;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
}

.panic-marker__dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ff2d55;
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 0 12px rgba(255, 45, 85, 0.8);
  position: relative;
  z-index: 1;
}

.panic-marker__pulse {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(255, 45, 85, 0.35);
  animation: panicPulseMap 1.4s ease-out infinite;
}

@keyframes panicPulseMap {
  0% {
    transform: scale(0.6);
    opacity: 0.9;
  }
  100% {
    transform: scale(2.2);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .panic-marker__pulse {
    animation: none;
    opacity: 0.4;
  }
}

/* Marcador arrastrable de zonas en modo edición (creado con JS: scope global). */
.zone-edit-marker {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: grab;
  user-select: none;
}

.zone-edit-marker:active {
  cursor: grabbing;
}

.zone-edit-marker__dot {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  background: var(--accent, #2fe0ea);
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 10px rgba(47, 224, 234, 0.7);
  transform: rotate(45deg);
}

.zone-edit-marker__label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text);
  background: var(--panel-solid, rgba(3, 18, 25, 0.88));
  border: 1px solid var(--border, rgba(230, 246, 248, 0.18));
  border-radius: 999px;
  padding: 1px 8px;
  white-space: nowrap;
}

/* Ajuste de controles Mapbox al tema de la app */
.mapboxgl-ctrl-group {
  background: var(--panel-solid) !important;
  border: 1px solid var(--border) !important;
}

.mapboxgl-ctrl-group button {
  background: transparent !important;
}

.mapboxgl-ctrl-group button + button {
  border-top-color: var(--border) !important;
}

.mapboxgl-ctrl button .mapboxgl-ctrl-icon {
  filter: none;
}

:root[data-theme='light'] .mapboxgl-ctrl button .mapboxgl-ctrl-icon {
  filter: invert(1) hue-rotate(180deg);
}

.mapboxgl-ctrl-attrib {
  background: var(--panel-solid) !important;
  color: var(--text-muted) !important;
}

.mapboxgl-ctrl-attrib a {
  color: var(--text-muted) !important;
}
</style>
