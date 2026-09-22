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

// ---- Zonas ----
export interface Zone {
  id: string
  name: string
  building: string | null
  departmentId: string | null
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
  zones?: { name: string | null } | null
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
}