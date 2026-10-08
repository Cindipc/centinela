<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useIncidentsStore } from '@/stores/incidents'
import { useEmergencyStore } from '@/stores/emergency'
import { useAuth } from '@/composables/useAuth'
import { ageLabel } from '@/composables/useIncidentQueue'
import type { Incident } from '@backend/types'

const store = useIncidentsStore()
const emergency = useEmergencyStore()
const { user } = useAuth()
const router = useRouter()

onMounted(() => {
  store.fetchIncidents()
  store.fetchReferences()
  emergency.fetchPanics()
})

/** Feed de solo lectura: RLS ya deja ver al empleado sus propios reportes. */
const feed = computed<Incident[]>(() =>
  [...store.myIncidents].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
)

const openMine = computed(
  () => feed.value.filter((i) => i.status === 'pendiente' || i.status === 'en_proceso').length
)

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
})
</script>

<template>
  <div class="inicio">
    <header class="page-header">
      <div>
        <h1>{{ greeting }}, {{ user?.name?.split(' ')[0] }}</h1>
        <p class="text-muted">
          {{ openMine }} de tus reportes siguen abiertos · {{ emergency.activePanics.length }} alertas de pánico activas
        </p>
      </div>
      <div class="page-header__actions">
        <button class="btn inicio__cta" @click="router.push({ path: '/reportar' })">➕ Reportar</button>
      </div>
    </header>

    <section v-if="emergency.activePanics.length > 0" class="card inicio__panic">
      <strong>Tu alerta de pánico está activa.</strong>
      <span class="text-muted"> Seguridad fue notificado. Si ya te ayudaron, puedes cancelarla desde Perfil.</span>
    </section>

<section class="inicio__block">
      <h2>Incidencias en tu zona</h2>
      <p class="text-muted inicio__hint">Feed de solo lectura con lo que tu rol puede ver.</p>
      <div v-if="store.loading" class="text-muted">Cargando...</div>

      <div class="inicio__grid">
        <article
          v-for="incident in feed"
          :key="incident.id"
          class="card feed"
          :class="{ 'feed--open': incident.status === 'pendiente' || incident.status === 'en_proceso' }"
        >
          <div class="feed__head">
            <span class="badge" :class="`status--${incident.status}`">{{ incident.status }}</span>
            <span class="text-muted feed__age">{{ ageLabel(incident.createdAt) }}</span>
          </div>
          <h3 class="feed__title">{{ incident.title }}</h3>
          <p class="feed__desc text-muted">{{ incident.description ?? 'Sin descripción.' }}</p>
          <div class="feed__foot">
            <span class="text-muted">{{ incident.zone ?? 'Sin zona' }}</span>
            <span v-if="incident.assignedToName" class="text-muted">Atiende: {{ incident.assignedToName }}</span>
          </div>
        </article>

        <div v-if="feed.length === 0 && !store.loading" class="text-muted inicio__empty">
          Todavía no hay incidencias que mostrar. Usa el botón para reportar una.
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.inicio {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.inicio__cta {
  font-size: 15px;
  padding: 11px 20px;
}

.inicio__hint {
  margin: -6px 0 12px;
  font-size: 12px;
}

.inicio__panic {
  padding: 14px 16px;
  font-size: 14px;
  border-color: rgba(255, 71, 87, 0.45);
  background: rgba(255, 71, 87, 0.08);
}

.inicio__block h2 {
  font-size: 18px;
  margin: 0 0 12px;
}

.inicio__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.feed {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.feed--open {
  border-left: 3px solid var(--accent);
}

.feed__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.feed__age {
  font-size: 12px;
}

.feed__title {
  margin: 0;
  font-size: 16px;
}

.feed__desc {
  margin: 0;
  font-size: 13px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.feed__foot {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.inicio__empty {
  grid-column: 1 / -1;
  text-align: center;
  padding: 36px 0;
}
</style>