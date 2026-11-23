// =========================================================
// Tipos de Centinela — alineados al esquema PostgreSQL/Supabase
// (roles, incidentes, equipos y notificaciones usan los enums reales)
// =========================================================

// ---- Usuarios y roles ----
export type Role = 'superadmin' | 'admin' | 'seguridad' | 'ti' | 'usuario'

export interface Profile {
  id: string
  email: string
  name: string
  role: Role
  departmentId?: string | null
  zoneId?: string | null
  phone?: string | null
  organizationId?: string | null
  organizationName?: string | null
}

// ---- Universidades, licencias y auditoría ----
export type OrganizationStatus = 'activa' | 'suspendida'

export interface Organization {
  id: string
  name: string
  slug: string | null
  address: string | null
  centerLat: number | null
  centerLng: number | null
  status: OrganizationStatus
  createdAt: string
}

export interface OrganizationInput {
  name: string
  slug?: string | null
  address?: string | null
  centerLat?: number | null
  centerLng?: number | null
  status?: OrganizationStatus
}

export type LicenseStatus = 'activa' | 'vencida' | 'suspendida' | 'pendiente'
export type EffectiveLicenseStatus = LicenseStatus | 'sin_licencia'

export interface License {
  id: string
  organizationId: string
  organizationName?: string | null
  plan: string
  status: LicenseStatus
  effectiveStatus: EffectiveLicenseStatus
  startDate: string
  endDate: string
  maxUsers: number
  maxZones: number
  notes: string | null
  createdAt: string
}

export interface LicenseInput {
  organizationId: string
  plan: string
  status?: LicenseStatus
  startDate?: string
  endDate: string
  maxUsers: number
  maxZones: number
  notes?: string | null
}

export interface LicenseUsage {
  organizationId: string
  licenseId: string | null
  plan: string | null
  status: EffectiveLicenseStatus
  startDate: string | null
  endDate: string | null
  maxUsers: number | null
  maxZones: number | null
  userCount: number
  zoneCount: number
}

export interface PlatformStats {
  organizations: number
  organizationsActive: number
  licensesActive: number
  licensesExpired: number
  licensesSuspended: number
  licensesPending: number
  admins: number
  users: number
  profiles: number
  incidents: number
  openIncidents: number
  panicAlertsActive: number
  equipment: number
}

export interface MyContext {
  userId: string
  role: Role
  organizationId: string | null
  organizationName: string | null
  organizationStatus: OrganizationStatus | null
  organizationCenter: GeoPoint | null
  license: {
    id: string
    plan: string
    status: EffectiveLicenseStatus
    startDate: string
    endDate: string
    maxUsers: number
    maxZones: number
  } | null
}

export interface AuditLog {
  id: number
  organizationId: string | null
  organizationName: string | null
  userId: string | null
  userName: string | null
  action: string
  tableName: string
  recordId: string | null
  oldData: Record<string, unknown> | null
  newData: Record<string, unknown> | null
  createdAt: string
}

// ---- Incidencias ----
export type IncidentType = 'seguridad' | 'equipo'
export type IncidentPriority = 'low' | 'medium' | 'high' | 'critical'
export type IncidentStatus = 'pendiente' | 'en_proceso' | 'resuelto' | 'falsa_alarma'

export interface GeoPoint {
  lat: number
  lng: number
}

