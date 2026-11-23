// =========================================================
// Fallback de desarrollo: Leaflet + OpenStreetMap cuando no hay
// token de Mapbox. Implementa el mismo contrato que useCampusMap
// para que MapCanvas no cambie de lógica de datos.
// =========================================================
import L, { type HeatLayer, type Layer, type Map as LeafletMap, type Marker, type TileLayer } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat'
import { ref } from 'vue'
import {
  CAMPUS_CENTER,
  DEFAULT_ZOOM,
  FOCUS_ZOOM,
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
import type { GeoPoint, PanicAlert, RiskLevel } from '@backend/types'
import type { CampusMapController, CampusMapOptions, EditableZone } from './useCampusMap'

type LeafletOptions = Omit<CampusMapOptions, 'token'>

const EMPTY_VISIBILITY: LayerVisibility = {
  zones: true,
  incidents: true,
  heat: false,
  panics: true,
}

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
const SATELLITE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const SATELLITE_ATTRIBUTION = 'Tiles &copy; Esri'

const PRIORITY_RADIUS: Record<string, number> = {
  critical: 9,
  high: 7.5,
  medium: 6.5,
  low: 5.5,
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char
  )
}

function createPanicIcon(): L.DivIcon {
  return L.divIcon({
    className: 'panic-marker leaflet-panic-marker',
    html: `<span class="panic-marker__pulse"></span><span class="panic-marker__dot" style="background:${PANIC_COLOR}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function createEditIcon(label: string): L.DivIcon {
  return L.divIcon({
    className: 'zone-edit-marker leaflet-zone-edit-marker',
    html: `<span class="zone-edit-marker__dot"></span><span class="zone-edit-marker__label">${escapeHtml(label)}</span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

function riskColor(level: unknown): string {
  return typeof level === 'string' && level in RISK_COLORS
    ? RISK_COLORS[level as RiskLevel]
    : RISK_COLORS.medium
}

export function useLeafletCampusMap(options: LeafletOptions): CampusMapController {
  const ready = ref(false)
  const error = ref<string | null>(null)
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const center = options.center ?? CAMPUS_CENTER
  let visibility: LayerVisibility = { ...EMPTY_VISIBILITY }
  let lastZones: MapFeatureCollection = EMPTY_FEATURE_COLLECTION
  let lastIncidents: MapFeatureCollection = EMPTY_FEATURE_COLLECTION
  let lastRiskZones: MapFeatureCollection = EMPTY_FEATURE_COLLECTION
  let riskZonesVisible = true
  let satellite = false
  let picking = false
  let zoneEditing = false

  let map: LeafletMap | null = null
  let baseLayer: TileLayer | null = null
  let heatLayerRef: HeatLayer | null = null
  let resizeObserver: ResizeObserver | null = null

  const zonesLayer = L.layerGroup()
  const riskLayer = L.layerGroup()
  const incidentsLayer = L.layerGroup()
  const panicsLayer = L.layerGroup()
  const editLayer = L.layerGroup()
  const panicMarkers = new Map<string, Marker>()

  function createBaseLayer(useSatellite: boolean): TileLayer {
    return useSatellite
      ? L.tileLayer(SATELLITE_URL, {
          attribution: SATELLITE_ATTRIBUTION,
          maxZoom: 19,
        })
      : L.tileLayer(OSM_URL, {
          attribution: OSM_ATTRIBUTION,
          maxZoom: 19,
        })
  }

  function applyVisibility(): void {
    if (!map) return
    const showZones = visibility.zones && !zoneEditing
    toggleLayer(zonesLayer, showZones)
    toggleLayer(riskLayer, riskZonesVisible)
    toggleLayer(incidentsLayer, visibility.incidents)
    toggleLayer(panicsLayer, visibility.panics)
    if (heatLayerRef) toggleLayer(heatLayerRef, visibility.heat && visibility.incidents)
  }

  function toggleLayer(layer: Layer, visible: boolean): void {
    if (!map) return
    if (visible) {
      if (!map.hasLayer(layer)) layer.addTo(map)
    } else if (map.hasLayer(layer)) {
      map.removeLayer(layer)
    }
  }

  function renderZones(): void {
    zonesLayer.clearLayers()
    for (const item of lastZones.features) {
      if (item.geometry.type !== 'Point') continue
      const [lng, lat] = item.geometry.coordinates
      const props = item.properties
      const marker = L.circleMarker([lat, lng], {
        radius: 14,
        color: ZONE_STROKE_COLOR,
        weight: 1.5,
        fillColor: ZONE_COLOR,
        fillOpacity: 0.22,
      })
      marker.bindTooltip(
        `${String(props.name ?? 'Zona')} · ${String(props.openCount ?? 0)} abiertas`,
        { direction: 'top' }
      )
      zonesLayer.addLayer(marker)
    }
  }

  function renderRiskZones(): void {
    riskLayer.clearLayers()
    for (const item of lastRiskZones.features) {
      if (item.geometry.type !== 'Polygon') continue
      const latLngs = item.geometry.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number])
      const props = item.properties
      const color = riskColor(props.riskLevel)
      const polygon = L.polygon(latLngs, {
        color,
        weight: 1.6,
        dashArray: '5 4',
        fillColor: color,
        fillOpacity: 0.18,
      })
      polygon.bindTooltip(
        `${String(props.label ?? 'Zona de riesgo')} · ${String(props.incidentCount ?? 0)} reportes`,
        { sticky: true }
      )
      riskLayer.addLayer(polygon)
    }
  }

  function renderIncidents(): void {
    incidentsLayer.clearLayers()
    if (heatLayerRef) {
      map?.removeLayer(heatLayerRef)
      heatLayerRef = null
    }

    const heatPoints: Array<[number, number, number?]> = []
    for (const item of lastIncidents.features) {
      if (item.geometry.type !== 'Point') continue
      const [lng, lat] = item.geometry.coordinates
      const props = item.properties
      const marker = L.circleMarker([lat, lng], {
        radius: PRIORITY_RADIUS[String(props.priority)] ?? 6,
        color: props.type === 'equipo' ? '#e8ecef' : 'rgba(3, 18, 25, 0.85)',
        weight: props.type === 'equipo' ? 2 : 1,
        fillColor: String(props.color ?? '#2fe0ea'),
        fillOpacity: 0.92,
      })
      marker.bindTooltip(`${String(props.code ?? '')} · ${String(props.title ?? '')}`, {
        direction: 'top',
      })
      marker.on('click', () => options.onIncidentClick?.(String(props.id)))
      incidentsLayer.addLayer(marker)
      heatPoints.push([lat, lng, props.priority === 'critical' ? 1 : props.priority === 'high' ? 0.7 : 0.35])
    }

    if (heatPoints.length > 0) {
      heatLayerRef = L.heatLayer(heatPoints, {
        radius: 28,
        blur: 22,
        maxZoom: 18,
        minOpacity: 0.25,
        gradient: {
          0.2: '#8d979f',
          0.45: '#14a9b8',
          0.7: '#2fe0ea',
          0.9: '#ff9f43',
          1: '#ff5468',
        },
      })
      if (map && visibility.heat && visibility.incidents) heatLayerRef.addTo(map)
    }
  }

  function renderPanics(): void {
    const seen = new Set<string>()
    for (const panic of lastPanicAlerts) {
      const point = panicPoint(panic)
      if (!isUsablePoint(point)) continue
      seen.add(panic.id)
      if (panicMarkers.has(panic.id)) continue
      const marker = L.marker(toLngLat(point), { icon: createPanicIcon() })
      marker.bindTooltip(`Alerta de pánico · ${panic.userName ?? 'usuario sin nombre'}`)
      marker.addTo(panicsLayer)
      panicMarkers.set(panic.id, marker)
    }
    for (const [id, marker] of panicMarkers) {
      if (seen.has(id)) continue
      panicsLayer.removeLayer(marker)
      panicMarkers.delete(id)
    }
  }

  let lastPanicAlerts: PanicAlert[] = []

  function clearEditMarkers(): void {
    editLayer.clearLayers()
  }

  function renderEditMarkers(zones: EditableZone[] = []): void {
    clearEditMarkers()
    if (!zoneEditing) return
    for (const zone of zones) {
      if (!isUsablePoint(zone.point)) continue
      const marker = L.marker(toLngLat(zone.point), {
        icon: createEditIcon(zone.name),
        draggable: true,
        autoPan: true,
      })
      marker.on('dragend', () => {
        const latLng = marker.getLatLng()
        options.onZoneMove?.(zone.id, { lat: latLng.lat, lng: latLng.lng })
      })
      editLayer.addLayer(marker)
    }
  }

  try {
    map = L.map(options.container, {
      center: toLngLat(center),
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    })
    baseLayer = createBaseLayer(satellite).addTo(map)
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map)
    zonesLayer.addTo(map)
    riskLayer.addTo(map)
    incidentsLayer.addTo(map)
    panicsLayer.addTo(map)
    editLayer.addTo(map)

    map.on('click', (event) => {
      if (!picking) return
      picking = false
      options.container.style.cursor = ''
      options.onPickPoint?.({ lat: event.latlng.lat, lng: event.latlng.lng })
    })

    map.whenReady(() => {
      ready.value = true
      map?.invalidateSize()
    })

    setTimeout(() => map?.invalidateSize(), 0)
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => map?.invalidateSize())
      resizeObserver.observe(options.container)
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo inicializar Leaflet.'
  }

  renderZones()
  renderRiskZones()
  renderIncidents()
  applyVisibility()

  function setBaseStyle(useSatellite: boolean): void {
    if (!map || satellite === useSatellite) return
    satellite = useSatellite
    if (baseLayer) map.removeLayer(baseLayer)
    baseLayer = createBaseLayer(satellite).addTo(map)
    baseLayer.bringToBack()
  }

  function setZones(data: MapFeatureCollection): void {
    lastZones = data
    renderZones()
    applyVisibility()
  }

  function setIncidents(data: MapFeatureCollection): void {
    lastIncidents = data
    renderIncidents()
    applyVisibility()
  }

  function setRiskZones(data: MapFeatureCollection): void {
    lastRiskZones = data
    renderRiskZones()
    applyVisibility()
  }

  function setRiskZonesVisible(visible: boolean): void {
    riskZonesVisible = visible
    applyVisibility()
  }

  function setPanics(panics: PanicAlert[]): void {
    lastPanicAlerts = panics
    renderPanics()
    applyVisibility()
  }

  function setVisibility(next: LayerVisibility): void {
    visibility = { ...EMPTY_VISIBILITY, ...next }
    applyVisibility()
  }

  function fitToZones(): void {
    if (!map) return
    const points: [number, number][] = []
    for (const item of lastZones.features) {
      if (item.geometry.type !== 'Point') continue
      const [lng, lat] = item.geometry.coordinates
      points.push([lat, lng])
    }
    if (points.length === 0) {
      map.setView(toLngLat(center), DEFAULT_ZOOM, { animate: !reducedMotion })
      return
    }
    map.fitBounds(L.latLngBounds(points), {
      padding: [44, 44],
      maxZoom: FOCUS_ZOOM,
      animate: !reducedMotion,
    })
  }

  function focusPoint(point: GeoPoint, zoom: number = FOCUS_ZOOM): void {
    if (!map || !isUsablePoint(point)) return
    map.setView(toLngLat(point), zoom, { animate: !reducedMotion })
  }

  function setPicking(enabled: boolean): void {
    picking = enabled
    if (map) map.getContainer().style.cursor = enabled ? 'crosshair' : ''
  }

  function setZoneEditing(enabled: boolean, zones: EditableZone[] = []): void {
    zoneEditing = enabled
    renderEditMarkers(zones)
    applyVisibility()
  }

  function destroy(): void {
    resizeObserver?.disconnect()
    resizeObserver = null
    clearEditMarkers()
    panicMarkers.clear()
    map?.remove()
    map = null
    heatLayerRef = null
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
