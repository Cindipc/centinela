import { getSupabase } from '../supabase/client'
import { PROFILE_SELECT, mapProfile } from './mappers'
import type { Profile, NewUserInput, DbProfileRow } from '../types'

const CREATE_USER_FUNCTION = 'create-user'

/**
 * Alta de usuarios cerrada: no existe signup público. La creación real ocurre
 * en la Edge Function "create-user", que valida current_role() = 'admin'
 * y usa el service role key (que nunca viaja al navegador).
 */
export async function createUser(input: NewUserInput): Promise<Profile> {
  const supabase = getSupabase()
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')

  const { data, error } = await supabase.functions.invoke(CREATE_USER_FUNCTION, {
    body: {
      fullName: input.fullName,
      email: input.email,
      password: input.password,
      role: input.role,
      departmentId: input.departmentId ?? null,
      zoneId: input.zoneId ?? null,
      phone: input.phone ?? null,
    },
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (error) {
    throw new Error(await readFunctionError(error, data))
  }
  if (!data || typeof data !== 'object' || !('user' in data)) {
    throw new Error('La Edge Function no devolvió el usuario creado.')
  }
  return data.user as Profile
}

/** Listado completo de perfiles (uso exclusivo de admin, filtrado por RLS). */
export async function getProfiles(): Promise<Profile[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .order('full_name')
  if (error) throw error
  return (data ?? []).map((r) => mapProfile(r as DbProfileRow))
}

async function readFunctionError(
  error: { message: string; context?: Response },
  payload: unknown
): Promise<string> {
  if (error.context) {
    try {
      const body = (await error.context.json()) as { error?: string }
      if (body?.error) return body.error
    } catch {
      /* respuesta sin JSON */
    }
  }
  const detail = (payload as { error?: string } | null)?.error
  return detail ?? error.message
}