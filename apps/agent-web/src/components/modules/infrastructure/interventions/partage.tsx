"use client"

import { History, RotateCcw, ShieldAlert, TriangleAlert } from "lucide-react"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import type { GareLigne } from "@workspace/ui/components/schema-ligne"

import { CelluleDouble, Chronologie, Panneau, TableauDonnees, type ColonneTableau, type EvenementChronologie } from "@/components/charte"
import type { useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte, dateHeure, heure, jourMois, messageErreur } from "@/components/gestion/referentiels/format"
import { usePortalSession } from "@/components/portal-guard"

import { CadreInfra, DossierIntrouvable, TagEtat, TagRetard, infraApi, pk, type DossierOuvrage } from "../commun"

/**
 * Outils communs aux écrans ouvrages, équipements, plages travaux et PRN :
 * chronologie, anomalies liées, gares de la ligne, saisie des dates à
 * l'heure de Libreville et page d'erreur des rubriques.
 */

/* =========================================================== Opérations */

export type Operation = ReturnType<typeof useOperation>

/** Refus constaté avant l'appel serveur : même présentation qu'un refus serveur. */
export const refuser = (operation: Operation, detail: string) => operation.signaler({ ton: "danger", titre: "Action refusée", detail })

/** Message d'erreur à afficher dans la fenêtre de saisie ouverte. */
export const erreurOperation = (operation: Operation) => (operation.retour?.ton === "danger" ? (operation.retour.detail ?? operation.retour.titre) : null)

/* ================================================================ Dates */

const HEURE_MS = 3_600_000
/** Libreville : UTC+1, sans heure d'été. */
const DECALAGE_LIBREVILLE_MS = HEURE_MS

/** « 01/10/2026 13:24 » : la date complète et l'heure. */
export const dateEtHeure = (valeur: number | null | undefined) => (valeur ? `${dateCourte(valeur)} ${heure(valeur)}` : "—")

/** Horodatage → valeur d'un champ `datetime-local`, à l'heure de Libreville. */
export function versChampDateHeure(valeur: number) {
  return new Date(valeur + DECALAGE_LIBREVILLE_MS).toISOString().slice(0, 16)
}

/** Champ `datetime-local` (heure de Libreville) → horodatage. */
export function depuisChampDateHeure(valeur: string) {
  return valeur ? Date.parse(`${valeur}:00+01:00`) : Number.NaN
}

/** Aujourd'hui à Libreville, au format AAAA-MM-JJ. */
export function jourLibreville(valeur = Date.now()) {
  return new Date(valeur + DECALAGE_LIBREVILLE_MS).toISOString().slice(0, 10)
}

/** Mois courant à Libreville, au format AAAA-MM. */
export function moisLibreville(valeur = Date.now()) {
  return jourLibreville(valeur).slice(0, 7)
}

/**
 * Date saisie (AAAA-MM-JJ) → horodatage d'un fait accompli : maintenant si
 * c'est aujourd'hui, midi de Libreville pour un jour passé. Le serveur refuse
 * les dates futures.
 */
export function horodatageDuJour(valeur: string, maintenant = Date.now()) {
  if (!valeur) return Number.NaN
  if (valeur === jourLibreville(maintenant)) return maintenant
  return Date.parse(`${valeur}T12:00:00+01:00`)
}

/** Date saisie (AAAA-MM-JJ) → midi de Libreville, pour une échéance. */
export function horodatageEcheance(valeur: string) {
  return valeur ? Date.parse(`${valeur}T12:00:00+01:00`) : Number.NaN
}

/** Identifiant de l'agent connecté, pour prévenir la séparation des tâches. */
export function useAgentConnecte(): string | null {
  const session = usePortalSession()
  return (session?.profile.user?._id as string | undefined) ?? null
}

/** Instant figé au montage : les filtres « à venir », « en retard » s'y réfèrent. */
export function useMaintenant() {
  const [maintenant] = useState(() => Date.now())
  return maintenant
}

/* ================================================================ Ligne */

/**
 * Gares de la ligne, lues dans le tableau de bord du module : c'est la seule
 * lecture qui expose la ligne avec ses gares majeures.
 */
export function useGaresLigne(): GareLigne[] | undefined {
  const accueil = useQuery(infraApi.queries.accueil, {})
  return accueil?.ligne.gares.map((gare) => ({ nom: gare.nom, km: gare.km, majeure: gare.majeure }))
}

/* ========================================================== Chronologie */

export interface EvenementDossier {
  id: string
  libelle: string
  detail: string | null
  auteurNom: string | null
  creeLe: number
}

export function evenementsDossier(evenements: readonly EvenementDossier[]): EvenementChronologie[] {
  return evenements.map((evenement) => ({
    cle: evenement.id,
    heure: jourMois(evenement.creeLe),
    titre: evenement.libelle,
    detail: [dateHeure(evenement.creeLe), evenement.auteurNom ?? "Système", evenement.detail].filter(Boolean).join(" · "),
  }))
}

