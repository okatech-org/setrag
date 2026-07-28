"use client"

import { LogOut } from "lucide-react"
import { useRouter } from "next/navigation"

import { authClient } from "@workspace/api/auth-client"
import { Avatar } from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"

import { AccountNavigation } from "@/components/account/account-navigation"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"
import { ticketingStorage } from "@/lib/ticketing"

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
    ticketingStorage.clearBooking()
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

      <AccountNavigation />

      {children}

      <Button variant="secondary" block onClick={() => void logout()}>
        <LogOut />
        Se déconnecter
      </Button>
    </div>
  )
}
