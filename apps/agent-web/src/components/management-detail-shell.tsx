"use client"

import type { ReactNode } from "react"

import { BandeauLectureSeule, EnTetePage } from "@/components/charte"
import { CoquilleAgent } from "@/coquille/coquille-agent"
import { asAppRole } from "@/lib/portal-access"
import {
  canPerformModuleActions,
  useModuleNavigationAccesses,
} from "./module-access-navigation"
import { usePortalSession } from "./portal-guard"
import { EcranAttente } from "@/coquille/ecran-attente"

const MANAGEMENT_SCOPE = {
  code: "DCO",
  name: "Direction commerciale · réseau entier",
  type: "siege",
}

/**
 * Cadre d'un dossier de gestion : retour à la liste, en-tête, mention de
 * lecture seule.
 *
 * Par défaut (`verrouillage="fieldset"`), tout le contenu est désactivé en
 * lecture seule. Les dossiers qui dosent eux-mêmes leurs actions par droit
 * (`verrouillage="aucun"`) gardent actifs onglets, exports et impressions.
 */
export function ManagementDetailShell({
  title,
  eyebrow,
  backHref,
  backLabel = "Retour à la liste",
  description,
  actions,
  verrouillage = "fieldset",
  gouvernance = false,
  lectureSeule,
  children,
}: {
  title: string
  eyebrow: string
  backHref: string
  backLabel?: string
  description?: ReactNode
  /** Actions de l'en-tête. Un seul bouton `primary` par écran. */
  actions?: ReactNode
  verrouillage?: "fieldset" | "aucun"
  /** Dossier de gouvernance : l'administrateur système y agit. */
  gouvernance?: boolean
  /** Force la mention de lecture seule (droits fins insuffisants). */
  lectureSeule?: boolean
  children: ReactNode
}) {
  const session = usePortalSession()
  const user = session?.profile.user
  const role = asAppRole(user?.role)
  const { accesses: moduleAccesses, loading: moduleAccessesLoading } =
    useModuleNavigationAccesses(role)
  const voyageursAccessLevel = moduleAccesses.find(
    ({ code }) => code === "voyageurs"
  )?.accessLevel
  const moduleReadOnly =
    gouvernance && role === "admin_it"
      ? false
      : moduleAccessesLoading ||
        (voyageursAccessLevel !== undefined &&
          !canPerformModuleActions(voyageursAccessLevel, role))
  const isReadOnly = moduleReadOnly || Boolean(lectureSeule)

  if (!user) {
    return (
      <EcranAttente>Vérification de la session…</EcranAttente>
    )
  }

  return (
    <CoquilleAgent perimetre={MANAGEMENT_SCOPE.name} titre={title}>
      <div className="mx-auto grid max-w-[1320px] grid-cols-[minmax(0,1fr)] gap-5">
        <EnTetePage
          retour={{ href: backHref, libelle: backLabel }}
          surtitre={eyebrow}
          titre={title}
          description={description}
          actions={actions}
        />
        {isReadOnly && !moduleAccessesLoading ? (
          <BandeauLectureSeule>
            {role === "admin_it" && !gouvernance
              ? "Administration système : ce dossier est visible pour la gouvernance, sans action métier."
              : "Mode lecture : vous pouvez consulter ce dossier, mais ses actions sont désactivées."}
          </BandeauLectureSeule>
        ) : null}
        {verrouillage === "fieldset" ? (
          <fieldset disabled={isReadOnly} className="contents">
            {children}
          </fieldset>
        ) : (
          children
        )}
      </div>
    </CoquilleAgent>
  )
}
