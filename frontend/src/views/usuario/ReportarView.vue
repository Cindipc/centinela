<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useIncidentsStore } from '@/stores/incidents'
import { useIncidentAi } from '@/composables/useIncidentAi'
import { analyzeIncidentImage } from '@backend/api/aiApi'
import { compressImageFile } from '@/utils/imageFile'
import type { ImageAnalysis, IncidentInput, IncidentPriority, IncidentType } from '@backend/types'

const router = useRouter()
const store = useIncidentsStore()
const {
  configured: aiConfigured,
  analyzing: aiAnalyzing,
  error: aiError,
  suggestion: aiSuggestion,
  duplicates: aiDuplicates,
  analyze: analyzeWithAi,
  reset: resetAi,
} = useIncidentAi()

const CATEGORIES: Record<IncidentType, string[]> = {
  seguridad: [
    'Persona sospechosa',
    'Acceso no autorizado',
    'Accidente',
    'Robo',
    'Vandalismo',
    'Otro',
  ],
  equipo: [
    'Laptop / computador',
    'Red / internet',
    'Proyector / audio',
    'Impresora',
    'Energía / UPS',
    'Otro',
  ],
}

const PRIORITY_LABELS: Record<IncidentPriority, string> = {
  low: 'Baja — no urgente',
  medium: 'Media — afecta el trabajo',
  high: 'Alta — me bloquea',
  critical: 'Crítica — riesgo de seguridad',
}

const form = reactive<IncidentInput>({
  type: 'seguridad',
  category: '',
  title: '',
  description: '',
  zone: '',
  priority: 'medium',
})

const photo = ref<File | null>(null)
const photoPreview = ref<string | null>(null)
const sending = ref(false)
const error = ref<string | null>(null)
const sent = ref(false)
const analyzingPhoto = ref(false)
const photoError = ref<string | null>(null)
const photoAnalysis = ref<ImageAnalysis | null>(null)

const selectedZoneId = computed(
  () => store.zones.find((zone) => zone.name === form.zone)?.id ?? null
)

onMounted(() => {
  store.fetchReferences()
})

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

async function analyzePhoto() {
  if (!photo.value) return
  analyzingPhoto.value = true
  photoError.value = null
  photoAnalysis.value = null
  try {
    const image = await compressImageFile(photo.value)
    const result = await analyzeIncidentImage({
      type: form.type,
      imageBase64: image.base64,
      mediaType: image.mediaType,
      description: form.description,
    })
    photoAnalysis.value = result
    if (result.source === 'unavailable') {
      photoError.value =
        'El modelo de visión no está configurado. Puedes continuar sin el análisis de la foto.'
    }
  } catch (e) {
    photoError.value =
      e instanceof Error ? e.message : 'No se pudo analizar la imagen.'
  } finally {
    analyzingPhoto.value = false
  }
}

function applyPhotoSuggestion() {
  if (!photoAnalysis.value) return
  form.category = photoAnalysis.value.category
  form.priority = photoAnalysis.value.priority
}

function onTypeChange() {
  form.category = ''
}

function onPhoto(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  photo.value = file
  photoPreview.value = file ? URL.createObjectURL(file) : null
  photoAnalysis.value = null
  photoError.value = null
}

/** La ubicación del reporte es opcional: no bloquea el envío si el permiso se deniega. */
function currentPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ coords: position.coords } as GeolocationPosition),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60000 }
    )
  })
}

