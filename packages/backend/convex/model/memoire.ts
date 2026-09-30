/**
 * Ce que Ruban retient d'un voyageur : règles pures.
 *
 * Une note est un fait court, durable et utile aux prochains voyages
 * (« Préfère la 1re classe. », « Va souvent d'Owendo à Franceville. »),
 * rattaché à un COMPTE — jamais à un invité — et valable sur le site,
 * l'application et les messageries reliées.
 *
 * Le filtrage est fait ici, côté serveur, quoi que dise le modèle : les
 * instructions de Ruban lui interdisent déjà de noter une donnée sensible,
 * mais une consigne ne suffit pas à le garantir. Une note refusée n'est pas
 * tronquée ni nettoyée : elle n'est pas enregistrée du tout, et le modèle
 * reçoit la raison.
 */

export const CATEGORIES_NOTE = [
  "preference",
  "trajet",
  "compagnon",
  "contrainte",
  "rappel",
  "autre",
] as const

export type CategorieNote = (typeof CATEGORIES_NOTE)[number]

/** Longueur maximale d'une note : une phrase. */
export const NOTE_LONGUEUR_MAX = 200

/** Notes conservées par compte : au-delà, la plus ancienne cède la place. */
export const NOTES_PAR_COMPTE_MAX = 50

/** Notes transmises au modèle à chaque tour, les plus récentes d'abord. */
export const NOTES_TRANSMISES_MAX = 30

export type VerdictNote =
  | { ok: true; texte: string; cle: string }
  | { ok: false; raison: string }

const REFUS_SENSIBLE =
  "Ruban ne retient ni pièce d'identité, ni numéro, ni code, ni moyen de paiement, ni coordonnées, ni information de santé ou d'opinion. Rien n'a été noté."

/** Minuscules, sans accents ni apostrophes typographiques : pour comparer. */
function aPlat(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’`´]/g, "'")
}

/** Clé de dédoublonnage : deux notes au même contenu n'en font qu'une. */
export function cleDeNote(texte: string): string {
  return aPlat(texte)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

/*
 * Ce qu'une note ne porte jamais. Mots recherchés dans le texte mis à plat
 * (minuscules, sans accents). Les faux positifs sont acceptés : mieux vaut
 * une note refusée qu'une donnée sensible conservée.
 */
const MOTS_INTERDITS: RegExp[] = [
  // Codes et secrets
  /\bmots? de passe\b/,
  /\bmdp\b/,
  /\bcodes? (secret|pin|otp|confidentiel|d'acces|dacces|de connexion|de verification|de validation|de securite)s?\b/,
  /\bpin\b/,
  /\botp\b/,
  /\bcvv\b|\bcvc\b|\bcryptogramme\b/,
  // Moyens de paiement
  /\bcartes? (bancaire|de credit|de debit|visa|mastercard)s?\b/,
  /\bnumeros? de (carte|compte)\b/,
  /\biban\b|\brib\b/,
  // Pièces d'identité
  /\bpasseports?\b/,
  /\bcartes? (d'identite|nationale d'identite|de sejour|consulaire)s?\b/,
  /\bpieces? d'identite\b/,
  /\bcni\b/,
  /\bpermis de conduire\b/,
  /\bsecurite sociale\b|\bcnamgs\b|\bcnss\b/,
  /\bnumeros? de (piece|document|passeport|dossier medical)\b/,
  // Santé
  /\bsante\b|\bmedic|\bmaladie|\bmalade\b|\bsoins?\b/,
  /\bdiabet|\bvih\b|\bsida\b|\bcancer|\bchimio|\bdialyse/,
  /\benceinte\b|\bgrossesse\b|\ballergi|\basthm|\bepilep/,
  /\bhandicap|\bfauteuil roulant\b|\bpmr\b|\binvalidite\b/,
  /\bhopital\b|\bclinique\b|\bpsych|\bdepression\b|\btraitement\b/,
  // Opinions, croyances, vie privée
  /\breligio|\bmusulman|\bchretien|\bcatholique|\bprotestant|\bjuif|\bjuive\b|\bislam/,
  /\bopinions? politiques?\b|\bpartis? politiques?\b|\bsyndica/,
  /\borientation sexuelle\b|\bhomosexu|\bethni/,
  /\bcasier judiciaire\b|\bcondamn/,
  // Consignes adressées à l'assistant (empoisonnement de la mémoire)
  /\binstructions?\b|\bprompt\b|\bsysteme\b|\bsystem\b/,
  /\bignore[rsz]?\b/,
]

/**
 * Dates (2026-10-01, 01/10/2026), heures (07:40, 7h40) et montants
 * (150 000 FCFA) : autorisés, ils ne comptent pas comme un numéro.
 */
const DATES_HEURES_MONTANTS =
  /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b|\b\d{1,2}\s?[:h]\s?\d{2}\b|\b\d{1,3}(?:[\s.]\d{3})+\s?(?:fcfa|f cfa|xaf|francs?)\b/gi

/**
 * Vérifie une note avant de l'enregistrer. Rend le texte propre (espaces
 * resserrés, une seule ligne) et sa clé de dédoublonnage, ou la raison du
 * refus, destinée au modèle.
 */
export function verifierNote(brut: string): VerdictNote {
  const texte = brut.replace(/\s+/g, " ").trim()
  if (texte.length < 3) {
    return { ok: false, raison: "Note vide : rien n'a été noté." }
  }
  if (texte.length > NOTE_LONGUEUR_MAX) {
    return {
      ok: false,
      raison: `Note trop longue : une phrase de ${NOTE_LONGUEUR_MAX} caractères au plus.`,
    }
  }
  // Balises, accolades, liens : une note est une phrase, pas du code ni une
  // adresse à suivre.
  if (/[<>{}\\]|https?:|www\.|\.[a-z]{2,}\//i.test(texte)) {
    return {
      ok: false,
      raison: "Une note est une phrase simple, sans lien ni balise. Rien n'a été noté.",
    }
  }
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(texte)) {
    return { ok: false, raison: REFUS_SENSIBLE }
  }
  // Six chiffres ou plus, espacés ou non : carte, téléphone, pièce, code.
  const sansDates = texte.replace(DATES_HEURES_MONTANTS, " ")
  if (/\d(?:[\s.-]?\d){5,}/.test(sansDates)) {
    return { ok: false, raison: REFUS_SENSIBLE }
  }
  const plat = aPlat(texte)
  if (MOTS_INTERDITS.some((motif) => motif.test(plat))) {
    return { ok: false, raison: REFUS_SENSIBLE }
  }
  return { ok: true, texte, cle: cleDeNote(texte) }
}

export function estCategorieNote(valeur: unknown): valeur is CategorieNote {
  return (
    typeof valeur === "string" &&
    (CATEGORIES_NOTE as readonly string[]).includes(valeur)
  )
}
