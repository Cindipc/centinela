<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import MapCanvas from '@/components/map/MapCanvas.vue'
import MapFilters from '@/components/map/MapFilters.vue'
import MapLayerToggles from '@/components/map/MapLayerToggles.vue'
import MapLegend from '@/components/map/MapLegend.vue'
import IncidentDrawer from '@/components/map/IncidentDrawer.vue'
import { useIncidentsStore } from '@/stores/incidents'
import { useEmergencyStore } from '@/stores/emergency'
import { useMapStore } from '@/stores/map.store'
import { useRole } from '@/composables/useRole'
import { useAuth } from '@/composables/useAuth'
import { DEFAULT_LAYER_VISIBILITY, CAMPUS_CENTER, type LayerVisibility } from '@backend/config/map'
import { distanceMeters, isUsablePoint, panicPoint } from '@backend/utils/mapGeo'
import { getErrorMessage } from '@backend/utils/errors'
import { updateZoneLocation } from '@backend/api/zonesApi'
import type {
  GeoPoint,
  Incident,
  IncidentStatus,
  IncidentType,
  PanicAlert,
} from '@backend/types'

const incidentsStore = useIncidentsStore()
const emergencyStore = useEmergencyStore()
const mapStore = useMapStore()
const { isAdmin, isSecurity, isTecnology, isEmployee } = useRole()
const { user, organizationCenter } = useAuth()
const campusCenter = computed(() => organizationCenter.value ?? CAMPUS_CENTER)
const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref<string | null>(null)
const satellite = ref(false)
const visibility = ref<LayerVisibility>({ ...DEFAULT_LAYER_VISIBILITY })
const selected = ref<Incident | null>(null)
const canvas = ref<InstanceType<typeof MapCanvas> | null>(null)

// Vista mapa / lista accesible
const viewMode = ref<'map' | 'list'>('map')

// "Reportar aquí" (usuario): picking en el mapa + formulario modal
const picking = ref(false)
const reportOpen = ref(false)
const reportPoint = ref<GeoPoint | null>(null)
const reportSubmitting = ref(false)
const reportError = ref<string | null>(null)
const reportType = ref<IncidentType>('seguridad')
const reportTitle = ref('')
const reportDescription = ref('')
const reportPhoto = ref<File | null>(null)

// Edición de zonas (admin)
const zoneEditing = ref(false)
const zoneChanges = ref<Record<string, GeoPoint>>({})
const zoneSaving = ref(false)

// Toast realtime (role="alert")
const toast = ref<{ message: string; tone: 'info' | 'danger' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

const filtered = computed(() => mapStore.applyFilters(incidentsStore.incidents))
const mapIncidents = computed(() => filtered.value.filter((i) => isUsablePoint(i.location)))
const withCoords = computed(() => incidentsStore.incidents.filter((i) => isUsablePoint(i.location)))
const activePanics = computed(() => emergencyStore.activePanics)
const zonesWithCoords = computed(() => incidentsStore.zones.filter((z) => isUsablePoint(z.location)))

const showPanicPanel = computed(() => isAdmin.value || isSecurity.value)
const zoneChangeCount = computed(() => Object.keys(zoneChanges.value).length)

// ---------- acciones del cajón según rol ----------

const canEditSelectedStatus = computed(() => {
  const incident = selected.value
  if (!incident) return false
  if (isAdmin.value) return true
  return isTecnology.value && incident.type === 'equipo'
})

const canAssignSelected = computed(() => isAdmin.value && selected.value !== null)

const canSelfAssignSelected = computed(() => {
  const incident = selected.value
  if (!incident) return false
  if (isAdmin.value) return true
  return isTecnology.value && incident.type === 'equipo'
})

const detailLink = computed<'seguridad' | 'ti' | null>(() => {
  const incident = selected.value
  if (!incident) return null
  if (incident.type === 'seguridad' && isSecurity.value) return 'seguridad'
  if (incident.type === 'equipo' && isTecnology.value) return 'ti'
  return null
})

// ---------- toasts ----------

function showToast(message: string, tone: 'info' | 'danger' = 'info'): void {
  toast.value = { message, tone }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = null
  }, 6000)
}

