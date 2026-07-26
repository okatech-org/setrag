/**
 * Charge utile du code-barres d'un titre de transport — logique pure.
 *
 * Objectif : un contrôleur doit pouvoir vérifier un titre SANS RÉSEAU, dans
 * un tunnel. Le titre est donc auto-porteur : il contient tout ce qu'il faut
 * pour établir son authenticité et sa portée, et une signature qui interdit
 * de le fabriquer.
 *
 * Format : CBOR → Base45 → code-barres 2D.
 *
 * Choix de conception, et ce qu'ils écartent :
 *
 *  — CBOR plutôt que JSON : sérialisation binaire compacte et déterministe.
 *    Le déterminisme n'est pas cosmétique, c'est une condition de la
 *    signature — deux sérialisations différentes du même contenu
 *    produiraient des signatures différentes.
 *
 *  — Base45 plutôt que Base64 : les codes-barres 2D disposent d'un mode
 *    alphanumérique à 45 caractères nettement plus dense que le mode octet.
 *    C'est l'encodage retenu par le certificat sanitaire européen, pour la
 *    même raison.
 *
 *  — PAS de compression. Le plan initial prévoyait un passage par zlib, sur
 *    le modèle du certificat européen. À l'usage la charge utile fait moins
 *    de 120 octets : à cette taille, l'en-tête de compression coûte plus
 *    qu'il ne rapporte. La compression est donc volontairement omise.
 */

/* ═══════════════════════ Structure de la charge utile ════════════════════ */

/** Version du format, pour permettre son évolution. */
export const PAYLOAD_VERSION = 1

/** Nature du titre présenté au contrôle. */
export type TitleKind = "billet" | "abonnement"

/**
 * Contenu signé d'un titre.
 *
 * Volontairement minimal : aucune donnée personnelle n'y figure. Le nom du
 * voyageur vient du manifeste embarqué, pas du code-barres — un titre perdu
 * ne doit rien révéler de son porteur.
 */
export interface TicketPayload {
  /** Version du format. */
  readonly v: number
  /** Version de la clé de signature, pour permettre la rotation. */
  readonly k: number
  readonly kind: TitleKind
  /** Numéro du titre. */
  readonly ref: string
  /** Identifiant de la desserte. */
  readonly trip: string
  /** Date de circulation, au format AAAA-MM-JJ. */
  readonly date: string
  /** Classe de service. */
  readonly cls: string
  /** Indice de l'arrêt de montée. */
  readonly from: number
  /** Indice de l'arrêt de descente. */
  readonly to: number
  /** Place attribuée, absente pour un billet debout. */
  readonly seat?: string
  /** Horodatage d'expiration, en secondes. */
  readonly exp: number
}

/* ═════════════════════════════ CBOR ═════════════════════════════════════ */

/**
 * Encodeur CBOR minimal, restreint au sous-ensemble utile ici : entiers
 * positifs, chaînes, et associations à clés textuelles.
 *
 * Écrire cet encodeur plutôt que d'ajouter une dépendance tient à deux
 * raisons : le déterminisme est ici une exigence de sécurité, et il est plus
 * facile à garantir sur cent lignes lisibles que sur une bibliothèque
 * généraliste ; et le sous-ensemble nécessaire est minuscule.
 *
 * Les clés sont triées par ordre lexicographique, ce qui rend l'encodage
 * canonique : même contenu, mêmes octets, même signature.
 */
export function encodeCbor(value: CborValue): Uint8Array {
  const out: number[] = []
  writeValue(out, value)
  return new Uint8Array(out)
}

export type CborValue =
  | number
  | string
  | boolean
  | null
  | CborValue[]
  | { [key: string]: CborValue | undefined }

function writeValue(out: number[], value: CborValue): void {
  if (value === null) {
    out.push(0xf6)
    return
  }
  if (typeof value === "boolean") {
    out.push(value ? 0xf5 : 0xf4)
    return
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(
        `CBOR : seuls les entiers sont pris en charge, reçu ${value}`,
      )
    }
    if (value >= 0) writeHead(out, 0, value)
    else writeHead(out, 1, -value - 1)
    return
  }
  if (typeof value === "string") {
    const bytes = utf8Encode(value)
    writeHead(out, 3, bytes.length)
    for (const b of bytes) out.push(b)
    return
  }
  if (Array.isArray(value)) {
    writeHead(out, 4, value.length)
    for (const item of value) writeValue(out, item)
    return
  }
  // Association : clés triées pour un encodage canonique.
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  writeHead(out, 5, entries.length)
  for (const [key, item] of entries) {
    writeValue(out, key)
    writeValue(out, item as CborValue)
  }
}

/** Écrit l'en-tête CBOR : type majeur sur 3 bits, longueur sur 5 bits. */
function writeHead(out: number[], major: number, length: number): void {
  const type = major << 5
  if (length < 24) {
    out.push(type | length)
  } else if (length < 0x100) {
    out.push(type | 24, length)
  } else if (length < 0x10000) {
    out.push(type | 25, length >> 8, length & 0xff)
  } else if (length <= 0xffffffff) {
    out.push(
      type | 26,
      (length >>> 24) & 0xff,
      (length >>> 16) & 0xff,
      (length >>> 8) & 0xff,
      length & 0xff,
    )
  } else {
    throw new Error(`CBOR : longueur non représentable (${length})`)
  }
}

