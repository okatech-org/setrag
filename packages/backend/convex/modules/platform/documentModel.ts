export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024
export const MAX_DOCUMENT_VERSIONS_PER_READ = 100
export const MAX_DOCUMENTS_PER_LIST = 100

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i
const MIME_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i
const ENTITY_TYPE_PATTERN = /^[a-z][a-z0-9._-]{0,119}$/i

export function requiredDocumentText(
  value: string,
  label: string,
  maximum: number
): string {
  const normalized = value.trim()
  if (
    normalized.length === 0 ||
    normalized.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new Error(
      `${label} doit contenir entre 1 et ${maximum} caractères sans caractère de contrôle.`
    )
  }
  return normalized
}

export function normalizedEntityType(value: string): string {
  const normalized = value.trim()
  if (!ENTITY_TYPE_PATTERN.test(normalized)) {
    throw new Error(
      "Le type d'entité doit contenir 1 à 120 lettres, chiffres, points, tirets ou soulignés."
    )
  }
  return normalized
}

export function normalizedEntityId(value: string): string {
  return requiredDocumentText(value, "L'identifiant d'entité", 200)
}

export function normalizedFileName(value: string): string {
  const normalized = requiredDocumentText(value, "Le nom du fichier", 255)
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new Error("Le nom du fichier ne doit pas contenir de chemin.")
  }
  return normalized
}

export function normalizedMimeType(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!MIME_TYPE_PATTERN.test(normalized)) {
    throw new Error("Le type MIME du fichier est invalide.")
  }
  if (
    !ALLOWED_DOCUMENT_MIME_TYPES.includes(
      normalized as (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number]
    )
  ) {
    throw new Error("Ce type de fichier n'est pas autorisé.")
  }
  return normalized
}

export function validDocumentSize(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_DOCUMENT_SIZE_BYTES
  ) {
    throw new Error(
      `La taille du fichier doit être comprise entre 1 et ${MAX_DOCUMENT_SIZE_BYTES} octets.`
    )
  }
  return value
}

export function normalizedSha256(
  value: string | undefined
): string | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim().toLowerCase()
  if (!SHA256_HEX_PATTERN.test(normalized)) {
    throw new Error(
      "L'empreinte SHA-256 doit contenir exactement 64 caractères hexadécimaux."
    )
  }
  return normalized
}

/**
 * Convex expose l'empreinte du stockage en base64, alors que l'API
 * documentaire utilise une représentation hexadécimale stable et lisible.
 * Accepter également l'hexadécimal rend la conversion compatible avec les
 * environnements qui exposeraient déjà cette forme canonique.
 */
export function normalizedStoredSha256(value: string): string {
  const normalized = value.trim()
  if (SHA256_HEX_PATTERN.test(normalized)) return normalized.toLowerCase()

  const base64 = normalized.replace(/-/g, "+").replace(/_/g, "/")
  const paddedBase64 = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "="
  )
  try {
    const bytes = atob(paddedBase64)
    if (bytes.length !== 32) throw new Error("invalid digest length")
    return Array.from(bytes, (byte) =>
      byte.charCodeAt(0).toString(16).padStart(2, "0")
    ).join("")
  } catch {
    throw new Error("L'empreinte SHA-256 du stockage est invalide.")
  }
}

export function boundedDocumentLimit(
  value: number | undefined,
  maximum: number,
  defaultValue: number
): number {
  if (value === undefined) return defaultValue
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(
      `La limite doit être un entier compris entre 1 et ${maximum}.`
    )
  }
  return value
}
