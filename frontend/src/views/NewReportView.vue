<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useIncidentsStore } from '@/stores/incidents'
import type { IncidentInput } from '@backend/types'

const router = useRouter()
const store = useIncidentsStore()
const sending = ref(false)
const success = ref(false)

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

.form__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.form__success {
  background: rgba(46, 213, 115, 0.15);
  color: var(--success);
  border: 1px solid rgba(46, 213, 115, 0.4);
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 14px;
}

@media (max-width: 640px) {
  .form__grid {
    grid-template-columns: 1fr;
  }
}
</style>