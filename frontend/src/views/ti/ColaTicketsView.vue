<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useIncidentsStore } from '@/stores/incidents'
import { useAuth } from '@/composables/useAuth'
import { useIncidentQueue } from '@/composables/useIncidentQueue'
import IncidentQueue from '@/components/queues/IncidentQueue.vue'
import type { Incident } from '@backend/types'

const router = useRouter()
const store = useIncidentsStore()
const { user } = useAuth()

// Cola de TI: solo incidents.type = 'equipo' (RLS lo refuerza).
const { items, zoneFilter, statusFilter, hideClosed, pendingCount, inProgressCount, unassignedCount } =
  useIncidentQueue('equipo')

onMounted(() => {
  store.fetchIncidentsByType('equipo')
  store.fetchReferences()
  store.listenRealtime()
})

const mine = computed(
  () => user.value ? items.value.filter((i) => i.assignedTo === user.value!.id) : []
)

function open(incident: Incident) {
  router.push({ name: 'ti-ticket', params: { id: incident.id } })
}
</script>

<template>
  <div class="cola">
    <header class="page-header">
      <div>
        <h1>Cola de tickets</h1>
        <p class="text-muted">
          {{ pendingCount }} pendientes · {{ inProgressCount }} en proceso · {{ unassignedCount }} sin asignar
        </p>
      </div>
    </header>

    <section class="cola__mine">
      <h2>Asignados a mí ({{ mine.length }})</h2>
      <IncidentQueue
        v-if="mine.length > 0"
        v-model:zone-filter="zoneFilter"
        v-model:status-filter="statusFilter"
        v-model:hide-closed="hideClosed"
        :incidents="mine"
        :zones="store.zones"
        empty-label="No tienes tickets asignados."
        @select="open"
      />
      <p v-else class="text-muted cola__hint">Todavía no tienes tickets asignados.</p>
    </section>

    <section class="cola__all">
      <h2>Todos los tickets de equipo</h2>
      <IncidentQueue
        v-model:zone-filter="zoneFilter"
        v-model:status-filter="statusFilter"
        v-model:hide-closed="hideClosed"
        :incidents="items"
        :zones="store.zones"
        empty-label="No hay tickets de equipo con estos filtros."
        @select="open"
      />
    </section>
  </div>
</template>

<style scoped>
.cola {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 900px;
}

.cola h2 {
  font-size: 16px;
  margin: 0 0 10px;
}

.cola__hint {
  margin: 0;
  font-size: 13px;
}
</style>