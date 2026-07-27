"use client"

import {
  Bell,
  ChevronRight,
  LogOut,
  Palette,
  UserRound,
  Users,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { authClient } from "@workspace/api/auth-client"
import { Avatar } from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"

import { NotificationsSheet } from "@/components/notifications/notifications-sheet"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"

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
]

/**
 * Compte, en mobile — un sommaire.
 *
 * Le bureau étale profil, consentements et droits sur une même page ; au pouce
 * cela ferait un formulaire interminable. Chaque rubrique s'ouvre donc dans un
 * écran empilé, et seule la gestion des données reste ici, en pied.
 */
export function AccountMobile({ children }: { children?: React.ReactNode }) {
  const router = useRouter()
  const { profile, user } = useTravelerAuth()

  const firstName = profile?.user.firstName ?? ""
  const lastName = profile?.user.lastName ?? ""
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") ||
    user?.name ||
    "Mon compte"

  async function logout() {
    await authClient.signOut()
    router.replace("/")
    router.refresh()
  }

  return (
    <div className="grid gap-s-5 *:min-w-0 md:hidden">
      <section className="flex items-center gap-s-3 rounded-lg border border-line bg-surface p-s-4">
        <Avatar name={displayName} size="lg" />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-body truncate font-semibold">
            {displayName}
          </span>
          <span className="tabular text-caption truncate text-ink-muted">
            {profile?.user.phone ?? profile?.user.email ?? "Compte voyageur"}
          </span>
        </span>
      </section>

      <nav aria-label="Réglages du compte">
        <ul className="grid gap-s-2">
          {ENTRIES.map((entry) => {
            const Icon = entry.icon
            const content = (
              <>
                <Icon
                  aria-hidden
                  className="size-5 shrink-0 text-accent-ink"
                />
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

            return (
              <li key={entry.label}>
                {entry.href ? (
                  <Link
                    href={entry.href}
                    className="flex min-h-target items-center gap-s-3 rounded-md border border-line bg-surface p-s-4 hover:bg-surface-sunk"
                  >
                    {content}
                  </Link>
                ) : (
                  <NotificationsSheet>
                    <button
                      type="button"
                      className="flex min-h-target w-full items-center gap-s-3 rounded-md border border-line bg-surface p-s-4 text-left hover:bg-surface-sunk"
                    >
                      {content}
                    </button>
                  </NotificationsSheet>
                )}
              </li>
            )
          })}
        </ul>
      </nav>

      {children}

      <Button variant="secondary" block onClick={() => void logout()}>
        <LogOut />
        Se déconnecter
      </Button>
    </div>
  )
}
