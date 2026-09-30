import * as React from "react"
import { BanIcon, CircleCheckIcon, CircleDotIcon, ClockAlertIcon, FlagIcon, HourglassIcon, RotateCcwIcon, TimerOffIcon } from "lucide-react"

import { Tag } from "../tag"

/** État d'une desserte, tel que le backend le publie. */
export type StatutDesserte = "planifie" | "a_lheure" | "retarde" | "annule" | "termine"

/** État d'un billet. */
export type StatutBillet = "en_attente" | "valide" | "utilise" | "annule" | "rembourse" | "expire"

/**
 * Pastille d'une desserte. Le libellé porte toujours l'information — un
 * retard se lit « +12 min », pas seulement en orange.
 */
export function PastilleDesserte({ statut, retard = 0 }: { statut: StatutDesserte; retard?: number }) {
  if (statut === "annule") {
    return (
      <Tag tone="danger">
        <BanIcon aria-hidden />
        Supprimé
      </Tag>
    )
  }
  if (statut === "termine") {
    return (
      <Tag tone="neutral">
        <FlagIcon aria-hidden />
        Arrivé
      </Tag>
    )
  }
  if (statut === "retarde" || retard > 0) {
    return (
      <Tag tone="warning">
        <ClockAlertIcon aria-hidden />
        {/* Un nouveau retard remplace l'ancien en montant (240 ms) : pas de clignotement. */}
        <span key={retard} className="tabular animate-[st-monte_240ms_var(--ease)_both]">
          +{retard} min
        </span>
      </Tag>
    )
  }
  if (statut === "a_lheure") {
    return (
      <Tag tone="success">
        <CircleCheckIcon aria-hidden />À l&apos;heure
      </Tag>
    )
  }
  return (
    <Tag tone="info">
      <CircleDotIcon aria-hidden />
      Prévu
    </Tag>
  )
}

const BILLET: Record<StatutBillet, { ton: React.ComponentProps<typeof Tag>["tone"]; libelle: string; Icone: typeof BanIcon }> = {
  en_attente: { ton: "info", libelle: "Paiement en attente", Icone: HourglassIcon },
  valide: { ton: "success", libelle: "Valide", Icone: CircleCheckIcon },
  utilise: { ton: "neutral", libelle: "Utilisé", Icone: FlagIcon },
  annule: { ton: "danger", libelle: "Annulé", Icone: BanIcon },
  rembourse: { ton: "neutral", libelle: "Remboursé", Icone: RotateCcwIcon },
  expire: { ton: "neutral", libelle: "Expiré", Icone: TimerOffIcon },
}

export function PastilleBillet({ statut }: { statut: StatutBillet }) {
  const { ton, libelle, Icone } = BILLET[statut]
  return (
    <Tag tone={ton}>
      <Icone aria-hidden />
      {libelle}
    </Tag>
  )
}
