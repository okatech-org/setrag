"use client"

import type { FunctionArgs } from "convex/server"
import { RotateCcw, ShieldAlert } from "lucide-react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import type { EvenementChronologie } from "@/components/charte"
import { dateHeure, jourMois, messageErreur } from "@/components/gestion/referentiels/format"

import { CadreInfra, DossierIntrouvable, infraApi, type AccueilInfra, type LigneLtv } from "../commun"
import type { ZoneVoie } from "../schema-voie"

/**
 * Outils partagés par les écrans voie, anomalies, LTV et le tableau de bord :
 * ligne de référence (gares), zones LTV, chronologie, référentiels des
 * listes de choix, téléversement et pages d'erreur.
 */

/* ============================================================ Référentiels */

type ArgsSignalement = FunctionArgs<typeof infraApi.mutations.signalerAnomalie>
export type Gravite = ArgsSignalement["gravite"]
export type CategorieAnomalie = ArgsSignalement["categorie"]
export type EtatVoie = FunctionArgs<typeof infraApi.mutations.majEtatSection>["etat"]
export type TypeIntervention = FunctionArgs<typeof infraApi.mutations.demanderIntervention>["type"]
export type StatutAnomalie = NonNullable<FunctionArgs<typeof infraApi.queries.anomalies>["statut"]>
export type IdStockage = NonNullable<ArgsSignalement["photoIds"]>[number]

/*
 * Les libellés affichés dans les tableaux viennent du serveur (`…Libelle`).
 * Ces listes ne servent qu'aux formulaires et aux filtres ; leur typage par
 * `Record` sur les arguments des mutations signale à la compilation toute
 * valeur ajoutée côté serveur.
 */
export const GRAVITES: Record<Gravite, { libelle: string; delai: string }> = {
  critique: { libelle: "Critique", delai: "traitement sous 24 heures" },
  elevee: { libelle: "Élevée", delai: "traitement sous 7 jours" },
  moyenne: { libelle: "Moyenne", delai: "traitement sous 30 jours" },
  faible: { libelle: "Faible", delai: "traitement sous 90 jours" },
}
export const ORDRE_GRAVITES: readonly Gravite[] = ["critique", "elevee", "moyenne", "faible"]

export const CATEGORIES_ANOMALIE: Record<CategorieAnomalie, string> = {
  rail: "Rail",
  traverses: "Traverses",
  ballast: "Ballast",
  geometrie: "Géométrie de la voie",
  talus: "Talus et terrassements",
  ouvrage: "Ouvrage d'art",
  signalisation: "Signalisation",
  passage_niveau: "Passage à niveau",
  telecoms: "Télécommunications",
  vegetation: "Végétation",
  autre: "Autre",
}

export const STATUTS_ANOMALIE: Record<StatutAnomalie, string> = {
  signalee: "Signalée",
  prise_en_charge: "Prise en charge",
  traitee: "Traitée, à clore",
  close: "Close",
  rejetee: "Rejetée",
}

export const ETATS_VOIE: Record<EtatVoie, string> = {
  bon: "Bon",
  moyen: "Moyen",
  degrade: "Dégradé",
  critique: "Critique",
}

export const TYPES_INTERVENTION: Record<TypeIntervention, string> = {
  entretien_voie: "Entretien de la voie",
  prn: "Travaux PRN",
  ouvrage: "Ouvrage d'art",
  signalisation: "Signalisation",
  telecoms: "Télécommunications",
  debroussaillage: "Débroussaillage",
}

/** Valeurs de repli tant que le référentiel n'est pas chargé. */
export const LONGUEUR_LIGNE_KM = 669
export const AIDE_PK = "PK 0 Owendo → PK 669 Franceville"

/* ================================================================= Ligne */

/**
 * Gares et LTV actives de la ligne, lues dans le tableau de bord du module :
 * c'est la seule requête qui expose la ligne avec ses gares majeures.
 */
export function useLigne(): AccueilInfra["ligne"] | undefined {
  const accueil = useQuery(infraApi.queries.accueil, {})
  return accueil?.ligne
}

type LtvZone = Pick<LigneLtv, "id" | "numero" | "pkDebut" | "pkFin" | "vitesseKmh">

/** LTV → zones du schéma de ligne, chacune écrite en clair. */
export function zonesLtv(ltvs: readonly LtvZone[]): ZoneVoie[] {
  return ltvs.map((ltv) => ({
    id: ltv.id,
    libelle: ltv.numero,
    pkDebut: ltv.pkDebut,
    pkFin: ltv.pkFin,
    detail: `${ltv.vitesseKmh} km/h`,
    href: `/infrastructures/ltv/${ltv.id}`,
    nature: "ltv" as const,
  }))
}

/* ============================================================ Chronologie */

export interface EvenementInfra {
  id: string
  libelle: string
  detail: string | null
  auteurNom: string | null
  creeLe: number
}

/** Événements d'un dossier (les plus récents d'abord) → chronologie. */
export function chronologieInfra(evenements: readonly EvenementInfra[]): EvenementChronologie[] {
  return evenements.map((evenement) => ({
    cle: evenement.id,
    heure: jourMois(evenement.creeLe),
    titre: evenement.libelle,
    detail: [dateHeure(evenement.creeLe), evenement.auteurNom ?? "Système", evenement.detail].filter(Boolean).join(" · "),
  }))
}

/* ============================================================== Erreurs */

/** Identifiant mal formé ou inexistant : le serveur refuse l'argument. */
export function erreurIntrouvable(message: string) {
  return /ArgumentValidationError|Value does not match validator|Invalid argument|introuvable/i.test(message)
}

/**
 * Page d'erreur des rubriques du module : un lien abîmé devient un dossier
 * introuvable, un refus d'accès est expliqué, le reste peut être relancé.
 */
export function ErreurInfra({
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
      <div className="flex flex-wrap gap-2">
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

/* ============================================================== Divers */

export const arrondiPk = (valeur: number) => Math.round(valeur * 1000) / 1000

/** Section qui porte un PK (début inclus, fin exclue sauf la dernière). */
export function sectionDuPk<T extends { pkDebut: number; pkFin: number }>(sections: readonly T[], pk: number): T | undefined {
  return sections.find((section, index) => pk >= section.pkDebut && (pk < section.pkFin || (index === sections.length - 1 && pk <= section.pkFin)))
}

/** Sections recoupées par une plage PK. */
export function sectionsRecoupees<T extends { pkDebut: number; pkFin: number }>(sections: readonly T[], debut: number, fin: number): T[] {
  const [a, b] = debut <= fin ? [debut, fin] : [fin, debut]
  return sections.filter((section) => a < section.pkFin && section.pkDebut < b)
}
