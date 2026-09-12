import {
  Activity,
  Compass,
  Landmark,
  ListChecks,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react"
import type { Route } from "next"

import { EXECUTIVE_PATH } from "@/lib/portal-access"

export type ExecutiveVolet =
  "overview" | "activities" | "finances" | "risks" | "decisions"

export interface ExecutiveVoletEntry {
  readonly volet: ExecutiveVolet
  /** Code d'écran, réservé aux lecteurs d'écran et à la documentation. */
  readonly code: string
  readonly href: Route
  readonly label: string
  /** La question du dirigeant à laquelle le volet répond. */
  readonly question: string
  readonly description: string
  readonly action: string
  readonly icon: LucideIcon
}

/**
 * Les cinq volets de l'espace Direction générale, dans l'ordre de lecture.
 * Ils suivent les questions du dirigeant, pas le catalogue des modules.
 */
export const EXECUTIVE_VOLETS = [
  {
    volet: "overview",
    code: "DG-01",
    href: "/direction",
    label: "Vue d’ensemble",
    question: "Où en est le réseau aujourd’hui, et qu’attend une décision ?",
    description: "Le point du jour et ce qui attend une décision",
    action: "Ouvrir la vue d’ensemble",
    icon: Compass,
  },
  {
    volet: "activities",
    code: "DG-02",
    href: "/direction/activites",
    label: "Activité et exploitation",
    question: "Que produit l’entreprise, que fait-elle circuler ?",
    description: "Ce que l’entreprise produit et fait circuler",
    action: "Ouvrir l’activité",
    icon: Activity,
  },
  {
    volet: "finances",
    code: "DG-03",
    href: "/direction/finances",
    label: "Finances",
    question: "Que rapporte-t-elle, où en est la conformité ?",
    description: "Recettes, journal, conformité",
    action: "Ouvrir les finances",
    icon: Landmark,
  },
  {
    volet: "risks",
    code: "DG-04",
    href: "/direction/risques",
    label: "Risques et continuité",
    question: "Qu’est-ce qui menace la continuité et la concession ?",
    description: "Continuité, sécurité, supervision",
    action: "Ouvrir les risques",
    icon: ShieldAlert,
  },
  {
    volet: "decisions",
    code: "DG-05",
    href: "/direction/decisions",
    label: "Décisions attendues",
    question:
      "Quels signaux, demandes et raccordements attendent une orientation ?",
    description: "Signaux, demandes et raccordements en attente",
    action: "Ouvrir les décisions",
    icon: ListChecks,
  },
] as const satisfies readonly ExecutiveVoletEntry[]

export function executiveVoletEntry(
  volet: ExecutiveVolet
): ExecutiveVoletEntry {
  const entry = EXECUTIVE_VOLETS.find((candidate) => candidate.volet === volet)
  if (!entry) throw new Error(`Volet inconnu : ${volet}`)
  return entry
}

export function isExecutiveVoletActive(
  entry: Pick<ExecutiveVoletEntry, "href">,
  pathname: string
) {
  return entry.href === EXECUTIVE_PATH
    ? pathname === EXECUTIVE_PATH
    : pathname === entry.href || pathname.startsWith(`${entry.href}/`)
}

export function adjacentVolets(volet: ExecutiveVolet): {
  previous?: ExecutiveVoletEntry
  next?: ExecutiveVoletEntry
} {
  const index = EXECUTIVE_VOLETS.findIndex((entry) => entry.volet === volet)
  return {
    previous: index > 0 ? EXECUTIVE_VOLETS[index - 1] : undefined,
    next:
      index >= 0 && index < EXECUTIVE_VOLETS.length - 1
        ? EXECUTIVE_VOLETS[index + 1]
        : undefined,
  }
}
