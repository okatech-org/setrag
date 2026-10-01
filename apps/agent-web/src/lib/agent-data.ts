/**
 * Vocabulaire du guichet : libellés, touches et formats partagés par les
 * écrans du portail de vente. Les données elles-mêmes viennent de Convex.
 */

export interface SellerIdentity {
  id?: string
  firstName?: string
  lastName?: string
  matricule?: string
  role: string
}

export interface PointOfSaleSummary {
  code: string
  name: string
  type: string
  stationName?: string
}

export interface CashSessionSummary {
  id: string
  openedAt: number
  openingFloatXaf: number
}

/* ════════════════════════════ Classes ═════════════════════════════════════ */

export type Classe = "DEUXIEME" | "PREMIERE" | "VIP"

export const CLASSES: readonly { code: Classe; libelle: string; court: string }[] = [
  { code: "DEUXIEME", libelle: "2e classe", court: "2e" },
  { code: "PREMIERE", libelle: "1re classe", court: "1re" },
  { code: "VIP", libelle: "VIP", court: "VIP" },
]

export function libelleClasse(classe: string | null | undefined, court = false) {
  const trouvee = CLASSES.find((c) => c.code === classe)
  return trouvee ? (court ? trouvee.court : trouvee.libelle) : (classe ?? "—")
}

/** Sous ce seuil, la case de classe l'écrit : « Plus que 6 places ». */
export const SEUIL_PLACES_RARES = 10

/* ════════════════════════════ Trains ══════════════════════════════════════ */

const TYPES_TRAIN: Record<string, string> = {
  EXPRESS: "Express",
  OMNIBUS: "Omnibus",
  AUTORAIL: "Autorail",
  SPECIAL: "Train spécial",
}

/** « Express 201 » à partir de EXPRESS et TR-201 — le mot du billet. */
export function nomTrain(type: string | null | undefined, numero: string) {
  return `${TYPES_TRAIN[type ?? ""] ?? "Train"} ${numero.replace(/^[A-Z]+-/, "")}`
}

/* ═════════════════════════ Moyens de paiement ═════════════════════════════ */

export type MoyenPaiement =
  | "especes"
  | "airtel_money"
  | "moov_money"
  | "clickpay"
  | "visa"
  | "mastercard"
  | "en_compte"

/** Choix proposés au guichet ; la carte couvre Visa et Mastercard. */
export type ChoixMoyen = "especes" | "airtel_money" | "moov_money" | "carte" | "clickpay" | "en_compte"

export const MOYENS: readonly {
  code: ChoixMoyen
  libelle: string
  aide: string
  touche: string
  distance: boolean
}[] = [
  { code: "especes", libelle: "Espèces", aide: "Rendu calculé", touche: "E", distance: false },
  { code: "airtel_money", libelle: "Airtel Money", aide: "Demande sur le téléphone", touche: "A", distance: true },
  { code: "moov_money", libelle: "Moov Money", aide: "Demande sur le téléphone", touche: "M", distance: true },
  { code: "carte", libelle: "Carte bancaire", aide: "Visa, Mastercard · TPE", touche: "T", distance: false },
  { code: "clickpay", libelle: "Click&Pay", aide: "Lien de paiement par SMS", touche: "L", distance: true },
  { code: "en_compte", libelle: "En compte", aide: "Client conventionné", touche: "K", distance: false },
]

const LIBELLES_MOYEN: Record<MoyenPaiement, string> = {
  especes: "Espèces",
  airtel_money: "Airtel Money",
  moov_money: "Moov Money",
  clickpay: "Click&Pay",
  visa: "Carte Visa",
  mastercard: "Carte Mastercard",
  en_compte: "En compte",
}

export function libelleMoyen(moyen: string | null | undefined) {
  return moyen ? (LIBELLES_MOYEN[moyen as MoyenPaiement] ?? moyen) : "—"
}

/** Source du « constaté » à la clôture, moyen par moyen. */
export function sourceRapprochement(moyen: MoyenPaiement) {
  switch (moyen) {
    case "especes":
      return "Comptage du billetage"
    case "airtel_money":
    case "moov_money":
    case "clickpay":
      return "Relevé opérateur"
    case "visa":
    case "mastercard":
      return "Tickets TPE"
    case "en_compte":
      return "Bons de commande"
  }
}

