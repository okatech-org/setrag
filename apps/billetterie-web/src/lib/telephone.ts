/**
 * Numéros de téléphone saisis par le voyageur.
 *
 * Depuis le 6 avril 2024 (fin de la cohabitation décidée par l'ARCEP), un
 * numéro gabonais s'écrit sur 9 chiffres en national — 077 12 34 56 — et
 * +241 suivi de 8 chiffres à l'international, le 0 initial tombant. On
 * accepte toutes les écritures courantes, espaces et tirets compris, et
 * l'on garde toujours la même forme compacte : +24177123456.
 *
 * Cette forme unique n'est pas un détail : sans compte, une réservation ne
 * se relit qu'avec son téléphone de contact, que le serveur compare tel quel
 * (`bookings.getByReference`). Tout numéro envoyé au serveur passe donc par
 * `lireTelephone`, à la réservation comme à la consultation.
 */

export type LectureTelephone =
  | { ok: true; numero: string }
  | {
      ok: false
      raison: "vide" | "incomplet" | "trop-long" | "invalide" | "etranger"
    }

/** Exemple affiché dans les aides : un numéro national à 9 chiffres. */
export const EXEMPLE_TELEPHONE = "077 12 34 56"

function national(chiffres: string): LectureTelephone {
  // 8 chiffres significatifs, jamais précédés d'un 0 à l'international.
  if (chiffres.length < 8) return { ok: false, raison: "incomplet" }
  if (chiffres.length > 8) return { ok: false, raison: "trop-long" }
  if (chiffres.startsWith("0")) return { ok: false, raison: "invalide" }
  return { ok: true, numero: `+241${chiffres}` }
}

/**
 * Lit un numéro saisi. Un numéro étranger (+33…, 00237…) est accepté tel
 * quel, sauf si `gabonais` l'exige — un compte Mobile Money, par exemple.
 */
export function lireTelephone(
  saisie: string,
  { gabonais = false }: { gabonais?: boolean } = {}
): LectureTelephone {
  let brut = saisie.replace(/[\s.\-()/]/g, "")
  if (!brut) return { ok: false, raison: "vide" }
  if (brut.startsWith("00")) brut = `+${brut.slice(2)}`

  if (brut.startsWith("+")) {
    const chiffres = brut.slice(1)
    if (!/^\d+$/.test(chiffres)) return { ok: false, raison: "invalide" }
    if (chiffres.startsWith("241")) {
      // « +241 077 12 34 56 » : le 0 national recopié après l'indicatif.
      const reste = chiffres.slice(3)
      return national(
        reste.length === 9 && reste.startsWith("0") ? reste.slice(1) : reste
      )
    }
    if (gabonais) return { ok: false, raison: "etranger" }
    if (chiffres.length < 8 || chiffres.length > 15)
      return { ok: false, raison: "invalide" }
    return { ok: true, numero: `+${chiffres}` }
  }

  if (!/^\d+$/.test(brut)) return { ok: false, raison: "invalide" }
  // « 241 77 12 34 56 », sans le +.
  if (brut.startsWith("241") && (brut.length === 11 || brut.length === 12)) {
    const reste = brut.slice(3)
    return national(
      reste.length === 9 && reste.startsWith("0") ? reste.slice(1) : reste
    )
  }
  // Écriture nationale : 0 suivi de 8 chiffres.
  if (brut.startsWith("0")) {
    if (brut.length < 9) return { ok: false, raison: "incomplet" }
    if (brut.length > 9) return { ok: false, raison: "trop-long" }
    return national(brut.slice(1))
  }
  // « 77 12 34 56 » : les 8 chiffres significatifs, sans le 0.
  return national(brut)
}

/** Ce que le voyageur doit corriger, en une phrase. */
export function erreurTelephone(
  raison: Exclude<LectureTelephone, { ok: true }>["raison"]
): string {
  switch (raison) {
    case "vide":
      return "Indiquez un numéro de téléphone."
    case "incomplet":
      return `Il manque des chiffres : un numéro gabonais en compte 9, par exemple ${EXEMPLE_TELEPHONE}.`
    case "trop-long":
      return `Il y a trop de chiffres : un numéro gabonais en compte 9, par exemple ${EXEMPLE_TELEPHONE}.`
    case "etranger":
      return "Le compte à débiter doit être un numéro gabonais (+241)."
    case "invalide":
      return `Numéro non reconnu. Écrivez-le sur 9 chiffres, par exemple ${EXEMPLE_TELEPHONE}, ou avec l'indicatif du pays.`
  }
}
