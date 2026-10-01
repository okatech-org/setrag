"use client"

import type { FunctionReturnType } from "convex/server"
import {
  CalendarClock,
  CalendarDays,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  HeartPulse,
  LayoutDashboard,
  Lock,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react"
import type { ReactNode } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"

import { CadreModule, Statut, type RubriqueModule, type Ton } from "./commun"
import {
  ETATS_APTITUDE,
  ETATS_HABILITATION,
  STATUTS_AGENT,
  STATUTS_CONGE,
  STATUTS_DECLARATION,
  STATUTS_PERIODE,
  STATUTS_SERVICE,
  STATUTS_VISITE,
  type EtatAptitude,
  type StatutAgent,
  type StatutConge,
  type StatutPeriode,
} from "./libelles"

export type AccesRh = FunctionReturnType<typeof api.modules.rh.accueil.monAcces>
export type CapaciteRh = AccesRh["capacites"][number]

/** Capacités de l'utilisateur dans le module, telles que le serveur les accorde. */
export function useAccesRh() {
  const acces = useQuery(api.modules.rh.accueil.monAcces, {})
  return {
    acces,
    charge: acces !== undefined,
    peut: (capacite: CapaciteRh) => Boolean(acces?.capacites.includes(capacite)),
  }
}

const RUBRIQUES: readonly (RubriqueModule & { capacite: CapaciteRh })[] = [
  { href: "/rh", libelle: "Tableau de bord", icone: LayoutDashboard, exacte: true, capacite: "indicateurs" },
  { href: "/rh/agents", libelle: "Dossiers du personnel", icone: Users, capacite: "dossiers.lire" },
  { href: "/rh/paie", libelle: "Paie et déclarations", icone: Wallet, capacite: "declarations.lire" },
  { href: "/rh/roulements", libelle: "Roulements", icone: CalendarClock, capacite: "roulements.lire" },
  { href: "/rh/aptitude", libelle: "Aptitude médicale", icone: HeartPulse, capacite: "aptitude.lire" },
  { href: "/rh/conges", libelle: "Congés et absences", icone: CalendarDays, capacite: "conges.lire" },
]

/** Cadre des écrans RH : rubriques filtrées par capacité, lecture seule écrite. */
export function CadreRh({
  titre,
  description,
  actions,
  retour,
  children,
}: {
  titre: ReactNode
  description?: ReactNode
  actions?: ReactNode
  retour?: { href: string; libelle: string }
  children: ReactNode
}) {
  const { acces, peut } = useAccesRh()
  const rubriques = RUBRIQUES.filter((rubrique) => {
    if (!acces) return rubrique.exacte
    if (rubrique.href === "/rh/paie") return peut("paie.lire") || peut("declarations.lire")
    return peut(rubrique.capacite)
  })
  return (
    <CadreModule
      espace="Ressources humaines"
      perimetre="DRH · réseau Owendo — Franceville"
      rubriques={rubriques}
      titre={titre}
      description={description}
      actions={actions}
      retour={retour}
      lectureSeule={
        acces?.lectureSeule
          ? acces.role === "admin_it"
            ? "Administration système : le module reste visible pour la gouvernance, sans action métier."
            : "Consultation : votre profil lit ces données sans pouvoir les modifier. Recherches, exports et impressions restent disponibles."
          : undefined
      }
    >
      {children}
    </CadreModule>
  )
}

/* ════════════════════════════ Pastilles RH ═════════════════════════════ */

const TONS_APTITUDE: Record<EtatAptitude, Ton> = {
  apte: "success",
  apte_restriction: "info",
  a_renouveler: "warning",
  expiree: "danger",
  inapte_temporaire: "danger",
  inapte_definitif: "danger",
  aucune: "neutral",
}

export function TagAptitude({ etat }: { etat: EtatAptitude }) {
  const icone = etat === "apte" ? CircleCheck : etat === "apte_restriction" ? CircleDashed : etat === "a_renouveler" ? Clock : etat === "aucune" ? CircleDashed : CircleX
  return <Statut valeur={etat} libelles={ETATS_APTITUDE} tons={TONS_APTITUDE} icone={icone} />
}

export function TagAgent({ statut }: { statut: StatutAgent }) {
  return <Statut valeur={statut} libelles={STATUTS_AGENT} tons={{ actif: "success", suspendu: "warning", sorti: "neutral" }} icone={statut === "actif" ? CircleCheck : statut === "suspendu" ? TriangleAlert : CircleX} />
}

export function TagHabilitation({ etat }: { etat: keyof typeof ETATS_HABILITATION }) {
  return (
    <Statut
      valeur={etat}
      libelles={ETATS_HABILITATION}
      tons={{ valide: "success", a_renouveler: "warning", expiree: "danger", suspendue: "warning", retiree: "neutral" }}
      icone={etat === "valide" ? CircleCheck : etat === "a_renouveler" ? Clock : CircleX}
    />
  )
}

export function TagPeriode({ statut }: { statut: StatutPeriode }) {
  return (
    <Statut
      valeur={statut}
      libelles={STATUTS_PERIODE}
      tons={{ ouverte: "info", calculee: "warning", validee: "accent", cloturee: "success" }}
      icone={statut === "cloturee" ? Lock : statut === "calculee" ? Clock : CircleDashed}
    />
  )
}

export function TagConge({ statut }: { statut: StatutConge }) {
  return (
    <Statut
      valeur={statut}
      libelles={STATUTS_CONGE}
      tons={{ demande: "warning", valide: "success", refuse: "danger", annule: "neutral" }}
      icone={statut === "valide" ? CircleCheck : statut === "demande" ? Clock : CircleX}
    />
  )
}

export function TagService({ statut }: { statut: keyof typeof STATUTS_SERVICE }) {
  return <Statut valeur={statut} libelles={STATUTS_SERVICE} tons={{ planifie: "info", publie: "success", annule: "neutral" }} icone={statut === "publie" ? CircleCheck : statut === "annule" ? CircleX : CircleDashed} />
}

export function TagVisite({ statut }: { statut: keyof typeof STATUTS_VISITE }) {
  return <Statut valeur={statut} libelles={STATUTS_VISITE} tons={{ programmee: "info", realisee: "success", annulee: "neutral" }} icone={statut === "realisee" ? CircleCheck : statut === "annulee" ? CircleX : Clock} />
}

export function TagDeclaration({ statut }: { statut: keyof typeof STATUTS_DECLARATION }) {
  return <Statut valeur={statut} libelles={STATUTS_DECLARATION} tons={{ transmise: "warning", accusee: "success", rejetee: "danger" }} icone={statut === "accusee" ? CircleCheck : statut === "rejetee" ? CircleX : Clock} />
}
