<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useTheme } from '@/composables/useTheme'
import { ROLE_LABELS } from '@/navigation/roleNav'

const { user, signOut } = useAuth()
const router = useRouter()
const { isDark, toggleTheme } = useTheme()

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
      <div class="topbar__scope text-muted">
        <span>{{ user?.organizationName ?? 'Plataforma global' }}</span>
        <span class="topbar__role">{{ user?.role ? ROLE_LABELS[user.role] : '' }}</span>
      </div>
      <span class="topbar__clock">{{ currentTime }}</span>
      <button
        class="topbar__theme"
        type="button"
        :aria-label="isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
        :title="isDark ? 'Modo claro' : 'Modo oscuro'"
        @click="toggleTheme"
      >
        <!-- Muestra el tema al que se cambiará: sol (claro) o luna (oscuro) -->
        <svg v-if="isDark" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
        </svg>
      </button>
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
  background: var(--shell-bg);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
}

.topbar__right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.topbar__scope {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  font-size: 12px;
}

.topbar__role {
  text-transform: capitalize;
  font-size: 11px;
  color: var(--accent);
}

.topbar__clock {
  font-variant-numeric: tabular-nums;
  font-size: 14px;
  color: var(--text);
}

.topbar__theme {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid var(--input-border);
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}

.topbar__theme svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.topbar__theme:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
}

.topbar__theme:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
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
  border: 1px solid var(--emblem-ring);
  background: linear-gradient(180deg, #5df0f7, var(--primary));
  color: #032029;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 0 14px rgba(47, 224, 234, 0.35);
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