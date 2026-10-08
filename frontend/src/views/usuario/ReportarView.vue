<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useIncidentsStore } from '@/stores/incidents'
import type { IncidentInput, IncidentPriority, IncidentType } from '@backend/types'

const router = useRouter()
const store = useIncidentsStore()

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

onMounted(() => {
  store.fetchReferences()
})

function onTypeChange() {
  form.category = ''
}

function onPhoto(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  photo.value = file
  photoPreview.value = file ? URL.createObjectURL(file) : null
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
          <span class="type__icon">🛡️</span>
          <span class="type__label">Seguridad</span>
        </label>
        <label class="type" :class="{ 'type--active': form.type === 'equipo' }">
          <input v-model="form.type" type="radio" value="equipo" @change="onTypeChange" />
          <span class="type__icon">🧰</span>
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
}

.type--active {
  border-color: var(--accent);
  background: rgba(47, 125, 255, 0.12);
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
  font-size: 13px;
  color: var(--text-muted);
}

.field input,
.field select,
.field textarea {
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 10px 12px;
  outline: none;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: var(--accent);
}

.report__preview {
  max-width: 220px;
  border-radius: 8px;
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
  border-radius: 8px;
  background: rgba(46, 213, 115, 0.15);
  border: 1px solid rgba(46, 213, 115, 0.4);
  color: var(--success);
  font-size: 14px;
}

.report__error {
  margin: 0;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(255, 71, 87, 0.12);
  border: 1px solid rgba(255, 71, 87, 0.4);
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