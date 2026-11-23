import { getSupabase } from '../supabase/client'
import { PROFILE_SELECT, mapProfile } from './mappers'
import type { Profile, NewUserInput, ProfileUpdateInput, DbProfileRow } from '../types'

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
      organizationId: input.organizationId ?? null,
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
export async function getProfiles(organizationId?: string | null): Promise<Profile[]> {
  const supabase = getSupabase()
  let query = supabase.from('profiles').select(PROFILE_SELECT).order('full_name')
  if (organizationId) query = query.eq('organization_id', organizationId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((r) => mapProfile(r as unknown as DbProfileRow))
}

/** Edición de perfil dentro de la propia universidad (RLS + triggers validan). */
export async function updateProfile(id: string, patch: ProfileUpdateInput): Promise<Profile> {
  if (patch.role === 'superadmin') {
    throw new Error('El rol superadmin solo se asigna manualmente en la base de datos.')
  }
  const supabase = getSupabase()
  const dbPatch: Record<string, unknown> = {}
  if (patch.fullName !== undefined) dbPatch.full_name = patch.fullName
  if (patch.role !== undefined) dbPatch.role = patch.role
  if (patch.departmentId !== undefined) dbPatch.department_id = patch.departmentId
  if (patch.zoneId !== undefined) dbPatch.zone_id = patch.zoneId
  if (patch.phone !== undefined) dbPatch.phone = patch.phone

  const { data, error } = await supabase
    .from('profiles')
    .update(dbPatch)
    .eq('id', id)
    .select(PROFILE_SELECT)
    .single()
  if (error) throw error
  return mapProfile(data as unknown as DbProfileRow)
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