// ---------- carga de datos ----------

onMounted(async () => {
  mapStore.setAll(mapStore.filtersFromQuery(route.query as Record<string, unknown>))
  try {
    await Promise.all([
      incidentsStore.fetchIncidents(),
      incidentsStore.fetchReferences(),
      emergencyStore.fetchPanics(),
    ])
  } catch (cause) {
    error.value = getErrorMessage(cause)
  } finally {
    loading.value = false
  }
  incidentsStore.listenRealtime(onNewIncident)
  emergencyStore.listenPanics(onNewPanic)
})

onBeforeUnmount(() => {
  emergencyStore.stopPanics()
  if (toastTimer) clearTimeout(toastTimer)
})

// ---------- realtime: flyTo + aviso audible a lectores de pantalla ----------

function onNewIncident(incident: Incident): void {
  if (incident.priority !== 'critical') return
  if (!isUsablePoint(incident.location)) return
  canvas.value?.focusPoint(incident.location, 17)
  showToast(`Incidencia crítica nueva: ${incident.code} · ${incident.title}`, 'danger')
}

function onNewPanic(alert: PanicAlert): void {
  const point = panicPoint(alert)
  if (point) canvas.value?.focusPoint(point, 17)
  showToast(
    `Alerta de pánico de ${alert.userName ?? 'usuario sin nombre'}${alert.zone ? ` · ${alert.zone}` : ''}`,
    'danger'
  )
}

// ---------- filtros persistidos en la URL ----------

watch(
  () => mapStore.filters,
  () => {
    const query: LocationQueryRaw = { ...route.query }
    delete query.tipo
    delete query.estado
    delete query.prioridad
    delete query.rango
    delete query.q
    Object.assign(query, mapStore.queryFromFilters())
    router.replace({ query }).catch(() => {
      /* navegación redundante: ya está en esa URL */
    })
  },
  { deep: true }
)

watch(
  () => route.query,
  (query) => {
    const parsed = mapStore.filtersFromQuery(query as Record<string, unknown>)
    if (JSON.stringify(parsed) !== JSON.stringify(mapStore.filters)) {
      mapStore.setAll(parsed)
    }
  }
)

// ---------- selección y lista accesible ----------

function onSelectIncident(id: string): void {
  selected.value = incidentsStore.incidents.find((i) => i.id === id) ?? null
}

function selectFromList(incident: Incident): void {
  selected.value = incident
  viewMode.value = 'map'
  if (isUsablePoint(incident.location)) {
    canvas.value?.focusPoint(incident.location, 18)
  }
}

function frameZones(): void {
  canvas.value?.fitToZones()
}

// ---------- acciones del cajón ----------

async function onDrawerStatus(status: IncidentStatus): Promise<void> {
  if (!selected.value) return
  try {
    await incidentsStore.update(selected.value.id, { status })
    showToast(`${selected.value.code}: estado cambiado a «${status.replace('_', ' ')}»`)
  } catch (cause) {
    showToast(getErrorMessage(cause), 'danger')
  }
}

async function onDrawerAssign(profileId: string): Promise<void> {
  if (!selected.value) return
  try {
    await incidentsStore.update(selected.value.id, { assignedTo: profileId || null })
    showToast(`${selected.value.code}: asignación actualizada`)
  } catch (cause) {
    showToast(getErrorMessage(cause), 'danger')
  }
}

async function onDrawerSelfAssign(): Promise<void> {
  if (!selected.value) return
  try {
    await incidentsStore.update(selected.value.id, { assignedTo: user.value?.id ?? '' })
    showToast(`${selected.value.code}: asignada a ti`)
  } catch (cause) {
    showToast(getErrorMessage(cause), 'danger')
  }
}

// ---------- alertas de pánico (admin / seguridad) ----------

function focusPanic(alert: PanicAlert): void {
  const point = panicPoint(alert)
  if (point) canvas.value?.focusPoint(point, 17)
}

