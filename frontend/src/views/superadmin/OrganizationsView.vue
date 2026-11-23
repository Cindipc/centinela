<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { createUser } from '@backend/api/usersApi'
import {
  createOrganization,
  getLicenses,
  getOrganizations,
  updateOrganization,
} from '@backend/api/organizationsApi'
import type { License, Organization } from '@backend/types'

const organizations = ref<Organization[]>([])
const licenses = ref<License[]>([])
const loading = ref(true)
const creating = ref(false)
const updatingId = ref<string | null>(null)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

const orgForm = reactive({
  name: '',
  slug: '',
  address: '',
  centerLat: '',
  centerLng: '',
})

const adminForm = reactive({
  organizationId: '',
  fullName: '',
  email: '',
  password: '',
  phone: '',
})

onMounted(load)

async function load() {
  loading.value = true
  error.value = null
  try {
    const [orgList, licenseList] = await Promise.all([getOrganizations(), getLicenses()])
    organizations.value = orgList
    licenses.value = licenseList
    if (!adminForm.organizationId && orgList.length > 0) {
      adminForm.organizationId = orgList[0].id
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudieron cargar las universidades.'
  } finally {
    loading.value = false
  }
}

const licenseByOrg = computed(() => {
  const map = new Map<string, License>()
  for (const license of licenses.value) {
    if (!map.has(license.organizationId)) map.set(license.organizationId, license)
  }
  return map
})

async function submitOrganization() {
  error.value = null
  notice.value = null
  if (!orgForm.name.trim()) {
    error.value = 'El nombre de la universidad es obligatorio.'
    return
  }
  creating.value = true
  try {
    const created = await createOrganization({
      name: orgForm.name.trim(),
      slug: orgForm.slug.trim() || null,
      address: orgForm.address.trim() || null,
      centerLat: orgForm.centerLat ? Number(orgForm.centerLat) : null,
      centerLng: orgForm.centerLng ? Number(orgForm.centerLng) : null,
    })
    organizations.value.push(created)
    if (!adminForm.organizationId) adminForm.organizationId = created.id
    notice.value = `Universidad ${created.name} creada. Configura su licencia antes de crear usuarios.`
    orgForm.name = ''
    orgForm.slug = ''
    orgForm.address = ''
    orgForm.centerLat = ''
    orgForm.centerLng = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo crear la universidad.'
  } finally {
    creating.value = false
  }
}

async function toggleStatus(organization: Organization) {
  error.value = null
  notice.value = null
  updatingId.value = organization.id
  try {
    const updated = await updateOrganization(organization.id, {
      status: organization.status === 'activa' ? 'suspendida' : 'activa',
    })
    const index = organizations.value.findIndex((item) => item.id === updated.id)
    if (index >= 0) organizations.value[index] = updated
    notice.value = `Universidad ${updated.name} marcada como ${updated.status}.`
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo actualizar la universidad.'
  } finally {
    updatingId.value = null
  }
}

async function submitAdmin() {
  error.value = null
  notice.value = null
  const org = organizations.value.find((item) => item.id === adminForm.organizationId)
  if (!org) {
    error.value = 'Selecciona una universidad.'
    return
  }
  if (!adminForm.fullName.trim() || !adminForm.email.trim() || adminForm.password.length < 8) {
    error.value = 'Completa nombre, correo y contraseña de al menos 8 caracteres.'
    return
  }
  creating.value = true
  try {
    const created = await createUser({
      fullName: adminForm.fullName.trim(),
      email: adminForm.email.trim(),
      password: adminForm.password,
      role: 'admin',
      phone: adminForm.phone.trim() || null,
      organizationId: org.id,
    })
    notice.value = `Administrador ${created.name} creado para ${org.name}.`
    adminForm.fullName = ''
    adminForm.email = ''
    adminForm.password = ''
    adminForm.phone = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo crear el administrador.'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="orgs">
    <header class="page-header">
      <div>
        <h1>Universidades</h1>
        <p class="text-muted">Alta, suspensión y administrador inicial de cada institución.</p>
      </div>
      <router-link class="btn btn--ghost" to="/superadmin/licencias">Gestionar licencias</router-link>
    </header>

    <p v-if="notice" class="orgs__ok">{{ notice }}</p>
    <p v-if="error" class="orgs__error">{{ error }}</p>
    <p v-if="loading" class="text-muted">Cargando universidades...</p>

    <div class="orgs__grid">
      <section class="card orgs__card">
        <h2>Nueva universidad</h2>
        <form class="orgs__form" @submit.prevent="submitOrganization">
          <label class="field">
            <span>Nombre</span>
            <input v-model="orgForm.name" required placeholder="Universidad..." />
          </label>
          <label class="field">
            <span>Slug</span>
            <input v-model="orgForm.slug" placeholder="utp" />
          </label>
          <label class="field orgs__wide">
            <span>Dirección</span>
            <input v-model="orgForm.address" placeholder="Ciudad, estado" />
          </label>
          <label class="field">
            <span>Latitud central</span>
            <input v-model="orgForm.centerLat" type="number" step="any" placeholder="20.5873" />
          </label>
          <label class="field">
            <span>Longitud central</span>
            <input v-model="orgForm.centerLng" type="number" step="any" placeholder="-90.0036" />
          </label>
          <footer class="orgs__wide">
            <button class="btn" type="submit" :disabled="creating">
              {{ creating ? 'Creando...' : 'Crear universidad' }}
            </button>
          </footer>
        </form>
      </section>

      <section class="card orgs__card">
        <h2>Administrador de universidad</h2>
        <p class="text-muted orgs__hint">
          Crea la primera cuenta admin de una institución. La licencia debe estar activa.
        </p>
        <form class="orgs__form" @submit.prevent="submitAdmin">
          <label class="field orgs__wide">
            <span>Universidad</span>
            <select v-model="adminForm.organizationId" required>
              <option value="" disabled>Selecciona una universidad</option>
              <option v-for="org in organizations" :key="org.id" :value="org.id">{{ org.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>Nombre completo</span>
            <input v-model="adminForm.fullName" required />
          </label>
          <label class="field">
            <span>Correo</span>
            <input v-model="adminForm.email" type="email" required />
          </label>
          <label class="field">
            <span>Contraseña temporal</span>
            <input v-model="adminForm.password" type="text" minlength="8" required />
          </label>
          <label class="field">
            <span>Teléfono</span>
            <input v-model="adminForm.phone" type="tel" placeholder="Opcional" />
          </label>
          <footer class="orgs__wide">
            <button class="btn" type="submit" :disabled="creating">
              {{ creating ? 'Creando...' : 'Crear administrador' }}
            </button>
          </footer>
        </form>
      </section>
    </div>

    <section class="card orgs__card">
      <h2>Universidades registradas</h2>
      <div class="orgs__table-wrap">
        <table class="orgs__table">
          <thead>
            <tr>
              <th>Universidad</th>
              <th>Centro</th>
              <th>Estado</th>
              <th>Licencia</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="org in organizations" :key="org.id">
              <td>
                <strong>{{ org.name }}</strong>
                <div class="text-muted orgs__small">{{ org.slug ?? 'sin slug' }}</div>
              </td>
              <td class="text-muted">
                {{ org.centerLat != null && org.centerLng != null ? `${org.centerLat}, ${org.centerLng}` : 'Sin centro' }}
              </td>
              <td><span class="badge">{{ org.status }}</span></td>
              <td class="text-muted">{{ licenseByOrg.get(org.id)?.effectiveStatus ?? 'sin licencia' }}</td>
              <td>
                <button class="btn btn--ghost btn--small" :disabled="updatingId === org.id" @click="toggleStatus(org)">
                  {{ org.status === 'activa' ? 'Suspender' : 'Activar' }}
                </button>
              </td>
            </tr>
            <tr v-if="organizations.length === 0">
              <td colspan="5" class="text-muted">Sin universidades.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.orgs {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 1100px;
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

.orgs__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.orgs__card {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.orgs__card h2 {
  margin: 0;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.orgs__form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.orgs__wide {
  grid-column: 1 / -1;
}

.orgs__hint,
.orgs__small {
  font-size: 12px;
  margin: 0;
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

.field input:focus,
.field select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(47, 224, 234, 0.16);
}

.orgs__table-wrap {
  overflow-x: auto;
}

.orgs__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.orgs__table th,
.orgs__table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  white-space: nowrap;
}

.orgs__table th {
  color: var(--text-muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.orgs__ok {
  color: var(--success);
}

.orgs__error {
  color: var(--danger);
}

@media (max-width: 900px) {
  .orgs__grid {
    grid-template-columns: 1fr;
  }
}
</style>
