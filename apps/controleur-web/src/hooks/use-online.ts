"use client"

import { useEffect, useState } from "react"

/**
 * État du réseau, tel que le terminal le perçoit.
 *
 * `navigator.onLine` ne prouve pas qu'un serveur répond — il dit seulement
 * que l'interface réseau est active. C'est suffisant ici : l'application ne
 * s'en sert que pour proposer un envoi, jamais pour conclure qu'un envoi a
 * réussi. La preuve d'un envoi reste la réponse du serveur.
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
