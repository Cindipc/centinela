<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { Incident, IncidentInput, IncidentPriority, IncidentType, Zone, Profile } from '@backend/types'

const props = defineProps<{
  show: boolean
  incident?: Incident | null
  busy?: boolean
  zones?: Zone[]
  staff?: Profile[]
}>()

const emit = defineEmits<{
  save: [data: IncidentInput, id?: string]
  close: []
}>()

const emptyForm = (): IncidentInput => ({
  title: '',
  description: '',
  type: 'seguridad',
  category: '',
  priority: 'medium',
  zone: '',
  assignedTo: '',
})

const form = reactive<IncidentInput & { id?: string }>(emptyForm())

watch(
  () => props.show,
  (isOpen) => {
    if (!isOpen) return
    const base = props.incident
    form.title = base?.title ?? ''
    form.description = base?.description ?? ''
    form.type = (base?.type as IncidentType) ?? 'seguridad'
    form.category = base?.category ?? ''
    form.priority = (base?.priority as IncidentPriority) ?? 'medium'
    form.zone = base?.zone ?? ''
    form.assignedTo = base?.assignedTo ?? ''
    form.id = base?.id
  }
)

function submit() {
  const { id, ...data } = form
  emit('save', { ...data }, id)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="modal-backdrop" @click.self="emit('close')">
        <form class="card modal" @submit.prevent="submit">
          <header class="modal__head">
            <h2>{{ incident ? 'Editar incidencia' : 'Nueva incidencia' }}</h2>
            <button type="button" class="modal__close" @click="emit('close')">✕</button>
          </header>

          <div class="modal__body">
            <label class="field">
              <span>Título</span>
              <input v-model.trim="form.title" required placeholder="Resumen del incidente" />
            </label>

            <label class="field">
              <span>Descripción</span>
              <textarea
                v-model.trim="form.description"
                rows="3"
                required
                placeholder="Detalles, personas involucradas, acciones tomadas..."
              ></textarea>
            </label>

            <div class="modal__grid">
              <label class="field">
                <span>Tipo</span>
                <select v-model="form.type" required>
                  <option value="seguridad">Seguridad</option>
                  <option value="equipo">Equipo</option>
                </select>
              </label>

              <label class="field">
                <span>Categoría</span>
                <input v-model.trim="form.category" placeholder="Ej. persona sospechosa" />
              </label>

              <label class="field">
                <span>Prioridad</span>
                <select v-model="form.priority" required>
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                  <option value="critical">Crítica</option>
                </select>
              </label>

              <label class="field">
                <span>Zona</span>
                <select v-model="form.zone">
                  <option value="">Seleccionar zona</option>
                  <option v-for="zone in zones" :key="zone.id" :value="zone.name">{{ zone.name }}</option>
                </select>
              </label>

              <label class="field">
                <span>Asignar a (opcional)</span>
                <select v-model="form.assignedTo">
                  <option value="">Sin asignar</option>
                  <option v-for="person in staff" :key="person.id" :value="person.id">{{ person.name }}</option>
                </select>
              </label>
            </div>
          </div>

          <footer class="modal__foot">
            <button type="button" class="btn btn--ghost" @click="emit('close')">Cancelar</button>
            <button type="submit" class="btn" :disabled="busy">
              {{ busy ? 'Guardando...' : 'Guardar' }}
            </button>
          </footer>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 7, 16, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 100;
}

.modal {
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  padding: 20px;
}

.modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.modal__head h2 {
  margin: 0;
  font-size: 18px;
}

.modal__close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 16px;
}

.modal__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal__grid {
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
  padding: 9px 12px;
  outline: none;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: var(--accent);
}

.modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.15s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>