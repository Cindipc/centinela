import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  Incident,
  IncidentPriority,
  IncidentStatus,
  IncidentType,
} from '@backend/types'

// =========================================================
// Filtros del mapa del campus. Se guardan en la query de la URL
// para que un refresh o un enlace compartido conserve la vista.
// =========================================================

export type MapTimeRange = 'all' | '24h' | '7d' | '30d'

export interface MapFilters {
  type: '' | IncidentType
  status: '' | IncidentStatus
  priority: '' | IncidentPriority
  range: MapTimeRange
  search: string
}

export const DEFAULT_MAP_FILTERS: MapFilters = {
  type: '',
  status: '',
  priority: '',
  range: 'all',
  search: '',
}

const RANGE_MS: Record<Exclude<MapTimeRange, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

const TYPES: IncidentType[] = ['seguridad', 'equipo']
const STATUSES: IncidentStatus[] = ['pendiente', 'en_proceso', 'resuelto', 'falsa_alarma']
const PRIORITIES: IncidentPriority[] = ['low', 'medium', 'high', 'critical']
const RANGES: MapTimeRange[] = ['all', '24h', '7d', '30d']

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && (allowed as string[]).includes(value) ? (value as T) : fallback
}

export const useMapStore = defineStore('map', () => {
  const filters = ref<MapFilters>({ ...DEFAULT_MAP_FILTERS })

  /** Aplica todos los filtros vigentes sobre la lista cruda (RLS ya limitó el conjunto). */
  function applyFilters(list: Incident[]): Incident[] {
    const { type, status, priority, range, search } = filters.value
    const cutoff = range === 'all' ? null : Date.now() - RANGE_MS[range]
    const needle = search.trim().toLowerCase()
    return list.filter((incident) => {
      if (type && incident.type !== type) return false
      if (status && incident.status !== status) return false
      if (priority && incident.priority !== priority) return false
      if (cutoff && new Date(incident.createdAt).getTime() < cutoff) return false
      if (
        needle &&
        !incident.code.toLowerCase().includes(needle) &&
        !incident.title.toLowerCase().includes(needle)
      ) {
        return false
      }
      return true
    })
  }

  function setFilter<K extends keyof MapFilters>(key: K, value: MapFilters[K]): void {
    filters.value = { ...filters.value, [key]: value }
  }

  function setAll(next: Partial<MapFilters>): void {
    filters.value = { ...filters.value, ...next }
  }

  function reset(): void {
    filters.value = { ...DEFAULT_MAP_FILTERS }
  }

  function hasActiveFilters(): boolean {
    const f = filters.value
    return (
      f.type !== '' || f.status !== '' || f.priority !== '' || f.range !== DEFAULT_MAP_FILTERS.range || f.search.trim() !== ''
    )
  }

  /** Query de router.replace (vacíos para no ensuciar la URL). */
  function queryFromFilters(): Record<string, string> {
    const f = filters.value
    const query: Record<string, string> = {}
    if (f.type) query.tipo = f.type
    if (f.status) query.estado = f.status
    if (f.priority) query.prioridad = f.priority
    if (f.range !== DEFAULT_MAP_FILTERS.range) query.rango = f.range
    if (f.search.trim()) query.q = f.search.trim()
    return query
  }

  /** Lee la query de la URL (back/forward, enlace compartido). */
  function filtersFromQuery(query: Record<string, unknown>): MapFilters {
    return {
      type: oneOf(query.tipo, TYPES, ''),
      status: oneOf(query.estado, STATUSES, ''),
      priority: oneOf(query.prioridad, PRIORITIES, ''),
      range: oneOf(query.rango, RANGES, DEFAULT_MAP_FILTERS.range),
      search: typeof query.q === 'string' ? query.q : '',
    }
  }

  return {
    filters,
    applyFilters,
    setFilter,
    setAll,
    reset,
    hasActiveFilters,
    queryFromFilters,
    filtersFromQuery,
  }
})
