import { getSupabase } from '../supabase/client'
import {
  AUDIT_SELECT,
  LICENSE_SELECT,
  ORGANIZATION_SELECT,
  mapAuditLog,
  mapLicense,
  mapOrganization,
} from './mappers'
import type {
  AuditLog,
  DbAuditLogRow,
  DbLicenseRow,
  DbOrganizationRow,
  EffectiveLicenseStatus,
  License,
  LicenseInput,
  LicenseUsage,
  MyContext,
  Organization,
  OrganizationInput,
  PlatformStats,
} from '../types'

function effectiveLicenseStatus(
  status: License['status'],
  startDate: string,
  endDate: string
): EffectiveLicenseStatus {
  const today = new Date().toISOString().slice(0, 10)
  if (status === 'suspendida') return 'suspendida'
  if (status === 'pendiente' || startDate > today) return 'pendiente'
  if (status === 'vencida' || endDate < today) return 'vencida'
  return 'activa'
}

/** Universidades visibles según RLS: todas para superadmin, la propia para el resto. */
export async function getOrganizations(): Promise<Organization[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('organizations')
    .select(ORGANIZATION_SELECT)
    .order('name')
  if (error) throw error
  return (data ?? []).map((row) => mapOrganization(row as unknown as DbOrganizationRow))
}

export async function getOrganization(id: string): Promise<Organization | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('organizations')
    .select(ORGANIZATION_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? mapOrganization(data as unknown as DbOrganizationRow) : null
}

export async function createOrganization(input: OrganizationInput): Promise<Organization> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name: input.name,
      slug: input.slug ?? null,
      address: input.address ?? null,
      center_lat: input.centerLat ?? null,
      center_lng: input.centerLng ?? null,
      status: input.status ?? 'activa',
    })
    .select(ORGANIZATION_SELECT)
    .single()
  if (error) throw error
  return mapOrganization(data as unknown as DbOrganizationRow)
}

export async function updateOrganization(
  id: string,
  patch: Partial<OrganizationInput>
): Promise<Organization> {
  const supabase = getSupabase()
  const dbPatch: Record<string, unknown> = {}
  if (patch.name !== undefined) dbPatch.name = patch.name
  if (patch.slug !== undefined) dbPatch.slug = patch.slug
  if (patch.address !== undefined) dbPatch.address = patch.address
  if (patch.centerLat !== undefined) dbPatch.center_lat = patch.centerLat
  if (patch.centerLng !== undefined) dbPatch.center_lng = patch.centerLng
  if (patch.status !== undefined) dbPatch.status = patch.status

  const { data, error } = await supabase
    .from('organizations')
    .update(dbPatch)
    .eq('id', id)
    .select(ORGANIZATION_SELECT)
    .single()
  if (error) throw error
  return mapOrganization(data as unknown as DbOrganizationRow)
}

function withEffectiveLicense(row: DbLicenseRow): License {
  return mapLicense(row, effectiveLicenseStatus(row.status, row.start_date, row.end_date))
}

/** Historial de licencias visible según RLS. */
export async function getLicenses(organizationId?: string | null): Promise<License[]> {
  const supabase = getSupabase()
  let query = supabase
    .from('licenses')
    .select(LICENSE_SELECT)
    .order('end_date', { ascending: false })
  if (organizationId) query = query.eq('organization_id', organizationId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => withEffectiveLicense(row as unknown as DbLicenseRow))
}

export async function createLicense(input: LicenseInput): Promise<License> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('licenses')
    .insert({
      organization_id: input.organizationId,
      plan: input.plan,
      status: input.status ?? 'activa',
      start_date: input.startDate ?? new Date().toISOString().slice(0, 10),
      end_date: input.endDate,
      max_users: input.maxUsers,
      max_zones: input.maxZones,
      notes: input.notes ?? null,
    })
    .select(LICENSE_SELECT)
    .single()
  if (error) throw error
  return withEffectiveLicense(data as unknown as DbLicenseRow)
}

