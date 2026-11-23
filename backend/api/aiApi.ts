import { getSupabase } from '../supabase/client'
import type {
  DuplicateCheck,
  GeoAnalysis,
  ImageAnalysis,
  IncidentPatterns,
  IncidentSuggestion,
  IncidentType,
  GeoPoint,
} from '../types'

const AI_API_URL = ((import.meta.env.VITE_AI_API_URL as string | undefined) ?? '').replace(/\/$/, '')

export function isAiConfigured(): boolean {
  return AI_API_URL.length > 0
}

async function accessToken(): Promise<string> {
  const { data } = await getSupabase().auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')
  return token
}

async function post<T>(path: string, body: unknown): Promise<T> {
  if (!AI_API_URL) throw new Error('El servicio de IA no está configurado (VITE_AI_API_URL).')
  const token = await accessToken()
  const response = await fetch(`${AI_API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    let detail = `El servicio de IA respondió ${response.status}.`
    try {
      const payload = (await response.json()) as { detail?: string; error?: string }
      detail = payload.detail ?? payload.error ?? detail
    } catch {
      /* respuesta sin JSON */
    }
    throw new Error(detail)
  }
  return (await response.json()) as T
}

export interface SuggestIncidentInput {
  type: IncidentType
  title: string
  description?: string
  zone?: string | null
  point?: GeoPoint | null
}

/** Clasificación/priorización asistida. Nunca cierra ni modifica la incidencia. */
export async function suggestIncident(input: SuggestIncidentInput): Promise<IncidentSuggestion> {
  return post<IncidentSuggestion>('/ai/suggest', {
    type: input.type,
    title: input.title,
    description: input.description ?? '',
    zone: input.zone ?? null,
    latitude: input.point?.lat ?? null,
    longitude: input.point?.lng ?? null,
  })
}

export interface DuplicateCheckInput {
  title: string
  description?: string
  type: IncidentType
  zoneId?: string | null
  point?: GeoPoint | null
  excludeIncidentId?: string | null
}

export async function checkDuplicates(input: DuplicateCheckInput): Promise<DuplicateCheck> {
  return post<DuplicateCheck>('/ai/duplicates', {
    title: input.title,
    description: input.description ?? '',
    type: input.type,
    zoneId: input.zoneId ?? null,
    latitude: input.point?.lat ?? null,
    longitude: input.point?.lng ?? null,
    excludeIncidentId: input.excludeIncidentId ?? null,
  })
}

export interface ImageAnalysisInput {
  type: IncidentType
  imageBase64: string
  mediaType?: string
  description?: string
}

/** Análisis visual opcional; la imagen no se persiste en el servicio de IA. */
export async function analyzeIncidentImage(input: ImageAnalysisInput): Promise<ImageAnalysis> {
  return post<ImageAnalysis>('/ai/image', {
    type: input.type,
    image_base64: input.imageBase64,
    media_type: input.mediaType ?? 'image/jpeg',
    description: input.description ?? null,
  })
}

/** Patrones por universidad calculados en el servidor con scikit-learn. */
export async function analyzePatterns(days = 30): Promise<IncidentPatterns> {
  return post<IncidentPatterns>('/ai/patterns', { days })
}

/** Agrupaciones espaciales vía PostGIS, ya filtradas por la universidad del JWT. */
export async function analyzeHotspots(days = 30): Promise<GeoAnalysis> {
  return post<GeoAnalysis>('/ai/hotspots', { days })
}
