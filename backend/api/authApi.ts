import { getSupabase } from '../supabase/client'
import { PROFILE_SELECT, mapProfile } from './mappers'
import type { Profile, DbProfileRow } from '../types'

async function profileFor(uid: string, email: string): Promise<Profile> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('profiles').select(PROFILE_SELECT).eq('id', uid).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Perfil no encontrado en la base de datos.')
  return mapProfile(data as DbProfileRow, email)
}

export async function login(email: string, password: string): Promise<Profile> {
  const supabase = getSupabase()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  if (!data.session) throw new Error('No se pudo iniciar sesión.')
  return profileFor(data.session.user.id, data.session.user.email ?? email)
}

export async function logout(): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession(): Promise<Profile | null> {
  const supabase = getSupabase()
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session) return null
  try {
    return await profileFor(session.user.id, session.user.email ?? '')
  } catch {
    return null
  }
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = getSupabase()
  const { data } = await supabase.auth.getUser()
  try {
    return await profileFor(userId, data.user?.email ?? '')
  } catch {
    return null
  }
}