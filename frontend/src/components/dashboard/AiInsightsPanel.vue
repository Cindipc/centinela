<script setup lang="ts">
import { ref } from 'vue'
import { analyzeHotspots, analyzePatterns, isAiConfigured } from '@backend/api/aiApi'
import type { GeoAnalysis, IncidentPatterns } from '@backend/types'

const configured = isAiConfigured()
const loading = ref(false)
const error = ref<string | null>(null)
const patterns = ref<IncidentPatterns | null>(null)
const hotspots = ref<GeoAnalysis | null>(null)
const days = ref(30)

async function analyze() {
  if (!configured) return
  loading.value = true
  error.value = null
  try {
    const [patternResult, hotspotResult] = await Promise.allSettled([
      analyzePatterns(days.value),
      analyzeHotspots(days.value),
    ])
    patterns.value = patternResult.status === 'fulfilled' ? patternResult.value : null
    hotspots.value = hotspotResult.status === 'fulfilled' ? hotspotResult.value : null
    if (patternResult.status === 'rejected' && hotspotResult.status === 'rejected') {
      const reason =
        patternResult.status === 'rejected' ? patternResult.reason : hotspotResult.reason
      error.value = reason instanceof Error ? reason.message : 'El análisis de IA falló.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section v-if="configured" class="card insights">
    <header class="insights__head">
      <div>
        <h2>Análisis con IA</h2>
        <p class="text-muted">Patrones y concentración espacial de tu universidad.</p>
      </div>
      <div class="insights__actions">
        <select v-model.number="days" class="insights__days" :disabled="loading">
          <option :value="7">7 días</option>
          <option :value="30">30 días</option>
          <option :value="90">90 días</option>
        </select>
        <button class="btn btn--ghost btn--small" type="button" :disabled="loading" @click="analyze">
          {{ loading ? 'Analizando...' : 'Analizar' }}
        </button>
      </div>
    </header>

    <p v-if="error" class="insights__error">{{ error }}</p>

    <div v-if="patterns" class="insights__grid">
      <div>
        <h3>Patrones</h3>
        <p class="text-muted">{{ patterns.summary }}</p>
        <p class="insights__meta">
          {{ patterns.totalIncidents }} incidencias · {{ patterns.periodDays }} días ·
          fuente: {{ patterns.source }}
        </p>
        <ul v-if="patterns.patterns.length" class="insights__list">
          <li v-for="pattern in patterns.patterns" :key="pattern.pattern">
            <strong>{{ pattern.pattern }}</strong> · {{ pattern.severity }}
            <span class="text-muted">— {{ pattern.detail }}</span>
          </li>
        </ul>
      </div>

      <div>
        <h3>Zonas con más incidencias</h3>
        <p v-if="!hotspots?.hotspots.length" class="text-muted">
          No hay concentraciones suficientes en el periodo.
        </p>
        <ul v-else class="insights__list">
          <li v-for="hotspot in hotspots.hotspots" :key="hotspot.clusterId">
            {{ hotspot.incidentCount }} incidencias ·
            {{ hotspot.centerLat.toFixed(5) }}, {{ hotspot.centerLng.toFixed(5) }}
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.insights {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.insights__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.insights h2 {
  margin: 0;
  font-size: 16px;
}

.insights h3 {
  margin: 0 0 4px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.insights__head p,
.insights__grid p {
  margin: 2px 0;
  font-size: 13px;
}

.insights__actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.insights__days {
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 8px;
  color: var(--text);
  padding: 6px 8px;
  font-size: 12px;
}

.insights__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

.insights__meta {
  color: var(--text-muted);
  font-size: 11px;
}

.insights__list {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.insights__error {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
}

@media (max-width: 900px) {
  .insights__grid {
    grid-template-columns: 1fr;
  }
}
</style>
