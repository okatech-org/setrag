/**
 * Rejeu des appels d'outils dans l'historique envoyé au modèle.
 *
 * Sans lui, le modèle ne relisait que les textes échangés : il relançait
 * `list_stations` ou `search_trips` à chaque tour et réaffichait les mêmes
 * cartes. Chaque tour enregistre donc ses appels d'outils (`assistantTurns
 * .toolCalls`) avec la sortie PROJETÉE — celle que le modèle a déjà lue,
 * jamais la sortie brute — réduite à l'essentiel, et les tours suivants les
 * rejouent au format du SDK : l'appel, puis son résultat, appariés par
 * `callId`.
 *
 * Bornes : les outils des `TOURS_REJOUES` derniers tours qui en ont, âgés de
 * moins de `AGE_MAX_REJEU_MS`, dans un budget total de `BUDGET_REJEU`
 * caractères ; chaque sortie tient en `SORTIE_REJEU_MAX` caractères. Seule
 * exception : une confirmation encore ouverte se relit toujours.
 *
 * Acteur : une sortie qui dépend de l'acteur (réservations, billets, profil,
 * notes, confirmations) n'est rejouée qu'à l'acteur qui l'a obtenue. Une
 * conversation invitée rattachée ensuite à un compte (`claim`) ne rejoue donc
 * au compte que les données publiques (gares, trains, prix) ; la liaison
 * d'une messagerie, elle, ouvre une conversation neuve. Un outil qui n'est
 * plus disponible pour l'acteur courant n'est jamais rejoué.
 *
 * Module pur : aucune dépendance à Convex.
 */

import { toLocalTime } from "../model/calendar"
import type { HistoryEntry, ReplayedToolCall } from "./providers"

/** Nombre de tours (parmi ceux qui ont appelé des outils) dont les appels sont rejoués. */
export const TOURS_REJOUES = 3
/** Taille maximale d'une sortie rejouée, en caractères JSON. */
export const SORTIE_REJEU_MAX = 3_000
/** Taille maximale de l'ensemble rejoué (entrées et sorties), en caractères JSON. */
export const BUDGET_REJEU = 12_000
/** Au-delà, disponibilités et prix ont pu changer : le modèle relance l'outil. */
export const AGE_MAX_REJEU_MS = 30 * 60 * 1_000
/** Trajets gardés d'une recherche rejouée. */
export const TRAJETS_REJOUES_MAX = 8
/** Au-delà, l'entrée d'un appel n'est pas enregistrée pour le rejeu. */
const ENTREE_REJEU_MAX = 2_000

/**
 * - `public` : la sortie ne dépend pas de l'acteur (référentiel, horaires,
 *   prix) ; rejouée à tout acteur à qui l'outil est ouvert.
 * - `acteur` : la sortie appartient à l'acteur qui l'a obtenue.
 * - `jamais` : sortie éphémère (lien temporaire d'un billet), jamais gardée.
 */
export type PolitiqueRejeu = "public" | "acteur" | "jamais"

const POLITIQUES: Readonly<Record<string, PolitiqueRejeu>> = {
  list_stations: "public",
  search_trips: "public",
  get_trip: "public",
  quote_booking: "public",
  get_ticket_download_url: "jamais",
}

export function politiqueRejeu(toolName: string): PolitiqueRejeu {
  return POLITIQUES[toolName] ?? "acteur"
}

export const ACTEUR_INVITE = "invite"

/** Clé de l'acteur d'un tour : le compte, ou « invite » sans compte. */
export function cleActeur(acteur: { userId: string } | null): string {
  return acteur ? `compte:${acteur.userId}` : ACTEUR_INVITE
}

/** Un appel d'outil enregistré sur son tour (`assistantTurns.toolCalls`). */
export type AppelEnregistre = {
  callId: string
  toolName: string
  inputJson: string
  /** Sortie projetée et réduite ; absente pour une confirmation. */
  outputJson?: string
  status: "ok" | "approval_required"
  actorKey: string
}

