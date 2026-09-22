<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getEquipment } from '@backend/api/equipmentApi'
import type { Equipment, EquipmentStatus } from '@backend/types'

const equipment = ref<Equipment[]>([])
const loading = ref(true)
const search = ref('')

onMounted(async () => {
  equipment.value = await getEquipment()
  loading.value = false
})

const filtered = computed(() =>
  equipment.value.filter((item) =>
    [item.name, item.zone ?? '', item.serialNumber ?? '', item.category].some((field) =>
      field.toLowerCase().includes(search.value.toLowerCase())
    )
  )
)

const statusLabels: Record<EquipmentStatus, string> = {
  operativo: 'Operativo',
  en_reparacion: 'En reparación',
  caido: 'Caído',
  con_falla: 'Con falla',
}

const categoryLabels: Record<string, string> = {
  computo: 'Cómputo',
  red: 'Red',
  av: 'A/V',
  energia: 'Energía',
  cctv: 'CCTV',
  periferico: 'Periférico',
  otro: 'Otro',
}

const avgAvailability = computed(() => {
  const usable = equipment.value.filter((e) => e.status === 'operativo').length
  return equipment.value.length === 0 ? 100 : Math.round((usable / equipment.value.length) * 100)
})
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <h1>Inventario</h1>
        <p class="text-muted">Disponibilidad del equipo: {{ avgAvailability }}% · {{ equipment.length }} equipos</p>
      </div>
      <input v-model="search" class="search" placeholder="Buscar equipo, zona o serie..." />
    </header>

    <div v-if="loading" class="text-muted">Cargando inventario...</div>

    <div v-else class="equipment-grid">
      <article v-for="item in filtered" :key="item.id" class="card equipment">
        <div class="equipment__head">
          <span class="equipment__name">{{ item.name }}</span>
          <span class="badge" :class="`status--${item.status}`">{{ statusLabels[item.status] }}</span>
        </div>
        <div class="equipment__meta">
          <span>{{ categoryLabels[item.category] ?? item.category }}</span>
          <span class="sep">·</span>
          <span>{{ item.zone ?? 'Sin zona' }}</span>
        </div>
        <div class="equipment__qr text-muted">Serie: {{ item.serialNumber ?? '—' }}</div>
        <div class="equipment__foot text-muted">
          <span>Asignado a: {{ item.assignedToName ?? '—' }}</span>
        </div>
      </article>

      <div v-if="filtered.length === 0" class="text-muted equipment__empty">Sin resultados.</div>
    </div>
  </div>
</template>

<style scoped>
.search {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 10px 14px;
  width: 260px;
  outline: none;
}

.search:focus {
  border-color: var(--accent);
}

.equipment-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.equipment {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.equipment__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.equipment__name {
  font-weight: 600;
}

.equipment__meta {
  font-size: 13px;
  color: var(--text-muted);
}

.equipment__meta .sep {
  opacity: 0.5;
  margin: 0 4px;
}

.equipment__qr {
  font-size: 12px;
  font-family: monospace;
}

.equipment__foot {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}

.equipment__empty {
  grid-column: 1 / -1;
  text-align: center;
  padding: 40px 0;
}
</style>