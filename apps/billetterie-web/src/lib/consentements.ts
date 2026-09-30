/**
 * Consentements révocables, tels que le voyageur les lit dans son compte.
 *
 * La version désigne le texte présenté ici : elle est enregistrée avec
 * l'accord, pour qu'il reste opposable. Changer un texte, c'est changer sa
 * version — les accords donnés sur l'ancien restent datés et lisibles dans
 * l'historique.
 *
 * Les conditions générales de vente n'y figurent pas : elles s'acceptent à
 * chaque achat, et leur version est portée par la vente elle-même.
 */

export type ConsentementRevocable = "donnees" | "marketing"

export const CONSENTEMENTS: Record<
  ConsentementRevocable,
  { version: string; libelle: string; texte: string }
> = {
  donnees: {
    version: "donnees-2026-09",
    libelle: "Utilisation de mes données de compte",
    texte:
      "Votre accord pour que SETRAG utilise les données de votre compte : identité, coordonnées, voyageurs enregistrés. Le retirer n'efface rien ; pour effacer vos données, supprimez le compte.",
  },
  marketing: {
    version: "marketing-2026-01",
    libelle: "Offres et nouveautés SETRAG",
    texte:
      "Des messages commerciaux de SETRAG. Sans effet sur les messages liés à vos voyages.",
  },
}

/** Libellés de tous les types d'accord, pour l'historique. */
export const LIBELLES_CONSENTEMENT: Record<
  "cgv" | ConsentementRevocable,
  string
> = {
  cgv: "Conditions générales de vente",
  donnees: CONSENTEMENTS.donnees.libelle,
  marketing: CONSENTEMENTS.marketing.libelle,
}
