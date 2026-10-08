<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { isActivePath, mobileNavItemsFor } from '@/navigation/roleNav'

const route = useRoute()
const { user } = useAuth()

const items = computed(() => mobileNavItemsFor(user.value?.role))
</script>

<template>
  <nav class="bottombar">
    <router-link
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="bottombar__link"
      :class="{
        'bottombar__link--active': isActivePath(route.path, item.to),
        'bottombar__link--primary': item.primary,
      }"
    >
      <span class="bottombar__icon">{{ item.icon }}</span>
      <span class="bottombar__label">{{ item.label }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.bottombar {
  display: none;
}

@media (max-width: 768px) {
  .bottombar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 60;
    display: flex;
    justify-content: space-around;
    align-items: stretch;
    gap: 2px;
    padding: 6px 6px calc(6px + env(safe-area-inset-bottom, 0px));
    background: var(--bg-raised);
    border-top: 1px solid var(--border);
  }

  .bottombar__link {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 52px;
    padding: 6px 2px;
    border-radius: 10px;
    color: var(--text-muted);
    text-decoration: none;
    font-size: 11px;
    font-weight: 600;
  }

  .bottombar__link--active {
    color: var(--accent);
    background: rgba(47, 125, 255, 0.12);
  }

  .bottombar__icon {
    font-size: 18px;
    line-height: 1;
  }

  .bottombar__label {
    white-space: nowrap;
  }

  .bottombar__link--primary .bottombar__icon {
    color: var(--accent);
  }
}
</style>