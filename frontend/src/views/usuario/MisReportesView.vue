<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useIncidentsStore } from '@/stores/incidents'
import { ageLabel } from '@/composables/useIncidentQueue'

const store = useIncidentsStore()
const router = useRouter()

onMounted(() => {
  store.fetchIncidents()
})

const mine = computed(() =>
  [...store.myIncidents].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
)

const open = computed(
  () => mine.value.filter((i) => i.status === 'pendiente' || i.status === 'en_proceso').length
)

const CLOSED_STATUSES = ['resuelto', 'falsa_alarma'] as const

const closed = computed(() => mine.value.filter((i) => (CLOSED_STATUSES as readonly string[]).includes(i.status)))

const typeLabels: Record<string, string> = { seguridad: 'Seguridad', equipo: 'Equipo' }
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <h1>Mis reportes</h1>
        <p class="text-muted">{{ open }} abiertos · {{ closed.length }} cerrados</p>
      </div>
      <div class="page-header__actions">
        <button class="btn" @click="router.push({ path: '/reportar' })">➕ Nuevo reporte</button>
      </div>
    </header>

    <div v-if="store.loading" class="text-muted">Cargando tus reportes...</div>

    <div v-else class="reports">
      <article v-for="incident in mine" :key="incident.id" class="card report-item">
        <div class="report-item__head">
          <div>
            <h3 class="report-item__title">{{ incident.title }}</h3>
            <span class="text-muted report-item__meta">
              {{ incident.code }} · {{ typeLabels[incident.type] }} · {{ ageLabel(incident.createdAt) }}
            </span>
          </div>
          <div class="report-item__badges">
            <span class="badge" :class="`priority--${incident.priority}`">{{ incident.priority }}</span>
            <span class="badge" :class="`status--${incident.status}`">{{ incident.status }}</span>
          </div>
        </div>

        <p class="report-item__desc text-muted">{{ incident.description ?? 'Sin descripción.' }}</p>

        <div v-if="incident.photoUrl" class="report-item__photo-row">
          <img :src="incident.photoUrl" :alt="incident.title" class="report-item__photo" />
        </div>

        <footer class="report-item__foot text-muted">
          <span>{{ incident.zone ?? 'Sin zona' }}</span>
          <span v-if="incident.assignedToName">Atiende: {{ incident.assignedToName }}</span>
          <span v-else-if="incident.status === 'pendiente'">Esperando asignación</span>
        </footer>

        <p v-if="incident.resolutionNote" class="report-item__resolution">
          <strong>Respuesta:</strong> {{ incident.resolutionNote }}
        </p>
      </article>

      <div v-if="mine.length === 0 && !store.loading" class="text-muted reports__empty">
        Todavía no has reportado ninguna incidencia.
      </div>
    </div>
  </div>
</template>

<style scoped>
.reports {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.report-item {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.report-item__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.report-item__title {
  margin: 0;
  font-size: 16px;
}

.report-item__meta {
  font-size: 12px;
}

.report-item__badges {
  display: flex;
  gap: 8px;
}

.report-item__desc {
  margin: 0;
  font-size: 13px;
}

.report-item__photo {
  width: 120px;
  height: 90px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.report-item__foot {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}

.report-item__resolution {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(46, 213, 115, 0.1);
  border: 1px solid rgba(46, 213, 115, 0.3);
  font-size: 13px;
}

.reports__empty {
  text-align: center;
  padding: 40px 0;
}
</style>