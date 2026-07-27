"use client"

import { HomeDesktop } from "@/components/home/home-desktop"
import { HomeMobile } from "@/components/home/home-mobile"

/**
 * Les deux vues sont rendues côte à côte et choisies uniquement par le
 * breakpoint. Le mobile conserve ainsi sa recherche compacte, avec ou sans
 * session ; l'authentification ne doit pas modifier la densité de la page.
 */
export default function AccueilPage() {
  return (
    <>
      <HomeMobile />
      <HomeDesktop />
    </>
  )
}
