<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Map as MapboxMap, Marker } from 'mapbox-gl'
import type { GeoPoint } from '@backend/types'

export interface MapPin {
  id: string
  position: GeoPoint
  label: string
  tone: 'critical' | 'warning' | 'info' | 'ok'
}

const props = defineProps<{
  pins: MapPin[]
  center?: GeoPoint
  zoom?: number
}>()

const container = ref<HTMLElement | null>(null)
const ready = ref(false)
const token = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ?? ''

let map: MapboxMap | null = null
let markers: Marker[] = []
let mapbox: typeof import('mapbox-gl').default | null = null

const TONE_COLORS: Record<MapPin['tone'], string> = {
  critical: '#ff4757',
  warning: '#ffa502',
  info: '#18b9f2',
  ok: '#2ed573',
}

function clearMarkers() {
  markers.forEach((marker) => marker.remove())
  markers = []
}

function drawPins() {
  const sdk = mapbox
  if (!map || !sdk) return
  clearMarkers()
  props.pins.forEach((pin) => {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'mapbox-pin'
    element.style.background = TONE_COLORS[pin.tone]
    element.title = pin.label
    element.setAttribute('aria-label', pin.label)
    element.addEventListener('click', () =>
      map?.flyTo({ center: [pin.position.lng, pin.position.lat], zoom: 16 })
    )
    markers.push(new sdk.Marker({ element }).setLngLat([pin.position.lng, pin.position.lat]).addTo(map!))
  })
}

onMounted(async () => {
  if (!token || !container.value) return
  const [sdk] = await Promise.all([import('mapbox-gl'), import('mapbox-gl/dist/mapbox-gl.css')])
  if (!container.value) return
  mapbox = sdk.default
  mapbox.accessToken = token
  const start: [number, number] = props.center ? [props.center.lng, props.center.lat] : [-77.029, -12.114]
  map = new mapbox.Map({
    container: container.value,
    style: 'mapbox://styles/mapbox/dark-v11',
    center: start,
    zoom: props.zoom ?? 15,
  })
  map.addControl(new mapbox.NavigationControl({ showCompass: false }))
  map.on('load', () => {
    ready.value = true
    drawPins()
  })
})

onBeforeUnmount(() => {
  clearMarkers()
  map?.remove()
  map = null
})

watch(
  () => props.pins,
  () => {
    if (ready.value) drawPins()
  },
  { deep: true }
)
</script>

<template>
  <div class="map">
    <div v-if="token" ref="container" class="map__canvas"></div>
    <div v-else class="map__fallback">
      <p class="map__fallback-title">Mapa sin configurar</p>
      <p class="text-muted">
        Define <code>VITE_MAPBOX_TOKEN</code> en <code>frontend/.env</code> para ver el mapa de Mapbox.
        La lista de {{ pins.length }} puntos sigue disponible en la cola.
      </p>
    </div>
  </div>
</template>

<style scoped>
.map {
  position: relative;
  border-radius: var(--radius);
  overflow: hidden;
  border: 1px solid var(--border);
  min-height: 380px;
  background: var(--bg-raised);
}

.map__canvas {
  position: absolute;
  inset: 0;
}

.map__fallback {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
  height: 100%;
  min-height: 380px;
  text-align: center;
}

.map__fallback-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.map__fallback p {
  margin: 0;
  font-size: 13px;
}

.map__fallback code {
  background: var(--bg-card);
  padding: 1px 6px;
  border-radius: 4px;
}

:deep(.mapbox-pin) {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--bg);
  cursor: pointer;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.6);
}
</style>