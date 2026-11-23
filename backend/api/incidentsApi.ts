import { getSupabase } from '../supabase/client'
import { findZoneIdByName } from './zonesApi'
import { INCIDENT_SELECT, mapIncident } from './mappers'
import type { Incident, IncidentInput, GeoPoint } from '../types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PHOTO_BUCKET = 'incidents'

async function resolveProfileId(nameOrId?: string | null): Promise<string | null> {
  if (!nameOrId) return null
  if (UUID_RE.test(nameOrId)) return nameOrId
  const supabase = getSupabase()
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('full_name', nameOrId)
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

async function nextCode(type: IncidentInput['type']): Promise<string> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('next_incident_code', { p_type: type })
  if (!error && typeof data === 'string') return data
  const { count } = await supabase.from('incidents').select('id', { count: 'exact', head: true })
  const seq = ((count ?? 0) + 1).toString().padStart(4, '0')
  return type === 'equipo' ? `TIC-${seq}` : `SEC-${seq}`
}

async function currentOrganizationId(): Promise<string | null> {
  const supabase = getSupabase()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  const { data } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', auth.user.id)
    .maybeSingle()
  return (data?.organization_id as string | null) ?? null
}

/** PostgREST espera las columnas PostGIS como GeoJSON. */
function toGeoJson(point: GeoPoint) {
  return { type: 'Point', coordinates: [point.lng, point.lat] }
}

export async function getIncidents(organizationId?: string | null): Promise<Incident[]> {
  const supabase = getSupabase()
  let query = supabase
    .from('incidents')
    .select(INCIDENT_SELECT)
    .order('created_at', { ascending: false })
  if (organizationId) query = query.eq('organization_id', organizationId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((r) => mapIncident(r as never))
}

/** Incidencias de un solo tipo (capa de la cola de seguridad o de TI). */
export async function getIncidentsByType(
  type: IncidentInput['type'],
  organizationId?: string | null
): Promise<Incident[]> {
  const supabase = getSupabase()
  let query = supabase
    .from('incidents')
    .select(INCIDENT_SELECT)
    .eq('type', type)
    .order('created_at', { ascending: false })
  if (organizationId) query = query.eq('organization_id', organizationId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((r) => mapIncident(r as never))
}

export async function getIncident(id: string): Promise<Incident | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('incidents').select(INCIDENT_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapIncident(data as never) : null
}

export async function createIncident(
  input: IncidentInput,
  reporter: { id: string; name: string }
): Promise<Incident> {
  const supabase = getSupabase()
  const zoneId = await findZoneIdByName(input.zone)
  const assignedToId = await resolveProfileId(input.assignedTo)

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('incidents')
      .insert({
        code: attempt === 0 ? await nextCode(input.type) : `${input.type === 'equipo' ? 'TIC' : 'SEC'}-${Date.now().toString(36).toUpperCase()}`,
        type: input.type,
        category: input.category ?? null,
        title: input.title,
        description: input.description ?? null,
        photo_url: input.photoUrl ?? null,
        location: input.location ? toGeoJson(input.location) : null,
        zone_id: zoneId,
        equipment_id: input.equipmentId ?? null,
        priority: input.priority,
        status: input.status ?? 'pendiente',
        reported_by: reporter.id,
        assigned_to: assignedToId,
      })
      .select(INCIDENT_SELECT)
      .single()
    if (!error) return mapIncident(data as never)
    if (attempt === 4 || !/duplicate key|code_key/i.test(error.message)) throw error
  }
  throw new Error('No se pudo asignar un código único a la incidencia.')
}

/** Sube una foto al bucket de Storage y devuelve su URL pública. */
export async function uploadIncidentPhoto(file: File): Promise<string> {
  const supabase = getSupabase()
  const organizationId = await currentOrganizationId()
  if (!organizationId) {
    throw new Error('Tu usuario no tiene una universidad asignada para subir fotos.')
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${organizationId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })
  if (error) {
    throw new Error(
      `No se pudo subir la foto (${error.message}). Verifica que el bucket "${PHOTO_BUCKET}" exista en Supabase Storage.`
    )
  }
  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function updateIncident(id: string, patch: Partial<Incident>): Promise<Incident> {
  const supabase = getSupabase()
  const dbPatch: Record<string, unknown> = {}

  if (patch.type) {
    dbPatch.type = patch.type
    const current = await supabase.from('incidents').select('code, type').eq('id', id).maybeSingle()
    if (current.data && current.data.code && current.data.type !== patch.type) {
      const numeric = String(current.data.code).replace(/^[A-Z]+-/, '')
      dbPatch.code = `${patch.type === 'equipo' ? 'TIC' : 'SEC'}-${numeric || '0001'}`
    }
  }
  if (patch.category !== undefined) dbPatch.category = patch.category
  if (patch.title) dbPatch.title = patch.title
  if (patch.description !== undefined) dbPatch.description = patch.description
  if (patch.priority) dbPatch.priority = patch.priority
  if (patch.status) dbPatch.status = patch.status
  if (patch.resolutionNote !== undefined) dbPatch.resolution_note = patch.resolutionNote
  if (patch.equipmentId !== undefined) dbPatch.equipment_id = patch.equipmentId
  if (patch.zone !== undefined) dbPatch.zone_id = await findZoneIdByName(patch.zone)
  if (patch.assignedTo !== undefined) dbPatch.assigned_to = await resolveProfileId(patch.assignedTo)

  if (patch.status === 'resuelto') dbPatch.resolved_at = new Date().toISOString()
  if (patch.status && patch.status !== 'resuelto') dbPatch.resolved_at = null

  if (Object.keys(dbPatch).length === 0) {
    return (await getIncident(id))!
  }

  const { data, error } = await supabase
    .from('incidents')
    .update(dbPatch)
    .eq('id', id)
    .select(INCIDENT_SELECT)
    .single()
  if (error) throw error
  return mapIncident(data as never)
}

export async function deleteIncident(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('incidents').delete().eq('id', id)
  if (error) throw error
}