<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { getAuditLogs, getOrganizations } from '@backend/api/organizationsApi'
import { useRole } from '@/composables/useRole'
import type { AuditLog, Organization } from '@backend/types'

const { isSuperadmin } = useRole()
const organizations = ref<Organization[]>([])
const logs = ref<AuditLog[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const filters = reactive({
  organizationId: '',
  tableName: '',
  action: '',
  limit: 100,
})

onMounted(async () => {
  try {
    organizations.value = await getOrganizations()
    if (!isSuperadmin.value && organizations.value.length === 1) {
      filters.organizationId = organizations.value[0].id
    }
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo cargar la auditoría.'
    loading.value = false
  }
})

async function load() {
  loading.value = true
  error.value = null
  try {
    logs.value = await getAuditLogs({
      organizationId: filters.organizationId || null,
      tableName: filters.tableName.trim() || null,
      action: filters.action || null,
      limit: Number(filters.limit),
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo cargar la auditoría.'
  } finally {
    loading.value = false
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('es-ES')
}

function summary(log: AuditLog): string {
  const source = log.newData ?? log.oldData
  if (!source) return 'Sin detalle'
  const title = source.title ?? source.full_name ?? source.name ?? source.code ?? source.email
  if (title) return String(title)
  return Object.keys(source).slice(0, 4).join(', ')
}

function actionClass(action: string): string {
  if (action === 'INSERT') return 'audit--insert'
  if (action === 'DELETE') return 'audit--delete'
  return 'audit--update'
}
</script>

<template>
  <div class="audit">
    <header class="page-header">
      <div>
        <h1>Auditoría</h1>
        <p class="text-muted">
          {{ isSuperadmin ? 'Cambios de todas las universidades.' : 'Cambios de tu universidad.' }}
        </p>
      </div>
    </header>

    <section class="card audit__filters">
      <label class="field">
        <span>Universidad</span>
        <select v-model="filters.organizationId">
          <option v-if="isSuperadmin" value="">Todas</option>
          <option v-for="org in organizations" :key="org.id" :value="org.id">{{ org.name }}</option>
        </select>
      </label>
      <label class="field">
        <span>Tabla</span>
        <input v-model="filters.tableName" placeholder="incidents, profiles..." />
      </label>
      <label class="field">
        <span>Acción</span>
        <select v-model="filters.action">
          <option value="">Todas</option>
          <option value="INSERT">Alta</option>
          <option value="UPDATE">Actualización</option>
          <option value="DELETE">Baja</option>
        </select>
      </label>
      <label class="field">
        <span>Filas</span>
        <select v-model.number="filters.limit">
          <option :value="50">50</option>
          <option :value="100">100</option>
          <option :value="200">200</option>
        </select>
      </label>
      <button class="btn audit__apply" type="button" :disabled="loading" @click="load">
        {{ loading ? 'Cargando...' : 'Aplicar filtros' }}
      </button>
    </section>

    <p v-if="error" class="audit__error">{{ error }}</p>

    <section class="card audit__card">
      <div class="audit__table-wrap">
        <table class="audit__table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Universidad</th>
              <th>Usuario</th>
              <th>Acción</th>
              <th>Tabla</th>
              <th>Registro</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in logs" :key="log.id">
              <td class="text-muted">{{ formatDate(log.createdAt) }}</td>
              <td>{{ log.organizationName ?? 'Global' }}</td>
              <td>{{ log.userName ?? 'Sistema / service role' }}</td>
              <td>
                <span class="audit__action" :class="actionClass(log.action)">{{ log.action }}</span>
              </td>
              <td><code>{{ log.tableName }}</code></td>
              <td class="text-muted audit__record">{{ log.recordId ?? '—' }}</td>
              <td class="audit__detail">{{ summary(log) }}</td>
            </tr>
            <tr v-if="!loading && logs.length === 0">
              <td colspan="7" class="text-muted">No hay registros de auditoría con estos filtros.</td>
            </tr>
            <tr v-if="loading">
              <td colspan="7" class="text-muted">Cargando auditoría...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.audit {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header h1 {
  margin: 0;
  font-size: 24px;
}

.audit__filters {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr 0.7fr auto;
  align-items: end;
  gap: 12px;
  padding: 16px;
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
  padding: 9px 11px;
  outline: none;
  text-transform: none;
  letter-spacing: normal;
  font-size: 14px;
}

.audit__apply {
  align-self: end;
  white-space: nowrap;
}

.audit__card {
  padding: 18px;
}

.audit__table-wrap {
  overflow-x: auto;
}

.audit__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.audit__table th,
.audit__table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}

.audit__table th {
  color: var(--text-muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.audit__action {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.audit--insert { color: var(--success); }
.audit--update { color: var(--warning); }
.audit--delete { color: var(--danger); }

.audit__record {
  font-family: monospace;
  font-size: 11px;
}

.audit__detail {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit__error {
  color: var(--danger);
}

@media (max-width: 900px) {
  .audit__filters {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 600px) {
  .audit__filters {
    grid-template-columns: 1fr;
  }
}
</style>
