import { getSupabase } from '../supabase/client'
import { PROFILE_SELECT, ZONE_SELECT, mapDepartment, mapProfile, mapZone } from './mappers'
import type { Zone, Profile, Department, DbZoneRow, DbDepartmentRow, DbProfileRow } from '../types'

export async function getZones(): Promise<Zone[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('zones').select(ZONE_SELECT).order('name')
  if (error) throw error
  return (data ?? []).map((r) => mapZone(r as DbZoneRow))
}

export async function getDepartments(): Promise<Department[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('departments').select('id, name, responsible_id').order('name')
  if (error) throw error
  return (data ?? []).map((r) => mapDepartment(r as DbDepartmentRow))
}

export async function getStaff(): Promise<Profile[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .in('role', ['admin', 'seguridad', 'ti'])
    .order('full_name')
  if (error) throw error
  return (data ?? []).map((r) => mapProfile(r as DbProfileRow))
}

export async function findZoneIdByName(zoneName?: string | null): Promise<string | null> {
  if (!zoneName) return null
  const supabase = getSupabase()
  const { data } = await supabase.from('zones').select('id').eq('name', zoneName).maybeSingle()
  return data?.id ?? null
}