import { computed, ref } from 'vue'
import { useIncidentsStore } from '@/stores/incidents'
import type { Incident, IncidentPriority, IncidentStatus, IncidentType } from '@backend/types'

// Orden de atención: primero lo crítico y, a igual prioridad, lo más antiguo.
const PRIORITY_ORDER: Record<IncidentPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const OPEN_STATUSES: IncidentStatus[] = ['pendiente', 'en_proceso']

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
  falsa_alarma: 'Falsa alarma',
}

/**
 * Cola de trabajo compartida por seguridad ('seguridad') y TI ('equipo'):
 * mismos filtros, mismo orden y mismos contadores en ambas vistas.
 */
export function useIncidentQueue(type: IncidentType) {
  const store = useIncidentsStore()
  const zoneFilter = ref('')
  const statusFilter = ref<IncidentStatus | ''>('')
  const hideClosed = ref(true)

  const scoped = computed(() => store.byType(type))

  const items = computed<Incident[]>(() =>
    scoped.value
      .filter(
        (i) =>
          (!zoneFilter.value || i.zoneId === zoneFilter.value) &&
          (!statusFilter.value || i.status === statusFilter.value) &&
          (!hideClosed.value || OPEN_STATUSES.includes(i.status))
      )
      .slice()
      .sort(
        (a, b) =>
          PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
  )

  const pendingCount = computed(() => scoped.value.filter((i) => i.status === 'pendiente').length)
  const inProgressCount = computed(
    () => scoped.value.filter((i) => i.status === 'en_proceso').length
  )
  const unassignedCount = computed(
    () => scoped.value.filter((i) => !i.assignedTo && OPEN_STATUSES.includes(i.status)).length
  )

  function reset() {
    zoneFilter.value = ''
    statusFilter.value = ''
    hideClosed.value = true
  }

  return {
    store,
    items,
    scoped,
    zoneFilter,
    statusFilter,
    hideClosed,
    pendingCount,
    inProgressCount,
    unassignedCount,
    reset,
  }
}

/** Antigüedad legible, usada en las colas. */
export function ageLabel(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'ahora mismo'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} d`
}