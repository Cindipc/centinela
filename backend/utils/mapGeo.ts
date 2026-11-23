// =========================================================
// Conversión de dominio (incidencias, pánico y zonas) a GeoJSON
// para las fuentes del mapa. Sin datos falsos: solo lo que viene
// de Supabase y que trae coordenadas válidas.
// =========================================================
import { PRIORITY_COLORS } from '../config/map'
import type { GeoPoint, Incident, PanicAlert, RiskZone, Zone } from '../types'

export interface MapPointGeometry {
  type: 'Point'
  coordinates: [number, number] // [lng, lat]
}

export interface MapPolygonGeometry {
  type: 'Polygon'
  coordinates: [number, number][][]
}

export interface MapFeature {
  type: 'Feature'
  geometry: MapPointGeometry | MapPolygonGeometry
  properties: Record<string, string | number | boolean | null>
}

export interface MapFeatureCollection {
  type: 'FeatureCollection'
  features: MapFeature[]
}

export const EMPTY_FEATURE_COLLECTION: MapFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
}

export function isUsablePoint(point: GeoPoint | null | undefined): point is GeoPoint {
  return (
    !!point &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  )
}

export function toLngLat(point: GeoPoint): [number, number] {
  return [point.lng, point.lat]
}

function feature(
  point: GeoPoint,
  properties: Record<string, string | number | boolean | null>
): MapFeature {
  return { type: 'Feature', geometry: { type: 'Point', coordinates: toLngLat(point) }, properties }
}

/** Incidencias con ubicación → GeoJSON con color por prioridad y tipo. */
export function incidentsToGeoJson(incidents: Incident[]): MapFeatureCollection {
  const features = incidents
    .filter((i) => isUsablePoint(i.location))
    .map((i) =>
      feature(i.location as GeoPoint, {
        id: i.id,
        code: i.code,
        title: i.title,
        type: i.type,
        priority: i.priority,
        status: i.status,
        zone: i.zone,
        color: PRIORITY_COLORS[i.priority],
      })
    )
  return { type: 'FeatureCollection', features }
}

/** Alertas de pánico activas con ubicación (se pintan como marcadores DOM). */
export function activePanicsWithCoords(panics: PanicAlert[]): PanicAlert[] {
  return panics.filter((p) => p.status === 'activo' && isUsablePoint(panicPoint(p)))
}

export function panicPoint(panic: PanicAlert): GeoPoint | null {
  if (panic.latitude == null || panic.longitude == null) return null
  return { lat: panic.latitude, lng: panic.longitude }
}

/** Zonas con ubicación + número de incidencias abiertas por zona. */
export function zonesToGeoJson(
  zones: Zone[],
  openCountByZone: Record<string, number> = {}
): MapFeatureCollection {
  const features = zones
    .filter((z) => isUsablePoint(z.location))
    .map((z) =>
      feature(z.location as GeoPoint, {
        id: z.id,
        name: z.name,
        building: z.building,
        openCount: openCountByZone[z.id] ?? 0,
      })
    )
  return { type: 'FeatureCollection', features }
}

/** Punto destino a `distanceM` metros y rumbo `bearing` grados desde `origin`. */
export function destinationPoint(origin: GeoPoint, bearing: number, distanceM: number): GeoPoint {
  const radius = 6371000
  const angular = distanceM / radius
  const bearingRad = (bearing * Math.PI) / 180
  const lat1 = (origin.lat * Math.PI) / 180
  const lng1 = (origin.lng * Math.PI) / 180
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearingRad)
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
    )
  return { lat: (lat2 * 180) / Math.PI, lng: (((lng2 * 180) / Math.PI + 540) % 360) - 180 }
}

/** Polígono aproximado (48 vértices) para una zona de riesgo circular. */
export function circlePolygon(center: GeoPoint, radiusM: number, steps = 48): MapPolygonGeometry {
  const ring: [number, number][] = []
  for (let index = 0; index <= steps; index += 1) {
    const point = destinationPoint(center, (index * 360) / steps, radiusM)
    ring.push(toLngLat(point))
  }
  return { type: 'Polygon', coordinates: [ring] }
}

/** Zonas de riesgo de la IA → GeoJSON de polígonos con metadatos para el mapa. */
export function riskZonesToGeoJson(zones: RiskZone[]): MapFeatureCollection {
  const features = zones
    .filter((zone) => isUsablePoint(zone.center) && Number.isFinite(zone.radiusM) && zone.radiusM > 0)
    .map<MapFeature>((zone) => ({
      type: 'Feature',
      geometry: circlePolygon(zone.center, Math.max(30, Math.min(zone.radiusM, 2500))),
      properties: {
        id: zone.id,
        label: zone.label,
        zone: zone.zone,
        incidentCount: zone.incidentCount,
        riskLevel: zone.riskLevel,
        score: zone.score,
        dominantType: zone.dominantType,
        peakHour: zone.peakHour,
        radiusM: zone.radiusM,
      },
    }))
  return { type: 'FeatureCollection', features }
}

/** Conteo de incidencias abiertas (pendiente/en_proceso) agrupado por zona. */
export function countOpenByZone(incidents: Incident[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const incident of incidents) {
    if (!incident.zoneId) continue
    if (incident.status === 'resuelto' || incident.status === 'falsa_alarma') continue
    counts[incident.zoneId] = (counts[incident.zoneId] ?? 0) + 1
  }
  return counts
}

/** Límites geográficos para encuadrar el mapa; null si no hay puntos. */
export function boundsFromPoints(
  points: GeoPoint[]
): [[number, number], [number, number]] | null {
  const usable = points.filter(isUsablePoint)
  if (usable.length === 0) return null
  let minLng = usable[0].lng
  let maxLng = usable[0].lng
  let minLat = usable[0].lat
  let maxLat = usable[0].lat
  for (const point of usable) {
    minLng = Math.min(minLng, point.lng)
    maxLng = Math.max(maxLng, point.lng)
    minLat = Math.min(minLat, point.lat)
    maxLat = Math.max(maxLat, point.lat)
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ]
}

/** Distancia en metros entre dos puntos (fórmula de haversine). */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
