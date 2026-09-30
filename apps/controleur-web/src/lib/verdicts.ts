/**
 * Les treize verdicts du contrôle, rangés en quatre familles.
 *
 * Chaque famille a une forme, un mot, une texture et un retour physique : un
 * verdict se reconnaît en niveaux de gris, en plein soleil et par un agent
 * daltonien. La teinte vient en dernier.
 *
 *  — accepté : cercle et coche ;
 *  — à vérifier : triangle, liseré en tirets ;
 *  — refusé : octogone, hachures ;
 *  — lecture impossible : cadre en tirets, fond gris — ni oui ni non.
 *
 * Ce module ne décide rien sur le titre : c'est `offline/verify.ts` qui rend
 * le verdict. Il dit seulement comment l'écran le présente et ce qu'il
 * propose ensuite, pour qu'un seul endroit porte cette table.
 */

import type { Verdict } from "./offline/types"
import type { VerificationResult } from "./offline/verify"

export type Famille = "accepte" | "vigilance" | "refus" | "lecture"

export const FAMILLE_DU_VERDICT: Record<Verdict, Famille> = {
  valide: "accepte",
  abonnement: "accepte",
  deja_controle: "vigilance",
  inconnu: "vigilance",
  // Une clé retirée du service est un problème d'exploitation, pas de
  // voyageur : à vérifier, jamais refusé.
  cle_hors_service: "vigilance",
  hors_segment: "refus",
  mauvaise_desserte: "refus",
  expire: "refus",
  annule: "refus",
  rembourse: "refus",
  non_paye: "refus",
  contrefait: "refus",
  // Un code froissé ou tronqué n'est pas une contrefaçon.
  illisible: "lecture",
}

export const LIBELLE_FAMILLE: Record<Famille, string> = {
  accepte: "Accepté",
  vigilance: "À vérifier",
  refus: "Refusé",
  lecture: "Lecture impossible",
}

/** Le mot écrit en tête de l'écran de verdict, en 36 px. */
export const LIBELLE_VERDICT: Record<Verdict, string> = {
  valide: "Valide",
  abonnement: "Abonnement valide",
  contrefait: "Signature invalide",
  illisible: "Code illisible",
  cle_hors_service: "Clé hors service",
  mauvaise_desserte: "Mauvaise desserte",
  hors_segment: "Hors segment",
  expire: "Expiré",
  annule: "Titre annulé",
  rembourse: "Titre remboursé",
  deja_controle: "Déjà contrôlé",
  non_paye: "Non payé",
  inconnu: "Statut inconnu",
}

export type Suite =
  | "valider"
  | "continuer"
  | "accepter"
  | "regulariser"
  | "vendre"
  | "pv"
  | "chercher"
  | "signaler"
  | "rescanner"
  | "saisir"
  | "fermer"

export const LIBELLE_SUITE: Record<Suite, string> = {
  valider: "Valider et scanner le suivant",
  continuer: "Continuer sans second contrôle",
  accepter: "Enregistrer et scanner le suivant",
  regulariser: "Régulariser — vendre le complément",
  vendre: "Vendre un titre à bord",
  pv: "Établir un procès-verbal",
  chercher: "Chercher dans le manifeste",
  signaler: "Signaler à l'exploitation",
  rescanner: "Scanner à nouveau",
  saisir: "Saisir le code à la main",
  fermer: "Fermer sans enregistrer",
}

export interface SuitesVerdict {
  /** Le seul bouton primaire de l'écran. */
  principale: Suite
  /** Boutons secondaires, dans l'ordre. */
  secondaires: Suite[]
  /** Boutons fantômes, sous les autres. */
  discretes: Suite[]
  /** Retour automatique au viseur après 1,5 s, annulable d'un toucher. */
  retourAuto: boolean
}

/**
 * Ce que l'écran propose après chaque verdict.
 *
 * Le motif décide de la suite. Un refus de bonne foi — mauvaise desserte,
 * titre expiré — propose d'abord la vente, puis le procès-verbal ; « hors
 * segment », seul refus régularisable, propose le complément. Une lecture
 * impossible ne reproche rien au voyageur : on représente, on saisit, on
 * cherche — jamais de procès-verbal d'emblée.
 */
export function suitesDuVerdict(verdict: Verdict): SuitesVerdict {
  switch (verdict) {
    case "valide":
    case "abonnement":
      return { principale: "valider", secondaires: [], discretes: ["fermer"], retourAuto: true }
    case "deja_controle":
      return { principale: "continuer", secondaires: [], discretes: ["fermer"], retourAuto: false }
    case "inconnu":
      return {
        principale: "regulariser",
        secondaires: ["pv"],
        discretes: ["accepter", "fermer"],
        retourAuto: false,
      }
    case "cle_hors_service":
      return { principale: "chercher", secondaires: ["signaler"], discretes: ["fermer"], retourAuto: false }
    case "hors_segment":
      return { principale: "regulariser", secondaires: ["pv"], discretes: ["fermer"], retourAuto: false }
    case "mauvaise_desserte":
    case "expire":
      return { principale: "vendre", secondaires: ["pv"], discretes: ["fermer"], retourAuto: false }
    case "annule":
    case "rembourse":
    case "non_paye":
    case "contrefait":
      return { principale: "pv", secondaires: ["vendre"], discretes: ["fermer"], retourAuto: false }
    case "illisible":
      return { principale: "rescanner", secondaires: ["saisir", "chercher"], discretes: [], retourAuto: false }
  }
}

/**
 * La suite enregistre-t-elle le contrôle avant de s'engager ?
 *
 * Tout verdict sur un titre est journalisé, refus compris : c'est ce qui
 * prouve qu'un faux a été présenté. Une lecture impossible, elle, ne dit rien
 * du voyageur — rien n'est enregistré, on recommence.
 */
export function enregistreLeControle(verdict: Verdict, suite: Suite): boolean {
  if (FAMILLE_DU_VERDICT[verdict] === "lecture") return false
  return suite !== "fermer" && suite !== "rescanner" && suite !== "saisir"
}

/** Ce sur quoi le verdict s'appuie, écrit au-dessus du mot. */
export function sourceDuVerdict(result: Pick<VerificationResult, "payload" | "fromManifest">): string {
  if (result.payload === null) return "Lecture du code"
  return result.fromManifest ? "Manifeste embarqué" : "Signature vérifiée localement"
}

/** Une note de retour sonore : fréquence (Hz), durée et silence après (ms). */
export interface Note {
  frequence: number
  duree: number
  pause?: number
}

/**
 * Retour physique de chaque famille.
 *
 * « Abonnement valide » vibre comme « Valide » : c'est la même famille. La
 * lecture impossible ne vibre ni ne sonne — rien n'est reproché.
 */
export const RETOUR_PHYSIQUE: Record<Famille, { vibration: number[] | null; notes: Note[] }> = {
  accepte: { vibration: [40], notes: [{ frequence: 1320, duree: 90 }] },
  vigilance: {
    vibration: [40, 60, 40],
    notes: [
      { frequence: 880, duree: 90, pause: 70 },
      { frequence: 880, duree: 90 },
    ],
  },
  refus: { vibration: [260], notes: [{ frequence: 220, duree: 420 }] },
  lecture: { vibration: null, notes: [] },
}