async function resolvePanic(alert: PanicAlert, status: PanicAlert['status']): Promise<void> {
  try {
    await emergencyStore.closePanic(alert.id, status)
    showToast(
      status === 'atendido' ? 'Alerta de pánico atendida.' : 'Alerta marcada como falsa alarma.'
    )
  } catch (cause) {
    showToast(getErrorMessage(cause), 'danger')
  }
}

// ---------- reportar aquí (usuario) ----------

function startPicking(): void {
  picking.value = true
  showToast('Haz clic en el mapa para marcar la ubicación del reporte.')
}

function cancelPicking(): void {
  picking.value = false
}

function onPickPoint(point: GeoPoint): void {
  picking.value = false
  const distance = distanceMeters(campusCenter.value, point)
  if (
    distance > 2000 &&
    !window.confirm(
      `El punto está a ${Math.round(distance)} m del campus. ¿Reportar en esa ubicación de todos modos?`
    )
  ) {
    return
  }
  reportPoint.value = point
  reportOpen.value = true
  reportError.value = null
}

function closeReport(): void {
  if (reportSubmitting.value) return
  reportOpen.value = false
  reportPoint.value = null
  reportTitle.value = ''
  reportDescription.value = ''
  reportPhoto.value = null
  reportError.value = null
}

function onReportPhotoSelected(event: Event): void {
  const input = event.target as HTMLInputElement
  reportPhoto.value = input.files?.[0] ?? null
}

async function submitReport(): Promise<void> {
  if (!reportPoint.value) return
  const title = reportTitle.value.trim()
  if (!title) {
    reportError.value = 'Escribe un título para el reporte.'
    return
  }
  reportSubmitting.value = true
  reportError.value = null
  try {
    const photoUrl = reportPhoto.value ? await incidentsStore.attachPhoto(reportPhoto.value) : undefined
    const created = await incidentsStore.addIncident({
      type: reportType.value,
      title,
      description: reportDescription.value.trim() || undefined,
      priority: 'medium',
      location: reportPoint.value,
      photoUrl,
    })
    closeReport()
    showToast(`Incidencia ${created.code} creada.`)
    if (isUsablePoint(created.location)) {
      canvas.value?.focusPoint(created.location, 18)
    }
    selected.value = created
  } catch (cause) {
    reportError.value = getErrorMessage(cause)
  } finally {
    reportSubmitting.value = false
  }
}

// ---------- edición de zonas (admin) ----------

function toggleZoneEditing(): void {
  zoneEditing.value = !zoneEditing.value
  if (!zoneEditing.value) zoneChanges.value = {}
}

function onZoneMove(zoneId: string, point: GeoPoint): void {
  zoneChanges.value = { ...zoneChanges.value, [zoneId]: point }
}

async function saveZoneChanges(): Promise<void> {
  if (zoneChangeCount.value === 0) return
  zoneSaving.value = true
  try {
    await Promise.all(
      Object.entries(zoneChanges.value).map(([id, point]) => updateZoneLocation(id, point))
    )
    zoneChanges.value = {}
    zoneEditing.value = false
    await incidentsStore.fetchReferences()
    showToast('Zonas actualizadas.')
  } catch (cause) {
    showToast(getErrorMessage(cause), 'danger')
  } finally {
    zoneSaving.value = false
  }
}
</script>

