/**
 * Règles pures de l'espace « Audit et documents » : découpage des études en
 * sections, extraits de recherche, rôles et cycle de vie d'un constat.
 */

import type { AppRole } from "../../model/permissions"

/* ═══════════════════════════════════════════════ Rôles ═══ */

/**
 * Les fonctions d'audit tiennent le plan d'actions : création, modification,
 * vérification, abandon. L'espace n'a pas de ressource propre dans la matrice
 * de droits (`model/permissions.ts`) ; cette liste est la règle locale, à
 * reporter dans la matrice quand une ressource `audit` y sera créée.
 */
export const ROLES_AUDITEURS: readonly AppRole[] = ["audit_risques"]

/** Référents des études : ils répondent aux annotations et les clôturent. */
export const ROLES_REFERENTS: readonly AppRole[] = [
  "audit_risques",
  "juriste",
  "direction_generale",
  "admin_fonctionnel",
]

export function estAuditeur(role: AppRole): boolean {
  return ROLES_AUDITEURS.includes(role)
}

export function estReferent(role: AppRole): boolean {
  return ROLES_REFERENTS.includes(role)
}

/* ═══════════════════════════════════════════════ Sections ═══ */

export interface SectionEtude {
  rang: number
  ancre: string
  titre: string
  niveau: number
  /** Markdown de la section, sans son titre. */
  corps: string
  /** Texte brut, pour la recherche. */
  texte: string
}

export function ancreDe(titre: string): string {
  const base = titre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
  return base || "section"
}

/** Markdown → texte brut (titres, emphase, code, tableaux, liens). */
export function texteBrut(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, (bloc) => bloc.replace(/```\w*/g, " "))
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#|]/g, " ")
    .replace(/^\s*[-+]\s+/gm, " ")
    .replace(/-{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Découpe une étude en sections aux titres de niveau 1 à 3. Ce qui précède
 * le premier titre forme une section « Préambule ». Les ancres sont uniques
 * dans l'étude. Les titres situés dans un bloc de code sont ignorés.
 */
export function decouperSections(markdown: string): SectionEtude[] {
  const lignes = markdown.replace(/\r\n/g, "\n").split("\n")
  const sections: Omit<SectionEtude, "texte">[] = []
  const ancres = new Map<string, number>()
  let courante: { titre: string; niveau: number; lignes: string[] } = {
    titre: "Préambule",
    niveau: 1,
    lignes: [],
  }
  let dansCode = false
  const clore = () => {
    const corps = courante.lignes.join("\n").trim()
    if (!corps && courante.titre === "Préambule") return
    const base = ancreDe(courante.titre)
    const vu = ancres.get(base) ?? 0
    ancres.set(base, vu + 1)
    sections.push({
      rang: sections.length,
      ancre: vu === 0 ? base : `${base}-${vu + 1}`,
      titre: courante.titre,
      niveau: courante.niveau,
      corps,
    })
  }
  for (const ligne of lignes) {
    if (ligne.trimStart().startsWith("```")) dansCode = !dansCode
    const titre = dansCode ? null : /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(ligne)
    if (titre) {
      clore()
      courante = { titre: titre[2]!.replace(/[*_`]/g, "").trim(), niveau: titre[1]!.length, lignes: [] }
    } else {
      courante.lignes.push(ligne)
    }
  }
  clore()
  return sections.map((section) => ({
    ...section,
    texte: texteBrut(`${section.titre} ${section.corps}`),
  }))
}

export function compterMots(texte: string): number {
  return texte.split(/\s+/).filter(Boolean).length
}

/** Extrait de 220 caractères autour du premier terme trouvé. */
export function extrait(texte: string, recherche: string, longueur = 220): string {
  const normaliser = (valeur: string) =>
    valeur.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  const cible = normaliser(texte)
  const termes = normaliser(recherche).split(/\s+/).filter((terme) => terme.length > 1)
  const position = termes.map((terme) => cible.indexOf(terme)).filter((index) => index >= 0)
  const debut = Math.max(0, (position.length ? Math.min(...position) : 0) - 60)
  const morceau = texte.slice(debut, debut + longueur).trim()
  return `${debut > 0 ? "…" : ""}${morceau}${debut + longueur < texte.length ? "…" : ""}`
}

/* ═══════════════════════════════════════════════ Constats ═══ */

export type StatutConstat = "a_lancer" | "en_cours" | "realisee" | "verifiee" | "abandonnee"

export const STATUTS_CONSTAT: Record<StatutConstat, string> = {
  a_lancer: "À lancer",
  en_cours: "En cours",
  realisee: "Réalisée",
  verifiee: "Vérifiée",
  abandonnee: "Abandonnée",
}

export const GRAVITES = {
  majeure: "Majeure",
  moderee: "Modérée",
  mineure: "Mineure",
} as const

export function constatOuvert(statut: StatutConstat): boolean {
  return statut === "a_lancer" || statut === "en_cours" || statut === "realisee"
}

export function constatEnRetard(
  constat: { statut: StatutConstat; echeance: string },
  aujourdhui: string
): boolean {
  return (constat.statut === "a_lancer" || constat.statut === "en_cours") && constat.echeance < aujourdhui
}

/**
 * Transitions autorisées et qui peut les faire.
 * - le responsable fait avancer l'action : à lancer → en cours → réalisée ;
 * - l'auditeur vérifie une action réalisée, la rouvre, ou l'abandonne ;
 * - la vérification n'est jamais faite par le responsable de l'action
 *   (séparation des tâches), même s'il est lui-même auditeur.
 */
export function verifierTransition(
  avant: StatutConstat,
  apres: StatutConstat,
  acteur: { auditeur: boolean; responsable: boolean }
): void {
  if (avant === apres) return
  if (avant === "verifiee" || avant === "abandonnee") {
    throw new Error("Une action vérifiée ou abandonnée est close.")
  }
  const avancer =
    (avant === "a_lancer" && (apres === "en_cours" || apres === "realisee")) ||
    (avant === "en_cours" && apres === "realisee")
  if (avancer) {
    if (!acteur.responsable && !acteur.auditeur) {
      throw new Error("Accès refusé : seul le responsable ou l'audit fait avancer l'action.")
    }
    return
  }
  if (apres === "verifiee") {
    if (avant !== "realisee") throw new Error("Seule une action réalisée se vérifie.")
    if (!acteur.auditeur) throw new Error("Accès refusé : la vérification revient à l'audit.")
    if (acteur.responsable) {
      throw new Error("Séparation des tâches : le responsable de l'action ne la vérifie pas.")
    }
    return
  }
  if (apres === "abandonnee") {
    if (!acteur.auditeur) throw new Error("Accès refusé : l'abandon revient à l'audit.")
    return
  }
  if (avant === "realisee" && apres === "en_cours") {
    if (!acteur.auditeur) throw new Error("Accès refusé : seul l'audit rouvre une action réalisée.")
    return
  }
  throw new Error("Transition impossible pour cette action.")
}

/** Avancement cohérent avec le statut : 100 % une fois réalisée. */
export function avancementPour(statut: StatutConstat, demande: number | undefined, actuel: number): number {
  if (statut === "realisee" || statut === "verifiee") return 100
  const valeur = demande ?? actuel
  if (!Number.isInteger(valeur) || valeur < 0 || valeur > 100) {
    throw new Error("L'avancement est un entier entre 0 et 100.")
  }
  if (statut === "a_lancer") return 0
  return Math.min(valeur, 95)
}

export function referenceConstat(annee: number, rang: number): string {
  return `AUD-${annee}-${String(rang).padStart(3, "0")}`
}
