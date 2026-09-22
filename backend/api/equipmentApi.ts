import { getSupabase } from '../supabase/client'
import { findZoneIdByName } from './zonesApi'
import { EQUIPMENT_SELECT, mapEquipment } from './mappers'
import type { Equipment, EquipmentInput } from '../types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveProfileId(nameOrId?: string | null): Promise<string | null> {
  if (!nameOrId) return null
  if (UUID_RE.test(nameOrId)) return nameOrId
  const supabase = getSupabase()
  const { data } = await supabase.from('profiles').select('id').eq('full_name', nameOrId).maybeSingle()
  return data?.id ?? null
}

export async function getEquipment(): Promise<Equipment[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('equipment')
    .select(EQUIPMENT_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => mapEquipment(r as never))
}

export async function getEquipmentItem(id: string): Promise<Equipment | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('equipment').select(EQUIPMENT_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapEquipment(data as never) : null
}

export async function createEquipment(input: EquipmentInput): Promise<Equipment> {
  const supabase = getSupabase()
  const zoneId = await findZoneIdByName(input.zone)
  const assignedToId = await resolveProfileId(input.assignedTo)

  const { data, error } = await supabase
    .from('equipment')
    .insert({
      name: input.name,
      category: input.category,
      serial_number: input.serialNumber ?? null,
      zone_id: zoneId,
      assigned_to: assignedToId,
      status: input.status ?? 'operativo',
    })
    .select(EQUIPMENT_SELECT)
    .single()
  if (error) throw error
  return mapEquipment(data as never)
}

export async function updateEquipment(id: string, patch: Partial<Equipment>): Promise<Equipment> {
  const supabase = getSupabase()
  const dbPatch: Record<string, unknown> = {}

  if (patch.name) dbPatch.name = patch.name
  if (patch.category) dbPatch.category = patch.category
  if (patch.serialNumber !== undefined) dbPatch.serial_number = patch.serialNumber
  if (patch.status) dbPatch.status = patch.status
  if (patch.zone !== undefined) dbPatch.zone_id = await findZoneIdByName(patch.zone)
  if (patch.assignedTo !== undefined) dbPatch.assigned_to = await resolveProfileId(patch.assignedTo)

  const { data, error } = await supabase
    .from('equipment')
    .update(dbPatch)
    .eq('id', id)
    .select(EQUIPMENT_SELECT)
    .single()
  if (error) throw error
  return mapEquipment(data as never)
}

export async function deleteEquipment(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('equipment').delete().eq('id', id)
  if (error) throw error
}