<template>
  <div class="mapa">
    <header class="page-header">
      <div>
        <h1>Mapa del campus</h1>
        <p class="text-muted">
          <template v-if="loading">Cargando datos del mapa…</template>
          <template v-else>
            {{ filtered.length }} de {{ incidentsStore.incidents.length }} incidencias visibles ·
            {{ zonesWithCoords.length }} zonas · {{ activePanics.length }} alerta(s) de pánico
            activa(s)
          </template>
        </p>
      </div>
      <div class="page-header__actions">
        <div class="mapa__viewtoggle" role="group" aria-label="Alternar mapa o lista">
          <button
            class="btn btn--ghost"
            type="button"
            :aria-pressed="viewMode === 'map'"
            @click="viewMode = 'map'"
          >
            Mapa
          </button>
          <button
            class="btn btn--ghost"
            type="button"
            :aria-pressed="viewMode === 'list'"
            @click="viewMode = 'list'"
          >
            Lista
          </button>
        </div>
        <button class="btn btn--ghost" type="button" :disabled="loading" @click="frameZones">
          Encuadrar zonas
        </button>
        <button
          class="btn btn--ghost"
          type="button"
          :aria-pressed="satellite"
          @click="satellite = !satellite"
        >
          {{ satellite ? 'Volver a estilo oscuro' : 'Vista satélite' }}
        </button>
        <button
          v-if="isEmployee"
          class="btn"
          type="button"
          :aria-pressed="picking"
          @click="picking ? cancelPicking() : startPicking()"
        >
          {{ picking ? 'Cancelar selección' : 'Reportar aquí' }}
        </button>
        <button
          v-if="isAdmin"
          class="btn btn--ghost"
          type="button"
          :aria-pressed="zoneEditing"
          @click="toggleZoneEditing"
        >
          {{ zoneEditing ? 'Salir de edición de zonas' : 'Editar zonas' }}
        </button>
      </div>
    </header>

    <p v-if="error" class="mapa__alert card" role="alert">{{ error }}</p>

    <MapFilters />

    <div v-if="zoneEditing && zoneChangeCount > 0" class="mapa__zonesave card" role="status">
      <span>{{ zoneChangeCount }} zona(s) con cambios sin guardar.</span>
      <button class="btn btn--ghost" type="button" :disabled="zoneSaving" @click="toggleZoneEditing">
        Descartar
      </button>
      <button class="btn" type="button" :disabled="zoneSaving" @click="saveZoneChanges">
        {{ zoneSaving ? 'Guardando…' : 'Guardar zonas' }}
      </button>
    </div>

    <div class="mapa__layout">
      <div class="mapa__stage">
        <MapCanvas
          v-show="viewMode === 'map'"
          ref="canvas"
          :incidents="mapIncidents"
          :zones="incidentsStore.zones"
          :panics="emergencyStore.panicAlerts"
          :satellite="satellite"
          :visibility="visibility"
          :picking="picking"
          :zone-editing="zoneEditing"
          :center="campusCenter"
          @select-incident="onSelectIncident"
          @pick-point="onPickPoint"
          @zone-move="onZoneMove"
        />

        <div v-if="viewMode === 'map' && picking" class="mapa__pickhint" role="status">
          Haz clic en el mapa para marcar el punto del reporte.
          <button class="btn btn--ghost" type="button" @click="cancelPicking">Cancelar</button>
        </div>

        <div
          v-if="viewMode === 'map' && !loading && withCoords.length === 0 && zonesWithCoords.length === 0"
          class="mapa__empty card"
        >
          <strong>Sin datos georreferenciados</strong>
          <p class="text-muted">
            Aún no hay incidencias ni zonas con coordenadas. El mapa se muestra en el centro por
            defecto del campus.
          </p>
        </div>

        <!-- Alternativa accesible al mapa: navegable con teclado y lectores de pantalla. -->
        <div
          v-if="viewMode === 'list'"
          class="mapa__list card"
          role="region"
          aria-label="Lista de incidencias visibles"
        >
          <p v-if="filtered.length === 0" class="text-muted mapa__listempty">
            Ninguna incidencia coincide con los filtros actuales.
          </p>
          <table v-else class="mapa__table">
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Título</th>
                <th scope="col">Prioridad</th>
                <th scope="col">Estado</th>
                <th scope="col">Zona</th>
                <th scope="col">Registrada</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="incident in filtered"
                :key="incident.id"
                tabindex="0"
                :aria-label="`Ver ${incident.code} en el mapa`"
                @click="selectFromList(incident)"
                @keydown.enter.prevent="selectFromList(incident)"
                @keydown.space.prevent="selectFromList(incident)"
              >
                <td class="mapa__code">{{ incident.code }}</td>
                <td>{{ incident.title }}</td>
                <td>
                  <span class="badge" :class="`priority--${incident.priority}`">
                    {{ incident.priority }}
                  </span>
                </td>
                <td>
                  <span class="badge" :class="`status--${incident.status}`">
                    {{ incident.status.replace('_', ' ') }}
                  </span>
                </td>
                <td>{{ incident.zone ?? '—' }}</td>
                <td>
                  {{ new Date(incident.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <aside class="mapa__panel card" aria-label="Panel del mapa">
        <MapLayerToggles v-model="visibility" />
        <MapLegend />

        <section v-if="showPanicPanel" class="mapa__panics" aria-label="Alertas de pánico">
          <h3>Pánico ({{ activePanics.length }})</h3>
          <p v-if="activePanics.length === 0" class="text-muted mapa__hint">
            Sin alertas activas. El botón de pánico global sigue disponible abajo a la derecha.
          </p>
          <ul v-else class="mapa__paniclist">
            <li v-for="alert in activePanics" :key="alert.id">
              <button
                class="mapa__panicfocus"
                type="button"
                :aria-label="`Centrar en la alerta de ${alert.userName ?? 'usuario'}`"
                @click="focusPanic(alert)"
              >
                <strong>{{ alert.userName ?? 'Usuario' }}</strong>
                <span class="text-muted">
                  {{ alert.zone ?? 'Sin zona' }} ·
                  {{ new Date(alert.createdAt).toLocaleTimeString('es-ES', { timeStyle: 'short' }) }}
                </span>
              </button>
              <div class="mapa__panicactions">
                <button class="btn btn--ghost" type="button" @click="resolvePanic(alert, 'atendido')">
                  Atender
                </button>
                <button class="btn btn--ghost" type="button" @click="resolvePanic(alert, 'falsa_alarma')">
                  Falsa alarma
                </button>
              </div>
            </li>
          </ul>
        </section>

        <p class="mapa__hint text-muted">
          Los datos vienen de Supabase y se limitan por tu rol (RLS). El mapa solo muestra lo que
          te corresponde ver.
        </p>
      </aside>
    </div>

    <IncidentDrawer
      :incident="selected"
      :staff="incidentsStore.staff"
      :allow-status-change="canEditSelectedStatus"
      :allow-assign="canAssignSelected"
      :allow-self-assign="canSelfAssignSelected"
      :detail-link="detailLink"
      @close="selected = null"
      @update-status="onDrawerStatus"
      @assign="onDrawerAssign"
      @self-assign="onDrawerSelfAssign"
    />

    <!-- Formulario "Reportar aquí" sobre el punto elegido en el mapa -->
    <Teleport to="body">
      <Transition name="mapa-modal">
        <div v-if="reportOpen" class="mapa__modalbackdrop" @click.self="closeReport">
          <form
            class="mapa__modal card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-here-title"
            @submit.prevent="submitReport"
          >
            <h2 id="report-here-title">Reportar aquí</h2>
            <p v-if="reportPoint" class="text-muted mapa__modalcoords">
              Punto elegido: {{ reportPoint.lat.toFixed(5) }}, {{ reportPoint.lng.toFixed(5) }}
            </p>

            <label class="mapa__field">
              Tipo
              <select v-model="reportType">
                <option value="seguridad">Seguridad</option>
                <option value="equipo">Equipo / TI</option>
              </select>
            </label>

            <label class="mapa__field">
              Título *
              <input v-model="reportTitle" type="text" maxlength="140" required />
            </label>

            <label class="mapa__field">
              Descripción
              <textarea v-model="reportDescription" rows="3" maxlength="2000"></textarea>
            </label>

            <label class="mapa__field">
              Foto (opcional)
              <input type="file" accept="image/*" @change="onReportPhotoSelected" />
            </label>

            <p v-if="reportError" class="mapa__modalerror" role="alert">{{ reportError }}</p>

            <footer class="mapa__modalactions">
              <button class="btn btn--ghost" type="button" :disabled="reportSubmitting" @click="closeReport">
                Cancelar
              </button>
              <button class="btn" type="submit" :disabled="reportSubmitting">
                {{ reportSubmitting ? 'Enviando…' : 'Crear reporte' }}
              </button>
            </footer>
          </form>
        </div>
      </Transition>
    </Teleport>

    <!-- Avisos realtime (nueva incidencia crítica / pánico / acciones) -->
    <div v-if="toast" class="mapa__toast" :class="`mapa__toast--${toast.tone}`" role="alert">
      {{ toast.message }}
    </div>
  </div>
</template>

<style scoped>
.mapa {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mapa__alert {
  padding: 12px 16px;
  margin: 0;
  color: var(--danger);
  font-size: 14px;
}

.mapa__viewtoggle {
  display: inline-flex;
  gap: 6px;
}

.mapa__viewtoggle .btn[aria-pressed='true'] {
  border-color: var(--accent);
  color: var(--accent);
}

.mapa__zonesave {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  font-size: 13px;
}

.mapa__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 264px;
  gap: 16px;
  align-items: start;
}

.mapa__stage {
  position: relative;
  height: clamp(420px, calc(100vh - 280px), 820px);
}

.mapa__panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.mapa__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.mapa__pickhint {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--panel-solid, rgba(3, 18, 25, 0.92));
  border: 1px solid var(--accent);
  color: var(--text);
  font-size: 13px;
  box-shadow: var(--shadow-card);
}

.mapa__empty {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  z-index: 4;
  padding: 12px 16px;
  max-width: 420px;
  text-align: center;
  font-size: 13px;
}

.mapa__empty p {
  margin: 4px 0 0;
}

.mapa__list {
  position: absolute;
  inset: 0;
  z-index: 3;
  overflow: auto;
  padding: 14px;
}

.mapa__listempty {
  margin: 8px 0;
  font-size: 13px;
}

.mapa__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.mapa__table th {
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 11px;
  color: var(--text-muted);
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}

.mapa__table td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--border);
}