export function PanneauChronologie({ evenements, sousTitre }: { evenements: readonly EvenementDossier[]; sousTitre?: string }) {
  return (
    <Panneau titre="Chronologie" icone={History} sousTitre={sousTitre ?? "Les plus récents d'abord, inscrits au journal d'audit"}>
      <Chronologie evenements={evenementsDossier(evenements)} vide="Aucun événement enregistré sur ce dossier." />
    </Panneau>
  )
}

/* ====================================================== Anomalies liées */

export type AnomalieLiee = DossierOuvrage["anomalies"][number]

const colonnesAnomalies: ColonneTableau<AnomalieLiee>[] = [
  { cle: "numero", libelle: "N°", rendu: (a) => <span className="tabular font-semibold">{a.numero}</span>, tri: (a) => a.numero },
  {
    cle: "description",
    libelle: "Anomalie",
    rendu: (a) => <CelluleDouble haut={a.description.length > 70 ? `${a.description.slice(0, 68)}…` : a.description} bas={a.categorieLibelle} />,
    tri: (a) => a.description,
    export: (a) => `${a.categorieLibelle} — ${a.description}`,
  },
  { cle: "pk", libelle: "PK", rendu: (a) => <span className="tabular">{pk(a.pk)}</span>, tri: (a) => a.pk, numerique: true, secondaire: true },
  { cle: "gravite", libelle: "Gravité", rendu: (a) => <TagEtat valeur={a.gravite} libelle={a.graviteLibelle} />, tri: (a) => a.gravite, export: (a) => a.graviteLibelle },
  { cle: "signale", libelle: "Signalée", rendu: (a) => <span className="tabular">{dateCourte(a.signaleLe)}</span>, tri: (a) => a.signaleLe, export: (a) => dateCourte(a.signaleLe), secondaire: true },
  {
    cle: "echeance",
    libelle: "Échéance",
    rendu: (a) => (
      <span className="flex flex-wrap items-center gap-2">
        <span className="tabular">{dateCourte(a.echeanceLe)}</span>
        {a.enRetard ? <TagRetard texte="Échéance dépassée" /> : null}
      </span>
    ),
    tri: (a) => a.echeanceLe,
    export: (a) => `${dateCourte(a.echeanceLe)}${a.enRetard ? " (dépassée)" : ""}`,
  },
  { cle: "statut", libelle: "Statut", rendu: (a) => <TagEtat valeur={a.statut} libelle={a.statutLibelle} />, tri: (a) => a.statut, export: (a) => a.statutLibelle },
]

/** Anomalies terrain rattachées à un dossier, chacune ouvrant sa fiche. */
export function AnomaliesLiees({ anomalies, exportNom, vide }: { anomalies: readonly AnomalieLiee[]; exportNom: string; vide: string }) {
  const ouvertes = anomalies.filter((a) => a.ouverte).length
  return (
    <Panneau titre="Anomalies liées" icone={TriangleAlert} sousTitre={`${ouvertes} ouverte${ouvertes > 1 ? "s" : ""} sur ${anomalies.length}`}>
      <TableauDonnees
        libelle="Anomalies liées"
        colonnes={colonnesAnomalies}
        lignes={anomalies}
        cle={(a) => a.id}
        lien={(a) => `/infrastructures/anomalies/${a.id}`}
        exportNom={exportNom}
        parPage={10}
        vide={{ titre: "Aucune anomalie liée", description: vide }}
      />
    </Panneau>
  )
}

/* ============================================================== Erreurs */

/** Identifiant mal formé ou inexistant : le serveur refuse l'argument. */
export function erreurIntrouvable(message: string) {
  return /ArgumentValidationError|Value does not match validator|Invalid argument|introuvable/i.test(message)
}

/**
 * Page d'erreur d'une rubrique : un lien abîmé devient un dossier introuvable,
 * un refus d'accès est expliqué, le reste peut être relancé.
 */
export function ErreurRubrique({
  error,
  reset,
  quoi,
  retour,
}: {
  error: Error
  reset: () => void
  quoi: string
  retour: { href: string; libelle: string }
}) {
  const message = messageErreur(error, "Erreur inconnue.")
  if (erreurIntrouvable(error.message)) {
    return (
      <CadreInfra titre={`${quoi} introuvable`} retour={retour}>
        <DossierIntrouvable quoi={quoi} retour={retour} />
      </CadreInfra>
    )
  }
  const refus = /Accès refusé|Module désactivé|non autorisé/i.test(error.message)
  return (
    <CadreInfra titre={refus ? "Accès non autorisé" : "Lecture impossible"} retour={retour}>
      <InlineMessage tone="danger" title={refus ? "Votre fonction ne donne pas accès à cet écran." : "Le serveur n'a pas pu fournir les données."}>
        {message}
      </InlineMessage>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={reset}>
          <RotateCcw />
          Réessayer
        </Button>
        {refus ? (
          <span className="text-small inline-flex items-center gap-2 text-ink-muted">
            <ShieldAlert aria-hidden className="size-4" />
            Demandez l&apos;habilitation à l&apos;administrateur fonctionnel.
          </span>
        ) : null}
      </div>
    </CadreInfra>
  )
}
