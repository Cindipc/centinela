import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  createContact,
  createPanicAlert,
  deleteContact,
  getContacts,
  getPanicAlerts,
  resolvePanicAlert,
  updateContact,
} from '@backend/api/emergencyApi'
import { useAuthStore } from './auth'
import type { EmergencyContact, EmergencyContactInput, PanicAlert } from '@backend/types'

export const useEmergencyStore = defineStore('emergency', () => {
  const contacts = ref<EmergencyContact[]>([])
  const panicAlerts = ref<PanicAlert[]>([])
  const loading = ref(false)
  const sending = ref(false)

  const activePanics = computed(() => panicAlerts.value.filter((p) => p.status === 'activo'))

  async function fetchContacts() {
    const auth = useAuthStore()
    if (!auth.user) return
    loading.value = true
    try {
      contacts.value = await getContacts(auth.user.id)
    } finally {
      loading.value = false
    }
  }

  async function addContact(input: EmergencyContactInput) {
    const auth = useAuthStore()
    if (!auth.user) throw new Error('Sin sesión activa.')
    const created = await createContact(auth.user.id, input)
    contacts.value.push(created)
    return created
  }

  async function editContact(id: string, patch: Partial<EmergencyContactInput>) {
    const updated = await updateContact(id, patch)
    const index = contacts.value.findIndex((c) => c.id === id)
    if (index !== -1) contacts.value[index] = updated
    return updated
  }

  async function removeContact(id: string) {
    await deleteContact(id)
    contacts.value = contacts.value.filter((c) => c.id !== id)
  }

  /** Alertas de pánico: el staff ve todas, el empleado solo las suyas (RLS). */
  async function fetchPanics() {
    const auth = useAuthStore()
    if (!auth.user) return
    loading.value = true
    try {
      panicAlerts.value = await getPanicAlerts(auth.user.role === 'usuario' ? auth.user.id : undefined)
    } finally {
      loading.value = false
    }
  }

  async function triggerPanic(location: { lat: number; lng: number }) {
    const auth = useAuthStore()
    if (!auth.user) throw new Error('Sin sesión activa.')
    sending.value = true
    try {
      const created = await createPanicAlert({
        userId: auth.user.id,
        zoneId: auth.user.zoneId,
        latitude: location.lat,
        longitude: location.lng,
      })
      panicAlerts.value.unshift(created)
      return created
    } finally {
      sending.value = false
    }
  }

  async function closePanic(id: string, status: PanicAlert['status']) {
    const updated = await resolvePanicAlert(id, status)
    const index = panicAlerts.value.findIndex((p) => p.id === id)
    if (index !== -1) panicAlerts.value[index] = updated
    return updated
  }

  return {
    contacts,
    panicAlerts,
    activePanics,
    loading,
    sending,
    fetchContacts,
    addContact,
    editContact,
    removeContact,
    fetchPanics,
    triggerPanic,
    closePanic,
  }
})