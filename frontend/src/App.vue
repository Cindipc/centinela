<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import Sidebar from './components/layout/Sidebar.vue'
import Topbar from './components/layout/Topbar.vue'
import MobileNav from './components/layout/MobileNav.vue'
import PanicButton from './components/emergency/PanicButton.vue'

const auth = useAuthStore()
const route = useRoute()

// El layout con navegación solo aparece dentro de la app; el login va a pantalla completa.
const withShell = computed(() => auth.isAuthenticated && route.name !== 'login')
</script>

<template>
  <div v-if="withShell" class="app-shell">
    <Sidebar />
    <div class="app-main">
      <Topbar />
      <main class="app-content">
        <router-view />
      </main>
    </div>
    <MobileNav />
    <PanicButton />
  </div>
  <div v-else class="app-shell">
    <main class="app-content app-content--full">
      <router-view />
    </main>
  </div>
</template>