<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Incident, IncidentStatus, Profile } from '@backend/types'
import { STATUS_LABELS } from '@/composables/useIncidentQueue'

const props = defineProps<{
  incident: Incident
  staff: Profile[]
  busy?: boolean
}>()

const emit = defineEmits<{
  save: [patch: { status?: IncidentStatus; resolutionNote?: string | null; assignedTo?: string | null }]
}>()

const status = ref<IncidentStatus>(props.incident.status)
const resolutionNote = ref(props.incident.resolutionNote ?? '')
const assignedTo = ref(props.incident.assignedTo ?? '')

watch(
  () => props.incident.id,
  () => {
    status.value = props.incident.status
    resolutionNote.value = props.incident.resolutionNote ?? ''
    assignedTo.value = props.incident.assignedTo ?? ''
  }
)

const NEXT_STATUS: Record<IncidentStatus, IncidentStatus> = {
  pendiente: 'en_proceso',
  en_proceso: 'resuelto',
  resuelto: 'resuelto',
  falsa_alarma: 'falsa_alarma',
}

const nextLabel = computed(() => `Marcar ${STATUS_LABELS[NEXT_STATUS[status.value]].toLowerCase()}`)

const dirty = computed(
  () =>
    status.value !== props.incident.status ||
    resolutionNote.value !== (props.incident.resolutionNote ?? '') ||
    assignedTo.value !== (props.incident.assignedTo ?? '')
)

function submit() {
  emit('save', {
    status: status.value,
    resolutionNote: resolutionNote.value.trim() || null,
    assignedTo: assignedTo.value || null,
  })
}
</script>

<template>
  <section class="card actions">
    <h3 class="actions__title">Gestión</h3>

    <div class="actions__row">
      <label class="field">
        <span>Estado</span>
        <select v-model="status">
          <option v-for="(label, value) in STATUS_LABELS" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>

      <label class="field">
        <span>Asignar a</span>
        <select v-model="assignedTo">
          <option value="">Sin asignar</option>
          <option v-for="person in staff" :key="person.id" :value="person.id">{{ person.name }}</option>
        </select>
      </label>
    </div>

    <label class="field">
      <span>Nota de resolución</span>
      <textarea
        v-model="resolutionNote"
        rows="3"
        placeholder="Qué se hizo, con qué resultado, si hace falta visita posterior..."
      ></textarea>
    </label>

    <div class="actions__foot">
      <button
        class="btn btn--ghost"
        :disabled="busy"
        @click="emit('save', { status: NEXT_STATUS[incident.status] })"
      >
        {{ nextLabel }}
      </button>
      <button class="btn" :disabled="busy || !dirty" @click="submit">
        {{ busy ? 'Guardando...' : 'Guardar cambios' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.actions {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.actions__title {
  margin: 0;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.actions__row {
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

.field select,
.field textarea {
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 10px 12px;
  outline: none;
}

.field select:focus,
.field textarea:focus {
  border-color: var(--accent);
}

.actions__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.actions__foot .btn {
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .actions__row {
    grid-template-columns: 1fr;
  }

  .actions__foot {
    flex-direction: column-reverse;
  }
}
</style>