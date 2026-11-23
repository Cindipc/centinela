import { getSupabase } from '../supabase/client'
import type { Incident, Notification, PanicAlert } from '../types'
import { mapIncident, mapNotification, mapPanicAlert } from './mappers'

export type Unsubscribe = () => void

export function subscribeToIncidents(
  onInsert: (incident: Incident) => void,
  onUpdate?: (incident: Incident) => void,
  organizationId?: string | null
): Unsubscribe {
  const supabase = getSupabase()
  const channel = supabase
    .channel(`incidents-changes:${organizationId ?? 'global'}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'incidents',
        ...(organizationId ? { filter: `organization_id=eq.${organizationId}` } : {}),
      },
      (payload) => {
        const mapped = mapIncident(payload.new as never)
        if (payload.eventType === 'INSERT') onInsert(mapped)
        else if (payload.eventType === 'UPDATE') onUpdate?.(mapped)
      }
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

/** Alertas de pánico en vivo (INSERT y UPDATE de estado). RLS limita lo que llega. */
export function subscribeToPanics(
  onChange: (alert: PanicAlert, eventType: 'INSERT' | 'UPDATE') => void,
  organizationId?: string | null
): Unsubscribe {
  const supabase = getSupabase()
  const channel = supabase
    .channel(`panic-changes:${organizationId ?? 'global'}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'panic_alerts',
        ...(organizationId ? { filter: `organization_id=eq.${organizationId}` } : {}),
      },
      (payload) => {
        if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return
        onChange(mapPanicAlert(payload.new as never), payload.eventType)
      }
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

export function subscribeToNotifications(
  userId: string,
  onNotification: (notification: Notification) => void
): Unsubscribe {
  const supabase = getSupabase()
  const channel = supabase
    .channel(`notifications-changes:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onNotification(mapNotification(payload.new as never))
      }
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

export function subscribeToEquipment(
  onChange: () => void,
  organizationId?: string | null
): Unsubscribe {
  const supabase = getSupabase()
  const channel = supabase
    .channel(`equipment-changes:${organizationId ?? 'global'}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'equipment',
        ...(organizationId ? { filter: `organization_id=eq.${organizationId}` } : {}),
      },
      () => {
        onChange()
      }
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}