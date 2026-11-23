<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import StatsCard from '@/components/dashboard/StatsCard.vue'
import { getLicenses, getOrganizations, getPlatformStats } from '@backend/api/organizationsApi'
import type { License, Organization, PlatformStats } from '@backend/types'

const stats = ref<PlatformStats | null>(null)
const organizations = ref<Organization[]>([])
const licenses = ref<License[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const [platformStats, orgList, licenseList] = await Promise.all([
      getPlatformStats(),
      getOrganizations(),
      getLicenses(),
    ])
    stats.value = platformStats
    organizations.value = orgList
    licenses.value = licenseList
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo cargar el panel global.'
  } finally {
    loading.value = false
  }
})

const licensesByOrganization = computed(() => {
  const map = new Map<string, License>()
  for (const license of licenses.value) {
    if (!map.has(license.organizationId)) map.set(license.organizationId, license)
  }
  return map
})

const organizationsWithLicense = computed(() =>
  organizations.value.map((organization) => ({
    ...organization,
    license: licensesByOrganization.value.get(organization.id) ?? null,
  }))
)

function statusTone(value: string): string {
  if (value === 'activa') return 'ok'
  if (value === 'pendiente') return 'warning'
  return 'danger'
}
</script>

<template>
  <div class="global">
    <header class="page-header">
      <div>
        <h1>Panel global</h1>
        <p class="text-muted">Universidades, licencias y actividad de toda la plataforma.</p>
      </div>
      <div class="page-header__actions">
        <router-link class="btn btn--ghost" to="/superadmin/universidades">Universidades</router-link>
        <router-link class="btn btn--ghost" to="/auditoria">Auditoría</router-link>
      </div>
    </header>

    <p v-if="error" class="global__error">{{ error }}</p>
    <p v-else-if="loading" class="text-muted">Cargando información global...</p>

    <template v-if="stats">
      <section class="stats-grid">
        <StatsCard label="Universidades" :value="stats.organizations" tone="info" />
        <StatsCard label="Universidades activas" :value="stats.organizationsActive" tone="success" />
        <StatsCard label="Licencias activas" :value="stats.licensesActive" tone="success" />
        <StatsCard label="Licencias vencidas" :value="stats.licensesExpired" tone="danger" />
        <StatsCard label="Usuarios" :value="stats.users" tone="info" />
        <StatsCard label="Incidencias abiertas" :value="stats.openIncidents" tone="warning" />
        <StatsCard label="Alertas de pánico" :value="stats.panicAlertsActive" tone="danger" />
        <StatsCard label="Equipos" :value="stats.equipment" tone="info" />
      </section>

      <section class="card global__table-card">
        <h2>Universidades y licencias</h2>
        <div class="global__table-wrap">
          <table class="global__table">
            <thead>
              <tr>
                <th>Universidad</th>
                <th>Estado</th>
                <th>Licencia</th>
                <th>Vigencia</th>
                <th>Usuarios</th>
                <th>Zonas</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="organization in organizationsWithLicense" :key="organization.id">
                <td>
                  <strong>{{ organization.name }}</strong>
                  <div class="text-muted global__slug">{{ organization.slug ?? 'sin slug' }}</div>
                </td>
                <td><span class="badge" :class="`badge--${statusTone(organization.status)}`">{{ organization.status }}</span></td>
                <td>
                  <span v-if="organization.license" class="badge" :class="`badge--${statusTone(organization.license.effectiveStatus)}`">
                    {{ organization.license.effectiveStatus }}
                  </span>
                  <span v-else class="text-muted">Sin licencia</span>
                </td>
                <td class="text-muted">
                  {{ organization.license ? `${organization.license.startDate} → ${organization.license.endDate}` : '—' }}
                </td>
                <td class="text-muted">{{ organization.license?.maxUsers ?? '—' }}</td>
                <td class="text-muted">{{ organization.license?.maxZones ?? '—' }}</td>
              </tr>
              <tr v-if="organizationsWithLicense.length === 0">
                <td colspan="6" class="text-muted">No hay universidades registradas.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.global {
  display: flex;
  flex-direction: column;
  gap: 20px;
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

.page-header__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.global__error {
  color: var(--danger);
}

.global__table-card {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.global__table-card h2 {
  margin: 0;
  font-size: 15px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--text-muted);
}

.global__table-wrap {
  overflow-x: auto;
}

.global__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.global__table th,
.global__table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  white-space: nowrap;
}

.global__table th {
  color: var(--text-muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.global__slug {
  font-size: 12px;
  margin-top: 2px;
}

.badge--ok {
  color: var(--success);
  border-color: rgba(85, 224, 176, 0.4);
}

.badge--warning {
  color: var(--warning);
  border-color: rgba(245, 194, 107, 0.4);
}

.badge--danger {
  color: var(--danger);
  border-color: rgba(255, 122, 136, 0.4);
}
</style>
