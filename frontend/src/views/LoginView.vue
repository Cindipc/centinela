<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const { signIn, loading } = useAuth()
const router = useRouter()

const email = ref('')
const password = ref('')
const submitError = ref<string | null>(null)

async function submit() {
  submitError.value = null
  try {
    await signIn(email.value, password.value)
    router.push({ name: 'dashboard' })
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'Error de autenticación'
  }
}
</script>

<template>
  <div class="login">
    <form class="card login__card" @submit.prevent="submit">
      <div class="login__brand">
        <img src="/src/assets/logo.svg" alt="Centinela" width="52" height="52" />
        <h1>Centinela</h1>
        <p class="text-muted">Vigilancia del campus</p>
      </div>

      <div class="field">
        <span>Correo</span>
        <input v-model.trim="email" type="email" required autocomplete="username" placeholder="usuario@centinela.local" />
      </div>

      <div class="field">
        <span>Contraseña</span>
        <input v-model="password" type="password" required autocomplete="current-password" placeholder="••••••••" />
      </div>

      <p v-if="submitError" class="login__error">{{ submitError }}</p>

      <button class="btn login__submit" type="submit" :disabled="loading">
        {{ loading ? 'Entrando...' : 'Iniciar sesión' }}
      </button>

      <div class="login__demo text-muted">
        <p>Sesión autenticada contra Supabase Auth.</p>
        <p>Crea el usuario en el panel de Supabase (el perfil se genera automáticamente).</p>
      </div>
    </form>
  </div>
</template>

<style scoped>
.login {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.login__card {
  width: 100%;
  max-width: 380px;
  padding: 32px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.login__brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.login__brand h1 {
  margin: 4px 0 0;
  font-size: 24px;
}

.login__brand p {
  margin: 0;
  font-size: 13px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--text-muted);
}

.field input {
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 10px 12px;
  outline: none;
}

.field input:focus {
  border-color: var(--accent);
}

.login__submit {
  justify-content: center;
  padding: 12px;
  font-size: 15px;
}

.login__error {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
}

.login__demo {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  font-size: 12px;
}

.login__demo p {
  margin: 0 0 4px;
}

.login__demo ul {
  margin: 0;
  padding-left: 16px;
}
</style>