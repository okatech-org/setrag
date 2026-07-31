"use client"

import { CloudOff } from "lucide-react"

import { useOnline } from "@/hooks/use-online"

/**
 * Bandeau permanent d'absence de réseau.
 *
 * Il ne remplace pas les messages des écrans, qui datent ce qu'ils montrent :
 * il répond à une autre question, celle que se pose un voyageur devant un
 * bouton qui ne réagit pas — « est-ce l'application, ou le réseau ? ».
 *
 * L'information n'est pas portée par la couleur seule : l'icône et la phrase
 * la disent, comme l'exige la charte.
 */
export function BarreReseau() {
  const enLigne = useOnline()

  if (enLigne) return null

  return (
    <div
      role="status"
      className="text-small flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-warning-ink"
    >
      <CloudOff className="size-4 shrink-0" aria-hidden />
      <span>
        Hors réseau — vos billets enregistrés restent consultables.
      </span>
    </div>
  )
}
