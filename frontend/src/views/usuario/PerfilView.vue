<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useIncidentsStore } from '@/stores/incidents'
import { useEmergencyStore } from '@/stores/emergency'
import { ROLE_LABELS } from '@/navigation/roleNav'
import { ageLabel } from '@/composables/useIncidentQueue'

const { user } = useAuth()
const store = useIncidentsStore()
const emergency = useEmergencyStore()

const newContact = reactive({ name: '', phone: '', relation: '' })
const saving = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

onMounted(() => {
  emergency.fetchContacts()
  emergency.fetchPanics()
  store.fetchReferences()
})

const zoneName = computed(
  () => store.zones.find((z) => z.id === user.value?.zoneId)?.name ?? null
)
const departmentName = computed(
  () => store.zones.find((z) => z.departmentId && z.departmentId === user.value?.departmentId)?.name ?? null
)

const initials = computed(() =>
  (user.value?.name ?? '?')
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
)

async function addContact() {
  error.value = null
  notice.value = null
  if (!newContact.name.trim() || !newContact.phone.trim()) {
    error.value = 'Nombre y teléfono son obligatorios.'
    return
  }
  saving.value = true
  try {
    await emergency.addContact({
      name: newContact.name.trim(),
      phone: newContact.phone.trim(),
      relation: newContact.relation.trim() || undefined,
    })
    newContact.name = ''
    newContact.phone = ''
    newContact.relation = ''
    notice.value = 'Contacto agregado.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo guardar el contacto.'
  } finally {
    saving.value = false
  }
}

async function removeContact(id: string) {
  error.value = null
  await emergency.removeContact(id)
}

async function cancelPanic(id: string) {
  error.value = null
  try {
    await emergency.closePanic(id, 'falsa_alarma')
    notice.value = 'Alerta de pánico cancelada.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo cancelar la alerta.'
  }
}

const tel = (phone: string) => `tel:${phone}`
</script>

<template>
  <div class="perfil">
    <header class="page-header">
      <div>
        <h1>Perfil</h1>
        <p class="text-muted">Tus datos y a quién avisamos si pulsas el botón de pánico.</p>
      </div>
    </header>

    <section class="card perfil__card">
      <div class="perfil__avatar">{{ initials }}</div>
      <dl class="perfil__data">
        <div>
          <dt>Nombre</dt>
          <dd>{{ user?.name ?? '—' }}</dd>
        </div>
        <div>
          <dt>Correo</dt>
          <dd>{{ user?.email || '—' }}</dd>
        </div>
        <div>
          <dt>Rol</dt>
          <dd>{{ user ? ROLE_LABELS[user.role] : '—' }}</dd>
        </div>
        <div>
          <dt>Zona</dt>
          <dd>{{ zoneName ?? user?.zoneId ?? '—' }}</dd>
        </div>
        <div>
          <dt>Departamento</dt>
          <dd>{{ departmentName ?? '—' }}</dd>
        </div>
        <div>
          <dt>Teléfono</dt>
          <dd>{{ user?.phone ?? '—' }}</dd>
        </div>
      </dl>
    </section>

    <section v-if="emergency.activePanics.length > 0" class="card perfil__panic">
      <h2>Alerta de pánico activa</h2>
      <div v-for="panic in emergency.activePanics" :key="panic.id" class="perfil__panic-row">
        <div>
          <strong>{{ panic.zone ?? 'Ubicación por GPS' }}</strong>
          <span class="text-muted"> · {{ ageLabel(panic.createdAt) }}</span>
          <p v-if="panic.latitude !== null" class="text-muted perfil__coords">
            {{ panic.latitude.toFixed(5) }}, {{ panic.longitude?.toFixed(5) }}
          </p>
        </div>
        <button class="btn btn--ghost" @click="cancelPanic(panic.id)">Cancelar alerta</button>
      </div>
    </section>

    <section class="card perfil__card">
      <h2 class="perfil__title">Contactos de confianza</h2>
      <p class="text-muted perfil__hint">
        Se usan como referencia para el personal de seguridad cuando atienden tu alerta.
      </p>

      <p v-if="notice" class="perfil__notice">{{ notice }}</p>
      <p v-if="error" class="perfil__error">{{ error }}</p>

      <ul class="contacts">
        <li v-for="contact in emergency.contacts" :key="contact.id" class="contacts__item">
          <div>
            <strong>{{ contact.name }}</strong>
            <span class="text-muted"> {{ contact.relation ?? '' }}</span>
          </div>
          <div class="contacts__actions">
            <a class="btn btn--ghost btn--small" :href="tel(contact.phone)">Llamar</a>
            <button class="btn btn--ghost btn--small" @click="removeContact(contact.id)">Quitar</button>
          </div>
        </li>
        <li v-if="emergency.contacts.length === 0" class="text-muted contacts__empty">
          Aún no tienes contactos de confianza.
        </li>
      </ul>

      <form class="contacts__form" @submit.prevent="addContact">
        <input v-model.trim="newContact.name" required placeholder="Nombre" />
        <input v-model.trim="newContact.phone" required type="tel" placeholder="Teléfono" />
        <input v-model.trim="newContact.relation" placeholder="Parentesco (opcional)" />
        <button class="btn" type="submit" :disabled="saving">
          {{ saving ? 'Guardando...' : 'Agregar' }}
        </button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.perfil {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 760px;
}

.perfil__card {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.perfil__title {
  margin: 0;
  font-size: 16px;
}

.perfil__hint {
  margin: -6px 0 0;
  font-size: 12px;
}

.perfil__avatar {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
}

.perfil__data {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.perfil__data dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--text-muted);
}

.perfil__data dd {
  margin: 2px 0 0;
  font-size: 14px;
}

.perfil__panic {
  padding: 18px;
  border-color: rgba(255, 71, 87, 0.45);
  background: rgba(255, 71, 87, 0.08);
}

.perfil__panic h2 {
  margin: 0 0 10px;
  font-size: 16px;
}

.perfil__panic-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 14px;
}

.perfil__coords {
  margin: 2px 0 0;
  font-size: 12px;
  font-family: monospace;
}

.perfil__notice {
  margin: 0;
  color: var(--success);
  font-size: 13px;
}

.perfil__error {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
}

.contacts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.contacts__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-raised);
  font-size: 14px;
}

.contacts__actions {
  display: flex;
  gap: 8px;
}

.contacts__empty {
  padding: 12px 0;
  font-size: 13px;
}

.contacts__form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.contacts__form input {
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 10px 12px;
  outline: none;
}

.contacts__form input:focus {
  border-color: var(--accent);
}

.btn--small {
  padding: 6px 12px;
  font-size: 13px;
}

@media (max-width: 640px) {
  .contacts__form {
    grid-template-columns: 1fr;
  }
}
</style>