<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  createLicense,
  getLicenses,
  getOrganizations,
  updateLicense,
} from '@backend/api/organizationsApi'
import type { License, LicenseStatus, Organization } from '@backend/types'

const today = new Date().toISOString().slice(0, 10)
const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

const organizations = ref<Organization[]>([])
const licenses = ref<License[]>([])
const loading = ref(true)
const saving = ref(false)
const updatingId = ref<string | null>(null)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

const form = reactive({
  organizationId: '',
  plan: 'Institucional',
  status: 'activa' as LicenseStatus,
  startDate: today,
  endDate: nextYear,
  maxUsers: 100,
  maxZones: 20,
  notes: '',
})

onMounted(async () => {
  try {
    const [orgList, licenseList] = await Promise.all([getOrganizations(), getLicenses()])
    organizations.value = orgList
    licenses.value = licenseList
    if (orgList.length > 0) form.organizationId = orgList[0].id
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudieron cargar las licencias.'
  } finally {
    loading.value = false
  }
})

async function submit() {
  error.value = null
  notice.value = null
  if (!form.organizationId) {
    error.value = 'Selecciona una universidad.'
    return
  }
  if (!form.endDate || form.endDate < form.startDate) {
    error.value = 'La fecha de fin debe ser posterior al inicio.'
    return
  }
  saving.value = true
  try {
    const created = await createLicense({
      organizationId: form.organizationId,
      plan: form.plan.trim() || 'Institucional',
      status: form.status,
      startDate: form.startDate,
      endDate: form.endDate,
      maxUsers: Number(form.maxUsers),
      maxZones: Number(form.maxZones),
      notes: form.notes.trim() || null,
    })
    licenses.value.unshift(created)
    notice.value = `Licencia ${created.plan} creada para ${created.organizationName ?? 'la universidad'}.`
    form.notes = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo crear la licencia.'
  } finally {
    saving.value = false
  }
}

async function setStatus(license: License, status: LicenseStatus) {
  error.value = null
  notice.value = null
  updatingId.value = license.id
  try {
    const updated = await updateLicense(license.id, { status })
    const index = licenses.value.findIndex((item) => item.id === updated.id)
    if (index >= 0) licenses.value[index] = updated
    notice.value = `Licencia actualizada a ${updated.effectiveStatus}.`
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo actualizar la licencia.'
  } finally {
    updatingId.value = null
  }
}

function statusClass(value: string): string {
  if (value === 'activa') return 'license--ok'
  if (value === 'pendiente') return 'license--warning'
  return 'license--danger'
}
</script>

<template>
  <div class="licenses">
    <header class="page-header">
      <div>
        <h1>Licencias</h1>
        <p class="text-muted">Vigencia, límites y estado efectivo por universidad.</p>
      </div>
      <router-link class="btn btn--ghost" to="/superadmin/universidades">Universidades</router-link>
    </header>

    <p v-if="notice" class="licenses__ok">{{ notice }}</p>
    <p v-if="error" class="licenses__error">{{ error }}</p>
    <p v-if="loading" class="text-muted">Cargando licencias...</p>

    <section class="card licenses__card">
      <h2>Nueva licencia</h2>
      <form class="licenses__form" @submit.prevent="submit">
        <label class="field">
          <span>Universidad</span>
          <select v-model="form.organizationId" required>
            <option value="" disabled>Selecciona una universidad</option>
            <option v-for="org in organizations" :key="org.id" :value="org.id">{{ org.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>Plan</span>
          <input v-model="form.plan" required />
        </label>
        <label class="field">
          <span>Estado</span>
          <select v-model="form.status">
            <option value="activa">Activa</option>
            <option value="pendiente">Pendiente</option>
            <option value="suspendida">Suspendida</option>
            <option value="vencida">Vencida</option>
          </select>
        </label>
        <label class="field">
          <span>Inicio</span>
          <input v-model="form.startDate" type="date" required />
        </label>
        <label class="field">
          <span>Fin</span>
          <input v-model="form.endDate" type="date" required />
        </label>
        <label class="field">
          <span>Máximo de usuarios</span>
          <input v-model.number="form.maxUsers" type="number" min="1" required />
        </label>
        <label class="field">
          <span>Máximo de zonas</span>
          <input v-model.number="form.maxZones" type="number" min="1" required />
        </label>
        <label class="field licenses__wide">
          <span>Notas</span>
          <input v-model="form.notes" placeholder="Opcional" />
        </label>
        <footer class="licenses__wide">
          <button class="btn" type="submit" :disabled="saving">
            {{ saving ? 'Guardando...' : 'Crear licencia' }}
          </button>
        </footer>
      </form>
    </section>

    <section class="card licenses__card">
      <h2>Historial de licencias</h2>
      <div class="licenses__table-wrap">
        <table class="licenses__table">
          <thead>
            <tr>
              <th>Universidad</th>
              <th>Plan</th>
              <th>Estado</th>
              <th>Vigencia</th>
              <th>Límites</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="license in licenses" :key="license.id">
              <td>{{ license.organizationName ?? license.organizationId }}</td>
              <td>{{ license.plan }}</td>
              <td>
                <span class="license-badge" :class="statusClass(license.effectiveStatus)">
                  {{ license.effectiveStatus }}
                </span>
              </td>
              <td class="text-muted">{{ license.startDate }} → {{ license.endDate }}</td>
              <td class="text-muted">{{ license.maxUsers }} usuarios · {{ license.maxZones }} zonas</td>
              <td class="licenses__actions">
                <button
                  class="btn btn--ghost btn--small"
                  :disabled="updatingId === license.id"
                  @click="setStatus(license, license.status === 'suspendida' ? 'activa' : 'suspendida')"
                >
                  {{ license.status === 'suspendida' ? 'Reactivar' : 'Suspender' }}
                </button>
              </td>
            </tr>
            <tr v-if="licenses.length === 0">
              <td colspan="6" class="text-muted">Sin licencias registradas.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.licenses {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 1150px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.page-header h1 {
  margin: 0;
  font-size: 24px;
}

.licenses__card {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.licenses__card h2 {
  margin: 0;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.licenses__form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.licenses__wide {
  grid-column: 1 / -1;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.field input,
.field select {
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 10px;
  color: var(--text);
  padding: 10px 12px;
  outline: none;
  text-transform: none;
  letter-spacing: normal;
  font-size: 14px;
}

.licenses__table-wrap {
  overflow-x: auto;
}

.licenses__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.licenses__table th,
.licenses__table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  white-space: nowrap;
}

.licenses__table th {
  color: var(--text-muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.license-badge {
  font-size: 12px;
  font-weight: 600;
  text-transform: capitalize;
}

.license--ok { color: var(--success); }
.license--warning { color: var(--warning); }
.license--danger { color: var(--danger); }

.licenses__actions {
  display: flex;
  gap: 8px;
}

.licenses__ok { color: var(--success); }
.licenses__error { color: var(--danger); }

@media (max-width: 900px) {
  .licenses__form {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 600px) {
  .licenses__form {
    grid-template-columns: 1fr;
  }
}
</style>
