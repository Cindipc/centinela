<script setup lang="ts">
import { computed, reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useIncidentsStore } from '@/stores/incidents'
import { useIncidentAi } from '@/composables/useIncidentAi'
import type { IncidentInput } from '@backend/types'

const router = useRouter()
const store = useIncidentsStore()
const sending = ref(false)
const success = ref(false)
const {
  configured: aiConfigured,
  analyzing: aiAnalyzing,
  error: aiError,
  suggestion: aiSuggestion,
  duplicates: aiDuplicates,
  analyze: analyzeWithAi,
  reset: resetAi,
} = useIncidentAi()

const form = reactive<IncidentInput>({
  title: '',
  description: '',
  type: 'seguridad',
  category: '',
  priority: 'medium',
  zone: '',
  assignedTo: '',
})

onMounted(() => {
  store.fetchReferences()
})

const selectedZoneId = computed(
  () => store.zones.find((zone) => zone.name === form.zone)?.id ?? null
)

function runAi() {
  resetAi()
  void analyzeWithAi({
    type: form.type,
    title: form.title,
    description: form.description,
    zone: form.zone,
    zoneId: selectedZoneId.value,
  })
}

function applySuggestion() {
  if (!aiSuggestion.value) return
  form.category = aiSuggestion.value.category
  form.priority = aiSuggestion.value.priority
}

async function submit() {
  sending.value = true
  try {
    await store.addIncident(form)
    success.value = true
    setTimeout(() => router.push({ name: 'incidents' }), 1200)
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <h1>Nuevo reporte</h1>
        <p class="text-muted">Registra una nueva incidencia en el campus</p>
      </div>
    </header>

    <form class="card form" @submit.prevent="submit">
      <div v-if="success" class="form__success">
        ✓ Incidencia registrada correctamente. Redirigiendo...
      </div>

      <div class="field">
        <span>Título</span>
        <input v-model.trim="form.title" required placeholder="Ej. Acceso no autorizado al edificio B" />
      </div>

      <div class="field">
        <span>Descripción</span>
        <textarea
          v-model.trim="form.description"
          rows="4"
          required
          placeholder="Describe qué ocurrió, cuándo y dónde..."
        ></textarea>
      </div>

      <div class="form__grid">
        <div class="field">
          <span>Tipo</span>
          <select v-model="form.type" required>
            <option value="seguridad">Seguridad</option>
            <option value="equipo">Equipo</option>
          </select>
        </div>

        <div class="field">
          <span>Categoría</span>
          <input v-model.trim="form.category" placeholder="Ej. persona sospechosa, laptop dañada" />
        </div>

        <div class="field">
          <span>Prioridad</span>
          <select v-model="form.priority" required>
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
            <option value="critical">Crítica</option>
          </select>
        </div>

        <div class="field">
          <span>Zona</span>
          <select v-model="form.zone" required>
            <option disabled value="">Seleccionar zona</option>
            <option v-for="zone in store.zones" :key="zone.id" :value="zone.name">{{ zone.name }}</option>
          </select>
        </div>

        <div class="field">
          <span>Asignar a (opcional)</span>
          <select v-model="form.assignedTo">
            <option value="">Sin asignar</option>
            <option v-for="person in store.staff" :key="person.id" :value="person.id">{{ person.name }}</option>
          </select>
        </div>
      </div>

      <section v-if="aiConfigured" class="ai-panel">
        <div class="ai-panel__head">
          <div>
            <strong>Asistente de IA</strong>
            <p class="text-muted">Sugiere categoría y prioridad, y busca posibles duplicados.</p>
          </div>
          <button type="button" class="btn btn--ghost btn--small" :disabled="aiAnalyzing" @click="runAi">
            {{ aiAnalyzing ? 'Analizando...' : 'Analizar reporte' }}
          </button>
        </div>
        <p v-if="aiError" class="ai-panel__error">{{ aiError }}</p>

        <div v-if="aiSuggestion" class="ai-panel__result">
          <p>
            <strong>{{ aiSuggestion.category }}</strong> · prioridad {{ aiSuggestion.priority }}
            · {{ Math.round(aiSuggestion.confidence * 100) }}% confianza
          </p>
          <p class="text-muted">{{ aiSuggestion.summary }}</p>
          <ul>
            <li v-for="action in aiSuggestion.recommendedActions" :key="action">{{ action }}</li>
          </ul>
          <button type="button" class="btn btn--ghost btn--small" @click="applySuggestion">
            Usar categoría y prioridad sugeridas
          </button>
        </div>

        <div v-if="aiDuplicates?.likelyDuplicate" class="ai-panel__duplicates">
          <strong>Posibles duplicados</strong>
          <ul>
            <li v-for="candidate in aiDuplicates.candidates" :key="candidate.incidentId">
              {{ candidate.code }} · {{ candidate.title }} ({{ Math.round(candidate.similarity * 100) }}%)
            </li>
          </ul>
          <p class="text-muted">Revisa antes de registrar; puedes continuar si es distinto.</p>
        </div>
      </section>

      <footer class="form__foot">
        <button type="button" class="btn btn--ghost" @click="router.back()">Cancelar</button>
        <button type="submit" class="btn" :disabled="sending">
          {{ sending ? 'Enviando...' : 'Registrar incidencia' }}
        </button>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.form {
  max-width: 640px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.field input,
.field select,
.field textarea {
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 10px;
  color: var(--text);
  padding: 10px 12px;
  outline: none;
  text-transform: none;
  letter-spacing: normal;
  font-size: 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(47, 224, 234, 0.16), 0 0 18px rgba(47, 224, 234, 0.22);
}

.form__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.form__success {
  background: var(--success-soft);
  color: var(--success);
  border: 1px solid rgba(85, 224, 176, 0.4);
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 14px;
}

.ai-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  background: var(--bg-raised);
}

.ai-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ai-panel__head p {
  margin: 2px 0 0;
  font-size: 12px;
}

.ai-panel__result,
.ai-panel__duplicates {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.ai-panel__result p,
.ai-panel__duplicates p {
  margin: 0;
}

.ai-panel__result ul,
.ai-panel__duplicates ul {
  margin: 0;
  padding-left: 18px;
}

.ai-panel__error {
  color: var(--danger);
  margin: 0;
  font-size: 13px;
}

@media (max-width: 640px) {
  .ai-panel__head {
    flex-direction: column;
  }
}

@media (max-width: 640px) {
  .form__grid {
    grid-template-columns: 1fr;
  }
}
</style>