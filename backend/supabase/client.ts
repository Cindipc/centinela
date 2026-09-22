import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type Env = Record<string, string | undefined>

const viteEnv = (import.meta as unknown as { env?: Env }).env ?? {}
const nodeEnv =
  (globalThis as unknown as { process?: { env?: Env } }).process?.env ?? {}

const SUPABASE_URL = viteEnv.VITE_SUPABASE_URL ?? nodeEnv.VITE_SUPABASE_URL ?? nodeEnv.SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY =
  viteEnv.VITE_SUPABASE_ANON_KEY ??
  nodeEnv.VITE_SUPABASE_ANON_KEY ??
  nodeEnv.SUPABASE_ANON_KEY ??
  ''

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase no configurado. Rellena VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el .env de la raíz del proyecto.'
    )
  }
  return supabase
}