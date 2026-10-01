"use client"

import { FileStack, FolderTree, Home, Inbox, Mail, Megaphone, type LucideIcon } from "lucide-react"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"


import { BandeauLectureSeule, EnTetePage } from "@/components/charte"
import { CoquilleAgent } from "@/coquille/coquille-agent"
import { MenuRubriques } from "@/coquille/rubriques"

export interface RubriqueEspace {
  href: string
  libelle: string
  icone: LucideIcon
  /** Correspondance exacte (accueil de l'espace) plutôt que par préfixe. */
  exact?: boolean
  /** Règle d'activité propre, quand ni l'exact ni le préfixe ne conviennent. */
  actif?: (chemin: string) => boolean
}

export const RUBRIQUES_GED: readonly RubriqueEspace[] = [
  { href: "/bureautique", libelle: "Accueil", icone: Home, exact: true },
  { href: "/bureautique/documents", libelle: "Documents", icone: FileStack },
  { href: "/bureautique/parapheur", libelle: "Parapheur", icone: Inbox },
  { href: "/bureautique/courrier", libelle: "Courrier", icone: Mail },
  { href: "/bureautique/notes", libelle: "Notes de service", icone: Megaphone },
  { href: "/bureautique/classement", libelle: "Classement et archives", icone: FolderTree },
]

export function rubriqueActive(rubrique: RubriqueEspace, chemin: string) {
  if (rubrique.actif) return rubrique.actif(chemin)
  return rubrique.exact ? chemin === rubrique.href : chemin === rubrique.href || chemin.startsWith(`${rubrique.href}/`)
}

/**
 * Rubriques d'un espace dans la barre latérale, avant « Mes modules ». Même
 * dessin que les volets de la Direction générale.
 */
export function NavigationEspace({
  libelle,
  rubriques,
  onNavigate,
}: {
  libelle: string
  rubriques: readonly RubriqueEspace[]
  onNavigate?: () => void
}) {
  const chemin = usePathname()
  return (
    <MenuRubriques
      titre={libelle}
      rubriques={rubriques.map((rubrique) => ({
        href: rubrique.href,
        libelle: rubrique.libelle,
        icone: rubrique.icone,
        actif: rubriqueActive(rubrique, chemin),
      }))}
      onNavigate={onNavigate}
    />
  )
}

/**
 * Cadre des écrans de la GED. Contrairement à `EnterpriseShell`, la lecture
 * seule ne désactive pas tout l'écran : un lecteur du module consulte,
 * télécharge, vise ce qu'on lui a confié et accuse lecture des notes. Seules
 * les actions de création et de gestion disparaissent, côté serveur comme
 * côté écran.
 */
export function CadreGed({
  titre,
  description,
  actions,
  lectureSeule,
  retour,
  titreDossier,
  children,
}: {
  titre: string
  description?: ReactNode
  actions?: ReactNode
  /** Mention de lecture seule ; absente, pas de bandeau. */
  lectureSeule?: ReactNode
  retour?: { href: string; libelle: string }
  /** Dernier maillon du fil d'Ariane (référence du dossier ouvert). */
  titreDossier?: string
  children: ReactNode
}) {
  return (
    <CoquilleAgent
      perimetre="Bureautique et GED · SETRAG"
      titre={titreDossier}
      rubriques={({ onNavigate }) => (
        <NavigationEspace libelle="Bureautique et GED" rubriques={RUBRIQUES_GED} onNavigate={onNavigate} />
      )}
    >
      <div className="mx-auto grid max-w-[1320px] grid-cols-[minmax(0,1fr)] gap-5">
        <EnTetePage surtitre="Bureautique et GED" titre={titre} description={description} actions={actions} retour={retour} />
        {lectureSeule ? <BandeauLectureSeule>{lectureSeule}</BandeauLectureSeule> : null}
        {children}
      </div>
    </CoquilleAgent>
  )
}

export const MENTION_LECTURE_GED =
  "Mode lecture : vous consultez les pièces, visez ce qui vous est confié et accusez lecture des notes ; le dépôt et la gestion du registre sont réservés aux habilitations en écriture."
