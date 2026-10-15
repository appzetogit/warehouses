import { useState, useEffect, useMemo } from "react"
import { Bell, CheckCircle2, Clock, Tag, Gift, AlertCircle, Trash2, X } from "lucide-react"
import AnimatedPage from "@store/components/user/AnimatedPage"
import AccountAppBar from "@store/components/user/account/AccountAppBar"
import useNotificationInbox from "@store/hooks/useNotificationInbox"
import { useProfile } from "@store/context/ProfileContext"

// Order updates that arrived on this device while the app was open, kept per
// account. Everything else comes from the server inbox.
const LEGACY_NOTIFICATIONS_KEY = "store_user_notifications"
const USER_NOTIFICATIONS_KEY_PREFIX = "store_user_notifications:"

const currentUserId = (profile) => {
  let user = profile
  if (!user) {
    try {
      user = JSON.parse(localStorage.getItem("user_user") || "null")
    } catch {
      user = null
    }
  }
  const id = user?._id || user?.id || user?.userId
  return id ? String(id) : null
}

const loadLocalNotifications = (userId) => {
  try {
    // The old key was shared by every account on the device.
    localStorage.removeItem(LEGACY_NOTIFICATIONS_KEY)
    if (!userId) return []
    const saved = JSON.parse(localStorage.getItem(`${USER_NOTIFICATIONS_KEY_PREFIX}${userId}`) || "[]")
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

// Icon mapping for dynamic icons
const ICON_MAP = {
  CheckCircle2,
  Tag,
  Gift,
  AlertCircle
}

export default function Notifications() {
  const { userProfile } = useProfile()
  const userId = currentUserId(userProfile)
  const [stored, setStored] = useState(() => ({ userId, items: loadLocalNotifications(userId) }))
  // Another account signed in on this device: show theirs, not the previous one's.
  if (stored.userId !== userId) setStored({ userId, items: loadLocalNotifications(userId) })
  const notificationsList = stored.userId === userId ? stored.items : []
  const setNotificationsList = (update) =>
    setStored((prev) => ({ ...prev, items: typeof update === "function" ? update(prev.items) : update }))
  const {
    items: broadcastNotifications,
    unreadCount: broadcastUnreadCount,
    markAsRead: markBroadcastAsRead,
    dismiss: dismissBroadcastNotification,
    dismissAll: dismissAllBroadcastNotifications,
  } = useNotificationInbox("user", { limit: 100 })

  // Persistence: Save to localStorage whenever list updates
  useEffect(() => {
    if (stored.userId) {
      try {
        localStorage.setItem(`${USER_NOTIFICATIONS_KEY_PREFIX}${stored.userId}`, JSON.stringify(stored.items))
      } catch {
        // storage full or blocked
      }
    }
    // Also dispatch an event to update other components (like navbar badge)
    window.dispatchEvent(new CustomEvent('notificationsUpdated', { detail: { count: stored.items.filter(n => !n.read).length } }))
  }, [stored])

  // Real-time: Listen for status updates from useUserNotifications hook
  useEffect(() => {
    const handleOrderUpdate = (event) => {
      const { orderId, status, message, title } = event.detail
      const isCancelled = String(status || "").toLowerCase().includes('cancel')
      
      const newNotification = {
        id: `order-${Date.now()}`,
        type: isCancelled ? "alert" : "order",
        title: title || `Order #${orderId} ${status}`,
        message: message || `Your order status is now ${status}`,
        time: "Just now",
        timestamp: Date.now(),
        read: false,
        icon: isCancelled ? "AlertCircle" : "CheckCircle2",
        iconColor: isCancelled ? "text-red-600" : "text-wh-brand-ink"
      }
      setNotificationsList(prev => [newNotification, ...prev])
    }

    const handleDeliveryOtp = (event) => {
      const { orderId, otp, message } = event.detail
      const newNotification = {
        id: `otp-${Date.now()}`,
        type: "alert",
        title: "Delivery OTP Received",
        message: message || `Your OTP for order #${orderId} is ${otp}`,
        time: "Just now",
        timestamp: Date.now(),
        read: false,
        icon: "AlertCircle",
        iconColor: "text-orange-600"
      }
      setNotificationsList(prev => [newNotification, ...prev])
    }

    window.addEventListener('orderStatusNotification', handleOrderUpdate)
    window.addEventListener('deliveryDropOtp', handleDeliveryOtp)

    return () => {
      window.removeEventListener('orderStatusNotification', handleOrderUpdate)
      window.removeEventListener('deliveryDropOtp', handleDeliveryOtp)
    }
  }, [])
  
  const mergedNotifications = useMemo(() => {
    const localItems = (notificationsList || []).map((item) => ({
      ...item,
      source: "local",
    }))
    const broadcastItems = (broadcastNotifications || []).map((item) => ({
      ...item,
      source: "broadcast",
      type: "broadcast",
      time: item.createdAt
        ? new Date(item.createdAt).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        : "Just now",
      timestamp: item.createdAt || Date.now(),
      icon: "Bell",
      iconColor: "text-blue-600",
    }))

    return [...broadcastItems, ...localItems].sort(
      (a, b) =>
        new Date(b.timestamp || b.createdAt || 0).getTime() -
        new Date(a.timestamp || a.createdAt || 0).getTime()
    )
  }, [broadcastNotifications, notificationsList])

  const unreadCount = notificationsList.filter(n => !n.read).length + broadcastUnreadCount

  const handleMarkAsRead = (id, source = "local") => {
    if (source === "broadcast") {
      markBroadcastAsRead(id)
      return
    }
    setNotificationsList(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    )
  }

  const handleClearAll = () => {
    setNotificationsList([])
    dismissAllBroadcastNotifications()
  }

  const handleDeleteOne = (id, source = "local") => {
    if (source === "broadcast") {
      dismissBroadcastNotification(id)
      return
    }
    setNotificationsList((prev) => prev.filter((notification) => notification.id !== id))
  }

  // Today / Earlier, as in the customer app. Display only.
  const sections = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const today = []
    const earlier = []
    for (const n of mergedNotifications) {
      const at = new Date(n.timestamp || n.createdAt || 0).getTime()
      if (Number.isFinite(at) && at >= startOfToday.getTime()) today.push(n)
      else earlier.push(n)
    }
    return [
      { title: "Today", items: today },
      { title: "Earlier", items: earlier },
    ].filter((s) => s.items.length > 0)
  }, [mergedNotifications])

  return (
    <AnimatedPage className="min-h-screen bg-app-cream font-app text-app-ink dark:bg-[#0a0a0a]">
      <AccountAppBar
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : ""}
        backTo="/user"
        right={
          mergedNotifications.length > 0 ? (
            <button
              type="button"
              onClick={handleClearAll}
              className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-app-brown active:bg-app-sand"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Clear all
            </button>
          ) : null
        }
      />

      <div className="max-w-md md:max-w-2xl lg:max-w-3xl xl:max-w-3xl mx-auto px-4 py-4 lg:px-8 lg:py-8">
        {sections.map((section) => (
          <section key={section.title} className="mb-5" aria-label={section.title}>
            <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-app-muted">
              {section.title}
            </h2>
            <div className="space-y-2.5">
              {section.items.map((notification) => {
                const Icon = ICON_MAP[notification.icon] || Bell
                const tone =
                  notification.type === "alert"
                    ? "bg-[#B3261E]/10 text-[#B3261E]"
                    : notification.type === "order"
                      ? "bg-app-ok/12 text-app-ok"
                      : "bg-app-brown/10 text-app-brown"
                return (
                  <div
                    key={notification.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleMarkAsRead(notification.id, notification.source)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleMarkAsRead(notification.id, notification.source)
                      }
                    }}
                    className={`relative flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors ${
                      !notification.read
                        ? "border-app-brown/25 bg-app-tint-strong/60"
                        : "border-app-line bg-white"
                    }`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3
                          className={`text-[14.5px] ${
                            !notification.read ? "font-semibold text-app-ink" : "font-medium text-app-ink/80"
                          }`}
                        >
                          {!notification.read ? (
                            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-app-brown align-middle" aria-label="Unread" />
                          ) : null}
                          {notification.title}
                        </h3>
                        <button
                          type="button"
                          aria-label="Delete notification"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteOne(notification.id, notification.source)
                          }}
                          className="-mr-1 -mt-1 shrink-0 rounded-full p-1 text-app-muted hover:bg-app-sand hover:text-[#B3261E]"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[13px] text-app-muted">{notification.message}</p>
                      <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-app-muted">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {notification.time}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}

        {/* Empty State (if no notifications) */}
        {mergedNotifications.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-app-brown/10">
              <Bell className="h-9 w-9 text-app-brown" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-[18px] font-semibold text-app-ink">No notifications</h3>
            <p className="mt-1 text-[13px] text-app-muted">You're all caught up!</p>
          </div>
        )}
      </div>
    </AnimatedPage>
  )
}
