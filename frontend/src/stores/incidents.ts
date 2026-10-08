import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getIncidents,
  getIncidentsByType,
  createIncident,
  updateIncident,
  deleteIncident,
  uploadIncidentPhoto,
} from '@backend/api/incidentsApi'
import { getZones, getStaff } from '@backend/api/zonesApi'
import { subscribeToIncidents } from '@backend/api/realtimeChannels'
import { useAuthStore } from './auth'
import type { Incident, IncidentInput, IncidentType, Zone, Profile } from '@backend/types'

export const useIncidentsStore = defineStore('incidents', () => {
  const incidents = ref<Incident[]>([])
  const zones = ref<Zone[]>([])
  const staff = ref<Profile[]>([])
  const loading = ref(false)
  const filter = ref<{ status?: string; priority?: string; type?: string; zone?: string }>({})

  const filteredIncidents = computed(() =>
    incidents.value.filter(
      (i) =>
        (!filter.value.status || i.status === filter.value.status) &&
        (!filter.value.priority || i.priority === filter.value.priority) &&
        (!filter.value.type || i.type === filter.value.type) &&
        (!filter.value.zone || i.zone === filter.value.zone)
    )
  )

  const openCount = computed(
    () => incidents.value.filter((i) => i.status !== 'resuelto' && i.status !== 'falsa_alarma').length
  )

  /** Reportes hechos por la persona conectada (RLS ya limita al rol usuario a los suyos). */
  const myIncidents = computed(() => {
    const auth = useAuthStore()
    const uid = auth.user?.id
    if (!uid) return []
    return incidents.value.filter((i) => i.reportedBy === uid)
  })

  /** Cola de trabajo de un tipo concreto: 'seguridad' (vigilancia) o 'equipo' (TI). */
  function byType(type: IncidentType): Incident[] {
    return incidents.value.filter((i) => i.type === type)
  }

  let unsubscribe: (() => void) | null = null

  async function fetchIncidents() {
    loading.value = true
    try {
      incidents.value = await getIncidents()
    } finally {
      loading.value = false
    }
  }

  /** Carga solo la capa de un tipo (cola de seguridad o de TI). */
  async function fetchIncidentsByType(type: IncidentType) {
    loading.value = true
    try {
      incidents.value = await getIncidentsByType(type)
    } finally {
      loading.value = false
    }
  }

  async function fetchReferences() {
    const [zonesData, staffData] = await Promise.all([getZones(), getStaff()])
    zones.value = zonesData
    staff.value = staffData
  }

  function listenRealtime() {
    if (unsubscribe) return
    unsubscribe = subscribeToIncidents((incident) => {
      const exists = incidents.value.some((i) => i.id === incident.id)
      if (!exists) {
        incidents.value.unshift(incident)
      }
    })
  }

  async function addIncident(input: IncidentInput) {
    const auth = useAuthStore()
    const created = await createIncident(input, {
      id: auth.user?.id ?? '',
      name: auth.user?.name ?? '',
    })
    incidents.value.unshift(created)
    return created
  }

  /** Sube la foto del reporte a Storage y devuelve la URL para incidents.photo_url. */
  async function attachPhoto(file: File) {
    return uploadIncidentPhoto(file)
  }

  async function update(id: string, patch: Partial<Incident>) {
    const updated = await updateIncident(id, patch)
    const index = incidents.value.findIndex((i) => i.id === id)
    if (index !== -1) incidents.value[index] = updated
    return updated
  }

  async function remove(id: string) {
    await deleteIncident(id)
    incidents.value = incidents.value.filter((i) => i.id !== id)
  }

  return {
    incidents,
    zones,
    staff,
    loading,
    filter,
    filteredIncidents,
    openCount,
    myIncidents,
    byType,
    fetchIncidents,
    fetchIncidentsByType,
    fetchReferences,
    listenRealtime,
    addIncident,
    attachPhoto,
    update,
    remove,
  }
})