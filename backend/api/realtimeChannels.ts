import { getSupabase } from '../supabase/client'
import type { Incident, Notification } from '../types'
import { mapIncident, mapNotification } from './mappers'

export type Unsubscribe = () => void

export function subscribeToIncidents(onIncident: (incident: Incident) => void): Unsubscribe {
  const supabase = getSupabase()
  const channel = supabase
    .channel('incidents-changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'incidents' },
      (payload) => {
        onIncident(mapIncident(payload.new as never))
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