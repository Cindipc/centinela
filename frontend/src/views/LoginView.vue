<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { homePathFor } from '@/navigation/roleNav'
import logoUrl from '@/assets/logo.png'

const { signIn, user, loading } = useAuth()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const submitError = ref<string | null>(null)

async function submit() {
  submitError.value = null
  try {
    await signIn(email.value, password.value)
    // El guard ya manda a /login si la sesión es inválida; aquí respetamos
    // el destino por rol (admin → /dashboard, seguridad → /seguridad/cola...).
    const redirect = route.query.redirect
    const target = typeof redirect === 'string' && redirect.startsWith('/') ? redirect : homePathFor(user.value?.role)
    router.push(target)
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : 'Error de autenticación'
  }
}
</script>

<template>
  <div class="login">
    <div class="login__bg" aria-hidden="true">
      <span class="login__grid"></span>
      <span class="login__glow"></span>
      <span class="login__scan"></span>
    </div>

    <form class="login__card" @submit.prevent="submit" novalidate>
      <span class="corner corner--tl" aria-hidden="true"></span>
      <span class="corner corner--tr" aria-hidden="true"></span>
      <span class="corner corner--bl" aria-hidden="true"></span>
      <span class="corner corner--br" aria-hidden="true"></span>

      <header class="login__brand">
        <div class="login__logo">
          <svg class="login__orbit" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" stroke-width="0.6" stroke-dasharray="2 5" />
          </svg>
          <img :src="logoUrl" alt="Centinela" width="104" height="104" />
        </div>
        <h1>CENTINELA</h1>
        <p class="login__tag">Vigilancia del campus</p>
      </header>

      <div class="field">
        <label for="login-email">Correo</label>
        <div class="field__control">
          <svg class="field__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Zm1.8.4 7.2 5.4 7.2-5.4" />
          </svg>
          <input
            id="login-email"
            v-model.trim="email"
            type="email"
            required
            autocomplete="username"
            placeholder="usuario@centinela.local"
          />
        </div>
      </div>

      <div class="field">
        <label for="login-password">Contraseña</label>
        <div class="field__control">
          <svg class="field__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 10V7.5a5 5 0 0 1 10 0V10M6 10h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" />
          </svg>
          <input
            id="login-password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            required
            autocomplete="current-password"
            placeholder="••••••••"
          />
          <button
            class="field__toggle"
            type="button"
            :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
            :aria-pressed="showPassword"
            @click="showPassword = !showPassword"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
              <path v-if="showPassword" d="M4 4l16 16" />
            </svg>
          </button>
        </div>
      </div>

      <p v-if="submitError" class="login__error" role="alert">{{ submitError }}</p>

      <button class="login__submit" type="submit" :disabled="loading">
        <span v-if="loading" class="login__spinner" aria-hidden="true"></span>
        {{ loading ? 'Verificando...' : 'Iniciar sesión' }}
      </button>

      <footer class="login__note">
        <p>Acceso restringido: solo un administrador puede crear cuentas.</p>
        <p>Cada rol entra a su propia vista (admin, seguridad, TI o usuario).</p>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.login {
  /* Paleta tomada del emblema: acero + cian sobre azul petróleo */
  --lg-bg: #031219;
  --lg-panel: rgba(6, 28, 37, 0.78);
  --lg-cyan: #2fe0ea;
  --lg-cyan-deep: #14a9b8;
  --lg-teal: #0c4a57;
  --lg-steel-1: #e8ecef;
  --lg-steel-2: #8d979f;
  --lg-text: #e6f6f8;
  --lg-muted: #8db0b8;
  --lg-danger: #ff7a88;
  --lg-heading-from: #ffffff;
  --lg-grid: rgba(47, 224, 234, 0.07);
  --lg-input-bg: rgba(2, 14, 20, 0.75);
  --lg-input-solid: #04202a;
  --lg-border: rgba(141, 176, 184, 0.28);
  --lg-placeholder: rgba(141, 176, 184, 0.5);
  --lg-shadow: 0 24px 60px rgba(0, 0, 0, 0.55), 0 0 40px rgba(20, 169, 184, 0.12);
  --lg-glow: radial-gradient(circle, rgba(20, 169, 184, 0.28), rgba(12, 74, 87, 0.12) 45%, transparent 70%);
  --lg-scan: rgba(47, 224, 234, 0.07);

  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: hidden;
  background: var(--lg-bg);
  color: var(--lg-text);
}

