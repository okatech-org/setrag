"use client"

import { BellIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Avatar } from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useTravelerAuth } from "@/hooks/use-traveler-auth"

/** Nom complet du profil, ou à défaut l'identifiant de connexion. */
export function nomAffiche(profil: { firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string | null } | null | undefined) {
  const nom = [profil?.firstName, profil?.lastName].filter(Boolean).join(" ")
  return nom || profil?.phone || profil?.email || "Mon compte"
}

/** Cloche des notifications, avec le nombre de non lues dit en toutes lettres. */
export function Cloche({ className }: { className?: string }) {
  const { isAuthenticated, isProfileReady } = useTravelerAuth()
  const nonLues = useQuery(api.functions.notificationCenter.unreadCount, isAuthenticated && isProfileReady ? {} : "skip") ?? 0
  if (!isAuthenticated) return null
  return (
    <Link
      href="/notifications"
      aria-label={nonLues > 0 ? `Notifications, ${nonLues} non lue${nonLues > 1 ? "s" : ""}` : "Notifications"}
      className={cn("relative grid size-11 place-items-center rounded-pill text-ink hover:bg-surface-sunk", className)}
    >
      <BellIcon className="size-[22px]" aria-hidden />
      {nonLues > 0 && (
        <span aria-hidden className="absolute top-2 right-2 grid h-[18px] min-w-[18px] place-items-center rounded-pill bg-danger px-1 font-mono text-[10.5px] font-semibold text-white shadow-[0_0_0_2px_var(--c-surface)]">
          {nonLues > 9 ? "9+" : nonLues}
        </span>
      )}
    </Link>
  )
}

/** Coin droit de l'en-tête : connexion, ou cloche et avatar. */
export function CompteRapide() {
  const chemin = usePathname()
  const { isLoading, isAuthenticated, profile } = useTravelerAuth()

  if (isLoading) return <span className="h-11 w-24" aria-hidden />
  if (!isAuthenticated) {
    return (
      <Button asChild variant="secondary" size="sm">
        <Link href={{ pathname: "/connexion", query: chemin === "/" ? {} : { retour: chemin } }}>Se connecter</Link>
      </Button>
    )
  }
  const nom = nomAffiche(profile?.user)
  return (
    <div className="flex items-center gap-1">
      <Cloche />
      <Link href="/compte" className="grid size-11 place-items-center rounded-pill hover:bg-surface-sunk" aria-label={`Mon compte — ${nom}`}>
        <Avatar name={nom} size="md" />
      </Link>
    </div>
  )
}
