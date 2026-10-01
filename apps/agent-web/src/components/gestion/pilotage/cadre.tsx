"use client"

import type { ReactNode } from "react"

import type {
  AppRole,
  Permission,
  ProtectedResource,
} from "@workspace/backend/permissions"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { BandeauLectureSeule } from "@/components/charte"
import { useModuleNavigationAccesses } from "@/components/module-access-navigation"
import { usePortalSession } from "@/components/portal-guard"
import { SellerShell } from "@/components/seller-shell"
import { useOnlineStatus } from "@/hooks/use-online-status"
import { asAppRole } from "@/lib/portal-access"

import { peutAgir } from "./droits"
import { EcranAttente } from "@/coquille/ecran-attente"

const PERIMETRE_GESTION = {
  code: "DCO",
  name: "Direction commerciale · réseau entier",
  type: "siege",
}

export interface Pilotage {
  role: AppRole | undefined
  enLigne: boolean
  /** Droit effectif, hors réseau compris : une action exige le réseau. */
  peut: (resource: ProtectedResource, permission?: Permission) => boolean
  /** Droit de consultation, indépendant du réseau. */
  voit: (resource: ProtectedResource) => boolean
}

/** Rôle, droits et réseau de l’écran courant. */
export function usePilotage(): Pilotage & { pret: boolean } {
  const session = usePortalSession()
  const role = asAppRole(session?.profile.user?.role)
  const { decisions, loading } = useModuleNavigationAccesses(role)
  const enLigne = useOnlineStatus()
  return {
    role,
    enLigne,
    pret: Boolean(session?.profile.user) && !loading,
    voit: (resource) => peutAgir(role, decisions, resource, "consulter"),
    peut: (resource, permission = "consulter") =>
      (permission === "consulter" || enLigne) && peutAgir(role, decisions, resource, permission),
  }
}

/**
 * Cadre d’un écran de pilotage : la coquille du portail de gestion, la
 * vérification de session, le bandeau hors réseau et, si le rôle ne peut
 * qu’observer, le bandeau de lecture seule.
 */
export function CadrePilotage({
  titre,
  lectureSeule,
  children,
}: {
  /** Dernier maillon du fil d’Ariane, pour un dossier ouvert. */
  titre?: string
  /** Message de lecture seule ; `false` si le rôle peut agir. */
  lectureSeule?: ReactNode | false
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
      online={enLigne}
      title={titre}
    >
      <div className="mx-auto grid max-w-[1500px] min-w-0 grid-cols-[minmax(0,1fr)] gap-5 pb-8">
        {!enLigne ? (
          <InlineMessage tone="warning" title="Hors réseau : consultation seule.">
            Les chiffres affichés datent de la dernière connexion ; les actions reprendront avec le réseau.
          </InlineMessage>
        ) : null}
        {lectureSeule ? <BandeauLectureSeule>{lectureSeule}</BandeauLectureSeule> : null}
        {children}
      </div>
    </SellerShell>
  )
}

/** Message de lecture seule selon le rôle. */
export function messageLectureSeule(role: AppRole | undefined, quoi: string) {
  return role === "admin_it"
    ? `Administration système : ${quoi} visible pour la gouvernance, sans action métier.`
    : `Consultation seule : votre rôle permet de lire ${quoi}, pas d’y agir.`
}
