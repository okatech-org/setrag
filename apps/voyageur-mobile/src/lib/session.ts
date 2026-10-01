import { useCallback } from "react"
import { router } from "expo-router"

import { signOut } from "./auth-client"
import { useBookings } from "./bookings-cache"
import { useJourney } from "./journey"

/**
 * Déconnexion explicite : le seul moment, avec la suppression du compte, où
 * la copie locale des billets est effacée.
 */
export function useSeDeconnecter() {
  const { clear } = useBookings()
  const { setTenue, setPaiement, setVoyageurs } = useJourney()

  return useCallback(async () => {
    // La session tombe d'abord : sinon le compte encore connu réécrirait sa
    // copie (et le « dernier compte ») juste après l'effacement.
    await signOut().catch(() => undefined)
    await clear()
    setTenue(null)
    setPaiement(null)
    setVoyageurs([])
    router.replace("/")
  }, [clear, setTenue, setPaiement, setVoyageurs])
}
