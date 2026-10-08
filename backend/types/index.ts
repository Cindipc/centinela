// =========================================================
// Tipos de Centinela — alineados al esquema PostgreSQL/Supabase
// (roles, incidentes, equipos y notificaciones usan los enums reales)
// =========================================================

// ---- Usuarios y roles ----
export type Role = 'usuario' | 'seguridad' | 'ti' | 'admin'

export interface Profile {
  id: string
  email: string
  name: string
  role: Role
  departmentId?: string | null
  zoneId?: string | null
  phone?: string | null
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
  name: string
  building: string | null
  departmentId: string | null
  location: GeoPoint | null
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
}

// ---- Filas crudas de la BD (para mapear en las APIs) ----
export interface DbIncidentRow {
  id: string
  code: string
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
}

export interface DbZoneRow {
  id: string
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
  user_id: string | null
  status: PanicStatus
  zone_id: string | null
  location?: unknown
  created_at: string
  resolved_at: string | null
  zones?: { name: string | null } | null
  reporter?: { full_name: string | null } | null
}