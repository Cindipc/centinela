import { getSupabase } from '../supabase/client'
import { CONTACT_SELECT, PANIC_SELECT, mapEmergencyContact, mapPanicAlert } from './mappers'
import type { EmergencyContact, EmergencyContactInput, PanicAlert } from '../types'

// ================= Contactos de confianza =================
// Los lee y escribe únicamente su dueño (políticas RLS de emergency_contacts).

export async function getContacts(userId: string): Promise<EmergencyContact[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('emergency_contacts')
    .select(CONTACT_SELECT)
    .eq('user_id', userId)
    .order('created_at')
  if (error) throw error
  return (data ?? []).map((r) => mapEmergencyContact(r as never))
}

export async function createContact(
  userId: string,
  input: EmergencyContactInput
): Promise<EmergencyContact> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('emergency_contacts')
    .insert({
      user_id: userId,
      name: input.name,
      phone: input.phone,
      relation: input.relation ?? null,
    })
    .select(CONTACT_SELECT)
    .single()
  if (error) throw error
  return mapEmergencyContact(data as never)
}

export async function updateContact(
  id: string,
  patch: Partial<EmergencyContactInput>
): Promise<EmergencyContact> {
  const supabase = getSupabase()
  const dbPatch: Record<string, unknown> = {}
  if (patch.name) dbPatch.name = patch.name
  if (patch.phone) dbPatch.phone = patch.phone
  if (patch.relation !== undefined) dbPatch.relation = patch.relation

  const { data, error } = await supabase
    .from('emergency_contacts')
    .update(dbPatch)
    .eq('id', id)
    .select(CONTACT_SELECT)
    .single()
  if (error) throw error
  return mapEmergencyContact(data as never)
}

export async function deleteContact(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('emergency_contacts').delete().eq('id', id)
  if (error) throw error
}

// ================= Botón de pánico =================

/** Inserta una alerta de pánico del propio usuario (panic_alerts.location es NOT NULL). */
export async function createPanicAlert(input: {
  userId: string
  zoneId?: string | null
  latitude: number
  longitude: number
}): Promise<PanicAlert> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('panic_alerts')
    .insert({
      user_id: input.userId,
      zone_id: input.zoneId ?? null,
      location: { type: 'Point', coordinates: [input.longitude, input.latitude] },
      status: 'activo',
    })
    .select(PANIC_SELECT)
    .single()
  if (error) throw error
  return mapPanicAlert(data as never)
}

/** Alertas de pánico: staff (admin/seguridad) ve todas; el usuario, las suyas. */
export async function getPanicAlerts(userId?: string): Promise<PanicAlert[]> {
  const supabase = getSupabase()
  let query = supabase.from('panic_alerts').select(PANIC_SELECT).order('created_at', { ascending: false })
  if (userId) query = query.eq('user_id', userId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((r) => mapPanicAlert(r as never))
}

export async function resolvePanicAlert(id: string, status: PanicAlert['status']): Promise<PanicAlert> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('panic_alerts')
    .update({ status, resolved_at: status === 'activo' ? null : new Date().toISOString() })
    .eq('id', id)
    .select(PANIC_SELECT)
    .single()
  if (error) throw error
  return mapPanicAlert(data as never)
}