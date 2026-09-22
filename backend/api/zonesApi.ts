import { getSupabase } from '../supabase/client'
import type { Zone, Profile, DbZoneRow, DbProfileRow } from '../types'

const PROFILE_SELECT = 'id, full_name, role, department_id, zone_id, phone'

function mapZone(row: DbZoneRow): Zone {
  return { id: row.id, name: row.name, building: row.building, departmentId: row.department_id }
}

export async function getZones(): Promise<Zone[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('zones').select('id, name, building, department_id').order('name')
  if (error) throw error
  return (data ?? []).map((r) => mapZone(r as DbZoneRow))
}

export async function getStaff(): Promise<Profile[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .in('role', ['admin', 'seguridad', 'ti'])
    .order('full_name')
  if (error) throw error
  return (data ?? []).map((r) => {
    const row = r as DbProfileRow
    return {
      id: row.id,
      email: '',
      name: row.full_name,
      role: row.role,
      departmentId: row.department_id ?? null,
      zoneId: row.zone_id ?? null,
      phone: row.phone ?? null,
    }
  })
}

export async function findZoneIdByName(zoneName?: string | null): Promise<string | null> {
  if (!zoneName) return null
  const supabase = getSupabase()
  const { data } = await supabase.from('zones').select('id').eq('name', zoneName).maybeSingle()
  return data?.id ?? null
}