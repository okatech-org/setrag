"use client"

import { useEffect, useState } from "react"

/**
 * État du réseau, tel que le navigateur le rapporte.
 *
 * `navigator.onLine` ne dit pas que le serveur répond : il dit que l'appareil
 * a une interface active. Sur la ligne, un téléphone accroché à une antenne
 * saturée se déclarera « en ligne » sans qu'aucune requête n'aboutisse. Cet
 * état ne sert donc qu'à EXPLIQUER — afficher un bandeau, dater ce qu'on
 * montre — jamais à décider qu'une donnée est fraîche : ce sont les requêtes
 * Convex qui en jugent, en aboutissant ou non.
 *
 * La valeur de départ est `true`, y compris au rendu serveur, où le réseau est
 * par construction disponible : partir de `false` ferait clignoter le bandeau
 * « hors réseau » à chaque chargement de page.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])

  return online
}
