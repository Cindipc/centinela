<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { createUser, getProfiles } from '@backend/api/usersApi'
import { getDepartments, getZones } from '@backend/api/zonesApi'
import { ROLE_LABELS } from '@/navigation/roleNav'
import type { Profile, Role } from '@backend/types'

const ROLES: Role[] = ['usuario', 'seguridad', 'ti', 'admin']

const profiles = ref<Profile[]>([])
const departments = ref<{ id: string; name: string }[]>([])
const zones = ref<{ id: string; name: string }[]>([])
const loading = ref(true)
const creating = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

const form = reactive({
  fullName: '',
  email: '',
  password: '',
  role: 'usuario' as Role,
  phone: '',
  departmentId: '',
  zoneId: '',
})

onMounted(async () => {
  try {
    const [list, deptList, zoneList] = await Promise.all([getProfiles(), getDepartments(), getZones()])
    profiles.value = list
    departments.value = deptList
    zones.value = zoneList
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo cargar la lista de usuarios.'
  } finally {
    loading.value = false
  }
})

const zoneName = computed(() => zones.value.find((z) => z.id === form.zoneId)?.name ?? null)

async function submit() {
  error.value = null
  notice.value = null
  creating.value = true
  try {
    const created = await createUser({
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      password: form.password,
      role: form.role,
      phone: form.phone.trim() || null,
      departmentId: form.departmentId || null,
      zoneId: form.zoneId || null,
    })
    profiles.value.push(created)
    notice.value = `Usuario ${created.name} creado con rol ${ROLE_LABELS[created.role]}.`
    form.fullName = ''
    form.email = ''
    form.password = ''
    form.phone = ''
    form.departmentId = ''
    form.zoneId = ''
    form.role = 'usuario'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo crear el usuario.'
  } finally {
    creating.value = false
  }
}

const zoneOf = (zoneId: string | null | undefined) => zones.value.find((z) => z.id === zoneId)?.name
</script>

<template>
  <div class="users">
    <header class="page-header">
      <div>
        <h1>Gestión de usuarios</h1>
        <p class="text-muted">Alta cerrada: solo un administrador puede crear cuentas y asignar el rol.</p>
      </div>
      <div class="page-header__actions">
        <router-link class="btn btn--ghost" to="/settings">← Configuración</router-link>
      </div>
    </header>

    <p v-if="notice" class="users__ok">{{ notice }}</p>
    <p v-if="error" class="users__error">{{ error }}</p>

    <section class="card users__card">
      <h2>Crear usuario</h2>
      <form class="users__form" @submit.prevent="submit">
        <label class="field">
          <span>Nombre completo</span>
          <input v-model.trim="form.fullName" required placeholder="Ej. Ana Ramírez" />
        </label>

        <label class="field">
          <span>Correo</span>
          <input v-model.trim="form.email" type="email" required placeholder="ana@centinela.local" />
        </label>

        <label class="field">
          <span>Contraseña temporal</span>
          <input v-model="form.password" type="text" required minlength="8" placeholder="Mínimo 8 caracteres" />
        </label>

        <label class="field">
          <span>Rol</span>
          <select v-model="form.role">
            <option v-for="role in ROLES" :key="role" :value="role">{{ ROLE_LABELS[role] }}</option>
          </select>
        </label>

        <label class="field">
          <span>Teléfono</span>
          <input v-model.trim="form.phone" type="tel" placeholder="Opcional" />
        </label>

        <label class="field">
          <span>Departamento</span>
          <select v-model="form.departmentId">
            <option value="">Sin departamento</option>
            <option v-for="dept in departments" :key="dept.id" :value="dept.id">{{ dept.name }}</option>
          </select>
        </label>

        <label class="field">
          <span>Zona</span>
          <select v-model="form.zoneId">
            <option value="">Sin zona</option>
            <option v-for="zone in zones" :key="zone.id" :value="zone.id">{{ zone.name }}</option>
          </select>
        </label>

        <p class="users__hint text-muted">
          Vista previa: {{ form.role }} · {{ zoneName ?? 'sin zona' }} ·
          {{ form.email || 'sin correo' }}
        </p>

        <footer class="users__foot">
          <button class="btn" type="submit" :disabled="creating">
            {{ creating ? 'Creando...' : 'Crear usuario' }}
          </button>
        </footer>
      </form>
    </section>

    <section class="card users__card">
      <h2>
        Usuarios registrados
        <span v-if="!loading" class="text-muted">({{ profiles.length }})</span>
      </h2>

      <div v-if="loading" class="text-muted">Cargando usuarios...</div>

      <div v-else class="users__table-wrap">
        <table class="users__table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Departamento</th>
              <th>Zona</th>
              <th>Teléfono</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="profile in profiles" :key="profile.id">
              <td>{{ profile.name }}</td>
              <td>
                <span class="badge users__role" :class="`role--${profile.role}`">
                  {{ ROLE_LABELS[profile.role] }}
                </span>
              </td>
              <td class="text-muted">{{ departments.find((d) => d.id === profile.departmentId)?.name ?? '—' }}</td>
              <td class="text-muted">{{ zoneOf(profile.zoneId) ?? '—' }}</td>
              <td class="text-muted">{{ profile.phone ?? '—' }}</td>
            </tr>
            <tr v-if="profiles.length === 0">
              <td colspan="5" class="text-muted users__empty">Sin usuarios registrados.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.users {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 900px;
}

.users__card {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.users__card h2 {
  margin: 0;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.users__form {
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
.field select {
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 10px 12px;
  outline: none;
}

.field input:focus,
.field select:focus {
  border-color: var(--accent);
}

.users__hint,
.users__foot {
  grid-column: 1 / -1;
}

.users__hint {
  margin: 0;
  font-size: 12px;
}

.users__foot {
  display: flex;
  justify-content: flex-end;
}

.users__ok {
  margin: 0;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(46, 213, 115, 0.12);
  border: 1px solid rgba(46, 213, 115, 0.4);
  color: var(--success);
  font-size: 14px;
}

.users__error {
  margin: 0;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(255, 71, 87, 0.12);
  border: 1px solid rgba(255, 71, 87, 0.4);
  color: var(--danger);
  font-size: 14px;
}

.users__table-wrap {
  overflow-x: auto;
}

.users__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.users__table th,
.users__table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.users__table th {
  color: var(--text-muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.users__role.role--admin { background: rgba(47, 125, 255, 0.18); color: #6aa3ff; }
.users__role.role--seguridad { background: rgba(255, 71, 87, 0.18); color: #ff6b77; }
.users__role.role--ti { background: rgba(255, 165, 2, 0.16); color: #ffbe52; }
.users__role.role--usuario { background: rgba(139, 150, 173, 0.2); color: var(--text-muted); }

.users__empty {
  text-align: center;
  padding: 30px 0;
}

@media (max-width: 640px) {
  .users__form {
    grid-template-columns: 1fr;
  }
}
</style>