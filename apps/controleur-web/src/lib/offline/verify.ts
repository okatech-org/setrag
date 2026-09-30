/**
 * Vérification d'un titre, entièrement locale.
 *
 * Rien ici n'appelle le réseau, et c'est le point : dans un tunnel entre Booué
 * et Lopé, le terminal doit trancher seul. Il le peut parce que le titre est
 * auto-porteur — il contient sa portée et une signature Ed25519 que la clé
 * publique embarquée suffit à vérifier.
 *
 * On importe le format depuis le backend (`@workspace/backend/barcode`) plutôt
 * que d'en recopier une seconde version : deux implémentations d'un même
 * encodage finissent toujours par diverger, et ici la divergence signifierait
 * refuser des titres authentiques.
 *
 * En revanche on n'importe PAS `convex/lib/signature.ts` : ce module lit la
 * clé PRIVÉE de signature. Elle n'a rien à faire dans un paquet servi au
 * navigateur.
 */

import * as ed from "@noble/ed25519"
import { sha512 } from "@noble/hashes/sha512"
import {
  parseBarcode,
  verifyScope,
  type TicketPayload,
} from "@workspace/backend/barcode"

import { jour } from "../format"
import { leTrain } from "../train"
import type {
  EmbarkedManifest,
  EmbarkedSubscription,
  EmbarkedTicket,
  LocalScan,
  ScanResult,
  Verdict,
} from "./types"

// `@noble/ed25519` v2 délègue le hachage à l'appelant pour rester sans
// dépendance. Sans ce branchement, seules les variantes asynchrones existent
// — or un contrôle en rafale ne peut pas attendre une micro-tâche par scan.
ed.etc.sha512Sync = (...messages: Uint8Array[]) =>
  sha512(ed.etc.concatBytes(...messages))

export interface VerificationContext {
  manifest: EmbarkedManifest
  /** Indice de l'arrêt le plus récemment desservi. */
  currentStopIndex: number
  /** Titre correspondant au code présenté, s'il est au manifeste. */
  ticket?: EmbarkedTicket
  subscription?: EmbarkedSubscription
  /** Contrôles déjà enregistrés sur CE terminal pour ce titre. */
  priorScans?: LocalScan[]
  now?: number
}

