import type { Route } from "next"

import type { ModuleCode } from "@workspace/backend/modules"

import type {
  ExecutiveOverviewDto,
  ExecutiveSourceState,
} from "./executive-dto"

export type DirectionCode =
  "def" | "dcfv" | "dmat" | "dinfra" | "dfc" | "drh" | "dsed"

export interface DirectionEntry {
  readonly code: DirectionCode
  /** Libellé repris de `DEMO_PERSONA_GROUPS` (`convex/model/demoPersonas.ts`). */
  readonly label: string
  readonly mission: string
  readonly modules: readonly ModuleCode[]
  /** Ce qui manque encore dans le système, dit en une phrase. */
  readonly notConnectedNote?: string
  /** Vue de démonstration existante, signalée non officielle. */
  readonly demoHref?: Route
  readonly demoLabel?: string
}

/**
 * Organigramme fonctionnel selon l'étude 03 (Document 03, cartographie des
 * acteurs) — à confirmer par SETRAG. Il sert d'ordre de lecture et de colonne
 * « responsable », jamais de structure de performance.
 */
export const DIRECTIONS: readonly DirectionEntry[] = [
  {
    code: "def",
    label: "DEF · Exploitation ferroviaire",
    mission: "Circulation des trains sur la voie unique",
    modules: ["cotraf"],
  },
  {
    code: "dcfv",
    label: "DCFV · Commercial fret & voyageurs",
    mission: "Fret, billetterie et relation avec les chargeurs",
    modules: ["fret", "voyageurs"],
  },
  {
    code: "dmat",
    label: "DMAT · Matériel roulant",
    mission: "Locomotives, wagons et ateliers d’Owendo et Booué",
    modules: ["gmao"],
    notConnectedNote:
      "Le parc de locomotives et de wagons n’est pas encore dans le système.",
    demoHref: "/materiel",
    demoLabel: "Ouvrir la démonstration Matériel",
  },
  {
    code: "dinfra",
    label: "DINFRA · Installations fixes",
    mission: "Voie, ouvrages d’art et programme de remise à niveau",
    modules: ["infrastructure"],
    notConnectedNote:
      "L’état de la voie et l’avancement du PRN ne sont pas encore dans le système.",
    demoHref: "/infrastructures",
    demoLabel: "Ouvrir la démonstration Infrastructures",
  },
  {
    code: "dfc",
    label: "DFC · Finance & comptabilité",
    mission: "Comptabilité OHADA, fiscalité, trésorerie",
    modules: ["finance"],
  },
  {
    code: "drh",
    label: "DRH · Ressources humaines",
    mission: "Effectifs, paie et roulements",
    modules: ["rh"],
    notConnectedNote:
      "Les effectifs et la paie ne sont pas encore dans le système.",
    demoHref: "/rh",
    demoLabel: "Ouvrir la démonstration RH",
  },
  {
    code: "dsed",
    label: "DSED · Sécurité & environnement",
    mission: "Sécurité des circulations, continuité, environnement",
    modules: ["securite"],
    notConnectedNote:
      "Le registre des événements de sécurité ARTF n’est pas encore dans le système ; seule la continuité PCA/PRA est lue.",
    demoHref: "/securite",
    demoLabel: "Ouvrir la démonstration Sécurité",
  },
]

export const ORGANIGRAMME_NOTE =
  "Organigramme selon l’étude 03 · à confirmer par SETRAG"

/** Modules déclarés dans le catalogue mais sans aucune source persistée. */
const MODULES_WITHOUT_SOURCE: readonly ModuleCode[] = [
  "gmao",
  "infrastructure",
  "rh",
  "ged",
  "copilot",
]

/** État de la source qui alimente un module, vu de la Direction générale. */
export function moduleSourceState(
  code: ModuleCode,
  data: ExecutiveOverviewDto
): ExecutiveSourceState {
  switch (code) {
    case "voyageurs":
      return data.passenger.state
    case "fret":
      return data.freight.state
    case "cotraf":
      return data.cotraf.state
    case "finance":
      return data.finance.state
    case "securite":
      return data.continuity.state
    default: {
      const visible = data.modules.some((module) => module.code === code)
      if (!visible) return "unavailable"
      return MODULES_WITHOUT_SOURCE.includes(code)
        ? "not_connected"
        : "unavailable"
    }
  }
}

export type DirectionConnection =
  "loading" | "connected" | "partial" | "not_connected" | "unavailable"

export const DIRECTION_CONNECTION_LABELS: Readonly<
  Record<DirectionConnection, string>
> = {
  loading: "Lecture en cours",
  connected: "Raccordée",
  partial: "Partiellement raccordée",
  not_connected: "Non raccordée",
  unavailable: "Non accessible",
}

/**
 * Une direction est raccordée quand chacun de ses modules a une source lue
 * (opérationnelle, synthétique ou vide). La DSED reste « partielle » tant que
 * le registre ARTF n'existe pas, même si la continuité PCA/PRA est lue.
 */
export function directionConnection(
  entry: DirectionEntry,
  data: ExecutiveOverviewDto
): DirectionConnection {
  const states = entry.modules.map((code) => moduleSourceState(code, data))
  if (states.some((state) => state === "loading")) return "loading"
  const read = states.filter(
    (state) =>
      state === "operational" || state === "synthetic_demo" || state === "empty"
  ).length
  if (read === states.length) {
    return entry.code === "dsed" ? "partial" : "connected"
  }
  if (read > 0) return "partial"
  if (states.every((state) => state === "unavailable")) return "unavailable"
  return "not_connected"
}

export function summarizeDirections(data: ExecutiveOverviewDto) {
  const groups: Record<DirectionConnection, DirectionEntry[]> = {
    loading: [],
    connected: [],
    partial: [],
    not_connected: [],
    unavailable: [],
  }
  for (const entry of DIRECTIONS) {
    groups[directionConnection(entry, data)].push(entry)
  }
  return groups
}

function shortCode(entry: DirectionEntry) {
  return entry.label.split(" · ")[0]
}

/** « Raccordement : 3 directions raccordées (DEF, DCFV, DFC) · 1 partiellement (DSED) · 3 non raccordées (DMAT, DINFRA, DRH) » */
export function directionsSummaryLabel(data: ExecutiveOverviewDto): string {
  const groups = summarizeDirections(data)
  const parts: string[] = []
  const describe = (
    entries: DirectionEntry[],
    singular: string,
    plural: string
  ) => {
    if (entries.length === 0) return
    parts.push(
      `${entries.length} ${entries.length === 1 ? singular : plural} (${entries.map(shortCode).join(", ")})`
    )
  }
  describe(groups.connected, "direction raccordée", "directions raccordées")
  describe(groups.partial, "partiellement", "partiellement")
  describe(groups.not_connected, "non raccordée", "non raccordées")
  describe(groups.unavailable, "non accessible", "non accessibles")
  describe(groups.loading, "en cours de lecture", "en cours de lecture")
  return parts.length > 0
    ? `Raccordement : ${parts.join(" · ")}`
    : "Raccordement : aucune direction évaluée"
}
