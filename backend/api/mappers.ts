import type { Incident, Equipment, Notification, DbIncidentRow, DbEquipmentRow, DbNotificationRow } from '../types'

// ================= Incidents =================
export const INCIDENT_SELECT = `
  id, code, type, category, title, description, photo_url,
  zone_id, equipment_id, priority, status, reported_by, assigned_to,
  resolution_note, created_at, updated_at, resolved_at,
  zones(name),
  reporter!incidents_reported_by_fkey(full_name),
  assignee!incidents_assigned_to_fkey(full_name)
`

export function mapIncident(row: DbIncidentRow): Incident {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    category: row.category ?? null,
    title: row.title,
    description: row.description ?? null,
    photoUrl: row.photo_url ?? null,
    zoneId: row.zone_id ?? null,
    zone: row.zones?.name ?? null,
    equipmentId: row.equipment_id ?? null,
    priority: row.priority,
    status: row.status,
    reportedBy: row.reported_by ?? null,
    reportedByName: row.reporter?.full_name ?? null,
    assignedTo: row.assigned_to ?? null,
    assignedToName: row.assignee?.full_name ?? null,
    resolutionNote: row.resolution_note ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? null,
  }
}

// ================= Equipment =================
export const EQUIPMENT_SELECT = `
  id, name, category, serial_number, zone_id, assigned_to, status, created_at,
  zones(name),
  assignee!equipment_assigned_to_fkey(full_name)
`

export function mapEquipment(row: DbEquipmentRow): Equipment {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    serialNumber: row.serial_number ?? null,
    zoneId: row.zone_id ?? null,
    zone: row.zones?.name ?? null,
    assignedTo: row.assigned_to ?? null,
    assignedToName: row.assignee?.full_name ?? null,
    status: row.status,
    createdAt: row.created_at,
  }
}

// ================= Notifications =================
export const NOTIFICATION_SELECT = `
  id, title, message, related_incident_id, is_read, created_at,
  incident:incidents(title)
`

export function mapNotification(row: DbNotificationRow): Notification {
  return {
    id: row.id,
    title: row.title,
    message: row.message ?? null,
    relatedIncidentId: row.related_incident_id ?? null,
    relatedIncidentTitle: row.incident?.title ?? null,
    read: row.is_read,
    createdAt: row.created_at,
  }
}