"use client"

import type { FunctionReturnType } from "convex/server"
import {
  ArrowLeft,
  Ban,
  BrickWall,
  CalendarRange,
  CircleCheck,
  CircleDashed,
  CirclePause,
  CircleX,
  Clock,
  Construction,
  Flag,
  Gauge,
  HardHat,
  LayoutDashboard,
  RadioTower,
  Route as IconeVoie,
  ShieldAlert,
  TrafficCone,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"

import { EnterpriseShell } from "@/components/enterprise-layout"
import { Pastille } from "@/components/gestion/referentiels/statuts"
import { formatXaf } from "@/lib/format"
import { MenuRubriques } from "@/coquille/rubriques"

/* ================================================================== API */

/** Fonctions Convex du module (régénérées par `convex codegen`). */
export const infraApi = api.modules.infrastructure

export type CapaciteInfra =
  | "anomalie_signaler"
  | "anomalie_traiter"
  | "anomalie_clore"
  | "ltv_gerer"
  | "voie_gerer"
  | "ouvrage_inspecter"
  | "inspection_valider"
  | "equipement_signalisation"
  | "equipement_telecoms"
  | "prn_gerer"
  | "prn_avancement_saisir"
  | "prn_valider"
  | "intervention_demander"
  | "intervention_accorder"

export type AccueilInfra = FunctionReturnType<typeof infraApi.queries.accueil>
export type LigneSection = FunctionReturnType<typeof infraApi.queries.sections>[number]
export type DossierSection = NonNullable<FunctionReturnType<typeof infraApi.queries.section>>
export type LigneOuvrage = FunctionReturnType<typeof infraApi.queries.ouvrages>[number]
export type DossierOuvrage = NonNullable<FunctionReturnType<typeof infraApi.queries.ouvrage>>
export type DossierInspection = NonNullable<FunctionReturnType<typeof infraApi.queries.inspection>>
export type LigneEquipementInfra = FunctionReturnType<typeof infraApi.queries.equipements>[number]
export type DossierEquipementInfra = NonNullable<FunctionReturnType<typeof infraApi.queries.equipement>>
export type LigneAnomalie = FunctionReturnType<typeof infraApi.queries.anomalies>[number]
export type DossierAnomalie = NonNullable<FunctionReturnType<typeof infraApi.queries.anomalie>>
export type LigneLtv = FunctionReturnType<typeof infraApi.queries.ltvs>[number]
export type DossierLtv = NonNullable<FunctionReturnType<typeof infraApi.queries.ltv>>
export type LigneChantier = FunctionReturnType<typeof infraApi.queries.chantiers>[number]
export type DossierChantier = NonNullable<FunctionReturnType<typeof infraApi.queries.chantier>>
export type RapportBailleur = FunctionReturnType<typeof infraApi.queries.rapportBailleur>
export type LigneIntervention = FunctionReturnType<typeof infraApi.queries.interventions>[number]
export type DossierIntervention = NonNullable<FunctionReturnType<typeof infraApi.queries.intervention>>
export type FormulairesInfra = FunctionReturnType<typeof infraApi.queries.formulaires>

/* =============================================================== Droits */

/**
 * Droits de l'utilisateur dans le module : la capacité métier décide de
 * l'affichage d'une action ; le serveur la vérifie de toute façon. Les
 * partenaires (Meridiam, bailleurs) lisent sans agir.
 */
export function useDroitsInfra() {
  const droits = useQuery(infraApi.queries.droits, {})
  const capacites = new Set<string>(droits?.capacites ?? [])
  return {
    chargement: droits === undefined,
    peutEcrire: droits?.peutEcrire ?? false,
    partenaire: droits?.partenaire ?? false,
    role: droits?.role,
    peut: (capacite: CapaciteInfra) => capacites.has(capacite),
  }
}

/* ============================================================ Navigation */

interface Rubrique {
  href: string
  libelle: string
  icone: LucideIcon
  exact?: boolean
}

export const RUBRIQUES_INFRA: readonly Rubrique[] = [
  { href: "/infrastructures", libelle: "Tableau de bord", icone: LayoutDashboard, exact: true },
  { href: "/infrastructures/voie", libelle: "Voie et sections", icone: IconeVoie },
  { href: "/infrastructures/anomalies", libelle: "Anomalies terrain", icone: TriangleAlert },
  { href: "/infrastructures/ltv", libelle: "Limitations de vitesse", icone: Gauge },
  { href: "/infrastructures/ouvrages", libelle: "Ouvrages d'art", icone: BrickWall },
  { href: "/infrastructures/equipements", libelle: "Signalisation et télécoms", icone: RadioTower },
  { href: "/infrastructures/interventions", libelle: "Plages travaux", icone: CalendarRange },
  { href: "/infrastructures/prn", libelle: "Programme PRN", icone: Construction },
]

export function NavigationInfra({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <MenuRubriques
      titre="Infrastructures"
      rubriques={RUBRIQUES_INFRA.map((rubrique) => ({ ...rubrique, exacte: rubrique.exact }))}
      onNavigate={onNavigate}
    />
  )
}

/**
 * Cadre de toutes les pages du module : coquille du portail, rubriques,
 * en-tête (un seul bouton `primary` dans `actions`) et mode lecture.
 */
export function CadreInfra({
  titre,
  description,
  actions,
  retour,
  children,
}: {
  titre: string
  description?: string
  actions?: ReactNode
  retour?: { href: string; libelle: string }
  children: ReactNode
}) {
  return (
    <EnterpriseShell
      title={titre}
      subtitle={description}
      actions={actions}
      space="Infrastructures · PRN"
      scope="DINFRA · ligne Owendo–Franceville"
      navigation={({ onNavigate }) => <NavigationInfra onNavigate={onNavigate} />}
      eyebrow={
        retour ? (
          <Button asChild variant="ghost" className="-ml-3">
            <Link href={retour.href as Route}>
              <ArrowLeft />
              {retour.libelle}
            </Link>
          </Button>
        ) : undefined
      }
    >
      {children}
    </EnterpriseShell>
  )
}

export function DossierEnChargement() {
  return (
    <div role="status" aria-label="Chargement du dossier" className="grid gap-4">
      <SkeletonLines />
      <SkeletonLines />
    </div>
  )
}

export function DossierIntrouvable({ quoi, retour }: { quoi: string; retour: { href: string; libelle: string } }) {
  return (
    <div className="rounded-md border border-line bg-surface">
      <EmptyState
        title={`${quoi} introuvable`}
        description="Le lien est peut-être ancien, ou le dossier a été purgé avec le jeu de démonstration."
        action={
          <Button asChild variant="secondary">
            <Link href={retour.href as Route}>{retour.libelle}</Link>
          </Button>
        }
      />
    </div>
  )
}

/* ============================================================ Formats */

const fmtEntier = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
const fmtDecimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })

