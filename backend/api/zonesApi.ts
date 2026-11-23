import { getSupabase } from '../supabase/client'
import { PROFILE_SELECT, ZONE_SELECT, mapDepartment, mapProfile, mapZone } from './mappers'
import type {
  Zone,
  ZoneInput,
  Profile,
  Department,
  GeoPoint,
  DbZoneRow,
  DbDepartmentRow,
  DbProfileRow,
} from '../types'

export async function getZones(organizationId?: string | null): Promise<Zone[]> {
  const supabase = getSupabase()
  let query = supabase.from('zones').select(ZONE_SELECT).order('name')
  if (organizationId) query = query.eq('organization_id', organizationId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((r) => mapZone(r as unknown as DbZoneRow))
}

export async function getDepartments(): Promise<Department[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('departments').select('id, name, responsible_id').order('name')
  if (error) throw error
  return (data ?? []).map((r) => mapDepartment(r as unknown as DbDepartmentRow))
}

export async function getStaff(organizationId?: string | null): Promise<Profile[]> {
  const supabase = getSupabase()
  let query = supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .in('role', ['admin', 'seguridad', 'ti'])
    .order('full_name')
  if (organizationId) query = query.eq('organization_id', organizationId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((r) => mapProfile(r as unknown as DbProfileRow))
}

export async function findZoneIdByName(
  zoneName?: string | null,
  organizationId?: string | null
): Promise<string | null> {
  if (!zoneName) return null
  const supabase = getSupabase()
  let query = supabase.from('zones').select('id').eq('name', zoneName)
  if (organizationId) query = query.eq('organization_id', organizationId)
  const { data } = await query.limit(1).maybeSingle()
  return data?.id ?? null
}

export async function createZone(input: ZoneInput): Promise<Zone> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('zones')
    .insert({
      name: input.name,
      building: input.building ?? null,
      department_id: input.departmentId ?? null,
      location: { type: 'Point', coordinates: [input.location.lng, input.location.lat] },
      ...(input.organizationId ? { organization_id: input.organizationId } : {}),
    })
    .select(ZONE_SELECT)
    .single()
  if (error) throw error
  return mapZone(data as unknown as DbZoneRow)
}

export async function updateZone(
  id: string,
  patch: Partial<Omit<ZoneInput, 'location'>>
): Promise<Zone> {
  const supabase = getSupabase()
  const dbPatch: Record<string, unknown> = {}
  if (patch.name !== undefined) dbPatch.name = patch.name
  if (patch.building !== undefined) dbPatch.building = patch.building
  if (patch.departmentId !== undefined) dbPatch.department_id = patch.departmentId
  const { data, error } = await supabase
    .from('zones')
    .update(dbPatch)
    .eq('id', id)
    .select(ZONE_SELECT)
    .single()
  if (error) throw error
  return mapZone(data as unknown as DbZoneRow)
}

export async function deleteZone(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('zones').delete().eq('id', id)
  if (error) throw error
}

/**
 * Mueve el punto de una zona (solo admin vía RLS `zones_admin_all`).
 * PostGIS recibe el point como GeoJSON, igual que al crear incidencias.
 */
export async function updateZoneLocation(id: string, point: GeoPoint): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('zones')
    .update({ location: { type: 'Point', coordinates: [point.lng, point.lat] } })
    .eq('id', id)
  if (error) throw error
}