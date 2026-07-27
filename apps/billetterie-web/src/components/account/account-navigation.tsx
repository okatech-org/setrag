"use client"

import { Bell, ChevronRight, Palette, UserRound, Users } from "lucide-react"
import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

import { NotificationsSheet } from "@/components/notifications/notifications-sheet"

const ENTRIES = [
  {
    href: "/compte/profil",
    label: "Profil",
    note: "Nom, téléphone, contact d’urgence",
    icon: UserRound,
  },
  {
    href: "/compte/voyageurs",
    label: "Voyageurs enregistrés",
    note: "Fiches réutilisées à la réservation",
    icon: Users,
  },
  {
    href: "/compte/affichage",
    label: "Affichage et langue",
    note: "Thème clair, sombre ou système",
    icon: Palette,
  },
  {
    href: null,
    label: "Notifications",
    note: "Alertes de retard, rappels, reçus",
    icon: Bell,
  },
] as const

/** Navigation de compte partagée par les expériences mobile et desktop. */
export function AccountNavigation({
  layout = "list",
  className,
}: {
  layout?: "list" | "grid"
  className?: string
}) {
  return (
    <nav
      aria-label="Réglages du compte"
      className={className}
      data-layout={layout}
    >
      <ul
        className={cn(
          "grid gap-s-2",
          layout === "grid" && "md:grid-cols-2 xl:grid-cols-4"
        )}
      >
        {ENTRIES.map((entry) => {
          const Icon = entry.icon
          const content = (
            <>
              <Icon aria-hidden className="size-5 shrink-0 text-accent-ink" />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-body font-medium">{entry.label}</span>
                <span className="text-caption text-ink-muted">
                  {entry.note}
                </span>
              </span>
              <ChevronRight
                aria-hidden
                className="size-5 shrink-0 text-ink-faint"
              />
            </>
          )
          const controlClass =
            "flex min-h-target h-full w-full items-center gap-s-3 rounded-md border border-line bg-surface p-s-4 text-left hover:bg-surface-sunk"

          return (
            <li key={entry.label}>
              {entry.href ? (
                <Link href={entry.href} className={controlClass}>
                  {content}
                </Link>
              ) : (
                <NotificationsSheet>
                  <button type="button" className={controlClass}>
                    {content}
                  </button>
                </NotificationsSheet>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
