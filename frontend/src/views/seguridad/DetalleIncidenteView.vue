<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useIncidentsStore } from '@/stores/incidents'
import IncidentSummary from '@/components/queues/IncidentSummary.vue'
import IncidentActions from '@/components/queues/IncidentActions.vue'
import { STATUS_LABELS } from '@/composables/useIncidentQueue'
import type { Incident, IncidentStatus } from '@backend/types'

const props = defineProps<{ id: string }>()

const router = useRouter()
const store = useIncidentsStore()
const saving = ref(false)
const error = ref<string | null>(null)

const incident = computed<Incident | null>(
  () => store.incidents.find((i) => i.id === props.id) ?? null
)

onMounted(async () => {
  store.fetchReferences()
  if (!incident.value) {
    await store.fetchIncidentsByType('seguridad')
  }
})

async function save(patch: { status?: IncidentStatus; resolutionNote?: string | null; assignedTo?: string | null }) {
  if (!incident.value) return
  error.value = null
  saving.value = true
  try {
    await store.update(incident.value.id, patch)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo guardar el cambio.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="detalle">
    <header class="page-header">
      <div>
        <button class="detalle__back" @click="router.push({ name: 'seguridad-cola' })">
          ← Cola de incidentes
        </button>
        <h1>Detalle del incidente</h1>
      </div>
      <span v-if="incident" class="badge" :class="`status--${incident.status}`">
        {{ STATUS_LABELS[incident.status] }}
      </span>
    </header>

    <p v-if="error" class="detalle__error">{{ error }}</p>

    <div v-if="incident" class="detalle__grid">
      <IncidentSummary :incident="incident" />
      <IncidentActions :incident="incident" :staff="store.staff" :busy="saving" @save="save" />
    </div>

    <div v-else-if="store.loading" class="text-muted">Cargando incidente...</div>
    <div v-else class="text-muted detalle__empty">No se encontró el incidente.</div>
  </div>
</template>

<style scoped>
.detalle {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 980px;
}

.detalle__back {
  background: none;
  border: none;
  color: var(--text-muted);
  padding: 0 0 6px;
  font-size: 13px;
}

.detalle__grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 16px;
  align-items: start;
}

.detalle__error {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
}

.detalle__empty {
  text-align: center;
  padding: 40px 0;
}

@media (max-width: 900px) {
  .detalle__grid {
    grid-template-columns: 1fr;
  }
}
</style>