/** Montant en XAF, comme l'impose la charte. */
export const xaf = (valeur: number | null | undefined) => (valeur === null || valeur === undefined ? "—" : formatXaf(Math.round(valeur)))
/** Grands montants : « 12,4 Md XAF », « 850 M XAF ». */
export function xafCompact(valeur: number | null | undefined) {
  if (valeur === null || valeur === undefined) return "—"
  if (Math.abs(valeur) >= 1e9) return `${fmtDecimal.format(valeur / 1e9)} Md XAF`
  if (Math.abs(valeur) >= 1e6) return `${fmtDecimal.format(valeur / 1e6)} M XAF`
  return xaf(valeur)
}
export const pk = (valeur: number | null | undefined) => (valeur === null || valeur === undefined ? "—" : `PK ${fmtDecimal.format(valeur)}`)
export const plagePk = (debut: number, fin: number) => `PK ${fmtDecimal.format(debut)} → ${fmtDecimal.format(fin)}`
export const kmh = (valeur: number | null | undefined) => (valeur === null || valeur === undefined ? "—" : `${fmtEntier.format(valeur)} km/h`)
export const minutes = (valeur: number | null | undefined) => (valeur === null || valeur === undefined ? "—" : `${fmtDecimal.format(valeur)} min`)
export const pct = (valeur: number | null | undefined) => (valeur === null || valeur === undefined ? "—" : `${fmtEntier.format(Math.round(valeur))} %`)