export interface VerificationResult {
  verdict: Verdict
  /** Ce que l'agent doit lire pour comprendre le refus. */
  reason: string | null
  payload: TicketPayload | null
  ticket?: EmbarkedTicket
  subscription?: EmbarkedSubscription
  /** Vrai quand la conclusion s'appuie sur le manifeste, pas sur la signature. */
  fromManifest: boolean
  /** Heure du premier contrôle, quand le titre repasse. */
  firstScanAt?: number
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/**
 * Un échec de lecture n'est pas une contrefaçon.
 *
 * Un code froissé, d'un autre émetteur ou tronqué se represente ou se saisit à
 * la main ; une signature fausse, elle, appelle un procès-verbal. Confondre
 * les deux ferait verbaliser des voyageurs de bonne foi.
 */
function readFailureVerdict(message: string): Verdict {
  return /étranger|Base45|tronqué|CBOR|charge utile|Version de format/.test(
    message
  )
    ? "illisible"
    : "contrefait"
}

/**
 * Rend un verdict sur un code présenté au contrôle.
 *
 * L'ordre des contrôles suit leur utilité pour l'agent : d'abord
 * l'authenticité — qui sépare la fraude de l'erreur —, puis la portée, puis
 * ce que le manifeste sait du titre.
 */
export function verifyLocally(
  barcode: string,
  ctx: VerificationContext
): VerificationResult {
  const now = ctx.now ?? Date.now()

  let parsed: ReturnType<typeof parseBarcode>
  try {
    parsed = parseBarcode(barcode)
  } catch (error) {
    const message = (error as Error).message
    return {
      verdict: readFailureVerdict(message),
      reason: message,
      payload: null,
      fromManifest: false,
    }
  }

  const { payload, payloadBytes, signature } = parsed

  // Une clé retirée du service n'est pas une contrefaçon : sans cette
  // distinction, une rotation ferait passer d'un coup tous les titres en
  // circulation pour des faux.
  if (payload.k !== ctx.manifest.signing.keyVersion) {
    return {
      verdict: "cle_hors_service",
      reason: `Version de clé ${payload.k} inconnue du terminal (clé ${ctx.manifest.signing.keyVersion} embarquée)`,
      payload,
      fromManifest: false,
    }
  }

  let authentic = false
  try {
    authentic = ed.verify(
      signature,
      payloadBytes,
      hexToBytes(ctx.manifest.signing.publicKey)
    )
  } catch {
    authentic = false
  }
  if (!authentic) {
    return {
      verdict: "contrefait",
      reason: "Signature non valide — ce code n'a pas été émis par SETRAG",
      payload,
      fromManifest: false,
    }
  }

  const scope = verifyScope(payload, {
    tripId: ctx.manifest.tripId,
    currentStopIndex: ctx.currentStopIndex,
    nowSeconds: Math.floor(now / 1000),
  })
  if (scope !== "valide") {
    return {
      verdict: scope,
      // Le motif nomme la desserte embarquée : deux circulations d'un même
      // train peuvent coexister le même jour (livrets horaires qui se
      // chevauchent), et « mauvaise desserte » seul laisserait l'agent
      // devant un titre qu'il croit — à raison — être celui de son train.
      reason:
        scope === "mauvaise_desserte"
          ? `Ce titre vaut pour une autre circulation que ${leTrain(ctx.manifest)} du ${formatDay(ctx.manifest.departureAt)} embarqué ici. Vérifiez que le manifeste téléchargé est celui de votre train.`
          : SCOPE_REASONS[scope],
      payload,
      ticket: ctx.ticket,
      subscription: ctx.subscription,
      fromManifest: false,
    }
  }

  if (payload.kind === "abonnement") {
    const sub = ctx.subscription
    if (!sub) {
      return {
        verdict: "inconnu",
        reason: `Abonnement ${payload.ref} absent du manifeste embarqué`,
        payload,
        fromManifest: true,
      }
    }
    if (now < sub.validFrom || now > sub.validUntil) {
      return {
        verdict: "expire",
        reason: `Abonnement valable du ${formatDay(sub.validFrom)} au ${formatDay(sub.validUntil)}`,
        payload,
        subscription: sub,
        fromManifest: true,
      }
    }
    const repasse = firstValidScan(ctx.priorScans)
    if (repasse) {
      return {
        verdict: "deja_controle",
        reason: "Cet abonnement a déjà été contrôlé sur ce terminal",
        payload,
        subscription: sub,
        fromManifest: false,
        firstScanAt: repasse.scannedAt,
      }
    }
    return {
      verdict: "abonnement",
      reason: null,
      payload,
      subscription: sub,
      fromManifest: true,
    }
  }

  const ticket = ctx.ticket
  if (!ticket) {
    // La signature est bonne : ce n'est pas une fraude, c'est un manifeste
    // qui ne connaît pas ce titre — acheté après le téléchargement, ou lot
    // manquant. L'écran doit dire lequel des deux.
    return {
      verdict: "inconnu",
      reason: ctx.manifest.complete
        ? `Titre ${payload.ref} émis après le téléchargement du manifeste`
        : `Titre ${payload.ref} absent du manifeste, qui est incomplet`,
      payload,
      fromManifest: true,
    }
  }

  const parStatut: Partial<
    Record<string, { verdict: Verdict; reason: string }>
  > = {
    annule: { verdict: "annule", reason: "Titre annulé" },
    rembourse: { verdict: "rembourse", reason: "Titre remboursé" },
    en_attente: { verdict: "non_paye", reason: "Titre non réglé" },
  }
  const refus = parStatut[ticket.status]
  if (refus) {
    return {
      verdict: refus.verdict,
      reason: `${refus.reason} — information du manifeste embarqué`,
      payload,
      ticket,
      fromManifest: true,
    }
  }

  const repasse = firstValidScan(ctx.priorScans)
  if (repasse) {
    return {
      verdict: "deja_controle",
      reason: "Titre déjà contrôlé sur ce terminal",
      payload,
      ticket,
      fromManifest: false,
      firstScanAt: repasse.scannedAt,
    }
  }
  if (ticket.status === "utilise") {
    return {
      verdict: "deja_controle",
      reason: "Titre déjà contrôlé — information du manifeste embarqué",
      payload,
      ticket,
      fromManifest: true,
    }
  }

  return {
    verdict: "valide",
    reason: null,
    payload,
    ticket,
    fromManifest: false,
  }
}

const SCOPE_REASONS: Record<
  "mauvaise_desserte" | "hors_segment" | "expire",
  string
> = {
  mauvaise_desserte: "Ce titre vaut pour une autre desserte",
  hors_segment: "Le voyageur circule au-delà du parcours payé",
  expire: "Titre expiré",
}

function firstValidScan(scans?: LocalScan[]): LocalScan | undefined {
  return scans
    ?.filter((s) => s.result === "valide")
    .sort((a, b) => a.scannedAt - b.scannedAt)[0]
}

/** « 30/09 », à l'heure de Libreville quel que soit le fuseau du terminal. */
function formatDay(ms: number): string {
  return jour(ms)
}

/**
 * Traduction d'un verdict local vers le résultat consigné par le serveur.
 *
 * Le verdict d'abonnement est le seul à changer de nom : côté système, un
 * abonnement contrôlé est un contrôle valide comme un autre. Tous les autres
 * conservent leur nom, précisément pour qu'un refus reste lisible dans le
 * journal — c'est ce qui distingue un billet froissé d'une contrefaçon.
 */
export function toScanResult(verdict: Verdict): ScanResult {
  switch (verdict) {
    // Un abonnement contrôlé est, pour le système, un contrôle valide.
    case "abonnement":
      return "valide"
    case "contrefait":
      return "signature_invalide"
    default:
      return verdict
  }
}
