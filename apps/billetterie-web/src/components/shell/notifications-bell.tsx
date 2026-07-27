"use client"

import { Bell } from "lucide-react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { cn } from "@workspace/ui/lib/utils"

import { NotificationsSheet } from "@/components/notifications/notifications-sheet"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"

/**
 * Cloche des notifications, avec le nombre de messages non lus.
 *
 * Le compte n'est pas porté par la seule couleur de la pastille : il est écrit
 * dedans, et repris dans le libellé accessible du lien.
 */
export function NotificationsBell({
  className,
  variant = "surface",
}: {
  className?: string
  variant?: "surface" | "inverse"
}) {
  const { isAuthenticated, isProfileReady } = useTravelerAuth()
  const unread = useQuery(
    api.functions.notificationCenter.unreadCount,
    isAuthenticated && isProfileReady ? {} : "skip"
  )
  const count = unread ?? 0

  return (
    <NotificationsSheet>
      <button
        type="button"
        aria-label={
          count > 0
            ? `Voir les notifications — ${count} non lue${count > 1 ? "s" : ""}`
            : "Voir les notifications"
        }
        className={cn(
          "relative grid size-target place-items-center rounded-pill transition-colors",
          variant === "inverse"
            ? "bg-white/10 text-ink-inverse hover:bg-white/20"
            : "text-ink hover:bg-surface-sunk",
          className
        )}
      >
        <Bell aria-hidden className="size-5" />
        {count > 0 && (
          <span
            aria-hidden
            className="tabular absolute top-1 right-1 grid min-w-4 place-items-center rounded-pill bg-danger px-1 text-[10px] leading-4 font-semibold text-ink-inverse"
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>
    </NotificationsSheet>
  )
}
