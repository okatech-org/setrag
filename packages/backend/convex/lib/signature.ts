import * as ed from "@noble/ed25519"
import { sha512 } from "@noble/hashes/sha512"
import {
  composeBarcode,
  parseBarcode,
  serializePayload,
  type TicketPayload,
} from "../model/barcode"

/**
 * Signature des titres de transport.
 *
 * Ed25519 plutôt qu'ECDSA pour deux raisons : les signatures sont
 * DÉTERMINISTES — pas de générateur aléatoire, donc pas de risque de fuite de
 * clé par entropie faible, qui est le mode d'échec historique de DSA — et la
 * vérification est assez rapide pour un contrôleur qui scanne en rafale.
 *
 * Le déterminisme a une seconde vertu ici : une mutation Convex peut être
 * rejouée à l'identique en cas de conflit de concurrence. Une signature
 * aléatoire produirait un résultat différent à chaque rejeu.
 *
 * La clé privée vit dans une variable d'environnement du déploiement, jamais
 * en base. La clé publique, elle, est distribuée aux terminaux contrôleurs :
 * c'est ce qui leur permet de vérifier un titre sans réseau.
 */

/**
 * `@noble/ed25519` v2 délègue le hachage à l'appelant afin de rester sans
 * dépendance. Sans ce branchement, seules les variantes asynchrones existent
 * — or une mutation Convex signe de façon synchrone.
 */
ed.etc.sha512Sync = (...messages: Uint8Array[]) =>
  sha512(ed.etc.concatBytes(...messages))

/** Version courante de la clé, pour permettre une rotation sans rupture. */
export const CURRENT_KEY_VERSION = 1

/** Nom de la variable d'environnement portant la clé privée. */
const PRIVATE_KEY_ENV = "BARCODE_SIGNING_KEY_V1"

/**
 * Clé de démonstration.
 *
 * Utilisée UNIQUEMENT si la variable d'environnement est absente, pour que le
 * système reste démontrable sans configuration. Elle est publique par nature
 * — elle figure dans le dépôt — donc les titres qu'elle signe n'ont aucune
 * valeur probante. Poser `BARCODE_SIGNING_KEY_V1` avant toute mise en
 * service réelle.
 */
const DEMO_PRIVATE_KEY_HEX =
  "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"

/** Vrai si le déploiement signe avec la clé de démonstration. */
export function isUsingDemoKey(): boolean {
  return !process.env[PRIVATE_KEY_ENV]
}

function privateKey(): Uint8Array {
  const hex = process.env[PRIVATE_KEY_ENV] ?? DEMO_PRIVATE_KEY_HEX
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      `${PRIVATE_KEY_ENV} invalide : 64 caractères hexadécimaux attendus ` +
        `(32 octets)`,
    )
  }
  return hexToBytes(hex)
}

/** Clé publique du déploiement, à embarquer dans l'application contrôleur. */
export function publicKeyHex(): string {
  return bytesToHex(ed.getPublicKey(privateKey()))
}

/** Signe une charge utile et retourne la chaîne complète du code-barres. */
export function signTicket(payload: TicketPayload): {
  barcode: string
  signatureHex: string
  keyVersion: number
} {
  const bytes = serializePayload(payload)
  const signature = ed.sign(bytes, privateKey())
  return {
    barcode: composeBarcode(bytes, signature),
    signatureHex: bytesToHex(signature),
    keyVersion: payload.k,
  }
}

/** Résultat d'une vérification cryptographique. */
export interface SignatureCheck {
  readonly authentic: boolean
  readonly payload: TicketPayload | null
  readonly error: string | null
}

/**
 * Vérifie l'authenticité d'un code-barres.
 *
 * Un échec ne distingue pas la contrefaçon de la corruption : dans les deux
 * cas le titre est refusé. Le message est conservé pour le journal, pas pour
 * être montré au voyageur.
 */
export function verifyBarcode(
  barcode: string,
  publicKey?: Uint8Array,
): SignatureCheck {
  try {
    const { payload, payloadBytes, signature } = parseBarcode(barcode)

    // Une clé retirée du service n'est pas une contrefaçon. Sans cette
    // distinction, une rotation ferait passer d'un coup tous les titres en
    // circulation pour des faux, et le terrain n'aurait aucun moyen de le
    // comprendre.
    if (publicKey === undefined && payload.k !== CURRENT_KEY_VERSION) {
      return {
        authentic: false,
        payload: null,
        error: `Version de clé ${payload.k} hors service`,
      }
    }

    const key = publicKey ?? ed.getPublicKey(privateKey())
    const authentic = ed.verify(signature, payloadBytes, key)
    return {
      authentic,
      payload: authentic ? payload : null,
      error: authentic ? null : "Signature non valide",
    }
  } catch (error) {
    return {
      authentic: false,
      payload: null,
      error: (error as Error).message,
    }
  }
}

/* ─────────────────────────────── Utilitaires ───────────────────────────── */

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
}
