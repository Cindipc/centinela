<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useIncidentsStore } from '@/stores/incidents'
import { getEquipmentItem } from '@backend/api/equipmentApi'
import IncidentSummary from '@/components/queues/IncidentSummary.vue'
import IncidentActions from '@/components/queues/IncidentActions.vue'
import { STATUS_LABELS } from '@/composables/useIncidentQueue'
import type { Equipment, EquipmentStatus, Incident, IncidentStatus } from '@backend/types'

const props = defineProps<{ id: string }>()

const router = useRouter()
const store = useIncidentsStore()
const equipment = ref<Equipment | null>(null)
const saving = ref(false)
const error = ref<string | null>(null)

const incident = computed<Incident | null>(
  () => store.incidents.find((i) => i.id === props.id) ?? null
)

/** Historial del mismo equipo: incidencias previas de tipo 'equipo'. */
const history = computed<Incident[]>(() => {
  const equipmentId = incident.value?.equipmentId
  if (!equipmentId) return []
  return store.incidents
    .filter((i) => i.equipmentId === equipmentId && i.id !== props.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
})

onMounted(async () => {
  store.fetchReferences()
  if (!incident.value) {
    await store.fetchIncidentsByType('equipo')
  }
  const equipmentId = incident.value?.equipmentId
  if (equipmentId) {
    try {
      equipment.value = await getEquipmentItem(equipmentId)
    } catch {
      equipment.value = null
    }
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

const equipmentStatusLabels: Record<EquipmentStatus, string> = {
  operativo: 'Operativo',
  en_reparacion: 'En reparación',
  caido: 'Caído',
  con_falla: 'Con falla',
}

const categoryLabels: Record<string, string> = {
  computo: 'Cómputo',
  red: 'Red',
  av: 'A/V',
  energia: 'Energía',
  cctv: 'CCTV',
  periferico: 'Periférico',
  otro: 'Otro',
}
</script>

<template>
  <div class="ticket">
    <header class="page-header">
      <div>
        <button class="ticket__back" @click="router.push({ name: 'ti-tickets' })">← Cola de tickets</button>
        <h1>Detalle del ticket</h1>
      </div>
      <span v-if="incident" class="badge" :class="`status--${incident.status}`">
        {{ STATUS_LABELS[incident.status] }}
      </span>
    </header>

    <p v-if="error" class="ticket__error">{{ error }}</p>

    <div v-if="incident" class="ticket__grid">
      <div class="ticket__main">
        <IncidentSummary :incident="incident" />
        <IncidentActions :incident="incident" :staff="store.staff" :busy="saving" @save="save" />
      </div>

      <aside class="ticket__side">
        <section class="card ticket__card">
          <h2 class="ticket__card-title">Equipo vinculado</h2>
          <template v-if="equipment">
            <dl class="ticket__data">
              <div>
                <dt>Nombre</dt>
                <dd>{{ equipment.name }}</dd>
              </div>
              <div>
                <dt>Categoría</dt>
                <dd>{{ categoryLabels[equipment.category] ?? equipment.category }}</dd>
              </div>
              <div>
                <dt>Serie</dt>
                <dd class="ticket__serial">{{ equipment.serialNumber ?? '—' }}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>
                  <span class="badge" :class="`status--${equipment.status}`">
                    {{ equipmentStatusLabels[equipment.status] }}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Zona</dt>
                <dd>{{ equipment.zone ?? '—' }}</dd>
              </div>
              <div>
                <dt>Asignado a</dt>
                <dd>{{ equipment.assignedToName ?? '—' }}</dd>
              </div>
            </dl>
          </template>
          <p v-else class="text-muted ticket__hint">
            {{ incident.equipmentId ? 'No se pudo cargar el equipo.' : 'Este ticket no está asociado a un equipo del inventario.' }}
          </p>
        </section>

        <section class="card ticket__card">
          <h2 class="ticket__card-title">Incidencias previas del equipo ({{ history.length }})</h2>
          <ul v-if="history.length > 0" class="ticket__history">
            <li v-for="item in history" :key="item.id" class="ticket__history-item">
              <button class="ticket__history-btn" @click="router.push({ name: 'ti-ticket', params: { id: item.id } })">
                <span class="ticket__history-title">{{ item.title }}</span>
                <span class="text-muted">
                  {{ item.code }} · {{ STATUS_LABELS[item.status] }} ·
                  {{ new Date(item.createdAt).toLocaleDateString('es-ES') }}
                </span>
              </button>
            </li>
          </ul>
          <p v-else class="text-muted ticket__hint">Sin incidencias previas para este equipo.</p>
        </section>
      </aside>
    </div>

    <div v-else-if="store.loading" class="text-muted">Cargando ticket...</div>
    <div v-else class="text-muted ticket__empty">No se encontró el ticket.</div>
  </div>
</template>

<style scoped>
.ticket {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1080px;
}

.ticket__back {
  background: none;
  border: none;
  color: var(--text-muted);
  padding: 0 0 6px;
  font-size: 13px;
}

.ticket__grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 16px;
  align-items: start;
}

.ticket__main,
.ticket__side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ticket__card {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ticket__card-title {
  margin: 0;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.ticket__data {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.ticket__data dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--text-muted);
}

.ticket__data dd {
  margin: 2px 0 0;
  font-size: 14px;
}

.ticket__serial {
  font-family: monospace;
  font-size: 13px;
}

.ticket__history {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ticket__history-btn {
  width: 100%;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 13px;
}

.ticket__history-btn:hover {
  border-color: var(--accent);
}

.ticket__history-title {
  font-weight: 600;
}

.ticket__hint {
  margin: 0;
  font-size: 13px;
}

.ticket__error {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
}

.ticket__empty {
  text-align: center;
  padding: 40px 0;
}

@media (max-width: 900px) {
  .ticket__grid {
    grid-template-columns: 1fr;
  }
}
</style>