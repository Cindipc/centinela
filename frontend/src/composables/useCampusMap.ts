// =========================================================
// useCampusMap — ciclo de vida del mapa Mapbox del campus:
// inicialización, capas GeoJSON (zonas, incidencias con clusters,
// heatmap), edificios 3D, cambio de estilo y limpieza al desmontar.
// =========================================================
import mapboxgl from 'mapbox-gl'
import { ref, shallowRef, type Ref } from 'vue'
import {
  BUILDINGS_MIN_ZOOM,
  BUILDING_COLORS,
  CAMPUS_CENTER,
  DEFAULT_LAYER_VISIBILITY,
  DEFAULT_PITCH,
  DEFAULT_ZOOM,
  FOCUS_ZOOM,
  MAP_LAYERS,
  MAP_SOURCES,
  MAPBOX_STYLES,
  PANIC_COLOR,
  RISK_COLORS,
  ZONE_COLOR,
  ZONE_STROKE_COLOR,
  type LayerVisibility,
} from '@backend/config/map'
import {
  EMPTY_FEATURE_COLLECTION,
  isUsablePoint,
  panicPoint,
  toLngLat,
  type MapFeatureCollection,
} from '@backend/utils/mapGeo'
import type { GeoPoint, PanicAlert } from '@backend/types'
import 'mapbox-gl/dist/mapbox-gl.css'

export interface CampusMapOptions {
  token: string
  container: HTMLElement
  /** Centro de la universidad; si no se indica, se usa el centro por defecto. */
  center?: GeoPoint | null
  /** Tema de la app: define el estilo base (oscuro/claro) salvo que se pida satélite. */
  theme: 'dark' | 'light'
  onIncidentClick?: (incidentId: string) => void
  /** Modo "Reportar aquí": clic en el mapa devuelve el punto elegido. */
  onPickPoint?: (point: GeoPoint) => void
  /** Edición de zonas (admin): al soltar un punto arrastrado. */
  onZoneMove?: (zoneId: string, point: GeoPoint) => void
}

/** Zona arrastrable en modo edición. */
export interface EditableZone {
  id: string
  name: string
  point: GeoPoint
}

export interface CampusMapController {
  ready: Ref<boolean>
  /** Mensaje de error fatal (token inválido, red, etc.); null si todo va bien. */
  error: Ref<string | null>
  setBaseStyle: (satellite: boolean) => void
  setZones: (data: MapFeatureCollection) => void
  setIncidents: (data: MapFeatureCollection) => void
  setRiskZones: (data: MapFeatureCollection) => void
  setRiskZonesVisible: (visible: boolean) => void
  setPanics: (panics: PanicAlert[]) => void
  setVisibility: (visibility: LayerVisibility) => void
  fitToZones: () => void
  focusPoint: (point: GeoPoint, zoom?: number) => void
  /** Activa el modo de selección de punto (clic = reportar en esa ubicación). */
  setPicking: (enabled: boolean) => void
  /** Modo edición de zonas: marcadores arrastrables, oculta la capa de círculos. */
  setZoneEditing: (enabled: boolean, zones?: EditableZone[]) => void
  destroy: () => void
}

const EMPTY_VISIBILITY: LayerVisibility = { ...DEFAULT_LAYER_VISIBILITY }

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function createPanicElement(panic: PanicAlert): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'panic-marker'
  el.title = `Alerta de pánico · ${panic.userName ?? 'usuario sin nombre'}`
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', el.title)
  el.innerHTML = `<span class="panic-marker__pulse"></span><span class="panic-marker__dot" style="background:${PANIC_COLOR}"></span>`
  return el
}