/** Décodeur CBOR du même sous-ensemble, pour la vérification hors ligne. */
export function decodeCbor(bytes: Uint8Array): CborValue {
  const state = { bytes, offset: 0 }
  const value = readValue(state)
  if (state.offset !== bytes.length) {
    throw new Error("CBOR : octets excédentaires après la valeur")
  }
  return value
}

interface ReadState {
  bytes: Uint8Array
  offset: number
}

function readValue(state: ReadState): CborValue {
  const initial = next(state)
  const major = initial >> 5
  const info = initial & 0x1f

  if (initial === 0xf6) return null
  if (initial === 0xf5) return true
  if (initial === 0xf4) return false

  const length = readLength(state, info)
  switch (major) {
    case 0:
      return length
    case 1:
      return -length - 1
    case 3: {
      const slice = state.bytes.subarray(state.offset, state.offset + length)
      state.offset += length
      return utf8Decode(slice)
    }
    case 4: {
      const items: CborValue[] = []
      for (let i = 0; i < length; i += 1) items.push(readValue(state))
      return items
    }
    case 5: {
      const map: Record<string, CborValue> = {}
      for (let i = 0; i < length; i += 1) {
        const key = readValue(state)
        if (typeof key !== "string") {
          throw new Error("CBOR : clé d'association non textuelle")
        }
        map[key] = readValue(state)
      }
      return map
    }
    default:
      throw new Error(`CBOR : type majeur ${major} non pris en charge`)
  }
}

function readLength(state: ReadState, info: number): number {
  if (info < 24) return info
  if (info === 24) return next(state)
  if (info === 25) return (next(state) << 8) | next(state)
  if (info === 26) {
    return (
      next(state) * 0x1000000 +
      (next(state) << 16) +
      (next(state) << 8) +
      next(state)
    )
  }
  throw new Error(`CBOR : information additionnelle ${info} non gérée`)
}

function next(state: ReadState): number {
  if (state.offset >= state.bytes.length) {
    throw new Error("CBOR : fin de données inattendue")
  }
  return state.bytes[state.offset++]!
}

/* ═════════════════════════════ Base45 ═══════════════════════════════════ */

/** Alphabet Base45 de la RFC 9285. */
export const BASE45_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"

/**
 * Encode des octets en Base45.
 *
 * Deux octets deviennent trois caractères, un octet isolé en devient deux.
 * L'alphabet est celui du mode alphanumérique des codes-barres 2D, ce qui
 * évite au symbole de basculer en mode octet, bien moins dense.
 */
export function encodeBase45(bytes: Uint8Array): string {
  let out = ""
  let i = 0
  for (; i + 1 < bytes.length; i += 2) {
    const value = bytes[i]! * 256 + bytes[i + 1]!
    const c = Math.floor(value / (45 * 45))
    const rest = value % (45 * 45)
    out +=
      BASE45_ALPHABET[rest % 45]! +
      BASE45_ALPHABET[Math.floor(rest / 45)]! +
      BASE45_ALPHABET[c]!
  }
  if (i < bytes.length) {
    const value = bytes[i]!
    out += BASE45_ALPHABET[value % 45]! + BASE45_ALPHABET[Math.floor(value / 45)]!
  }
  return out
}

export function decodeBase45(text: string): Uint8Array {
  const values: number[] = []
  for (const ch of text) {
    const index = BASE45_ALPHABET.indexOf(ch)
    if (index === -1) {
      throw new Error(`Base45 : caractère invalide « ${ch} »`)
    }
    values.push(index)
  }
  if (values.length % 3 === 1) {
    throw new Error("Base45 : longueur invalide")
  }

  const out: number[] = []
  let i = 0
  for (; i + 2 < values.length; i += 3) {
    const value = values[i]! + values[i + 1]! * 45 + values[i + 2]! * 45 * 45
    if (value > 0xffff) throw new Error("Base45 : valeur hors bornes")
    out.push(value >> 8, value & 0xff)
  }
  if (i < values.length) {
    const value = values[i]! + values[i + 1]! * 45
    if (value > 0xff) throw new Error("Base45 : valeur hors bornes")
    out.push(value)
  }
  return new Uint8Array(out)
}

/* ══════════════════ Composition et lecture du titre ═════════════════════ */

/** Sérialise la charge utile signable, en octets canoniques. */
export function serializePayload(payload: TicketPayload): Uint8Array {
  assertPayload(payload)
  return encodeCbor(payload as unknown as CborValue)
}

/** Relit une charge utile depuis ses octets. */
export function deserializePayload(bytes: Uint8Array): TicketPayload {
  const decoded = decodeCbor(bytes)
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    throw new Error("Charge utile invalide : association attendue")
  }
  const payload = decoded as unknown as TicketPayload
  assertPayload(payload)
  return payload
}

