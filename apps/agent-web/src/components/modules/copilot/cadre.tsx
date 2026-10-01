"use client"

import { MessagesSquare, ScrollText } from "lucide-react"
import type { ReactNode } from "react"

import { SigneRuban } from "@workspace/ui/marque"

import { EnTetePage } from "@/components/charte"
import { CoquilleAgent } from "@/coquille/coquille-agent"
import { NavigationEspace, type RubriqueEspace } from "@/components/modules/ged/cadre"

/**
 * Cadre de Copilot. Poser une question est une lecture : un compte au niveau
 * « Lecture » du module utilise pleinement Copilot. C'est pourquoi ce cadre
 * ne passe pas par `EnterpriseShell`, qui désactiverait toute saisie.
 */
export function CadreCopilot({
  titre,
  description,
  actions,
  supervision,
  plein,
  children,
}: {
  titre: string
  description?: ReactNode
  actions?: ReactNode
  /** Affiche la rubrique du journal d'usage. */
  supervision?: boolean
  /** Contenu pleine largeur (écran de conversation). */
  plein?: boolean
  children: ReactNode
}) {
  const rubriques: RubriqueEspace[] = [
    {
      href: "/copilot",
      libelle: "Conversations",
      icone: MessagesSquare,
      actif: (chemin) => chemin.startsWith("/copilot") && !chemin.startsWith("/copilot/journal"),
    },
    ...(supervision ? [{ href: "/copilot/journal", libelle: "Journal d'usage", icone: ScrollText }] : []),
  ]
  return (
    <CoquilleAgent
      perimetre="SETRAG Copilot · données selon vos habilitations"
      rubriques={({ onNavigate }) => (
        <NavigationEspace
          libelle="Copilot"
          rubriques={rubriques}
          onNavigate={onNavigate}
        />
      )}
    >
      <div className={plein ? "mx-auto grid max-w-[1480px] grid-cols-[minmax(0,1fr)] gap-4" : "mx-auto grid max-w-[1320px] grid-cols-[minmax(0,1fr)] gap-5"}>
        <EnTetePage
          surtitre={
            <span className="inline-flex items-center gap-2">
              <AvatarCopilot taille={22} />
              SETRAG Copilot
            </span>
          }
          titre={titre}
          description={description}
          actions={actions}
        />
        {children}
      </div>
    </CoquilleAgent>
  )
}

/** Le signe de l'assistant dans un rond encre, comme Ruban côté voyageur. */
export function AvatarCopilot({
  taille = 28,
  etat = "repos",
}: {
  taille?: number
  etat?: "repos" | "reflexion" | "hors-ligne"
}) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-pill bg-brand-encre text-ink-inverse"
      style={{ width: taille, height: taille }}
    >
      <SigneRuban etat={etat} fond="sombre" className="w-auto" style={{ height: Math.round(taille * 0.58) }} />
    </span>
  )
}
