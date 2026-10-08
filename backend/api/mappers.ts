import type {
  Incident,
  Equipment,
  Notification,
  Profile,
  Zone,
  Department,
  EmergencyContact,
  PanicAlert,
  GeoPoint,
  DbIncidentRow,
  DbEquipmentRow,
  DbNotificationRow,
  DbProfileRow,
  DbZoneRow,
  DbDepartmentRow,
  DbEmergencyContactRow,
  DbPanicAlertRow,
} from '../types'

// ================= Perfiles =================
export const PROFILE_SELECT = 'id, full_name, role, department_id, zone_id, phone'

export function mapProfile(row: DbProfileRow, email = ''): Profile {
  return {
    id: row.id,
    email,
    name: row.full_name,
    role: row.role,
    departmentId: row.department_id ?? null,
    zoneId: row.zone_id ?? null,
    phone: row.phone ?? null,
  }
}

// ================= Geometría (PostGIS) =================
// PostgREST devuelve geography como GeoJSON (objeto o texto JSON) o como WKB
// hex. Se normaliza a { lat, lng } para pintar en el mapa.
export function parsePoint(value: unknown): GeoPoint | null {
  if (!value) return null
  if (typeof value === 'string') {
    const text = value.trim()
    if (text.startsWith('{')) return parsePoint(JSON.parse(text))
    if (/^[0-9a-f]{18}$/i.test(text)) return parseEwkbHex(text)
    return null
  }
  if (Array.isArray(value)) return parsePoint({ type: 'Point', coordinates: value })
  if (typeof value === 'object') {
    const coords = (value as { coordinates?: unknown }).coordinates
    if (Array.isArray(coords) && coords.length >= 2) {
      const lng = Number(coords[0])
      const lat = Number(coords[1])
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
    }
  }
  return null
}

function parseEwkbHex(hex: string): GeoPoint | null {
  const bytes = hex.match(/../g)
  if (!bytes || bytes.length < 9) return null
  const littleEndian = bytes[0] === '01'
  const read = (from: number, to: number) => {
    const chunk = bytes.slice(from, to)
    return Number(BigInt('0x' + (littleEndian ? chunk.reverse().join('') : chunk.join(''))))
  }
  try {
    const lng = read(1, 5)
    const lat = read(5, 9)
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  } catch {
    return null
  }
}

// ================= Incidents =================
export const INCIDENT_SELECT = `
  id, code, type, category, title, description, photo_url, location,
  zone_id, equipment_id, priority, status, reported_by, assigned_to,
  resolution_note, created_at, updated_at, resolved_at,
  zones(name, location),
  reporter:reported_by(full_name),
  assignee:assigned_to(full_name)
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
    location: parsePoint(row.location) ?? parsePoint(row.zones?.location),
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
  assignee:assigned_to(full_name)
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

// ================= Zonas y departamentos =================
export const ZONE_SELECT = 'id, name, building, department_id, location'

export function mapZone(row: DbZoneRow): Zone {
  return {
    id: row.id,
    name: row.name,
    building: row.building,
    departmentId: row.department_id,
    location: parsePoint(row.location),
  }
}

export function mapDepartment(row: DbDepartmentRow): Department {
  return { id: row.id, name: row.name, responsibleId: row.responsible_id }
}

// ================= Contactos de confianza =================
export const CONTACT_SELECT = 'id, user_id, name, phone, relation, created_at'

export function mapEmergencyContact(row: DbEmergencyContactRow): EmergencyContact {
  return {
    id: row.id,
    userId: row.user_id ?? '',
    name: row.name,
    phone: row.phone,
    relation: row.relation ?? null,
    createdAt: row.created_at,
  }
}

// ================= Botón de pánico =================
export const PANIC_SELECT = `
  id, user_id, status, zone_id, location, created_at, resolved_at,
  zones(name),
  reporter:user_id(full_name)
`

export function mapPanicAlert(row: DbPanicAlertRow): PanicAlert {
  const point = parsePoint(row.location)
  return {
    id: row.id,
    userId: row.user_id ?? '',
    userName: row.reporter?.full_name ?? null,
    status: row.status,
    zone: row.zones?.name ?? null,
    latitude: point?.lat ?? null,
    longitude: point?.lng ?? null,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }
}