.mapa__table tbody tr {
  cursor: pointer;
  outline: none;
}

.mapa__table tbody tr:hover,
.mapa__table tbody tr:focus-visible {
  background: var(--accent-soft, rgba(47, 224, 234, 0.12));
}

.mapa__code {
  font-weight: 700;
  color: var(--accent);
  white-space: nowrap;
}

.mapa__panics h3 {
  margin: 0 0 8px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.mapa__paniclist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mapa__paniclist li {
  border: 1px solid var(--danger, #ff5468);
  border-radius: 10px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mapa__panicfocus {
  background: none;
  border: none;
  padding: 0;
  text-align: left;
  color: var(--text);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mapa__panicfocus span {
  font-size: 11px;
}

.mapa__panicactions {
  display: flex;
  gap: 6px;
}

.mapa__panicactions .btn {
  flex: 1;
  font-size: 12px;
  padding: 5px 8px;
}

.mapa__modalbackdrop {
  position: fixed;
  inset: 0;
  z-index: 95;
  background: var(--overlay);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  padding: 16px;
}

.mapa__modal {
  width: min(440px, 100%);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 90vh;
  overflow-y: auto;
}

.mapa__modal h2 {
  margin: 0;
  font-size: 18px;
}

.mapa__modalcoords {
  margin: 0;
  font-size: 12px;
}

.mapa__field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.mapa__field input,
.mapa__field select,
.mapa__field textarea {
  background: var(--input-solid, var(--bg-card));
  color: var(--text);
  border: 1px solid var(--input-border);
  border-radius: 8px;
  padding: 9px 10px;
  font-size: 13px;
  text-transform: none;
  letter-spacing: normal;
  font-family: inherit;
}

.mapa__modalerror {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
}

.mapa__modalactions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.mapa__toast {
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 120;
  max-width: min(520px, calc(100vw - 32px));
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  background: var(--panel-solid, rgba(3, 18, 25, 0.95));
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
}

.mapa__toast--danger {
  border-color: var(--danger, #ff5468);
  color: var(--danger, #ff5468);
}

.mapa-modal-enter-active,
.mapa-modal-leave-active {
  transition: opacity 0.2s ease;
}

.mapa-modal-enter-from,
.mapa-modal-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .mapa-modal-enter-active,
  .mapa-modal-leave-active {
    transition: none;
  }
}

@media (max-width: 960px) {
  .mapa__layout {
    grid-template-columns: 1fr;
  }

  .mapa__stage {
    height: 60vh;
    min-height: 360px;
  }
}

@media (max-width: 768px) {
  .page-header__actions {
    width: 100%;
    flex-wrap: wrap;
  }
}
</style>
