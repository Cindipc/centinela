<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { STATUS_LABELS, ageLabel } from '@/composables/useIncidentQueue'
import type { Incident, IncidentStatus, Profile } from '@backend/types'

const props = defineProps<{
  incident: Incident | null
  /** Lista del personal para asignación (solo admin). */
  staff?: Profile[]
  /** Cambiar estado desde el cajón (admin; TI en incidencias de equipo). */
  allowStatusChange?: boolean
  /** Asignar a otro miembro del personal (admin). */
  allowAssign?: boolean
  /** Autoasignarse la incidencia (TI en incidencias de equipo). */
  allowSelfAssign?: boolean
  /** Enlace a la ficha completa solo si el rol puede abrir esa ruta. */
  detailLink?: 'seguridad' | 'ti' | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update-status', status: IncidentStatus): void
  (e: 'assign', profileId: string): void
  (e: 'self-assign'): void
}>()

const typeLabels: Record<Incident['type'], string> = {
  seguridad: 'Seguridad',
  equipo: 'Equipo / TI',
}

const selectedStatus = ref<IncidentStatus>('pendiente')
const selectedAssignee = ref('')

watch(
  () => props.incident,
  (incident) => {
    selectedStatus.value = incident?.status ?? 'pendiente'
    selectedAssignee.value = ''
  },
  { immediate: true }
)

const fecha = computed(() => {
  if (!props.incident) return ''
  return new Date(props.incident.createdAt).toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
})

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.incident) emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

watch(
  () => props.incident?.id,
  (id) => {
    if (!id) return
    const panel = document.querySelector<HTMLElement>('.drawer')
    panel?.focus()
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="incident" class="drawer-backdrop" @click.self="emit('close')">
        <aside
          class="drawer card"
          role="dialog"
          aria-modal="true"
          :aria-label="`Detalle de ${incident.code}`"
          tabindex="-1"
        >
          <header class="drawer__head">
            <div class="drawer__headings">
              <span class="drawer__code">{{ incident.code }}</span>
              <h2>{{ incident.title }}</h2>
            </div>
            <button class="drawer__close" type="button" aria-label="Cerrar detalle" @click="emit('close')">
              ✕
            </button>
          </header>

          <div class="drawer__badges">
            <span class="badge" :class="`priority--${incident.priority}`">{{ incident.priority }}</span>
            <span class="badge" :class="`status--${incident.status}`">
              {{ STATUS_LABELS[incident.status] }}
            </span>
            <span class="badge drawer__type">{{ typeLabels[incident.type] }}</span>
          </div>

          <img v-if="incident.photoUrl" class="drawer__photo" :src="incident.photoUrl" :alt="`Foto de ${incident.code}`" />

          <p v-if="incident.description" class="drawer__desc">{{ incident.description }}</p>
          <p v-else class="text-muted drawer__desc">Sin descripción.</p>

          <dl class="drawer__meta">
            <div>
              <dt>Zona</dt>
              <dd>{{ incident.zone ?? 'Sin zona asignada' }}</dd>
            </div>
            <div>
              <dt>Reportó</dt>
              <dd>{{ incident.reportedByName ?? 'Anónimo' }}</dd>
            </div>
            <div>
              <dt>Asignada a</dt>
              <dd>{{ incident.assignedToName ?? 'Sin asignar' }}</dd>
            </div>
            <div>
              <dt>Registrada</dt>
              <dd>{{ fecha }} · {{ ageLabel(incident.createdAt) }}</dd>
            </div>
            <div v-if="incident.location">
              <dt>Coordenadas</dt>
              <dd>{{ incident.location.lat.toFixed(5) }}, {{ incident.location.lng.toFixed(5) }}</dd>
            </div>
          </dl>

          <section
            v-if="allowStatusChange || allowAssign || allowSelfAssign"
            class="drawer__actions"
            aria-label="Acciones sobre la incidencia"
          >
            <div v-if="allowStatusChange" class="drawer__field">
              <label :for="`drawer-status-${incident.id}`">Estado</label>
              <select
                :id="`drawer-status-${incident.id}`"
                v-model="selectedStatus"
                @change="emit('update-status', selectedStatus)"
              >
                <option value="pendiente">Pendiente</option>
                <option value="en_proceso">En proceso</option>
                <option value="resuelto">Resuelto</option>
                <option value="falsa_alarma">Falsa alarma</option>
              </select>
            </div>

            <div v-if="allowAssign" class="drawer__field">
              <label :for="`drawer-assign-${incident.id}`">Asignar a</label>
              <select
                :id="`drawer-assign-${incident.id}`"
                v-model="selectedAssignee"
                @change="selectedAssignee && emit('assign', selectedAssignee)"
              >
                <option value="">Sin asignar</option>
                <option v-for="person in staff" :key="person.id" :value="person.id">
                  {{ person.name }}
                </option>
              </select>
            </div>

            <button
              v-if="allowSelfAssign"
              class="btn btn--ghost"
              type="button"
              @click="emit('self-assign')"
            >
              Asignarme
            </button>
          </section>

          <footer class="drawer__footer">
            <router-link
              v-if="detailLink === 'seguridad'"
              class="btn btn--ghost"
              :to="{ name: 'seguridad-detalle', params: { id: incident.id } }"
            >
              Abrir ficha
            </router-link>
            <router-link
              v-else-if="detailLink === 'ti'"
              class="btn btn--ghost"
              :to="{ name: 'ti-ticket', params: { id: incident.id } }"
            >
              Abrir ticket
            </router-link>
            <button class="btn" type="button" @click="emit('close')">Cerrar</button>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: var(--overlay);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: flex-end;
}

.drawer {
  width: min(420px, 100%);
  height: 100%;
  overflow-y: auto;
  padding: 20px;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  outline: none;
}

.drawer__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.drawer__headings {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.drawer__code {
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--accent);
  font-weight: 700;
}

.drawer__head h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.3;
}

.drawer__close {
  border: 1px solid var(--input-border);
  background: transparent;
  color: var(--text-muted);
  border-radius: 8px;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.drawer__close:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.drawer__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.drawer__type {
  background: var(--accent-soft);
  color: var(--accent);
}

.drawer__photo {
  width: 100%;
  max-height: 240px;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid var(--border);
}

.drawer__desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.drawer__meta {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.drawer__meta div {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  font-size: 13px;
}

.drawer__meta dt {
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 11px;
  padding-top: 2px;
}

.drawer__meta dd {
  margin: 0;
  text-align: right;
  font-weight: 600;
}

.drawer__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px dashed var(--input-border);
  border-radius: 10px;
}

.drawer__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.drawer__field label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.drawer__field select {
  background: var(--input-solid, var(--bg-card));
  color: var(--text);
  border: 1px solid var(--input-border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
}

.drawer__footer {
  margin-top: auto;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 8px;
}

.drawer__footer .btn {
  text-decoration: none;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .drawer-enter-active,
  .drawer-leave-active {
    transition: none;
  }
}
</style>
