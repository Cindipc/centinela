<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from './stores/auth'
import Sidebar from './components/layout/Sidebar.vue'
import Topbar from './components/layout/Topbar.vue'

const auth = useAuthStore()

onMounted(() => {
  auth.restoreSession()
})
</script>

<template>
  <div v-if="auth.isAuthenticated" class="app-shell">
    <Sidebar />
    <div class="app-main">
      <Topbar />
      <main class="app-content">
        <router-view />
      </main>
    </div>
  </div>
  <div v-else class="app-shell">
    <main class="app-content app-content--full">
      <router-view />
    </main>
  </div>
</template>