export type EtatExecution = {
  status: "approval_required" | "running" | "succeeded" | "failed" | "rejected"
  outputJson?: string
  error?: string
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function choisir(
  value: unknown,
  cles: readonly string[]
): Record<string, unknown> {
  const source = recordOf(value)
  return Object.fromEntries(
    cles.filter((cle) => source[cle] !== undefined).map((cle) => [cle, source[cle]])
  )
}

const SORTIE_OMISE = {
  status: "omitted",
  message:
    "Résultat trop volumineux pour être rappelé : relance l'outil si tu en as besoin.",
}

/** Réduit le tableau `valeurs` jusqu'à ce que `emballer` tienne en `max` caractères. */
function reduireTableau(
  valeurs: unknown[],
  max: number,
  emballer: (garde: unknown[], omis: number) => unknown
): string | null {
  for (let garde = valeurs.length - 1; garde >= 0; garde -= 1) {
    const json = JSON.stringify(
      emballer(valeurs.slice(0, garde), valeurs.length - garde)
    )
    if (json.length <= max) return json
  }
  return null
}

/**
 * Sérialise `value` en `max` caractères au plus. Un tableau trop long perd
 * ses derniers éléments (le nombre omis est dit) ; sinon, la sortie est
 * remplacée par une mention « omis ». Jamais un JSON coupé au milieu.
 */
export function bornerJson(value: unknown, max: number): string {
  const json = JSON.stringify(value ?? null)
  if (json.length <= max) return json
  if (Array.isArray(value)) {
    return (
      reduireTableau(value, max, (garde, omis) => [
        ...garde,
        { elementsOmis: omis },
      ]) ?? JSON.stringify(SORTIE_OMISE)
    )
  }
  // Un objet : ses tableaux raccourcissent, le plus lourd d'abord ; s'il ne
  // suffit pas de le vider, on passe au suivant.
  let courant = recordOf(value)
  const tableaux = Object.entries(courant)
    .filter(([, valeur]) => Array.isArray(valeur))
    .sort(
      ([, a], [, b]) => JSON.stringify(b).length - JSON.stringify(a).length
    )
  for (const [cle, valeur] of tableaux) {
    const base = courant
    const reduit = reduireTableau(valeur as unknown[], max, (garde, omis) => ({
      ...base,
      [cle]: garde,
      [`${cle}Omis`]: omis,
    }))
    if (reduit) return reduit
    courant = { ...base, [cle]: [], [`${cle}Omis`]: (valeur as unknown[]).length }
  }
  return JSON.stringify(SORTIE_OMISE)
}

/** L'essentiel d'une recherche : ce qu'il faut pour répondre et réserver. */
function reduireRecherche(output: unknown): unknown {
  const recherche = recordOf(output)
  const trajets = Array.isArray(recherche.trips) ? recherche.trips : []
  return {
    ...choisir(recherche, [
      "originStationId",
      "destinationStationId",
      "serviceDate",
      "passengers",
    ]),
    trips: trajets.slice(0, TRAJETS_REJOUES_MAX).map((trajet) =>
      choisir(trajet, [
        "tripId",
        "trainNumber",
        "trainType",
        "departureTime",
        "arrivalTime",
        "cancelled",
        "hasAvailability",
        "availableByClass",
        "prixParClasse",
      ])
    ),
    ...(trajets.length > TRAJETS_REJOUES_MAX
      ? { tripsOmis: trajets.length - TRAJETS_REJOUES_MAX }
      : {}),
  }
}

function heureLocale(valeur: unknown): string | null {
  return typeof valeur === "number" ? toLocalTime(valeur) : null
}

/**
 * L'essentiel d'une desserte (`get_trip`) : le train, ses arrêts en heures de
 * Libreville et les places libres par classe, une valeur par tronçon (dans
 * l'ordre des arrêts). Les documents bruts de la base n'y figurent plus.
 */
function reduireDesserte(output: unknown): unknown {
  const desserte = recordOf(output)
  const arrets = Array.isArray(desserte.stops) ? desserte.stops : []
  const disponibilites = Array.isArray(desserte.availability)
    ? desserte.availability
    : []
  const parClasse: Record<string, number[]> = {}
  for (const compteur of disponibilites) {
    const { serviceClass, segmentIndex, available } = recordOf(compteur)
    if (
      typeof serviceClass !== "string" ||
      typeof segmentIndex !== "number" ||
      typeof available !== "number"
    ) {
      continue
    }
    ;(parClasse[serviceClass] ??= [])[segmentIndex] = available
  }
  return {
    trip: choisir(desserte.trip, [
      "trainNumber",
      "trainType",
      "serviceDate",
      "status",
      "delayMinutes",
    ]),
    stops: arrets.map((arret) => {
      const etape = recordOf(arret)
      return {
        stationId: etape.stationId,
        name: recordOf(etape.station).name ?? null,
        arrivalTime: heureLocale(etape.arrivalAt),
        departureTime: heureLocale(etape.departureAt),
      }
    }),
    availableBySegment: parClasse,
  }
}

const REDUCTEURS: Readonly<Record<string, (output: unknown) => unknown>> = {
  search_trips: reduireRecherche,
  get_trip: reduireDesserte,
}

/** La sortie projetée d'un outil, réduite et bornée pour le rejeu (JSON). */
export function reduirePourRejeu(toolName: string, output: unknown): string {
  const reduire = REDUCTEURS[toolName]
  return bornerJson(reduire ? reduire(output) : output, SORTIE_REJEU_MAX)
}

/**
 * L'enregistrement d'un appel du tour, ou `null` s'il ne se rejoue pas
 * (sortie éphémère, erreur, entrée démesurée).
 */
export function appelAEnregistrer(params: {
  callId: string
  toolName: string
  input: unknown
  result: { status: "ok"; output: unknown } | { status: "approval_required" }
  actorKey: string
}): AppelEnregistre | null {
  if (politiqueRejeu(params.toolName) === "jamais") return null
  const inputJson = JSON.stringify(params.input ?? {})
  if (inputJson.length > ENTREE_REJEU_MAX) return null
  return {
    callId: params.callId,
    toolName: params.toolName,
    inputJson,
    ...(params.result.status === "ok"
      ? { outputJson: reduirePourRejeu(params.toolName, params.result.output) }
      : {}),
    status: params.result.status,
    actorKey: params.actorKey,
  }
}

/** Ce que le modèle relit d'une confirmation, selon son état ACTUEL. */
function sortieConfirmation(
  appel: AppelEnregistre,
  execution: EtatExecution | undefined,
  expiree: boolean
): unknown {
  switch (execution?.status) {
    case "approval_required":
      // Les boutons d'une messagerie expirent : une confirmation restée
      // sans réponse se repropose, sans quoi le voyageur serait bloqué.
      return expiree
        ? {
            status: "expired",
            message:
              "Les boutons de confirmation ont expiré sans réponse. Si le voyageur veut toujours cette action, appelle de nouveau l'outil.",
          }
        : {
            status: "approval_required",
            message:
              "Confirmation toujours ouverte : elle reste valable tant que le voyageur ne l'a ni confirmée ni annulée. Ne rappelle pas cet outil pour la même action.",
          }
    case "succeeded":
      return {
        status: "confirmed",
        result: JSON.parse(
          reduirePourRejeu(
            appel.toolName,
            execution.outputJson ? JSON.parse(execution.outputJson) : null
          )
        ),
      }
    case "rejected":
      return { status: "rejected", message: "Le voyageur a annulé cette action." }
    case "failed":
      return {
        status: "error",
        message: execution.error ?? "Cette action a échoué.",
      }
    case "running":
      return { status: "running", message: "Action en cours d'exécution." }
    default:
      return undefined
  }
}

type ContexteRejeu = {
  executions: Readonly<Record<string, EtatExecution | undefined>>
  acteurCourant: string
  outilsDisponibles: ReadonlySet<string>
  maintenant: number
  expirationConfirmationMs?: number
}

/** La sortie à rejouer pour cet appel, ou `undefined` s'il ne se rejoue pas. */
function sortieRejouee(
  appel: AppelEnregistre,
  tour: TourHistorique,
  contexte: ContexteRejeu
): unknown {
  if (!contexte.outilsDisponibles.has(appel.toolName)) return undefined
  const politique = politiqueRejeu(appel.toolName)
  if (politique === "jamais") return undefined
  const memeActeur = appel.actorKey === contexte.acteurCourant
  if (appel.status === "approval_required") {
    // Une action engageante n'est jamais rappelée à un autre acteur.
    const expiree =
      contexte.expirationConfirmationMs !== undefined &&
      contexte.maintenant - tour.createdAt > contexte.expirationConfirmationMs
    return memeActeur
      ? sortieConfirmation(appel, contexte.executions[appel.callId], expiree)
      : undefined
  }
  if (politique === "acteur" && !memeActeur) return undefined
  return appel.outputJson === undefined
    ? undefined
    : (JSON.parse(appel.outputJson) as unknown)
}

export type MessageHistorique = {
  role: "user" | "assistant" | "tool"
  content: string
  requestId?: string
  status?: "en_cours" | "termine" | "erreur"
}

export type TourHistorique = {
  requestId: string
  createdAt: number
  toolCalls?: AppelEnregistre[]
}

/**
 * L'historique du modèle : les messages texte terminés, et, juste avant la
 * réponse de chaque tour récent, ses appels d'outils rejouables.
 */
export function construireHistorique(params: {
  /** Messages de la conversation, dans l'ordre chronologique. */
  messages: MessageHistorique[]
  tours: TourHistorique[]
  /** État actuel des exécutions confirmables, par `callId`. */
  executions: Readonly<Record<string, EtatExecution | undefined>>
  acteurCourant: string
  outilsDisponibles: ReadonlySet<string>
  maintenant: number
  /**
   * Durée de validité d'une confirmation (boutons d'une messagerie). Absente
   * sur le site : la carte reste valable tant qu'elle n'est pas tranchée.
   */
  expirationConfirmationMs?: number
}): HistoryEntry[] {
  // Une réponse en cours d'écriture ou interrompue n'est pas un échange :
  // le modèle ne la relit pas.
  const visibles = params.messages.filter(
    (message) =>
      (message.role === "user" || message.role === "assistant") &&
      message.status !== "en_cours" &&
      message.status !== "erreur"
  )
  const reponses = new Set(
    visibles
      .filter((message) => message.role === "assistant" && message.requestId)
      .map((message) => message.requestId!)
  )
  const recents = params.tours
    .filter(
      (tour) =>
        (tour.toolCalls?.length ?? 0) > 0 &&
        reponses.has(tour.requestId) &&
        params.maintenant - tour.createdAt <= AGE_MAX_REJEU_MS
    )
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, TOURS_REJOUES)

  const rejouesParRequete = new Map<string, ReplayedToolCall[]>()
  let budget = BUDGET_REJEU
  budget: for (const tour of recents) {
    const appels: ReplayedToolCall[] = []
    for (const appel of tour.toolCalls ?? []) {
      const output = sortieRejouee(appel, tour, params)
      if (output === undefined) continue
      const taille = appel.inputJson.length + JSON.stringify(output).length
      if (taille > budget) {
        if (appels.length > 0) rejouesParRequete.set(tour.requestId, appels)
        break budget
      }
      budget -= taille
      appels.push({
        callId: appel.callId,
        name: appel.toolName,
        input: JSON.parse(appel.inputJson) as unknown,
        output,
      })
    }
    if (appels.length > 0) rejouesParRequete.set(tour.requestId, appels)
  }

  // Une confirmation encore ouverte se relit toujours, hors fenêtre et hors
  // budget (elle est petite) : sinon le modèle la reproposerait, et le
  // voyageur aurait deux cartes valides pour la même action.
  for (const tour of params.tours) {
    if (!reponses.has(tour.requestId)) continue
    for (const appel of tour.toolCalls ?? []) {
      if (
        appel.status !== "approval_required" ||
        params.executions[appel.callId]?.status !== "approval_required"
      ) {
        continue
      }
      const deja = rejouesParRequete.get(tour.requestId) ?? []
      if (deja.some((rejoue) => rejoue.callId === appel.callId)) continue
      const output = sortieRejouee(appel, tour, params)
      if (output === undefined) continue
      rejouesParRequete.set(tour.requestId, [
        ...deja,
        {
          callId: appel.callId,
          name: appel.toolName,
          input: JSON.parse(appel.inputJson) as unknown,
          output,
        },
      ])
    }
  }

  const historique: HistoryEntry[] = []
  for (const message of visibles) {
    const rejoues =
      message.role === "assistant" && message.requestId
        ? rejouesParRequete.get(message.requestId)
        : undefined
    if (rejoues) {
      historique.push({ role: "tools", calls: rejoues })
      rejouesParRequete.delete(message.requestId!)
    }
    historique.push({
      role: message.role as "user" | "assistant",
      content: message.content,
    })
  }
  return historique
}
