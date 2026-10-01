"use client"

import type { FunctionReturnType } from "convex/server"
import {
  ArrowLeft,
  Ban,
  Boxes,
  CalendarClock,
  CircleCheck,
  CircleDashed,
  CirclePause,
  CircleX,
  ClipboardCheck,
  Clock,
  Flag,
  Hammer,
  LayoutDashboard,
  PackageCheck,
  ShieldAlert,
  ShoppingCart,
  TrainFront,
  TriangleAlert,
  Truck,
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
export const gmaoApi = api.modules.gmao

export type CapaciteGmao =
  | "ot_demander"
  | "ot_planifier"
  | "ot_executer"
  | "ot_cloturer"
  | "visite_signer"
  | "compteur_relever"
  | "stock_mouvementer"
  | "achat_demander"
  | "achat_valider"
  | "parc_administrer"
  | "plan_administrer"

export type AccueilGmao = FunctionReturnType<typeof gmaoApi.queries.accueil>
export type LigneEngin = FunctionReturnType<typeof gmaoApi.queries.equipements>[number]
export type DossierEngin = NonNullable<FunctionReturnType<typeof gmaoApi.queries.equipement>>
export type LigneOt = FunctionReturnType<typeof gmaoApi.queries.ordresTravail>[number]
export type DossierOt = NonNullable<FunctionReturnType<typeof gmaoApi.queries.ordreTravail>>
export type LignePlan = FunctionReturnType<typeof gmaoApi.queries.plans>[number]
export type DossierPlan = NonNullable<FunctionReturnType<typeof gmaoApi.queries.plan>>
export type LigneEcheance = FunctionReturnType<typeof gmaoApi.queries.echeances>[number]
export type LigneVisite = FunctionReturnType<typeof gmaoApi.queries.visites>[number]
export type DossierVisite = NonNullable<FunctionReturnType<typeof gmaoApi.queries.visite>>
export type LigneDepart = FunctionReturnType<typeof gmaoApi.queries.departs>[number]
export type LigneArticle = FunctionReturnType<typeof gmaoApi.queries.articles>[number]
export type DossierArticle = NonNullable<FunctionReturnType<typeof gmaoApi.queries.article>>
export type LigneMouvement = FunctionReturnType<typeof gmaoApi.queries.mouvements>[number]
export type LigneAchat = FunctionReturnType<typeof gmaoApi.queries.demandesAchat>[number]
export type DossierAchat = NonNullable<FunctionReturnType<typeof gmaoApi.queries.demandeAchat>>
export type FormulairesGmao = FunctionReturnType<typeof gmaoApi.queries.formulaires>

/* =============================================================== Droits */

/**
 * Droits de l'utilisateur dans le module : la capacité métier décide de
 * l'affichage d'une action ; le serveur la vérifie de toute façon.
 */
export function useDroitsGmao() {
  const droits = useQuery(gmaoApi.queries.droits, {})
  const capacites = new Set<string>(droits?.capacites ?? [])
  return {
    chargement: droits === undefined,
    peutEcrire: droits?.peutEcrire ?? false,
    role: droits?.role,
    utilisateurId: droits?.utilisateurId,
    peut: (capacite: CapaciteGmao) => capacites.has(capacite),
  }
}

/* ============================================================ Navigation */

interface Rubrique {
  href: string
  libelle: string
  icone: LucideIcon
  exact?: boolean
}

export const RUBRIQUES_GMAO: readonly Rubrique[] = [
  { href: "/materiel", libelle: "Tableau de bord", icone: LayoutDashboard, exact: true },
  { href: "/materiel/parc", libelle: "Parc", icone: TrainFront },
  { href: "/materiel/ordres", libelle: "Ordres de travail", icone: Wrench },
  { href: "/materiel/preventif", libelle: "Préventif", icone: CalendarClock },
  { href: "/materiel/visites", libelle: "Visites avant départ", icone: ClipboardCheck },
  { href: "/materiel/stock", libelle: "Stock de pièces", icone: Boxes },
  { href: "/materiel/achats", libelle: "Achats", icone: ShoppingCart },
]

export function NavigationGmao({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <MenuRubriques
      titre="Matériel roulant"
      rubriques={RUBRIQUES_GMAO.map((rubrique) => ({ ...rubrique, exacte: rubrique.exact }))}
      onNavigate={onNavigate}
    />
  )
}

/**
 * Cadre de toutes les pages du module : coquille du portail, rubriques,
 * en-tête (un seul bouton `primary` dans `actions`) et mode lecture.
 */
export function CadreGmao({
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
      space="Matériel roulant · GMAO"
      scope="DMAT · ateliers d'Owendo, Booué et Moanda"
      navigation={({ onNavigate }) => <NavigationGmao onNavigate={onNavigate} />}
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

/** États communs d'un dossier : chargement et introuvable. */
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
const fmtDecimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 })

export const km = (valeur: number | null | undefined) => (valeur === null || valeur === undefined ? "—" : `${fmtEntier.format(valeur)} km`)
/** Montant en XAF, comme l'impose la charte. */
export const xaf = (valeur: number | null | undefined) => (valeur === null || valeur === undefined ? "—" : formatXaf(Math.round(valeur)))
export const heures = (valeur: number | null | undefined) => (valeur === null || valeur === undefined ? "—" : `${fmtDecimal.format(valeur)} h`)
export const quantite = (valeur: number | null | undefined, unite?: string) =>
  valeur === null || valeur === undefined ? "—" : `${fmtDecimal.format(valeur)}${unite ? ` ${unite}` : ""}`
export const pct = (valeur: number | null | undefined) => (valeur === null || valeur === undefined ? "—" : `${fmtEntier.format(Math.round(valeur * 100))} %`)

/* ============================================================ Libellés */

export const FAMILLES = { locomotive: "Locomotive", voiture: "Voiture voyageurs", wagon: "Wagon" } as const
export const FAMILLES_PLURIEL = { locomotive: "Locomotives", voiture: "Voitures voyageurs", wagon: "Wagons" } as const
export type FamilleEngin = keyof typeof FAMILLES

export const TYPES_OT = { preventif: "Préventif", correctif: "Correctif", amelioratif: "Amélioratif" } as const
export const ORIGINES_OT = { demande: "Demande", plan: "Plan préventif", visite_technique: "Visite avant départ", incident: "Incident" } as const
export const SENS_MOUVEMENT = { entree: "Entrée", sortie: "Sortie", ajustement: "Ajustement" } as const
export const ORIGINES_ACHAT = { seuil: "Seuil de stock", manuelle: "Manuelle", ot: "Ordre de travail" } as const
export const RESULTATS_CONTROLE = { ok: "Conforme", defaut: "Défaut", non_applicable: "Sans objet" } as const
export const GRAVITES_DEFAUT = { mineur: "Mineur", majeur: "Majeur", bloquant: "Bloquant" } as const

type Ton = "accent" | "second" | "success" | "warning" | "danger" | "info" | "neutral" | "strong"
interface DefStatut {
  libelle: string
  ton: Ton
  icone: LucideIcon
}

export const STATUTS_ENGIN: Record<"en_service" | "immobilise" | "en_atelier" | "reforme", DefStatut> = {
  en_service: { libelle: "En service", ton: "success", icone: CircleCheck },
  en_atelier: { libelle: "En atelier", ton: "info", icone: Hammer },
  immobilise: { libelle: "Immobilisé", ton: "danger", icone: CirclePause },
  reforme: { libelle: "Réformé", ton: "neutral", icone: Ban },
}

export const STATUTS_OT: Record<"demande" | "planifie" | "en_cours" | "travaux_termines" | "cloture" | "annule", DefStatut> = {
  demande: { libelle: "Demandé", ton: "neutral", icone: CircleDashed },
  planifie: { libelle: "Planifié", ton: "accent", icone: CalendarClock },
  en_cours: { libelle: "En cours", ton: "info", icone: Wrench },
  travaux_termines: { libelle: "En réception", ton: "warning", icone: Flag },
  cloture: { libelle: "Clôturé", ton: "success", icone: CircleCheck },
  annule: { libelle: "Annulé", ton: "neutral", icone: CircleX },
}

export const PRIORITES: Record<"urgente" | "haute" | "normale" | "basse", DefStatut> = {
  urgente: { libelle: "Urgente", ton: "danger", icone: ShieldAlert },
  haute: { libelle: "Haute", ton: "warning", icone: TriangleAlert },
  normale: { libelle: "Normale", ton: "neutral", icone: CircleDashed },
  basse: { libelle: "Basse", ton: "neutral", icone: Clock },
}

export const APTITUDES: Record<"apte" | "apte_sous_reserve" | "inapte", DefStatut> = {
  apte: { libelle: "Apte au départ", ton: "success", icone: CircleCheck },
  apte_sous_reserve: { libelle: "Apte sous réserve", ton: "warning", icone: TriangleAlert },
  inapte: { libelle: "Inapte · départ bloqué", ton: "danger", icone: Ban },
}

export const STATUTS_ACHAT: Record<"soumise" | "validee" | "commandee" | "recue" | "refusee" | "annulee", DefStatut> = {
  soumise: { libelle: "À valider", ton: "warning", icone: Clock },
  validee: { libelle: "Validée", ton: "accent", icone: CircleCheck },
  commandee: { libelle: "Commandée", ton: "info", icone: Truck },
  recue: { libelle: "Reçue", ton: "success", icone: PackageCheck },
  refusee: { libelle: "Refusée", ton: "danger", icone: CircleX },
  annulee: { libelle: "Annulée", ton: "neutral", icone: Ban },
}

export const ETATS_ECHEANCE: Record<"a_jour" | "proche" | "echue", DefStatut> = {
  a_jour: { libelle: "À jour", ton: "success", icone: CircleCheck },
  proche: { libelle: "Proche", ton: "warning", icone: Clock },
  echue: { libelle: "Échue", ton: "danger", icone: TriangleAlert },
}

function TagDef({ def, suffixe }: { def: DefStatut; suffixe?: string }) {
  return (
    <Pastille ton={def.ton} icone={def.icone}>
      {def.libelle}
      {suffixe ? ` ${suffixe}` : ""}
    </Pastille>
  )
}

export const TagEngin = ({ statut }: { statut: keyof typeof STATUTS_ENGIN }) => <TagDef def={STATUTS_ENGIN[statut]} />
export const TagOt = ({ statut }: { statut: keyof typeof STATUTS_OT }) => <TagDef def={STATUTS_OT[statut]} />
export const TagPriorite = ({ priorite }: { priorite: keyof typeof PRIORITES }) => <TagDef def={PRIORITES[priorite]} />
export const TagAptitude = ({ aptitude }: { aptitude: keyof typeof APTITUDES }) => <TagDef def={APTITUDES[aptitude]} />
export const TagAchat = ({ statut }: { statut: keyof typeof STATUTS_ACHAT }) => <TagDef def={STATUTS_ACHAT[statut]} />
export const TagEcheance = ({ etat }: { etat: keyof typeof ETATS_ECHEANCE }) => <TagDef def={ETATS_ECHEANCE[etat]} />

/** Retard écrit en toutes lettres, jamais porté par la couleur seule. */
export function TagRetard() {
  return (
    <Pastille ton="danger" icone={Clock}>
      En retard
    </Pastille>
  )
}

/** Restant avant échéance, écrit : « dans 1 240 km », « dépassé de 12 j ». */
export function libelleRestant(params: { kmRestants: number | null; joursRestants: number | null; declencheur?: "km" | "temps" }) {
  const parKm = params.kmRestants !== null ? (params.kmRestants >= 0 ? `dans ${km(params.kmRestants)}` : `dépassé de ${km(-params.kmRestants)}`) : null
  const parJours =
    params.joursRestants !== null
      ? params.joursRestants >= 0
        ? `dans ${fmtEntier.format(params.joursRestants)} j`
        : `dépassé de ${fmtEntier.format(-params.joursRestants)} j`
      : null
  if (params.declencheur === "km") return parKm ?? parJours ?? "—"
  if (params.declencheur === "temps") return parJours ?? parKm ?? "—"
  return [parKm, parJours].filter(Boolean).join(" · ") || "—"
}