/* ════════════════════════════ Produits ════════════════════════════════════ */

const PRODUITS: Record<string, string> = {
  billet: "Billet",
  bagage: "Bagage",
  colis: "Colis express",
  taa: "Auto accompagné",
  funeraire: "Funéraire",
}

export function libelleProduit(produit: string, kind?: string) {
  if (kind === "annulation") return "Annulation"
  if (kind === "remboursement") return "Remboursement"
  return PRODUITS[produit] ?? produit
}

/* ═══════════════════════════ États d'opération ════════════════════════════ */

export type EtatOperation =
  | "emis"
  | "enregistre"
  | "controle"
  | "annule"
  | "rembourse"
  | "annulation"
  | "remboursement"
  | "en_attente"
  | "expire"

export const ETATS_OPERATION: Record<
  EtatOperation,
  { libelle: string; ton: "success" | "accent" | "info" | "danger" | "neutral" | "warning" }
> = {
  emis: { libelle: "Émis", ton: "success" },
  enregistre: { libelle: "Enregistré", ton: "success" },
  controle: { libelle: "Contrôlé à bord", ton: "accent" },
  annule: { libelle: "Annulé", ton: "danger" },
  rembourse: { libelle: "Remboursé", ton: "info" },
  annulation: { libelle: "Annulation", ton: "neutral" },
  remboursement: { libelle: "Remboursement", ton: "info" },
  en_attente: { libelle: "Paiement en attente", ton: "warning" },
  expire: { libelle: "Tenue expirée", ton: "neutral" },
}

/* ════════════════════════════ Formats ═════════════════════════════════════ */

const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })

/** « 32 500 » avec l'espace insécable ordinaire (toutes les polices l'ont). */
export function montant(valeur: number) {
  return nombre.format(Math.round(valeur)).replace(/ /g, " ")
}

/** « 32 500 XAF ». */
export function xaf(valeur: number) {
  return `${montant(valeur)} XAF`
}

/** « −29 250 » pour une sortie, « 32 500 » sinon. */
export function montantSigne(valeur: number) {
  return valeur < 0 ? `−${montant(Math.abs(valeur))}` : montant(valeur)
}

const heureFormat = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Libreville",
})

export function heure(valeur: number | Date) {
  return heureFormat.format(valeur)
}

const JOURS = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."]
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]

/** « Ven. 2 oct. » depuis « 2026-10-02 » ; l'année en plus si demandée. */
export function dateCourte(date: string, avecAnnee = false) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return date
  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const semaine = new Date(Date.UTC(annee, mois - 1, jour)).getUTCDay()
  const texte = `${JOURS[semaine]} ${jour === 1 ? "1er" : jour} ${MOIS[mois - 1] ?? ""}`
  return avecAnnee ? `${texte} ${annee}` : texte
}

const dateHeureFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Libreville",
})

export function dateHeure(valeur: number) {
  return dateHeureFormat.format(valeur)
}

/** Jour de service à Libreville (UTC+1), au format AAAA-MM-JJ. */
export function jourDeService(valeur = Date.now(), decalageJours = 0) {
  const local = new Date(valeur + 60 * 60_000 + decalageJours * 86_400_000)
  return local.toISOString().slice(0, 10)
}

/** « 11 h 45 » entre deux horodatages. */
export function duree(debut: number, fin: number) {
  const minutes = Math.max(0, Math.round((fin - debut) / 60_000))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`
}

/** Vrai si l'arrivée tombe un jour de service plus tard que le départ. */
export function lendemain(depart: number, arrivee: number) {
  return jourDeService(arrivee) > jourDeService(depart)
}

/** Initiales et nom court : « N. Moussavou ». */
export function nomCourt(prenom?: string | null, nom?: string | null) {
  if (!prenom && !nom) return "Agent SETRAG"
  const famille = nom ? nom.charAt(0) + nom.slice(1).toLowerCase() : ""
  return `${prenom ? `${prenom.charAt(0)}. ` : ""}${famille || prenom || ""}`.trim()
}

/** Montant TVA d'un TTC, à l'identique du billet imprimé. */
export function ventilation(ttc: number, tvaPct = 18) {
  const ht = Math.round(ttc / (1 + tvaPct / 100))
  return { ht, tva: ttc - ht }
}
