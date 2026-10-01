"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { MODULE_MANIFEST } from "@workspace/backend/modules"

import { BandeauLectureSeule, EnTetePage } from "@/components/charte"
import { CoquilleAgent } from "@/coquille/coquille-agent"
import { asAppRole } from "@/lib/portal-access"
import {
  canPerformModuleActions,
  useModuleNavigationAccesses,
} from "./module-access-navigation"
import { usePortalSession } from "./portal-guard"

export interface EnterpriseShellProps {
  title: string
  subtitle?: string
  children: ReactNode
  actions?: ReactNode
  /** Libellé de l'espace, porté par le surtitre de la page. */
  space?: string
  /** Périmètre affiché au pied du menu (réseau, direction, site). */
  scope?: string
  /**
   * Rubriques d'un espace transverse, rendues en tête du menu. Le rappel
   * reçoit la fermeture du tiroir mobile.
   */
  navigation?: (context: { onNavigate: () => void }) => ReactNode
  /** Élément rendu au-dessus du titre : lien de retour, surtitre. */
  eyebrow?: ReactNode
}

/**
 * Cadre des modules et des espaces transverses : la coquille du portail, un
 * en-tête de page, et le mode lecture quand le niveau d'accès ne permet pas
 * d'agir.
 */
export function EnterpriseShell({
  title,
  subtitle,
  children,
  actions,
  space,
  scope,
  navigation,
  eyebrow,
}: EnterpriseShellProps) {
  const pathname = usePathname()
  const session = usePortalSession()
  const role = asAppRole(session?.profile.user?.role)
  const activeModule = MODULE_MANIFEST.find(
    (module) => module.route !== "/gestion" && pathname.startsWith(module.route)
  )
  const { accesses: moduleAccesses, loading: moduleAccessesLoading } =
    useModuleNavigationAccesses(role)
  const activeAccess = activeModule
    ? moduleAccesses.find(({ code }) => code === activeModule.code)
    : undefined
  const isSystemGovernance = role === "admin_it" && Boolean(activeModule)
  const isReadOnly = Boolean(
    activeModule &&
      (moduleAccessesLoading ||
        (activeAccess &&
          !canPerformModuleActions(activeAccess.accessLevel, role)))
  )

  return (
    <CoquilleAgent perimetre={scope} rubriques={navigation} titre={title}>
      <div className="mx-auto grid max-w-[1320px] grid-cols-[minmax(0,1fr)] gap-5">
        {eyebrow ? <div className="flex items-center">{eyebrow}</div> : null}
        <EnTetePage
          surtitre={space ?? activeModule?.label}
          titre={title}
          description={subtitle}
          actions={actions && !isReadOnly ? actions : undefined}
        />
        {isReadOnly ? (
          <BandeauLectureSeule>
            {isSystemGovernance
              ? "Administration système : le module reste visible pour la gouvernance des accès, sans action métier."
              : "Mode lecture : les informations restent visibles, mais les actions du module sont désactivées."}
          </BandeauLectureSeule>
        ) : null}
        <fieldset disabled={isReadOnly} className="contents">
          {children}
        </fieldset>
      </div>
    </CoquilleAgent>
  )
}