export async function updateLicense(id: string, patch: Partial<LicenseInput>): Promise<License> {
  const supabase = getSupabase()
  const dbPatch: Record<string, unknown> = {}
  if (patch.plan !== undefined) dbPatch.plan = patch.plan
  if (patch.status !== undefined) dbPatch.status = patch.status
  if (patch.startDate !== undefined) dbPatch.start_date = patch.startDate
  if (patch.endDate !== undefined) dbPatch.end_date = patch.endDate
  if (patch.maxUsers !== undefined) dbPatch.max_users = patch.maxUsers
  if (patch.maxZones !== undefined) dbPatch.max_zones = patch.maxZones
  if (patch.notes !== undefined) dbPatch.notes = patch.notes

  const { data, error } = await supabase
    .from('licenses')
    .update(dbPatch)
    .eq('id', id)
    .select(LICENSE_SELECT)
    .single()
  if (error) throw error
  return withEffectiveLicense(data as unknown as DbLicenseRow)
}

export async function getLicenseUsage(organizationId?: string | null): Promise<LicenseUsage> {
  const supabase = getSupabase()
  const params = organizationId ? { p_org: organizationId } : {}
  const { data, error } = await supabase.rpc('license_usage', params)
  if (error) throw error
  const raw = (data ?? {}) as Record<string, unknown>
  return {
    organizationId: String(raw.organization_id ?? organizationId ?? ''),
    licenseId: (raw.license_id as string | null) ?? null,
    plan: (raw.plan as string | null) ?? null,
    status: (raw.status as EffectiveLicenseStatus) ?? 'sin_licencia',
    startDate: (raw.start_date as string | null) ?? null,
    endDate: (raw.end_date as string | null) ?? null,
    maxUsers: typeof raw.max_users === 'number' ? raw.max_users : null,
    maxZones: typeof raw.max_zones === 'number' ? raw.max_zones : null,
    userCount: Number(raw.user_count ?? 0),
    zoneCount: Number(raw.zone_count ?? 0),
  }
}

export async function getMyContext(): Promise<MyContext | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('my_context')
  if (error) throw error
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  const center = raw.organization_center as { lat?: number; lng?: number } | null
  const license = raw.license as Record<string, unknown> | null
  return {
    userId: String(raw.user_id ?? ''),
    role: raw.role as MyContext['role'],
    organizationId: (raw.organization_id as string | null) ?? null,
    organizationName: (raw.organization_name as string | null) ?? null,
    organizationStatus: (raw.organization_status as MyContext['organizationStatus']) ?? null,
    organizationCenter:
      center && typeof center.lat === 'number' && typeof center.lng === 'number'
        ? { lat: center.lat, lng: center.lng }
        : null,
    license: license
      ? {
          id: String(license.id ?? ''),
          plan: String(license.plan ?? ''),
          status: license.status as EffectiveLicenseStatus,
          startDate: String(license.start_date ?? ''),
          endDate: String(license.end_date ?? ''),
          maxUsers: Number(license.max_users ?? 0),
          maxZones: Number(license.max_zones ?? 0),
        }
      : null,
  }
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('platform_stats')
  if (error) throw error
  const raw = (data ?? {}) as Record<string, unknown>
  const number = (key: string) => Number(raw[key] ?? 0)
  return {
    organizations: number('organizations'),
    organizationsActive: number('organizations_active'),
    licensesActive: number('licenses_active'),
    licensesExpired: number('licenses_expired'),
    licensesSuspended: number('licenses_suspended'),
    licensesPending: number('licenses_pending'),
    admins: number('admins'),
    users: number('users'),
    profiles: number('profiles'),
    incidents: number('incidents'),
    openIncidents: number('open_incidents'),
    panicAlertsActive: number('panic_alerts_active'),
    equipment: number('equipment'),
  }
}

export interface AuditLogFilters {
  organizationId?: string | null
  tableName?: string | null
  action?: string | null
  limit?: number
}

/** Auditoría visible según RLS: admin ve su universidad, superadmin ve todo. */
export async function getAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLog[]> {
  const supabase = getSupabase()
  let query = supabase
    .from('audit_logs')
    .select(AUDIT_SELECT)
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 100)
  if (filters.organizationId) query = query.eq('organization_id', filters.organizationId)
  if (filters.tableName) query = query.eq('table_name', filters.tableName)
  if (filters.action) query = query.eq('action', filters.action)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => mapAuditLog(row as unknown as DbAuditLogRow))
}