/* Tema claro: el login también respeta la preferencia del sistema */
:global(html[data-theme='light']) .login {
  --lg-bg: #eef5f7;
  --lg-panel: rgba(255, 255, 255, 0.9);
  --lg-cyan: #0b8f9c;
  --lg-cyan-deep: #0e8f9c;
  --lg-teal: #7fc9d4;
  --lg-steel-1: #ffffff;
  --lg-steel-2: #9aa7ae;
  --lg-text: #0d2530;
  --lg-muted: #4f6f7a;
  --lg-danger: #d63d54;
  --lg-heading-from: #0d2530;
  --lg-grid: rgba(12, 74, 87, 0.08);
  --lg-input-bg: #ffffff;
  --lg-input-solid: #ffffff;
  --lg-border: rgba(13, 60, 72, 0.2);
  --lg-placeholder: rgba(79, 111, 122, 0.65);
  --lg-shadow: 0 18px 40px rgba(13, 60, 72, 0.14);
  --lg-glow: radial-gradient(circle, rgba(20, 169, 184, 0.18), rgba(12, 74, 87, 0.06) 45%, transparent 70%);
  --lg-scan: rgba(11, 143, 156, 0.14);
}

/* ---------- Fondo ---------- */
.login__bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.login__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(var(--lg-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--lg-grid) 1px, transparent 1px);
  background-size: 36px 36px;
  mask-image: radial-gradient(ellipse at center, #000 20%, transparent 75%);
  -webkit-mask-image: radial-gradient(ellipse at center, #000 20%, transparent 75%);
}

.login__glow {
  position: absolute;
  left: 50%;
  top: 42%;
  width: 720px;
  height: 720px;
  transform: translate(-50%, -50%);
  background: var(--lg-glow);
}

.login__scan {
  position: absolute;
  left: 0;
  right: 0;
  height: 140px;
  background: linear-gradient(to bottom, transparent, var(--lg-scan), transparent);
  animation: scan 9s linear infinite;
}

@keyframes scan {
  from { transform: translateY(-160px); }
  to { transform: translateY(100vh); }
}

/* ---------- Tarjeta (borde metálico) ---------- */
.login__card {
  position: relative;
  width: 100%;
  max-width: 400px;
  padding: 34px 30px 26px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-radius: 18px;
  background: var(--lg-panel);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: var(--lg-shadow);
}

/* Borde metálico: se dibuja aparte para que el fondo de la tarjeta siga translúcido */
.login__card::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: 1.5px;
  border-radius: 18px;
  background: linear-gradient(145deg, var(--lg-steel-1), var(--lg-steel-2) 28%, var(--lg-teal) 52%, var(--lg-steel-1) 78%, var(--lg-steel-2));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  pointer-events: none;
}

.corner {
  position: absolute;
  width: 14px;
  height: 14px;
  border: 0 solid var(--lg-cyan);
  opacity: 0.85;
  pointer-events: none;
}
.corner--tl { top: 8px; left: 8px; border-top-width: 2px; border-left-width: 2px; border-top-left-radius: 4px; }
.corner--tr { top: 8px; right: 8px; border-top-width: 2px; border-right-width: 2px; border-top-right-radius: 4px; }
.corner--bl { bottom: 8px; left: 8px; border-bottom-width: 2px; border-left-width: 2px; border-bottom-left-radius: 4px; }
.corner--br { bottom: 8px; right: 8px; border-bottom-width: 2px; border-right-width: 2px; border-bottom-right-radius: 4px; }

/* ---------- Marca ---------- */
.login__brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}

.login__logo {
  position: relative;
  width: 124px;
  height: 124px;
  display: grid;
  place-items: center;
}

