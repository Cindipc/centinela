<script setup lang="ts">
const zones = [
  { name: 'Acceso Norte', x: 30, y: 20, tone: 'ok' },
  { name: 'Perímetro Oeste', x: 8, y: 55, tone: 'warn' },
  { name: 'Laboratorio B', x: 55, y: 35, tone: 'ok' },
  { name: 'Estacionamiento P1', x: 70, y: 70, tone: 'danger' },
  { name: 'Biblioteca', x: 45, y: 62, tone: 'ok' },
]
</script>

<template>
  <section class="card campus-map">
    <header class="campus-map__head">
      <h3>Mapa del campus</h3>
      <span class="campus-map__legend"><span class="dot dot--ok"></span> Operativo · <span class="dot dot--warn"></span> Atención · <span class="dot dot--danger"></span> Crítico</span>
    </header>
    <div class="campus-map__canvas">
      <svg viewBox="0 0 100 80" preserveAspectRatio="none" class="campus-map__grid">
        <rect x="2" y="2" width="96" height="76" fill="rgba(255,255,255,0.03)" stroke="var(--border)" />
        <rect x="28" y="15" width="12" height="14" fill="rgba(255,255,255,0.06)" stroke="var(--border)" />
        <rect x="50" y="28" width="12" height="14" fill="rgba(255,255,255,0.06)" stroke="var(--border)" />
        <rect x="42" y="60" width="10" height="12" fill="rgba(255,255,255,0.06)" stroke="var(--border)" />
        <rect x="66" y="66" width="10" height="12" fill="rgba(255,255,255,0.06)" stroke="var(--border)" />
        <path d="M30 20 H 55 72" stroke="var(--border)" stroke-width="0.4" fill="none" stroke-dasharray="1.5 1.5" />
      </svg>
      <div
        v-for="zone in zones"
        :key="zone.name"
        class="campus-map__pin"
        :class="`pin--${zone.tone}`"
        :style="{ left: zone.x + '%', top: zone.y + '%' }"
      >
        <span class="campus-map__pin-dot"></span>
        <span class="campus-map__pin-label">{{ zone.name }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.campus-map {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.campus-map__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.campus-map__head h3 {
  margin: 0;
  font-size: 16px;
}

.campus-map__legend {
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.dot--ok { background: var(--success); }
.dot--warn { background: var(--warning); }
.dot--danger { background: var(--danger); }

.campus-map__canvas {
  position: relative;
  flex: 1;
  min-height: 280px;
  border-radius: 8px;
  overflow: hidden;
}

.campus-map__grid {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.campus-map__pin {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.campus-map__pin-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--bg);
  box-shadow: 0 0 8px currentColor;
}

.pin--ok .campus-map__pin-dot { background: var(--success); color: var(--success); }
.pin--warn .campus-map__pin-dot { background: var(--warning); color: var(--warning); }
.pin--danger .campus-map__pin-dot { background: var(--danger); color: var(--danger); animation: pulse 1.2s infinite; }

.campus-map__pin-label {
  font-size: 11px;
  color: var(--text);
  background: rgba(11, 16, 32, 0.8);
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.35); }
}
</style>