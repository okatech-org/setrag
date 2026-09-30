/**
 * Numéros de téléphone gabonais, comparés sans tenir compte de leur écriture.
 *
 * Un invité retrouve sa réservation avec la référence et le téléphone de
 * contact : « 077 12 34 56 », « +241 77 12 34 56 » ou « 0024177123456 »
 * désignent le même numéro et doivent ouvrir le même dossier.
 */

/** Nombre minimal de chiffres significatifs d'un numéro de contact. */
export const CHIFFRES_SIGNIFICATIFS_MIN = 8

/**
 * Chiffres significatifs du numéro, sans indicatif ni zéro initial.
 *
 * L'indicatif 241 n'est retiré que derrière un préfixe international (`+` ou
 * `00`) : sans lui, « 241… » peut être le début d'un numéro national, et le
 * tronquer rapprocherait deux lignes différentes.
 */
export function normaliserTelephone(numero: string): string {
  const brut = numero.trim()
  let chiffres = brut.replace(/\D/g, "")
  const international = brut.startsWith("+") || chiffres.startsWith("00")
  if (chiffres.startsWith("00")) chiffres = chiffres.slice(2)
  if (international && chiffres.startsWith("241")) chiffres = chiffres.slice(3)
  return chiffres.replace(/^0+/, "")
}

/** Deux numéros désignent-ils la même ligne ? Un numéro trop court ne prouve rien. */
export function memeTelephone(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false
  const na = normaliserTelephone(a)
  return na.length >= 6 && na === normaliserTelephone(b)
}

/**
 * Un numéro assez long pour servir de preuve d'accès à une réservation.
 *
 * Sans compte, le téléphone de contact double la référence : un numéro de
 * trois chiffres se devinerait. Huit chiffres significatifs, c'est un numéro
 * gabonais complet (077 12 34 56).
 */
export function telephoneDeContactValide(numero: string): boolean {
  return normaliserTelephone(numero).length >= CHIFFRES_SIGNIFICATIFS_MIN
}
