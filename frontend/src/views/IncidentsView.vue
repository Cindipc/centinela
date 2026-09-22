<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useIncidentsStore } from '@/stores/incidents'
import IncidentTable from '@/components/incidents/IncidentTable.vue'
import IncidentFormModal from '@/components/incidents/IncidentFormModal.vue'
import IncidentCard from '@/components/incidents/IncidentCard.vue'
import type { Incident, IncidentInput } from '@backend/types'

const store = useIncidentsStore()

const showForm = ref(false)
const selected = ref<Incident | null>(null)
const editing = ref<Incident | null>(null)

onMounted(() => {
  store.fetchIncidents()
  store.fetchReferences()
})

function openCreate() {
  editing.value = null
  showForm.value = true
}

function openEdit(incident: Incident) {
  editing.value = incident
  showForm.value = true
}

async function handleSave(data: IncidentInput, id?: string) {
  if (id) {
    await store.update(id, data)
  } else {
    await store.addIncident(data)
  }
  showForm.value = false
}

async function handleChangeStatus(incident: Incident, status: Incident['status']) {
  await store.update(incident.id, { status })
}
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <h1>Incidencias</h1>
        <p class="text-muted">{{ store.openCount }} abiertas · {{ store.incidents.length }} totales</p>
      </div>
      <div class="page-header__actions">
        <button class="btn" @click="openCreate">+ Nueva incidencia</button>
      </div>
    </header>

    <IncidentTable
      :incidents="store.filteredIncidents"
      @select="openEdit"
      @change-status="handleChangeStatus"
    />

    <IncidentFormModal
      :show="showForm"
      :incident="editing"
      :busy="store.loading"
      :zones="store.zones"
      :staff="store.staff"
      @save="handleSave"
      @close="showForm = false"
    />

    <Teleport to="body">
      <div v-if="selected" class="modal-backdrop" @click.self="selected = null">
        <div class="card modal-detail">
          <IncidentCard :incident="selected" />
          <button class="btn btn--ghost" @click="selected = null">Cerrar</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 7, 16, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-detail {
  width: 100%;
  max-width: 480px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-detail .btn {
  align-self: flex-end;
}
</style>