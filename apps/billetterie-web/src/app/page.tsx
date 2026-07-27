"use client"

import { HomeDesktop } from "@/components/home/home-desktop"
import { HomeMobile } from "@/components/home/home-mobile"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"

/**
 * Les deux vues sont rendues côte à côte.
 *
 * Au-delà de 768 px, la vitrine web reste toujours visible. Sous ce seuil,
 * l'interface applicative ne remplace la vitrine qu'après authentification.
 */
export default function AccueilPage() {
  const { isAuthenticated } = useTravelerAuth()

  return (
    <>
      <HomeMobile className={isAuthenticated ? undefined : "hidden"} />
      <HomeDesktop className={isAuthenticated ? undefined : "block"} />
    </>
  )
}
