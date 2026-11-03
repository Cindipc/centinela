import { getSupabase } from '../supabase/client'
import type { Incident, Notification, PanicAlert } from '../types'
import { mapIncident, mapNotification, mapPanicAlert } from './mappers'

export type Unsubscribe = () => void

export function subscribeToIncidents(
  onInsert: (incident: Incident) => void,
  onUpdate?: (incident: Incident) => void
): Unsubscribe {
  const supabase = getSupabase()
  const channel = supabase
    .channel('incidents-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'incidents' },
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
  onChange: (alert: PanicAlert, eventType: 'INSERT' | 'UPDATE') => void
): Unsubscribe {
  const supabase = getSupabase()
  const channel = supabase
    .channel('panic-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'panic_alerts' },
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

export function subscribeToNotifications(onNotification: (notification: Notification) => void): Unsubscribe {
  const supabase = getSupabase()
  const channel = supabase
    .channel('notifications-changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications' },
      (payload) => {
        onNotification(mapNotification(payload.new as never))
      }
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

export function subscribeToEquipment(onChange: () => void): Unsubscribe {
  const supabase = getSupabase()
  const channel = supabase
    .channel('equipment-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'equipment' },
      () => {
        onChange()
      }
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}