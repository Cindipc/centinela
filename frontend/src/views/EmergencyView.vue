<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useIncidentsStore } from '@/stores/incidents'
import IncidentCard from '@/components/incidents/IncidentCard.vue'

const router = useRouter()

const store = useIncidentsStore()

onMounted(() => {
  store.fetchIncidents()
})

const critical = computed(() =>
  store.incidents.filter(
    (i) =>
      i.priority === 'critical' &&
      i.status !== 'resuelto' &&
      i.status !== 'falsa_alarma'
  )
)

const lastUpdated = computed(() => {
  if (critical.value.length === 0) return '—'
  const mostRecent = critical.value.reduce((max, i) => (i.updatedAt > max.updatedAt ? i : max))
  return new Date(mostRecent.updatedAt).toLocaleTimeString('es-ES')
})

const protocols = [
  { title: 'Protocolo de evacuación', detail: 'Reunión en punto de encuentro norte. Verificar conteo de personal.', action: 'Descargar plan' },
  { title: 'Línea directa de emergencia', detail: 'Contactar con la central al 105 y con seguridad del campus al ext. 4567.', action: 'Llamar' },
  { title: 'Kit de primeros auxilios', detail: 'Ubicado en recepción del edificio A y en garita 2.', action: 'Ver ubicación' },
]
</script>

<template>
  <div class="emergency">
    <header class="page-header">
      <div>
        <h1>Emergencia</h1>
        <p class="text-muted">Protocolos y situaciones críticas activas</p>
      </div>
      <div class="emergency__clock">
        Última actualización crítica: {{ lastUpdated }}
      </div>
    </header>

    <section class="emergency__sos" :class="{ 'emergency__sos--empty': critical.length === 0 }">
      <button class="emergency__button" @click="router.push({ name: 'new-report' })">
        <span class="emergency__button-icon">🆘</span>
        <span>Alerta de emergencia</span>
      </button>
      <p class="text-muted">
        {{ critical.length === 0 ? 'No hay emergencias activas' : `${critical.length} emergencia${critical.length > 1 ? 's' : ''} en curso` }}
      </p>
    </section>

    <section v-if="critical.length > 0" class="emergency__list">
      <h2>Emergencias críticas</h2>
      <div class="emergency__grid">
        <IncidentCard v-for="inc in critical" :key="inc.id" :incident="inc" />
      </div>
    </section>

    <section class="emergency__protocols">
      <h2>Protocolos</h2>
      <div class="protocols">
        <div v-for="p in protocols" :key="p.title" class="card protocol">
          <h3>{{ p.title }}</h3>
          <p>{{ p.detail }}</p>
          <button class="btn btn--ghost">{{ p.action }}</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.emergency {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.emergency__clock {
  font-size: 13px;
  color: var(--text-muted);
}

.emergency__sos {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 18px;
  border-radius: var(--radius);
  background: rgba(255, 71, 87, 0.1);
  border: 1px solid rgba(255, 71, 87, 0.4);
}

.emergency__sos--empty {
  background: var(--bg-card);
  border-color: var(--border);
}

.emergency__button {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--danger);
  color: #fff;
  border: none;
  border-radius: 12px;
  padding: 14px 22px;
  font-size: 16px;
  font-weight: 700;
  animation: sosPulse 1.4s infinite;
}

.emergency__button-icon {
  font-size: 24px;
}

@keyframes sosPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.5); }
  50% { box-shadow: 0 0 0 12px rgba(255, 71, 87, 0); }
}

.emergency__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.emergency h2 {
  font-size: 18px;
  margin: 0 0 12px;
}

.protocols {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.protocol {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.protocol h3 {
  margin: 0;
  font-size: 15px;
}

.protocol p {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  flex: 1;
}

.protocol .btn {
  align-self: flex-start;
}
</style>