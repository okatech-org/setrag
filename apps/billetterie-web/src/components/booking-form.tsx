"use client"

import { useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"

import { BookingFormDesktop } from "@/components/booking/booking-form-desktop"
import { BookingFormMobile } from "@/components/booking/booking-form-mobile"
import {
  useBookingDraft,
  type TravelerDefaults,
} from "@/features/reservation/use-booking-draft"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"

/**
 * Saisie du dossier.
 *
 * Le brouillon et la mutation de création vivent dans le hook, appelé une
 * seule fois ici : les deux vues étant montées ensemble, un état par vue
 * ouvrirait deux dossiers et retiendrait deux fois les places.
 */
export function BookingForm() {
  const { isAuthenticated, isLoading, isProfileReady, profile, user } =
    useTravelerAuth()

  if (isLoading || (isAuthenticated && (!isProfileReady || !profile))) {
    return <SkeletonLines lines={7} />
  }

  const nameParts = (user?.name ?? "").trim().split(/\s+/).filter(Boolean)
  const traveler: TravelerDefaults | undefined = isAuthenticated
    ? {
        firstName: profile?.user.firstName ?? nameParts[0] ?? "",
        lastName: profile?.user.lastName ?? nameParts.slice(1).join(" ") ?? "",
        phone: profile?.user.phone ?? "",
        email:
          profile?.user.email ??
          (user?.email?.endsWith("@auth.setrag.local")
            ? ""
            : (user?.email ?? "")),
      }
    : undefined

  return <ReadyBookingForm traveler={traveler} />
}

function ReadyBookingForm({ traveler }: { traveler?: TravelerDefaults }) {
  const router = useRouter()
  const draft = useBookingDraft(traveler)

  if (!draft.hasTrip) {
    return (
      <EmptyState
        title="Aucun train sélectionné"
        description="Revenez aux résultats et choisissez une desserte avant de renseigner les voyageurs."
        action={
          <Button onClick={() => router.push("/")}>Rechercher un train</Button>
        }
      />
    )
  }

  return (
    <>
      <BookingFormMobile draft={draft} />
      <BookingFormDesktop draft={draft} />
    </>
  )
}
