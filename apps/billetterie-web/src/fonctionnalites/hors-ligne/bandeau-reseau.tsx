"use client"

import { CloudOffIcon } from "lucide-react"

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
export function BandeauReseau() {
  const enLigne = useOnline()

  if (enLigne) return null

  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-surface-sunk px-4 py-2 text-[13px] font-medium text-ink">
      <CloudOffIcon className="size-4 shrink-0" aria-hidden />
      <span>Pas de réseau. Vos billets restent consultables.</span>
    </div>
  )
}
