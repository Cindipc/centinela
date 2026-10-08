<script setup lang="ts">
import { ref } from 'vue'
import { useEmergencyStore } from '@/stores/emergency'
import { useAuth } from '@/composables/useAuth'

const emergency = useEmergencyStore()
const { user } = useAuth()

/** Botón de pánico flotante: visible en todas las vistas, escribe en panic_alerts. */
const confirming = ref(false)
const message = ref<string | null>(null)
const error = ref<string | null>(null)

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Este dispositivo no reporta ubicación.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 30000,
    })
  })
}

async function send() {
  error.value = null
  message.value = null
  confirming.value = false
  try {
    const position = await currentPosition()
    await emergency.triggerPanic({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    })
    message.value = 'Alerta enviada. Seguridad ya fue notificado.'
  } catch (e) {
    const reason = e instanceof GeolocationPositionError ? e.message : e instanceof Error ? e.message : ''
    error.value = `No se pudo enviar la alerta de pánico. ${reason}`
  }
}
</script>

<template>
  <div v-if="user" class="panic">
    <Transition name="panic-toast">
      <p v-if="message" class="panic__toast panic__toast--ok">{{ message }}</p>
      <p v-else-if="error" class="panic__toast panic__toast--error">{{ error }}</p>
    </Transition>

    <button class="panic__button" :disabled="emergency.sending" @click="confirming = true">
      <span class="panic__icon">🆘</span>
      <span class="panic__label">Pánico</span>
    </button>

    <Teleport to="body">
      <div v-if="confirming" class="panic-modal" @click.self="confirming = false">
        <div class="card panic-modal__box">
          <h2>¿Confirmar alerta de pánico?</h2>
          <p class="text-muted">
            Se enviará tu ubicación actual a seguridad y se registrará como alerta activa.
          </p>
          <div class="panic-modal__actions">
            <button class="btn btn--ghost" @click="confirming = false">Cancelar</button>
            <button class="btn btn--danger" @click="send">Enviar alerta</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.panic {
  position: fixed;
  right: 16px;
  bottom: 20px;
  z-index: 70;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.panic__button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border: none;
  border-radius: 999px;
  background: var(--danger);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  box-shadow: var(--shadow);
  animation: panicPulse 1.8s infinite;
}

.panic__button:disabled {
  opacity: 0.7;
}

.panic__icon {
  font-size: 18px;
}

.panic__toast {
  margin: 0;
  max-width: 280px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  background: var(--bg-card);
  border: 1px solid var(--border);
}

.panic__toast--ok {
  color: var(--success);
  border-color: rgba(46, 213, 115, 0.4);
}

.panic__toast--error {
  color: var(--danger);
  border-color: rgba(255, 71, 87, 0.4);
}

.panic-toast-enter-active,
.panic-toast-leave-active {
  transition: opacity 0.2s ease;
}

.panic-toast-enter-from,
.panic-toast-leave-to {
  opacity: 0;
}

.panic-modal {
  position: fixed;
  inset: 0;
  z-index: 120;
  background: rgba(4, 7, 16, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.panic-modal__box {
  width: 100%;
  max-width: 380px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panic-modal__box h2 {
  margin: 0;
  font-size: 18px;
}

.panic-modal__box p {
  margin: 0;
  font-size: 14px;
}

.panic-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
}

@keyframes panicPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.45); }
  50% { box-shadow: 0 0 0 10px rgba(255, 71, 87, 0); }
}

@media (max-width: 768px) {
  .panic {
    bottom: 76px;
    right: 14px;
  }
}
</style>