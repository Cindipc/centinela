<script setup lang="ts">
defineProps<{
  label: string
  value: number
  tone?: 'info' | 'success' | 'warning' | 'danger'
  suffix?: string
}>()
</script>

<template>
  <div class="card stats-card" :class="`stats-card--${tone ?? 'info'}`">
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

.stats-card__value {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
  text-shadow: 0 0 18px currentColor;
}

.stats-card__suffix {
  font-size: 16px;
  margin-left: 2px;
}

.stats-card__label {
  font-size: 13px;
  color: var(--text-muted);
}

.stats-card--danger .stats-card__value { color: var(--danger); }
.stats-card--warning .stats-card__value { color: var(--warning); }
.stats-card--success .stats-card__value { color: var(--success); }
.stats-card--info .stats-card__value { color: var(--info); }
</style>