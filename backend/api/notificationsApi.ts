import { getSupabase } from '../supabase/client'
import { NOTIFICATION_SELECT, mapNotification } from './mappers'
import type { Notification } from '../types'

export async function getNotifications(): Promise<Notification[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIFICATION_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => mapNotification(r as never))
}

export async function markAsRead(id: string): Promise<Notification> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .select(NOTIFICATION_SELECT)
    .single()
  if (error) throw error
  return mapNotification(data as never)
}

export async function markAllAsRead(): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('notifications').update({ is_read: true }).neq('is_read', true)
  if (error) throw error
}