"use client"

import { WifiOff } from "lucide-react"
import type { ReactNode } from "react"

import { InlineMessage } from "@workspace/ui/components/inline-message"

import { BandeauLectureSeule, EnTetePage } from "@/components/charte"
import { usePortalSession } from "@/components/portal-guard"
import { SellerShell } from "@/components/seller-shell"
import { useOnlineStatus } from "@/hooks/use-online-status"
import { EcranAttente } from "@/coquille/ecran-attente"

const PERIMETRE_GESTION = {
  code: "DCO",
  name: "Direction commerciale · réseau entier",
  type: "siege",
}

/**
 * Cadre d'une page liste du portail de gestion : la coquille, l'en-tête
 * (un seul bouton `primary` dans `actions`), l'avertissement hors réseau et,
 * s'il y a lieu, la mention de lecture seule.
 */
export function CadreGestion({
  surtitre,
  titre,
  description,
  actions,
  lectureSeule,
  children,
}: {
  surtitre: string
  titre: string
  description?: ReactNode
  actions?: ReactNode
  /** Texte de la mention de lecture seule ; absent, pas de mention. */
  lectureSeule?: ReactNode
  children: ReactNode
}) {
  const session = usePortalSession()
  const enLigne = useOnlineStatus()
  const user = session?.profile.user
  if (!user) {
    return (
      <EcranAttente>Vérification de la session…</EcranAttente>
    )
  }
  return (
    <SellerShell
      seller={{
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        matricule: user.matricule,
        role: user.role,
      }}
      pointOfSale={PERIMETRE_GESTION}
      portal="gestion"
    >
      <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)] gap-5">
        <EnTetePage surtitre={surtitre} titre={titre} description={description} actions={actions} />
        {!enLigne ? (
          <InlineMessage tone="warning" title="Hors réseau.">
            <WifiOff aria-hidden className="inline size-4" /> Les données affichées peuvent dater ; les actions reprendront au retour du réseau.
          </InlineMessage>
        ) : null}
        {lectureSeule ? <BandeauLectureSeule>{lectureSeule}</BandeauLectureSeule> : null}
        {children}
      </div>
    </SellerShell>
  )
}

/** Texte de lecture seule selon la raison. */
export function mentionLectureSeule(role: string | undefined, sujet: string) {
  return role === "admin_it"
    ? `Administration système : ${sujet} est visible pour la gouvernance, sans action métier.`
    : `Mode lecture : vous consultez ${sujet}, sans droit de modification.`
}