/* ============================================================ Pastilles */

type Ton = "accent" | "second" | "success" | "warning" | "danger" | "info" | "neutral" | "strong"
interface DefTon {
  ton: Ton
  icone: LucideIcon
}

/** Teinte et icône par valeur ; le libellé vient du serveur et porte l'information. */
const TONS: Record<string, DefTon> = {
  // Gravité
  faible: { ton: "neutral", icone: CircleDashed },
  moyenne: { ton: "info", icone: Clock },
  elevee: { ton: "warning", icone: TriangleAlert },
  critique: { ton: "danger", icone: ShieldAlert },
  // Anomalie
  signalee: { ton: "warning", icone: Flag },
  prise_en_charge: { ton: "info", icone: HardHat },
  traitee: { ton: "accent", icone: Wrench },
  close: { ton: "success", icone: CircleCheck },
  rejetee: { ton: "neutral", icone: CircleX },
  // État de voie
  bon: { ton: "success", icone: CircleCheck },
  moyen: { ton: "info", icone: Clock },
  degrade: { ton: "warning", icone: TriangleAlert },
  // Équipement
  en_service: { ton: "success", icone: CircleCheck },
  hors_service: { ton: "danger", icone: Ban },
  // LTV
  active: { ton: "warning", icone: Gauge },
  levee: { ton: "neutral", icone: CircleCheck },
  // Chantier
  etude: { ton: "neutral", icone: CircleDashed },
  en_cours: { ton: "info", icone: Construction },
  suspendu: { ton: "warning", icone: CirclePause },
  receptionne: { ton: "success", icone: CircleCheck },
  // Intervention
  demandee: { ton: "neutral", icone: Clock },
  accordee: { ton: "accent", icone: CircleCheck },
  terminee: { ton: "success", icone: Flag },
  annulee: { ton: "neutral", icone: Ban },
  refusee: { ton: "danger", icone: CircleX },
  // Avancement / inspection / jalon
  saisie: { ton: "warning", icone: Clock },
  validee: { ton: "success", icone: CircleCheck },
  brouillon: { ton: "neutral", icone: CircleDashed },
  atteint: { ton: "success", icone: CircleCheck },
  a_venir: { ton: "neutral", icone: Clock },
  en_retard: { ton: "danger", icone: TriangleAlert },
}

/** Pastille d'état : la valeur choisit la teinte, le libellé (serveur) dit l'état. */
export function TagEtat({ valeur, libelle }: { valeur: string; libelle: string }) {
  const def = TONS[valeur] ?? { ton: "neutral" as const, icone: CircleDashed }
  return (
    <Pastille ton={def.ton} icone={def.icone}>
      {libelle}
    </Pastille>
  )
}

/** Cotation IQOA : le chiffre et son sens, jamais la couleur seule. */
export function TagCotation({ cotation, libelle }: { cotation: string; libelle?: string }) {
  const ton: Ton = cotation === "1" ? "success" : cotation === "2" ? "info" : cotation === "2E" ? "warning" : "danger"
  return (
    <Pastille ton={ton} icone={cotation === "3U" ? ShieldAlert : cotation.startsWith("3") ? TriangleAlert : CircleCheck}>
      <span className="tabular">IQOA {cotation}</span>
      {libelle ? ` · ${libelle}` : ""}
    </Pastille>
  )
}

export function TagRetard({ texte = "En retard" }: { texte?: string }) {
  return (
    <Pastille ton="danger" icone={Clock}>
      {texte}
    </Pastille>
  )
}

export function TagLtv() {
  return (
    <Pastille ton="warning" icone={TrafficCone}>
      Sous LTV
    </Pastille>
  )
}
