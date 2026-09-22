<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const { user, signOut } = useAuth()
const router = useRouter()

const initials = computed(() => {
  const name = user.value?.name ?? '?'
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
})

const currentTime = computed(() => new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))

async function handleLogout() {
  await signOut()
  router.push({ name: 'login' })
}
</script>

<template>
  <header class="topbar">
    <div class="topbar__right">
      <div class="topbar__role text-muted">{{ user?.role ?? '' }}</div>
      <span class="topbar__clock">{{ currentTime }}</span>
      <div class="topbar__profile">
        <span class="topbar__avatar">{{ initials }}</span>
        <span class="topbar__name">{{ user?.name ?? 'Usuario' }}</span>
      </div>
      <button class="btn btn--ghost btn--small" @click="handleLogout">Salir</button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 12px 24px;
  background: var(--bg-raised);
  border-bottom: 1px solid var(--border);
}

.topbar__right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.topbar__role {
  text-transform: capitalize;
  font-size: 13px;
}

.topbar__clock {
  font-variant-numeric: tabular-nums;
  font-size: 14px;
  color: var(--text);
}

.topbar__profile {
  display: flex;
  align-items: center;
  gap: 10px;
}

.topbar__avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
}

.topbar__name {
  font-size: 14px;
  font-weight: 600;
}

.btn--small {
  padding: 6px 12px;
  font-size: 13px;
}
</style>