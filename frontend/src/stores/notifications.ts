import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getNotifications, markAsRead, markAllAsRead } from '@backend/api/notificationsApi'
import { subscribeToNotifications } from '@backend/api/realtimeChannels'
import type { Notification } from '@backend/types'

export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref<Notification[]>([])
  const loading = ref(false)

  const unreadCount = computed(() => notifications.value.filter((n) => !n.read).length)

  let unsubscribe: (() => void) | null = null

  async function fetchNotifications() {
    loading.value = true
    try {
      notifications.value = await getNotifications()
    } finally {
      loading.value = false
    }
  }

  function listenRealtime() {
    if (unsubscribe) return
    unsubscribe = subscribeToNotifications((notification) => {
      const exists = notifications.value.some((n) => n.id === notification.id)
      if (!exists) {
        notifications.value.unshift(notification)
      }
    })
  }

  async function markOne(id: string) {
    const updated = await markAsRead(id)
    const index = notifications.value.findIndex((n) => n.id === id)
    if (index !== -1) notifications.value[index] = updated
  }

  async function markAll() {
    await markAllAsRead()
    notifications.value = notifications.value.map((n) => ({ ...n, read: true }))
  }

  return { notifications, loading, unreadCount, fetchNotifications, listenRealtime, markOne, markAll }
})