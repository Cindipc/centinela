import { ref } from 'vue'
import { checkDuplicates, isAiConfigured, suggestIncident } from '@backend/api/aiApi'
import type {
  DuplicateCheck,
  IncidentSuggestion,
  IncidentType,
  GeoPoint,
} from '@backend/types'

export interface AnalyzeIncidentInput {
  type: IncidentType
  title: string
  description?: string
  zone?: string | null
  zoneId?: string | null
  point?: GeoPoint | null
  excludeIncidentId?: string | null
}

export function useIncidentAi() {
  const configured = isAiConfigured()
  const analyzing = ref(false)
  const error = ref<string | null>(null)
  const suggestion = ref<IncidentSuggestion | null>(null)
  const duplicates = ref<DuplicateCheck | null>(null)

  function reset() {
    analyzing.value = false
    error.value = null
    suggestion.value = null
    duplicates.value = null
  }

  async function analyze(input: AnalyzeIncidentInput): Promise<void> {
    if (!configured) return
    if (input.title.trim().length < 3) {
      error.value = 'Escribe un título antes de analizar.'
      return
    }
    analyzing.value = true
    error.value = null
    try {
      const [suggestionResult, duplicateResult] = await Promise.allSettled([
        suggestIncident({
          type: input.type,
          title: input.title,
          description: input.description,
          zone: input.zone,
          point: input.point,
        }),
        checkDuplicates({
          type: input.type,
          title: input.title,
          description: input.description,
          zoneId: input.zoneId,
          point: input.point,
          excludeIncidentId: input.excludeIncidentId,
        }),
      ])
      suggestion.value =
        suggestionResult.status === 'fulfilled' ? suggestionResult.value : null
      duplicates.value =
        duplicateResult.status === 'fulfilled' ? duplicateResult.value : null
      if (suggestionResult.status === 'rejected' && duplicateResult.status === 'rejected') {
        error.value =
          suggestionResult.reason instanceof Error
            ? suggestionResult.reason.message
            : 'El servicio de IA no está disponible.'
      }
    } finally {
      analyzing.value = false
    }
  }

  return {
    configured,
    analyzing,
    error,
    suggestion,
    duplicates,
    analyze,
    reset,
  }
}