export interface Incident {
  id: string
  code: string
  organizationId: string | null
  type: IncidentType
  category: string | null
  title: string
  description: string | null
  photoUrl: string | null
  zoneId: string | null
  zone: string | null
  location: GeoPoint | null
  equipmentId: string | null
  priority: IncidentPriority
  status: IncidentStatus
  reportedBy: string | null
  reportedByName: string | null
  assignedTo: string | null
  assignedToName: string | null
  resolutionNote: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

export interface IncidentInput {
  type: IncidentType
  category?: string
  title: string
  description?: string
  zone?: string
  equipmentId?: string
  photoUrl?: string
  location?: GeoPoint | null
  priority: IncidentPriority
  status?: IncidentStatus
  assignedTo?: string
}

// ---- Equipos ----
export type EquipmentStatus = 'operativo' | 'en_reparacion' | 'caido' | 'con_falla'

export interface Equipment {
  id: string
  organizationId: string | null
  name: string
  category: string
  serialNumber: string | null
  zoneId: string | null
  zone: string | null
  assignedTo: string | null
  assignedToName: string | null
  status: EquipmentStatus
  createdAt: string
}

export interface EquipmentInput {
  name: string
  category: string
  serialNumber?: string
  zone?: string
  assignedTo?: string
  status?: EquipmentStatus
}

// ---- Notificaciones ----
export interface Notification {
  id: string
  organizationId: string | null
  title: string
  message: string | null
  relatedIncidentId: string | null
  relatedIncidentTitle: string | null
  read: boolean
  createdAt: string
}

// ---- Zonas y departamentos ----
export interface Zone {
  id: string
  organizationId: string | null
  name: string
  building: string | null
  departmentId: string | null
  location: GeoPoint | null
}

export interface ZoneInput {
  name: string
  building?: string | null
  departmentId?: string | null
  location: GeoPoint
  /** Solo superadmin: universidad destino. */
  organizationId?: string | null
}

export interface Department {
  id: string
  name: string
  responsibleId: string | null
}

// ---- Contactos de confianza y botón de pánico ----
export interface EmergencyContact {
  id: string
  userId: string
  name: string
  phone: string
  relation: string | null
  createdAt: string
}

export interface EmergencyContactInput {
  name: string
  phone: string
  relation?: string
}

export type PanicStatus = 'activo' | 'atendido' | 'falsa_alarma'

export interface PanicAlert {
  id: string
  organizationId: string | null
  userId: string
  userName: string | null
  status: PanicStatus
  zone: string | null
  latitude: number | null
  longitude: number | null
  createdAt: string
  resolvedAt: string | null
}

// ---- Alta de usuarios (solo admin, vía Edge Function) ----
export interface NewUserInput {
  fullName: string
  email: string
  password: string
  role: Role
  departmentId?: string | null
  zoneId?: string | null
  phone?: string | null
  /** Solo lo usa un superadmin para registrar al administrador de otra universidad. */
  organizationId?: string | null
}

export interface ProfileUpdateInput {
  fullName?: string
  role?: Role
  departmentId?: string | null
  zoneId?: string | null
  phone?: string | null
}

// ---- Filas crudas de la BD (para mapear en las APIs) ----
export interface DbIncidentRow {
  id: string
  code: string
  organization_id: string | null
  type: IncidentType
  category: string | null
  title: string
  description: string | null
  photo_url: string | null
  zone_id: string | null
  equipment_id: string | null
  priority: IncidentPriority
  status: IncidentStatus
  reported_by: string | null
  assigned_to: string | null
  resolution_note: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  location?: unknown
  zones?: { name: string | null; location?: unknown } | null
  reporter?: { full_name: string | null } | null
  assignee?: { full_name: string | null } | null
}

export interface DbEquipmentRow {
  id: string
  organization_id: string | null
  name: string
  category: string
  serial_number: string | null
  zone_id: string | null
  assigned_to: string | null
  status: EquipmentStatus
  created_at: string
  zones?: { name: string | null } | null
  assignee?: { full_name: string | null } | null
}

export interface DbNotificationRow {
  id: string
  organization_id: string | null
  title: string
  message: string | null
  related_incident_id: string | null
  is_read: boolean
  created_at: string
  incident?: { title: string | null } | null
}

export interface DbProfileRow {
  id: string
  full_name: string
  role: Role
  department_id: string | null
  zone_id: string | null
  phone: string | null
  organization_id?: string | null
  organizations?: { name: string | null } | null
}

export interface DbZoneRow {
  id: string
  organization_id: string | null
  name: string
  building: string | null
  department_id: string | null
  location?: unknown
}

export interface DbDepartmentRow {
  id: string
  name: string
  responsible_id: string | null
}

export interface DbEmergencyContactRow {
  id: string
  user_id: string | null
  name: string
  phone: string
  relation: string | null
  created_at: string
}

export interface DbPanicAlertRow {
  id: string
  organization_id: string | null
  user_id: string | null
  status: PanicStatus
  zone_id: string | null
  location?: unknown
  created_at: string
  resolved_at: string | null
  zones?: { name: string | null } | null
  reporter?: { full_name: string | null } | null
}

export interface DbOrganizationRow {
  id: string
  name: string
  slug: string | null
  address: string | null
  center_lat: number | null
  center_lng: number | null
  status: OrganizationStatus
  created_at: string
}

export interface DbLicenseRow {
  id: string
  organization_id: string
  plan: string
  status: LicenseStatus
  start_date: string
  end_date: string
  max_users: number
  max_zones: number
  notes: string | null
  created_at: string
  organizations?: { name: string | null } | null
}

export interface DbAuditLogRow {
  id: number
  organization_id: string | null
  user_id: string | null
  action: string
  table_name: string
  record_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  created_at: string
  organizations?: { name: string | null } | null
  actor?: { full_name: string | null } | null
}

// ---- IA (respuestas del backend FastAPI) ----
export interface IncidentSuggestion {
  category: string
  priority: IncidentPriority
  summary: string
  possibleCauses: string[]
  recommendedActions: string[]
  suggestedZone: string | null
  confidence: number
  source: 'ollama' | 'rules' | 'unavailable'
}

export interface ImageAnalysis {
  category: string
  priority: IncidentPriority
  observations: string[]
  safetyConcerns: string[]
  confidence: number
  source: 'ollama' | 'unavailable'
}

export interface DuplicateCandidate {
  incidentId: string
  code: string
  title: string
  status: IncidentStatus
  zone: string | null
  createdAt: string
  distanceMeters: number | null
  similarity: number
}

export interface DuplicateCheck {
  likelyDuplicate: boolean
  candidates: DuplicateCandidate[]
  source: 'postgis' | 'rules' | 'unavailable'
}

export interface EmergingPattern {
  pattern: string
  detail: string
  incidentIds: string[]
  severity: 'informativo' | 'preventivo' | 'urgente'
}

export interface IncidentPatterns {
  patterns: EmergingPattern[]
  summary: string
  totalIncidents: number
  periodDays: number
  source: 'scikit-learn' | 'rules' | 'insufficient_data'
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type AiSource =
  | 'supabase'
  | 'synthetic'
  | 'demo'
  | 'scikit-learn'
  | 'dl4j'
  | 'ollama'
  | 'rules'
  | 'fallback'
  | 'unavailable'

export interface Hotspot {
  clusterId: number
  incidentCount: number
  centerLat: number
  centerLng: number
  firstIncident: string
  lastIncident: string
  /** Campos nuevos calculados con scikit-learn (compatibles con el panel previo). */
  radiusM?: number
  score?: number
  riskLevel?: RiskLevel
  dominantType?: IncidentType
  zone?: string | null
  peakHour?: number | null
  label?: string
  incidentIds?: string[]
}

export interface GeoAnalysis {
  hotspots: Hotspot[]
  source: 'postgis' | 'scikit-learn' | 'synthetic' | 'unavailable'
  isSynthetic?: boolean
  totalIncidents?: number
  narrative?: string | null
  model?: string
}

/** Zona de riesgo lista para pintar en Mapbox o Leaflet. */
export interface RiskZone {
  id: string
  center: GeoPoint
  radiusM: number
  score: number
  incidentCount: number
  dominantType: IncidentType
  zone: string | null
  peakHour: number | null
  riskLevel: RiskLevel
  label: string
}

export interface AiServiceStatus {
  name: 'python' | 'java' | 'ollama'
  status: 'ok' | 'degraded' | 'down'
  detail?: string | null
  version?: string | null
}

export interface AiHealth {
  status: 'ok' | 'degraded' | 'down'
  services: AiServiceStatus[]
  checkedAt: string
}

export interface AiHourBucket {
  hour: number
  count: number
}

export interface AiWeekdayBucket {
  weekday: number
  label: string
  count: number
}

export interface AiPatterns {
  patterns: EmergingPattern[]
  summary: string
  totalIncidents: number
  periodDays: number
  source: 'scikit-learn' | 'rules' | 'insufficient_data'
  isSynthetic?: boolean
  narrative?: string | null
  byHour: AiHourBucket[]
  byWeekday: AiWeekdayBucket[]
  byType: Array<{ type: IncidentType; count: number }>
  byZone: Array<{ zone: string; zoneId: string | null; count: number; dominantType: IncidentType }>
  peakHours: number[]
}

export interface AiClusterMember {
  id: string
  code: string
  title: string
  type: IncidentType
  priority: IncidentPriority
  status: IncidentStatus
  zone: string | null
  createdAt: string
  point: GeoPoint | null
}

export interface AiCluster {
  id: string
  label: string
  zone: string | null
  zoneId: string | null
  type: IncidentType
  incidentCount: number
  center: GeoPoint | null
  radiusM: number
  avgPriority: IncidentPriority
  score: number
  topTerms: string[]
  firstIncident: string
  lastIncident: string
  members: AiClusterMember[]
}

export interface AiClusterResponse {
  clusters: AiCluster[]
  totalIncidents: number
  source: 'scikit-learn' | 'synthetic' | 'unavailable'
  isSynthetic: boolean
  narrative?: string | null
}

export interface AiClassifyInput {
  id?: string
  type?: IncidentType
  title: string
  description?: string | null
  zone?: string | null
  zoneId?: string | null
  point?: GeoPoint | null
  createdAt?: string | null
}

export interface AiClassification {
  type: IncidentType
  priority: IncidentPriority
  priorityScore: number
  category: string
  confidence: number
  probabilities: Record<string, number>
  source: 'dl4j' | 'rules' | 'fallback'
  reasons: string[]
}

export interface AiStaffSuggestion {
  id: string
  name: string
  role: 'seguridad' | 'ti'
  zone: string | null
  point: GeoPoint | null
  distanceMeters: number | null
  activeLoad: number
  score: number
  etaMinutes: number | null
  reasons: string[]
}

export interface AiAssignment {
  report: {
    type: IncidentType
    priority: IncidentPriority
    title: string
    zone: string | null
    point: GeoPoint | null
  }
  suggestions: AiStaffSuggestion[]
  source: 'supabase' | 'demo' | 'fallback'
  narrative: string | null
}

export interface AiSummary {
  summary: string
  recommendations: string[]
  source: 'ollama' | 'fallback'
}

export interface AiAnalysisFilters {
  days: number
  hourFrom: number | null
  hourTo: number | null
  type: '' | IncidentType
  priority: '' | IncidentPriority
  useSynthetic: boolean
}