<script setup lang="ts">
defineProps<{
  label: string
  value: number
  icon?: string
  tone?: 'info' | 'success' | 'warning' | 'danger'
  suffix?: string
}>()
</script>

<template>
  <div class="card stats-card" :class="`stats-card--${tone ?? 'info'}`">
    <div class="stats-card__icon">{{ icon ?? '•' }}</div>
    <div class="stats-card__body">
      <div class="stats-card__value">
        {{ value }}<span v-if="suffix" class="stats-card__suffix">{{ suffix }}</span>
      </div>
      <div class="stats-card__label">{{ label }}</div>
    </div>
  </div>
</template>

<style scoped>
.stats-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
}

.stats-card__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  background: var(--bg-raised);
}

.stats-card__value {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
}

.stats-card__suffix {
  font-size: 16px;
  margin-left: 2px;
}

.stats-card__label {
  font-size: 13px;
  color: var(--text-muted);
}

.stats-card--danger .stats-card__icon { background: rgba(255, 71, 87, 0.15); }
.stats-card--danger .stats-card__value { color: var(--danger); }
.stats-card--warning .stats-card__icon { background: rgba(255, 165, 2, 0.15); }
.stats-card--warning .stats-card__value { color: var(--warning); }
.stats-card--success .stats-card__icon { background: rgba(46, 213, 115, 0.15); }
.stats-card--success .stats-card__value { color: var(--success); }
.stats-card--info .stats-card__icon { background: rgba(24, 185, 242, 0.15); }
.stats-card--info .stats-card__value { color: var(--info); }
</style>