.login__logo img {
  position: relative;
  filter: drop-shadow(0 0 14px rgba(47, 224, 234, 0.45));
  animation: pulse 4.5s ease-in-out infinite;
}

.login__orbit {
  position: absolute;
  inset: 0;
  color: var(--lg-cyan);
  opacity: 0.55;
  animation: spin 40s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse {
  0%, 100% { filter: drop-shadow(0 0 10px rgba(47, 224, 234, 0.35)); }
  50% { filter: drop-shadow(0 0 22px rgba(47, 224, 234, 0.7)); }
}

.login__brand h1 {
  margin: 8px 0 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.32em;
  padding-left: 0.32em; /* compensa el espaciado para centrar el texto */
  background: linear-gradient(180deg, var(--lg-heading-from), var(--lg-steel-2));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.login__tag {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--lg-cyan);
}

/* ---------- Campos ---------- */
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field label {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lg-muted);
}

.field__control {
  position: relative;
  display: flex;
  align-items: center;
}

.field__icon {
  position: absolute;
  left: 12px;
  width: 18px;
  height: 18px;
  fill: none;
  stroke: var(--lg-muted);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
  transition: stroke 0.2s;
}

.field__control:focus-within .field__icon { stroke: var(--lg-cyan); }

.field input {
  width: 100%;
  padding: 12px 42px 12px 40px;
  font: inherit;
  font-size: 14px;
  color: var(--lg-text);
  background: var(--lg-input-bg);
  border: 1px solid var(--lg-border);
  border-radius: 10px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.field input::placeholder { color: var(--lg-placeholder); }

.field input:focus {
  border-color: var(--lg-cyan);
  box-shadow: 0 0 0 3px rgba(47, 224, 234, 0.16), 0 0 18px rgba(47, 224, 234, 0.22);
}

/* Evita el fondo claro del autocompletado del navegador */
.field input:-webkit-autofill {
  -webkit-text-fill-color: var(--lg-text);
  box-shadow: 0 0 0 1000px var(--lg-input-solid) inset;
  caret-color: var(--lg-text);
}

.field__toggle {
  position: absolute;
  right: 6px;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  background: none;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
}

.field__toggle svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: var(--lg-muted);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.field__toggle:hover svg,
.field__toggle:focus-visible svg { stroke: var(--lg-cyan); }
.field__toggle:focus-visible { outline: 2px solid var(--lg-cyan); outline-offset: 1px; }

/* ---------- Error y botón ---------- */
.login__error {
  margin: 0;
  padding: 9px 12px;
  font-size: 13px;
  color: var(--lg-danger);
  background: rgba(255, 122, 136, 0.08);
  border: 1px solid rgba(255, 122, 136, 0.35);
  border-radius: 8px;
}

.login__submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 4px;
  padding: 13px;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #032029;
  background: linear-gradient(180deg, #5df0f7, var(--lg-cyan-deep));
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 10px;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 0 22px rgba(47, 224, 234, 0.3);
  transition: filter 0.2s, box-shadow 0.2s, transform 0.1s;
}

.login__submit:hover:not(:disabled) {
  filter: brightness(1.08);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 0 30px rgba(47, 224, 234, 0.5);
}
.login__submit:active:not(:disabled) { transform: translateY(1px); }
.login__submit:focus-visible { outline: 2px solid var(--lg-text); outline-offset: 2px; }
.login__submit:disabled { opacity: 0.7; cursor: progress; }

.login__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(3, 32, 41, 0.3);
  border-top-color: #032029;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

/* ---------- Pie ---------- */
.login__note {
  margin-top: 4px;
  padding-top: 14px;
  border-top: 1px solid var(--lg-border);
  font-size: 11.5px;
  line-height: 1.5;
  text-align: center;
  color: var(--lg-muted);
}

.login__note p { margin: 0 0 4px; }

@media (max-width: 420px) {
  .login__card { padding: 28px 20px 22px; }
}

@media (prefers-reduced-motion: reduce) {
  .login__scan,
  .login__orbit,
  .login__logo img,
  .login__spinner { animation: none; }
}
</style>