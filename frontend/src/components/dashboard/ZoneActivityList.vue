<script setup lang="ts">
interface ZoneEntry {
  zone: string
  incidentCount: number
  lastEventTitle: string
  lastEventAt: string
}

defineProps<{
  zones: ZoneEntry[]
}>()
</script>

<template>
  <section class="card zone-list">
    <header class="zone-list__head">
      <h3>Actividad por zona</h3>
    </header>
    <ul class="zone-list__items">
      <li v-for="zone in zones" :key="zone.zone" class="zone-list__item">
        <span class="zone-list__name">{{ zone.zone }}</span>
        <span class="zone-list__count" :class="{ 'zone-list__count--alert': zone.incidentCount > 1 }">
          {{ zone.incidentCount }} inc.
        </span>
        <div class="zone-list__event">
          <span>{{ zone.lastEventTitle }}</span>
          <span class="text-muted zone-list__time">{{ zone.lastEventAt }}</span>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.zone-list {
  padding: 18px;
}

.zone-list__head h3 {
  margin: 0 0 14px;
  font-size: 16px;
}

.zone-list__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.zone-list__item {
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: center;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.zone-list__item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.zone-list__name {
  font-weight: 600;
  font-size: 14px;
}

.zone-list__count {
  font-size: 12px;
  background: var(--bg-raised);
  padding: 2px 8px;
  border-radius: 999px;
  color: var(--text-muted);
}

.zone-list__count--alert {
  background: rgba(255, 71, 87, 0.15);
  color: var(--danger);
}

.zone-list__event {
  display: flex;
  flex-direction: column;
  font-size: 13px;
  text-align: right;
}

.zone-list__time {
  font-size: 11px;
}
</style>