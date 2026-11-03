<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useRole } from '@/composables/useRole'
import { useTheme } from '@/composables/useTheme'

const { user } = useAuth()
const { role, isAdmin, canReportIncidents, canManageEquipment, canScanQr } = useRole()
const { theme, setTheme } = useTheme()

const roleLabels: Record<string, string> = {
  usuario: 'Usuario',
  seguridad: 'Seguridad',
  ti: 'TI',
  admin: 'Administrador',
}

const initials = computed(() => {
  const name = user.value?.name ?? '?'
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
})

const notificacionesEnabled = ref(true)
const alertasCriticas = ref(true)
const turno = ref('08:00 – 20:00')

const saved = ref(false)

function save() {
  saved.value = true
  setTimeout(() => (saved.value = false), 2000)
}
</script>

<template>
  <div class="settings">
    <header class="page-header">
      <div>
        <h1>Configuración</h1>
        <p class="text-muted">Perfil, roles y preferencias</p>
      </div>
    </header>

    <section class="card settings__section">
      <h2>Perfil</h2>
      <div class="settings__profile">
        <div class="settings__avatar">{{ initials }}</div>
        <div>
          <div class="settings__name">{{ user?.name }}</div>
          <div class="text-muted">{{ user?.email }}</div>
        </div>
        <span class="badge">{{ user?.role ? roleLabels[user.role] : '—' }}</span>
      </div>
    </section>

    <section class="card settings__section">
      <h2>Permisos</h2>
      <ul class="settings__permissions">
        <li :class="{ ok: canReportIncidents }">Reportar incidencias</li>
        <li :class="{ ok: canManageEquipment }">Gestionar inventario</li>
        <li :class="{ ok: canScanQr }">Escaneo de QR</li>
        <li :class="{ ok: isAdmin }">Administración general</li>
      </ul>
      <p class="text-muted settings__role">Rol actual: <strong>{{ role }}</strong></p>
    </section>

    <section class="card settings__section">
      <h2>Preferencias</h2>
      <div class="settings__field settings__field--row">
        <label for="notif">Notificaciones en tiempo real</label>
        <input id="notif" v-model="notificacionesEnabled" type="checkbox" />
      </div>
      <div class="settings__field settings__field--row">
        <label for="alertas">Alertas críticas</label>
        <input id="alertas" v-model="alertasCriticas" type="checkbox" />
      </div>
      <div class="settings__field settings__field--row">
        <label for="turno">Horario de turno</label>
        <select id="turno" v-model="turno">
          <option value="08:00 – 20:00">08:00 – 20:00</option>
          <option value="20:00 – 08:00">20:00 – 08:00</option>
        </select>
      </div>
    </section>

    <section class="card settings__section">
      <h2>Apariencia</h2>
      <div class="settings__field settings__field--row">
        <span>Tema de la interfaz</span>
        <div class="theme-switch" role="group" aria-label="Tema de la interfaz">
          <button
            type="button"
            class="theme-switch__option"
            :class="{ 'theme-switch__option--active': theme === 'light' }"
            :aria-pressed="theme === 'light'"
            @click="setTheme('light')"
          >
            Claro
          </button>
          <button
            type="button"
            class="theme-switch__option"
            :class="{ 'theme-switch__option--active': theme === 'dark' }"
            :aria-pressed="theme === 'dark'"
            @click="setTheme('dark')"
          >
            Oscuro
          </button>
        </div>
      </div>
      <p class="text-muted settings__role">
        Si no eliges un tema, se usa el tema del sistema (Edge en claro se verá en claro; un visor en oscuro se verá en oscuro).
      </p>
    </section>

    <section class="card settings__section">
      <h2>Administración</h2>
      <p class="text-muted settings__role">
        El registro es cerrado: las cuentas nuevas las crea un administrador y se les asigna el rol al momento del alta.
      </p>
      <router-link class="btn settings__link" to="/configuracion/usuarios">
        Gestionar usuarios
      </router-link>
    </section>

    <div class="settings__actions">
      <button class="btn" @click="save">Guardar cambios</button>
      <span v-if="saved" class="settings__saved">✓ Guardado</span>
    </div>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 720px;
}

.settings__section {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.settings__section h2 {
  margin: 0;
  font-size: 15px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.settings__profile {
  display: flex;
  align-items: center;
  gap: 14px;
}

.settings__avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 1px solid var(--emblem-ring);
  background: linear-gradient(180deg, #5df0f7, var(--primary));
  color: #032029;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  box-shadow: 0 0 14px rgba(47, 224, 234, 0.35);
}

.settings__name {
  font-weight: 600;
}

.settings__permissions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings__permissions li {
  color: var(--text-muted);
}

.settings__permissions li.ok::before {
  content: '✓ ';
  color: var(--success);
}

.settings__role {
  font-size: 13px;
}

.settings__field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  font-size: 14px;
}

.settings__field--row {
  padding: 8px 0;
}

.settings__field select {
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 10px;
  color: var(--text);
  padding: 8px 12px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.settings__field select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(47, 224, 234, 0.16);
}

.theme-switch {
  display: inline-flex;
  padding: 3px;
  gap: 3px;
  border: 1px solid var(--input-border);
  border-radius: 10px;
  background: var(--input-bg);
}

.theme-switch__option {
  padding: 6px 14px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  transition: background 0.15s, color 0.15s;
}

.theme-switch__option:hover {
  color: var(--accent);
}

.theme-switch__option--active {
  background: linear-gradient(180deg, #5df0f7, var(--primary));
  color: #032029;
}

.theme-switch__option:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.settings__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settings__link {
  align-self: flex-start;
  text-decoration: none;
}

.settings__saved {
  color: var(--success);
  font-size: 14px;
}
</style>