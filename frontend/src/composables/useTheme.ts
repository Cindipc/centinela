import { computed, ref, watch } from 'vue'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'centinela-theme'

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    /* almacenamiento no disponible (modo incógnito): se usa el del sistema */
  }
  return systemTheme()
}

const theme = ref<Theme>(readStoredTheme())

watch(
  theme,
  (value) => {
    document.documentElement.dataset.theme = value
    document.documentElement.style.colorScheme = value
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (meta) meta.content = value === 'light' ? '#eef5f7' : '#031219'
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      /* preferencia efímera si no hay almacenamiento */
    }
  },
  { immediate: true }
)

// Si el sistema cambia de tema y el usuario no eligió uno a mano, la app lo sigue.
window
  .matchMedia('(prefers-color-scheme: light)')
  .addEventListener('change', (event) => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return
    } catch {
      /* sin almacenamiento: siempre seguir al sistema */
    }
    theme.value = event.matches ? 'light' : 'dark'
  })

export function useTheme() {
  const isDark = computed(() => theme.value === 'dark')

  function setTheme(value: Theme) {
    theme.value = value
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  return { theme, isDark, setTheme, toggleTheme }
}
