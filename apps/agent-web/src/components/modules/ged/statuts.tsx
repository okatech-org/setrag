"use client"

import {
  Archive,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  EyeOff,
  FlaskConical,
  Globe,
  Lock,
  Megaphone,
  PenLine,
  ShieldAlert,
  Stamp,
  Trash2,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react"

import { can } from "@workspace/backend/permissions"
import { Tag, type TagProps } from "@workspace/ui/components/tag"

type Ton = NonNullable<TagProps["tone"]>
type Definition = { libelle: string; ton: Ton; icone: LucideIcon }

function Pastille({ definition }: { definition: Definition }) {
  const Icone = definition.icone
  return (
    <Tag tone={definition.ton}>
      <Icone aria-hidden />
      {definition.libelle}
    </Tag>
  )
}

export const DIRECTIONS = {
  DG: "Direction générale",
  DEF: "Exploitation ferroviaire",
  DCFV: "Commercial fret et voyageurs",
  DMAT: "Matériel roulant",
  DINFRA: "Installations fixes",
  DFC: "Finance et comptabilité",
  DRH: "Ressources humaines",
  DSED: "Sécurité et environnement",
  DSI: "Systèmes d'information",
  DJ: "Affaires juridiques",
  BOC: "Bureau d'ordre central",
} as const

export const libelleDirection = (code: string) => DIRECTIONS[code as keyof typeof DIRECTIONS] ?? code

export const TYPES_DOCUMENT = {
  courrier_entrant: "Courrier entrant",
  courrier_sortant: "Courrier sortant",
  note_service: "Note de service",
  contrat: "Contrat ou convention",
  proces_verbal: "Procès-verbal",
  rapport: "Rapport",
  piece_comptable: "Pièce comptable",
  procedure: "Procédure",
  plan_technique: "Plan technique",
  autre: "Autre document",
} as const
export type TypeDocument = keyof typeof TYPES_DOCUMENT

export const STATUTS_DOCUMENT = {
  brouillon: { libelle: "Brouillon", ton: "neutral", icone: PenLine },
  en_circuit: { libelle: "En circuit", ton: "warning", icone: Clock },
  valide: { libelle: "Validé", ton: "success", icone: CircleCheck },
  diffuse: { libelle: "Diffusé", ton: "info", icone: Megaphone },
  refuse: { libelle: "Refusé", ton: "danger", icone: CircleX },
  archive: { libelle: "Archivé", ton: "neutral", icone: Archive },
  elimine: { libelle: "Éliminé", ton: "strong", icone: Trash2 },
} as const satisfies Record<string, Definition>
export type StatutDocument = keyof typeof STATUTS_DOCUMENT

export function TagStatutDocument({ statut }: { statut: StatutDocument }) {
  return <Pastille definition={STATUTS_DOCUMENT[statut]} />
}

export const CLASSIFICATIONS = {
  public: { libelle: "Public", ton: "neutral", icone: Globe },
  interne: { libelle: "Interne", ton: "neutral", icone: Users },
  confidentiel: { libelle: "Confidentiel", ton: "warning", icone: ShieldAlert },
  restreint: { libelle: "Restreint", ton: "danger", icone: Lock },
} as const satisfies Record<string, Definition>
export type Classification = keyof typeof CLASSIFICATIONS

export function TagClassification({ classification }: { classification: Classification }) {
  return <Pastille definition={CLASSIFICATIONS[classification]} />
}

export const STATUTS_ETAPE = {
  a_venir: { libelle: "À venir", ton: "neutral", icone: CircleDashed },
  en_attente: { libelle: "En attente", ton: "warning", icone: Clock },
  vise: { libelle: "Visé", ton: "success", icone: Stamp },
  signe: { libelle: "Signé", ton: "success", icone: PenLine },
  diffuse: { libelle: "Diffusé", ton: "info", icone: Megaphone },
  refuse: { libelle: "Refusé", ton: "danger", icone: CircleX },
  annule: { libelle: "Annulé", ton: "neutral", icone: EyeOff },
} as const satisfies Record<string, Definition>
export type StatutEtape = keyof typeof STATUTS_ETAPE

export function TagEtape({ statut }: { statut: StatutEtape }) {
  return <Pastille definition={STATUTS_ETAPE[statut]} />
}

export const NATURES_ETAPE = { visa: "Visa", signature: "Signature", diffusion: "Diffusion" } as const
export type NatureEtape = keyof typeof NATURES_ETAPE

export const STATUTS_CIRCUIT = {
  en_cours: { libelle: "En cours", ton: "warning", icone: Clock },
  termine: { libelle: "Terminé", ton: "success", icone: CircleCheck },
  refuse: { libelle: "Refusé", ton: "danger", icone: CircleX },
  annule: { libelle: "Annulé", ton: "neutral", icone: EyeOff },
} as const satisfies Record<string, Definition>
export type StatutCircuit = keyof typeof STATUTS_CIRCUIT

export function TagCircuit({ statut }: { statut: StatutCircuit }) {
  return <Pastille definition={STATUTS_CIRCUIT[statut]} />
}

export const STATUTS_COURRIER = {
  enregistre: { libelle: "Enregistré", ton: "neutral", icone: CircleDashed },
  en_traitement: { libelle: "En traitement", ton: "info", icone: Clock },
  repondu: { libelle: "Répondu", ton: "success", icone: CircleCheck },
  clos: { libelle: "Clos", ton: "neutral", icone: Archive },
} as const satisfies Record<string, Definition>
export type StatutCourrier = keyof typeof STATUTS_COURRIER

export function TagCourrier({ statut, enRetard }: { statut: StatutCourrier; enRetard?: boolean }) {
  if (enRetard) {
    return <Pastille definition={{ libelle: "En retard", ton: "danger", icone: TriangleAlert }} />
  }
  return <Pastille definition={STATUTS_COURRIER[statut]} />
}

/** Une ligne issue du jeu de démonstration le dit en toutes lettres. */
export function TagDemo({ origine }: { origine: "demo" | "reel" }) {
  if (origine !== "demo") return null
  return (
    <Tag tone="neutral" title="Ligne du jeu de démonstration : contenu fictif">
      <FlaskConical aria-hidden />
      Démo
    </Tag>
  )
}

const FONCTIONS_DIFFUSION = [
  ["chef_gare", "Chefs de gare"],
  ["chef_train", "Chefs de train"],
  ["conducteur_ligne", "Conducteurs de ligne"],
  ["regulateur_cotraf", "Régulateurs COTRAF"],
  ["controleur_train", "Contrôleurs à bord"],
  ["vendeur_guichet", "Vendeurs guichet"],
  ["responsable_atelier", "Responsables d'atelier"],
  ["ingenieur_atelier", "Ingénieurs atelier"],
  ["contremaitre_atelier", "Contremaîtres atelier"],
  ["visiteur_rames", "Visiteurs de rames"],
  ["agent_voie", "Agents de voie"],
  ["inspecteur_securite", "Inspecteurs sécurité"],
  ["comptable", "Comptables"],
  ["gestionnaire_paie", "Gestionnaires de paie"],
  ["juriste", "Juristes"],
  ["audit_risques", "Audit et risques"],
  ["direction_generale", "Direction générale"],
] as const

/**
 * Fonctions proposées pour la diffusion d'une note : seules celles qui lisent
 * la GED, sans quoi la note ne leur parviendrait pas.
 */
export const ROLES_DIFFUSION = FONCTIONS_DIFFUSION.filter(([role]) => can(role, "ged", "consulter"))

/** Taille de fichier lisible : « 42 Ko », « 1,3 Mo ». */
export function taille(octets: number) {
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`
  return `${(octets / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`
}