/**
 * Assemble la chaîne finale du code-barres.
 *
 * Le préfixe `SETRAG1:` identifie l'émetteur et la version du conteneur : un
 * scanner qui lit un code étranger le rejette immédiatement, sans tenter de
 * le déchiffrer.
 */
export const BARCODE_PREFIX = "SETRAG1:"

export function composeBarcode(
  payloadBytes: Uint8Array,
  signature: Uint8Array,
): string {
  if (signature.length !== 64) {
    throw new Error(
      `Signature Ed25519 invalide : ${signature.length} octets au lieu de 64`,
    )
  }
  const joined = new Uint8Array(payloadBytes.length + signature.length)
  joined.set(payloadBytes, 0)
  joined.set(signature, payloadBytes.length)
  return BARCODE_PREFIX + encodeBase45(joined)
}

/** Sépare la chaîne du code-barres en charge utile et signature. */
export function parseBarcode(text: string): {
  payload: TicketPayload
  payloadBytes: Uint8Array
  signature: Uint8Array
} {
  if (!text.startsWith(BARCODE_PREFIX)) {
    throw new Error("Code-barres étranger : préfixe SETRAG absent")
  }
  const joined = decodeBase45(text.slice(BARCODE_PREFIX.length))
  if (joined.length <= 64) {
    throw new Error("Code-barres tronqué : signature absente")
  }
  const payloadBytes = joined.subarray(0, joined.length - 64)
  const signature = joined.subarray(joined.length - 64)
  return {
    payload: deserializePayload(payloadBytes),
    payloadBytes,
    signature,
  }
}

/* ══════════════════════ Vérification de portée ══════════════════════════ */

/**
 * Délai de grâce après l'arrivée, en heures.
 *
 * Le code-barres reste vérifiable au-delà du terminus : un contrôle de
 * recettes, une réclamation ou un litige se traitent après coup, et un titre
 * illisible à ce moment-là ne prouve plus rien. Six heures couvrent la fin de
 * la journée d'exploitation sans allonger la fenêtre de réutilisation d'un
 * titre volé — celle-ci est de toute façon fermée par le manifeste, qui
 * marque le titre comme déjà contrôlé.
 */
export const EXPIRY_GRACE_HOURS = 6

/** Échéance du code-barres, en secondes, à partir de l'arrivée prévue. */
export function expiryFromArrival(arrivalAtMs: number): number {
  return Math.floor(arrivalAtMs / 1000) + EXPIRY_GRACE_HOURS * 3600
}

/** Motifs de refus d'un titre, alignés sur l'écran de résultat CM-05. */
export type ScopeVerdict =
  | "valide"
  | "mauvaise_desserte"
  | "hors_segment"
  | "expire"

/**
 * Vérifie qu'un titre couvre bien le contrôle en cours.
 *
 * Cette vérification est purement locale : elle n'a besoin ni de réseau ni
 * du manifeste. Elle établit que le titre a été émis pour CETTE desserte,
 * qu'il couvre le segment où le contrôle a lieu, et qu'il n'est pas périmé.
 * Le statut fin — annulé, remboursé, déjà contrôlé — relève du manifeste.
 */
export function verifyScope(
  payload: TicketPayload,
  context: {
    tripId: string
    /** Indice de l'arrêt le plus récemment desservi. */
    currentStopIndex: number
    /** Instant du contrôle, en secondes. */
    nowSeconds: number
  },
): ScopeVerdict {
  if (payload.trip !== context.tripId) return "mauvaise_desserte"
  if (payload.exp < context.nowSeconds) return "expire"
  // Le voyageur doit être entre sa gare de montée et sa gare de descente.
  if (
    context.currentStopIndex < payload.from ||
    context.currentStopIndex >= payload.to
  ) {
    return "hors_segment"
  }
  return "valide"
}

/* ─────────────────────────────── Utilitaires ───────────────────────────── */

function assertPayload(payload: TicketPayload): void {
  if (payload.v !== PAYLOAD_VERSION) {
    throw new Error(
      `Version de format inconnue : ${payload.v} (attendue ${PAYLOAD_VERSION})`,
    )
  }
  if (!Number.isInteger(payload.k) || payload.k < 1) {
    throw new Error(`Version de clé invalide : ${payload.k}`)
  }
  if (payload.kind !== "billet" && payload.kind !== "abonnement") {
    throw new Error(`Nature de titre inconnue : ${payload.kind}`)
  }
  if (!payload.ref) throw new Error("Numéro de titre absent")
  if (!payload.trip) throw new Error("Desserte absente")
  if (!Number.isInteger(payload.from) || payload.from < 0) {
    throw new Error(`Arrêt de montée invalide : ${payload.from}`)
  }
  if (!Number.isInteger(payload.to) || payload.to <= payload.from) {
    throw new Error(
      `Arrêt de descente invalide : ${payload.to} (montée ${payload.from})`,
    )
  }
}

function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}