export function useCampusMap(options: CampusMapOptions): CampusMapController {
  const ready = ref(false)
  const error = ref<string | null>(null)
  const reducedMotion = prefersReducedMotion()

  let satellite = false
  const center = options.center ?? CAMPUS_CENTER
  let visibility: LayerVisibility = { ...EMPTY_VISIBILITY }
  let lastZones: MapFeatureCollection = EMPTY_FEATURE_COLLECTION
  let lastIncidents: MapFeatureCollection = EMPTY_FEATURE_COLLECTION
  let lastRiskZones: MapFeatureCollection = EMPTY_FEATURE_COLLECTION
  let riskZonesVisible = true
  let lastPanics: PanicAlert[] = []
  const panicMarkers = new Map<string, mapboxgl.Marker>()
  let resizeObserver: ResizeObserver | null = null

  let picking = false
  let zoneEditing = false
  const zoneEditMarkers: mapboxgl.Marker[] = []

  const map = shallowRef<mapboxgl.Map | null>(null)

  function baseStyleUrl(): string {
    if (satellite) return MAPBOX_STYLES.satellite
    return options.theme === 'light' ? MAPBOX_STYLES.light : MAPBOX_STYLES.dark
  }

  // ---------- capas ----------

  function registerLayers(target: mapboxgl.Map): void {
    if (!target.getSource(MAP_SOURCES.zones)) {
      target.addSource(MAP_SOURCES.zones, { type: 'geojson', data: lastZones })
      target.addLayer({
        id: MAP_LAYERS.zonesCircle,
        type: 'circle',
        source: MAP_SOURCES.zones,
        paint: {
          'circle-radius': 15,
          'circle-color': ZONE_COLOR,
          'circle-opacity': 0.22,
          'circle-stroke-color': ZONE_STROKE_COLOR,
          'circle-stroke-width': 1.5,
        },
      })
      target.addLayer({
        id: MAP_LAYERS.zonesLabel,
        type: 'symbol',
        source: MAP_SOURCES.zones,
        layout: {
          'text-field': ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'openCount']], ' abiertas'],
          'text-size': 11,
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
        },
        paint: {
          'text-color': options.theme === 'light' ? '#0d2530' : '#e6f6f8',
          'text-halo-color': options.theme === 'light' ? 'rgba(255,255,255,0.9)' : 'rgba(3, 18, 25, 0.9)',
          'text-halo-width': 1.4,
        },
      })
    }

    if (!target.getSource(MAP_SOURCES.riskZones)) {
      target.addSource(MAP_SOURCES.riskZones, { type: 'geojson', data: lastRiskZones })
      target.addLayer(
        {
          id: MAP_LAYERS.riskFill,
          type: 'fill',
          source: MAP_SOURCES.riskZones,
          layout: { visibility: riskZonesVisible ? 'visible' : 'none' },
          paint: {
            'fill-color': [
              'match',
              ['get', 'riskLevel'],
              'critical',
              RISK_COLORS.critical,
              'high',
              RISK_COLORS.high,
              'medium',
              RISK_COLORS.medium,
              RISK_COLORS.low,
            ],
            'fill-opacity': 0.22,
          },
        },
        MAP_LAYERS.zonesCircle
      )
      target.addLayer(
        {
          id: MAP_LAYERS.riskOutline,
          type: 'line',
          source: MAP_SOURCES.riskZones,
          layout: { visibility: riskZonesVisible ? 'visible' : 'none' },
          paint: {
            'line-color': [
              'match',
              ['get', 'riskLevel'],
              'critical',
              RISK_COLORS.critical,
              'high',
              RISK_COLORS.high,
              'medium',
              RISK_COLORS.medium,
              RISK_COLORS.low,
            ],
            'line-width': 1.6,
            'line-opacity': 0.85,
            'line-dasharray': [2, 1.2],
          },
        },
        MAP_LAYERS.zonesCircle
      )
      target.addLayer(
        {
          id: MAP_LAYERS.riskLabel,
          type: 'symbol',
          source: MAP_SOURCES.riskZones,
          layout: {
            visibility: riskZonesVisible ? 'visible' : 'none',
            'text-field': [
              'concat',
              ['coalesce', ['get', 'label'], 'Riesgo'],
              '\n',
              ['to-string', ['get', 'incidentCount']],
              ' reportes',
            ],
            'text-size': 10,
            'text-anchor': 'center',
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
          },
          paint: {
            'text-color': options.theme === 'light' ? '#0d2530' : '#fff4f6',
            'text-halo-color': options.theme === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(3, 18, 25, 0.92)',
            'text-halo-width': 1.2,
          },
        },
        MAP_LAYERS.zonesCircle
      )
    }

    if (!target.getSource(MAP_SOURCES.incidents)) {
      target.addSource(MAP_SOURCES.incidents, {
        type: 'geojson',
        data: lastIncidents,
        cluster: true,
        clusterRadius: 52,
        clusterMaxZoom: 14,
      })
      target.addLayer({
        id: MAP_LAYERS.incClusters,
        type: 'circle',
        source: MAP_SOURCES.incidents,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#14a9b8',
          'circle-stroke-color': '#2fe0ea',
          'circle-stroke-width': 1.5,
          'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 30, 25],
        },
      })
      target.addLayer({
        id: MAP_LAYERS.incClusterCount,
        type: 'symbol',
        source: MAP_SOURCES.incidents,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
        },
        paint: { 'text-color': '#032029' },
      })
      target.addLayer({
        id: MAP_LAYERS.incPoints,
        type: 'circle',
        source: MAP_SOURCES.incidents,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['coalesce', ['get', 'color'], '#2fe0ea'],
          'circle-radius': ['match', ['get', 'priority'], 'critical', 9, 'high', 7.5, 'medium', 6.5, 'low', 5.5, 6],
          'circle-stroke-width': ['match', ['get', 'type'], 'equipo', 2, 1],
          'circle-stroke-color': ['match', ['get', 'type'], 'equipo', '#e8ecef', 'rgba(3, 18, 25, 0.85)'],
          'circle-opacity': 0.92,
        },
      })
      target.addLayer({
        id: MAP_LAYERS.incHeatmap,
        type: 'heatmap',
        source: MAP_SOURCES.incidents,
        layout: { visibility: 'none' },
        paint: {
          'heatmap-weight': [
            'match',
            ['get', 'priority'],
            'critical',
            1,
            'high',
            0.7,
            'medium',
            0.4,
            'low',
            0.15,
            0.3,
          ],
          'heatmap-intensity': 1.1,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(0, 0, 0, 0)',
            0.2,
            '#8d979f',
            0.4,
            '#14a9b8',
            0.6,
            '#2fe0ea',
            0.85,
            '#ff9f43',
            1,
            '#ff5468',
          ],
          'heatmap-radius': 30,
          'heatmap-opacity': 0.78,
        },
      })
    }

    // Edificios en 3D (solo estilos que incluyan la capa "building" de composite).
    if (!target.getLayer(MAP_LAYERS.buildings3d) && target.getSource('composite')) {
      target.addLayer({
        id: MAP_LAYERS.buildings3d,
        source: 'composite',
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: BUILDINGS_MIN_ZOOM,
        paint: {
          'fill-extrusion-color': options.theme === 'light' ? BUILDING_COLORS.light : BUILDING_COLORS.dark,
          'fill-extrusion-height': [
            'coalesce',
            ['get', 'render_height'],
            ['get', 'height'],
            12,
          ],
          'fill-extrusion-base': ['coalesce', ['get', 'render_base_height'], ['get', 'base'], 0],
          'fill-extrusion-opacity': 0.72,
        },
      })
    }

    applyVisibility()
    applyPanics()
  }

  function setLayerVisibility(target: mapboxgl.Map, layerId: string, visible: boolean): void {
    if (target.getLayer(layerId)) {
      target.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
    }
  }

  function applyVisibility(): void {
    const target = map.value
    if (!target) return
    // En modo edición las zonas se pintan como marcadores arrastrables, no como círculos.
    const showZones = visibility.zones && !zoneEditing
    setLayerVisibility(target, MAP_LAYERS.zonesCircle, showZones)
    setLayerVisibility(target, MAP_LAYERS.zonesLabel, showZones)
    setLayerVisibility(target, MAP_LAYERS.incClusters, visibility.incidents)
    setLayerVisibility(target, MAP_LAYERS.incClusterCount, visibility.incidents)
    setLayerVisibility(target, MAP_LAYERS.incPoints, visibility.incidents)
    setLayerVisibility(target, MAP_LAYERS.incHeatmap, visibility.heat && visibility.incidents)
    setLayerVisibility(target, MAP_LAYERS.riskFill, riskZonesVisible)
    setLayerVisibility(target, MAP_LAYERS.riskOutline, riskZonesVisible)
    setLayerVisibility(target, MAP_LAYERS.riskLabel, riskZonesVisible)
  }

  function applyPanics(): void {
    const target = map.value
    if (!target) return
    const seen = new Set<string>()
    for (const panic of lastPanics) {
      const point = panicPoint(panic)
      if (!isUsablePoint(point)) continue
      seen.add(panic.id)
      const existing = panicMarkers.get(panic.id)
      if (existing) {
        existing.getElement().style.display = visibility.panics ? '' : 'none'
        continue
      }
      const marker = new mapboxgl.Marker({ element: createPanicElement(panic) })
        .setLngLat(toLngLat(point))
        .addTo(target)
      marker.getElement().style.display = visibility.panics ? '' : 'none'
      panicMarkers.set(panic.id, marker)
    }
    for (const [id, marker] of panicMarkers) {
      if (!seen.has(id)) {
        marker.remove()
        panicMarkers.delete(id)
      }
    }
  }

  // ---------- interacción ----------

  /** Forma mínima de lo que devuelve queryRenderedFeatures (varía entre versiones de Mapbox). */
  interface QueriedFeature {
    geometry?: { type: string; coordinates: number[] } | null
    properties?: Record<string, unknown> | null
  }

  interface ClusterSourceLike {
    getClusterExpansionZoom: (clusterId: number) => Promise<number>
  }

  function handleMapClick(event: mapboxgl.MapMouseEvent): void {
    const target = map.value
    if (!target) return
    // Modo "Reportar aquí": el clic elige el punto aunque haya una incidencia encima.
    if (picking) {
      picking = false
      target.getCanvas().style.cursor = ''
      options.onPickPoint?.({ lat: event.lngLat.lat, lng: event.lngLat.lng })
      return
    }
    const candidates = [MAP_LAYERS.incPoints, MAP_LAYERS.incClusters].filter((id) =>
      target.getLayer(id)
    )
    if (candidates.length === 0) return
    const [hit] = target.queryRenderedFeatures(event.point, { layers: candidates }) as unknown as QueriedFeature[]
    if (!hit) return

    const props = hit.properties ?? {}
    if (props.cluster_id != null) {
      const source = target.getSource(MAP_SOURCES.incidents) as unknown as ClusterSourceLike | undefined
      const coords =
        hit.geometry?.type === 'Point' && hit.geometry.coordinates.length >= 2
          ? ([hit.geometry.coordinates[0], hit.geometry.coordinates[1]] as [number, number])
          : null
      if (!source?.getClusterExpansionZoom || !coords) return
      source
        .getClusterExpansionZoom(Number(props.cluster_id))
        .then((zoom) => target.easeTo({ center: coords, zoom, duration: reducedMotion ? 0 : 700 }))
        .catch(() => {
          /* el cluster pudo desaparecer al actualizarse la fuente */
        })
      return
    }

    if (props.id != null && options.onIncidentClick) {
      options.onIncidentClick(String(props.id))
    }
  }

  function handleMouseMove(event: mapboxgl.MapMouseEvent): void {
    const target = map.value
    if (!target) return
    if (picking) {
      target.getCanvas().style.cursor = 'crosshair'
      return
    }
    const candidates = [MAP_LAYERS.incPoints, MAP_LAYERS.incClusters].filter((id) =>
      target.getLayer(id)
    )
    if (candidates.length === 0) {
      target.getCanvas().style.cursor = ''
      return
    }
    const hit = target.queryRenderedFeatures(event.point, { layers: candidates })
    target.getCanvas().style.cursor = hit.length > 0 ? 'pointer' : ''
  }

  // ---------- inicialización ----------

  try {
    mapboxgl.accessToken = options.token
    const instance = new mapboxgl.Map({
      container: options.container,
      style: baseStyleUrl(),
        center: [center.lng, center.lat],
        zoom: DEFAULT_ZOOM,
      pitch: DEFAULT_PITCH,
      maxPitch: 70,
    })
    instance.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right')
    instance.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
        showUserHeading: true,
      }),
      'top-right'
    )
    instance.addControl(new mapboxgl.FullscreenControl(), 'top-right')
    instance.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left')

    instance.on('error', (event) => {
      if (ready.value) return
      const message = event.error instanceof Error ? event.error.message : ''
      error.value = message
        ? `No se pudo cargar el mapa (${message}). Revisa el token de Mapbox.`
        : 'No se pudo cargar el mapa. Revisa el token de Mapbox y tu conexión.'
    })

    instance.once('style.load', () => {
      registerLayers(instance)
      if (!ready.value) {
        ready.value = true
        instance.setPitch(DEFAULT_PITCH)
        fitToZones()
      }
    })

    instance.on('click', handleMapClick)
    instance.on('mousemove', handleMouseMove)
    map.value = instance

    // El contenedor puede cambiar de tamaño (sidebar, viewport o pestaña oculta).
    requestAnimationFrame(() => instance.resize())
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => instance.resize())
      resizeObserver.observe(options.container)
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo inicializar el mapa.'
  }

  // ---------- API del controlador ----------

  function setBaseStyle(useSatellite: boolean): void {
    const target = map.value
    if (!target || satellite === useSatellite) return
    satellite = useSatellite
    target.setStyle(baseStyleUrl())
    target.once('style.load', () => {
      registerLayers(target)
    })
  }

  function setData(sourceId: string, data: MapFeatureCollection): void {
    const target = map.value
    if (!target) return
    const source = target.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
    source?.setData(data as never)
  }

  function setZones(data: MapFeatureCollection): void {
    lastZones = data
    setData(MAP_SOURCES.zones, data)
  }

  function setIncidents(data: MapFeatureCollection): void {
    lastIncidents = data
    setData(MAP_SOURCES.incidents, data)
  }

  function setRiskZones(data: MapFeatureCollection): void {
    lastRiskZones = data
    setData(MAP_SOURCES.riskZones, data)
  }

  function setRiskZonesVisible(visible: boolean): void {
    riskZonesVisible = visible
    applyVisibility()
  }

  function setPanics(panics: PanicAlert[]): void {
    lastPanics = panics
    applyPanics()
  }

  function setVisibility(next: LayerVisibility): void {
    visibility = { ...EMPTY_VISIBILITY, ...next }
    applyVisibility()
  }

  function fitToZones(): void {
    const target = map.value
    if (!target) return
    const points: GeoPoint[] = []
    for (const item of lastZones.features) {
      if (item.geometry.type !== 'Point') continue
      const [lng, lat] = item.geometry.coordinates
      points.push({ lat, lng })
    }
    if (points.length === 0) {
      target.easeTo({
      center: [center.lng, center.lat],
        zoom: DEFAULT_ZOOM,
        duration: reducedMotion ? 0 : 700,
      })
      return
    }
    let bounds = new mapboxgl.LngLatBounds(points[0], points[0])
    for (const point of points) bounds = bounds.extend(point)
    target.fitBounds(bounds, {
      padding: { top: 70, bottom: 70, left: 70, right: 70 },
      maxZoom: FOCUS_ZOOM,
      duration: reducedMotion ? 0 : 900,
    })
  }

  function focusPoint(point: GeoPoint, zoom: number = FOCUS_ZOOM): void {
    const target = map.value
    if (!target || !isUsablePoint(point)) return
    target.easeTo({ center: toLngLat(point), zoom, duration: reducedMotion ? 0 : 800 })
  }

  function setPicking(enabled: boolean): void {
    picking = enabled
    const target = map.value
    if (target) target.getCanvas().style.cursor = enabled ? 'crosshair' : ''
  }

  function clearZoneEditMarkers(): void {
    for (const marker of zoneEditMarkers) marker.remove()
    zoneEditMarkers.length = 0
  }

  function setZoneEditing(enabled: boolean, zones: EditableZone[] = []): void {
    zoneEditing = enabled
    const target = map.value
    clearZoneEditMarkers()
    if (!target) {
      applyVisibility()
      return
    }
    if (enabled) {
      for (const zone of zones) {
        if (!isUsablePoint(zone.point)) continue
        const el = document.createElement('div')
        el.className = 'zone-edit-marker'
        el.title = `${zone.name} · arrastra para mover`
        el.setAttribute('role', 'img')
        el.setAttribute('aria-label', el.title)
        el.innerHTML = `<span class="zone-edit-marker__dot"></span><span class="zone-edit-marker__label">${zone.name}</span>`
        const marker = new mapboxgl.Marker({ element: el, draggable: true })
          .setLngLat(toLngLat(zone.point))
          .addTo(target)
        marker.on('dragend', () => {
          const lngLat = marker.getLngLat()
          options.onZoneMove?.(zone.id, { lat: lngLat.lat, lng: lngLat.lng })
        })
        zoneEditMarkers.push(marker)
      }
    }
    applyVisibility()
  }

  function destroy(): void {
    resizeObserver?.disconnect()
    resizeObserver = null
    clearZoneEditMarkers()
    for (const marker of panicMarkers.values()) marker.remove()
    panicMarkers.clear()
    map.value?.remove()
    map.value = null
    ready.value = false
  }

  return {
    ready,
    error,
    setBaseStyle,
    setZones,
    setIncidents,
    setRiskZones,
    setRiskZonesVisible,
    setPanics,
    setVisibility,
    fitToZones,
    focusPoint,
    setPicking,
    setZoneEditing,
    destroy,
  }
}
