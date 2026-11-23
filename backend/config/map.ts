// =========================================================
// Configuración del mapa del campus (Mapbox GL JS).
// El centro por defecto es fácil de cambiar: ajusta CAMPUS_CENTER.
// =========================================================
import type { IncidentPriority } from '../types'

/** Centro por defecto: Universidad Tecnológica del Poniente (Maxcanú, Yucatán). */
export const CAMPUS_CENTER = { lat: 20.5873, lng: -90.0036 }

export const DEFAULT_ZOOM = 15
export const FOCUS_ZOOM = 17
/** Edificios 3D y mayor inclinación a partir de este zoom. */
export const BUILDINGS_MIN_ZOOM = 15
export const DEFAULT_PITCH = 55

export const MAPBOX_STYLES = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  light: 'mapbox://styles/mapbox/light-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
} as const

export type MapBaseStyle = keyof typeof MAPBOX_STYLES

/** Colores de incidencia por prioridad (paleta Centinela). */
export const PRIORITY_COLORS: Record<IncidentPriority, string> = {
  critical: '#ff5468',
  high: '#ff9f43',
  medium: '#2fe0ea',
  low: '#8d979f',
}

export const PANIC_COLOR = '#ff2d55'
export const ZONE_COLOR = '#14a9b8'
export const ZONE_STROKE_COLOR = '#2fe0ea'
/** Edificios 3D: se adaptan al tema claro/oscuro de la app. */
export const BUILDING_COLORS = {
  dark: '#1a4a57',
  light: '#a9cfd8',
} as const

/** Identificadores de fuentes y capas (se re-registran al cambiar de estilo). */
export const MAP_SOURCES = {
  zones: 'cent-zones',
  incidents: 'cent-incidents',
  riskZones: 'cent-risk-zones',
} as const

export const MAP_LAYERS = {
  zonesCircle: 'cent-zones-circle',
  zonesLabel: 'cent-zones-label',
  incClusters: 'cent-inc-clusters',
  incClusterCount: 'cent-inc-cluster-count',
  incPoints: 'cent-inc-points',
  incHeatmap: 'cent-inc-heatmap',
  riskFill: 'cent-risk-fill',
  riskOutline: 'cent-risk-outline',
  riskLabel: 'cent-risk-label',
  buildings3d: 'cent-buildings-3d',
} as const

/** Colores por nivel de riesgo de la IA. */
export const RISK_COLORS = {
  low: '#55e0b0',
  medium: '#2fe0ea',
  high: '#ff9f43',
  critical: '#ff5468',
} as const

/** Grupos de capas que el usuario puede encender/apagar. */
export type MapLayerGroup = 'zones' | 'incidents' | 'heat' | 'panics'

export interface LayerVisibility extends Record<MapLayerGroup, boolean> {}

export const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
  zones: true,
  incidents: true,
  heat: false,
  panics: true,
}