async function submit() {
  error.value = null
  sent.value = false
  sending.value = true
  try {
    const position = await currentPosition()
    const photoUrl = photo.value ? await store.attachPhoto(photo.value) : undefined
    await store.addIncident({
      ...form,
      photoUrl,
      location: position ? { lat: position.coords.latitude, lng: position.coords.longitude } : null,
    })
    sent.value = true
    setTimeout(() => router.push({ path: '/mis-reportes' }), 1100)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo registrar el reporte.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <h1>Reportar</h1>
        <p class="text-muted">Seguridad o equipo: elige el tipo y describe qué ocurrió.</p>
      </div>
    </header>

    <form class="card report" @submit.prevent="submit">
      <p v-if="sent" class="report__ok">✓ Reporte registrado. Redirigiendo a tus reportes...</p>
      <p v-if="error" class="report__error">{{ error }}</p>

      <div class="report__types">
        <label class="type" :class="{ 'type--active': form.type === 'seguridad' }">
          <input v-model="form.type" type="radio" value="seguridad" @change="onTypeChange" />
          <span class="type__icon"></span>
          <span class="type__label">Seguridad</span>
        </label>
        <label class="type" :class="{ 'type--active': form.type === 'equipo' }">
          <input v-model="form.type" type="radio" value="equipo" @change="onTypeChange" />
          <span class="type__icon"></span>
          <span class="type__label">Equipo</span>
        </label>
      </div>

      <label class="field">
        <span>¿Qué ocurrió?</span>
        <input v-model.trim="form.title" required maxlength="120" placeholder="Resumen breve" />
      </label>

      <label class="field">
        <span>Descripción</span>
        <textarea
          v-model.trim="form.description"
          rows="4"
          required
          placeholder="Detalla qué viste, cuándo y quién estaba involved..."
        ></textarea>
      </label>

      <div class="report__grid">
        <label class="field">
          <span>Categoría</span>
          <select v-model="form.category" required>
            <option disabled value="">Seleccionar</option>
            <option v-for="option in CATEGORIES[form.type]" :key="option" :value="option">
              {{ option }}
            </option>
            <option
              v-if="form.category && !CATEGORIES[form.type].includes(form.category)"
              :value="form.category"
            >
              {{ form.category }} (sugerida por IA)
            </option>
          </select>
        </label>

        <label class="field">
          <span>Zona</span>
          <select v-model="form.zone" required>
            <option disabled value="">Seleccionar zona</option>
            <option v-for="zone in store.zones" :key="zone.id" :value="zone.name">{{ zone.name }}</option>
          </select>
        </label>
      </div>

      <label class="field">
        <span>Prioridad percibida</span>
        <select v-model="form.priority" required>
          <option v-for="(label, value) in PRIORITY_LABELS" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>

      <label class="field">
        <span>Foto (opcional)</span>
        <input type="file" accept="image/*" capture="environment" @change="onPhoto" />
      </label>

      <img v-if="photoPreview" :src="photoPreview" alt="Vista previa" class="report__preview" />

      <section v-if="aiConfigured && photo" class="ai-panel">
        <div class="ai-panel__head">
          <div>
            <strong>Análisis de la foto (opcional)</strong>
            <p class="text-muted">Describe solo lo visible. No identifica personas.</p>
          </div>
          <button
            type="button"
            class="btn btn--ghost btn--small"
            :disabled="analyzingPhoto"
            @click="analyzePhoto"
          >
            {{ analyzingPhoto ? 'Analizando...' : 'Analizar foto' }}
          </button>
        </div>
        <p v-if="photoError" class="ai-panel__error">{{ photoError }}</p>
        <div v-if="photoAnalysis" class="ai-panel__result">
          <p>
            <strong>{{ photoAnalysis.category }}</strong> · prioridad
            {{ photoAnalysis.priority }} · {{ Math.round(photoAnalysis.confidence * 100) }}%
            confianza
          </p>
          <ul>
            <li v-for="item in photoAnalysis.observations" :key="item">{{ item }}</li>
          </ul>
          <ul v-if="photoAnalysis.safetyConcerns.length" class="ai-panel__risk">
            <li v-for="item in photoAnalysis.safetyConcerns" :key="item">{{ item }}</li>
          </ul>
          <button
            v-if="photoAnalysis.source === 'ollama'"
            type="button"
            class="btn btn--ghost btn--small"
            @click="applyPhotoSuggestion"
          >
            Usar sugerencia de la foto
          </button>
        </div>
      </section>

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

      <footer class="report__foot">
        <button type="button" class="btn btn--ghost" @click="router.back()">Cancelar</button>
        <button type="submit" class="btn" :disabled="sending">
          {{ sending ? 'Enviando...' : 'Enviar reporte' }}
        </button>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.report {
  max-width: 640px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.report__types {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.type {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-raised);
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}

.type--active {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: 0 0 18px rgba(47, 224, 234, 0.22);
}

.type input {
  accent-color: var(--accent);
}

.type__icon {
  font-size: 20px;
}

.type__label {
  font-weight: 600;
  font-size: 14px;
}

.report__grid {
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

.report__preview {
  max-width: 220px;
  border-radius: 10px;
  border: 1px solid var(--border);
  align-self: flex-start;
}

.report__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.report__ok {
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--success-soft);
  border: 1px solid rgba(85, 224, 176, 0.4);
  color: var(--success);
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

.ai-panel__risk {
  color: var(--danger);
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

.report__error {
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--danger-soft);
  border: 1px solid rgba(255, 122, 136, 0.4);
  color: var(--danger);
  font-size: 14px;
}

@media (max-width: 640px) {
  .report__grid,
  .report__types {
    grid-template-columns: 1fr;
  }
}
</style>