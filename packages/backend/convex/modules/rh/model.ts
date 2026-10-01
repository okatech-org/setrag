/**
 * Règles métier RH — logique pure, sans dépendance à Convex.
 *
 * Effectifs, aptitude médicale, roulements (contraintes de repos et de
 * conduite), congés. Le calcul de paie vit à part dans `modelPaie.ts`.
 * Toutes les dates « AAAA-MM-JJ » s'entendent à Libreville (UTC+1, sans
 * heure d'été) ; les instants sont des horodatages en millisecondes.
 */

/* ═══════════════════════════ Énumérations ═══════════════════════════════ */

export const DIRECTIONS = {
  DG: "Direction générale",
  DSI: "Systèmes d'information",
  DEF: "Exploitation ferroviaire",
  DMAT: "Matériel roulant",
  DINFRA: "Installations fixes",
  DCFV: "Commercial fret & voyageurs",
  DFC: "Finance & comptabilité",
  DRH: "Ressources humaines",
  DSED: "Sécurité & environnement",
} as const
export type Direction = keyof typeof DIRECTIONS
export const DIRECTION_CODES = Object.keys(DIRECTIONS) as [
  Direction,
  ...Direction[],
]

/**
 * Métiers suivis par le module. Les métiers « de sécurité » exigent une
 * aptitude médicale en cours de validité pour être portés au roulement.
 */
export const METIERS = {
  conducteur_ligne: { libelle: "Conducteur de ligne", securite: true },
  chef_train: { libelle: "Chef de train", securite: true },
  controleur_train: { libelle: "Contrôleur à bord", securite: true },
  regulateur: { libelle: "Régulateur COTRAF", securite: true },
  agent_manoeuvre: { libelle: "Agent de manœuvre", securite: true },
  agent_voie: { libelle: "Agent de la voie", securite: true },
  agent_gare: { libelle: "Agent de gare", securite: false },
  vendeur: { libelle: "Agent de vente", securite: false },
  technicien_atelier: { libelle: "Technicien d'atelier", securite: false },
  technicien_signalisation: {
    libelle: "Technicien signalisation & télécoms",
    securite: true,
  },
  administratif: { libelle: "Personnel administratif", securite: false },
  cadre: { libelle: "Cadre", securite: false },
  medical: { libelle: "Personnel médical", securite: false },
} as const
export type Metier = keyof typeof METIERS
export const METIER_CODES = Object.keys(METIERS) as [Metier, ...Metier[]]

/** Personnel roulant : planifié au roulement des dessertes. */
export const METIERS_ROULANTS: readonly Metier[] = [
  "conducteur_ligne",
  "chef_train",
  "controleur_train",
]

export const CATEGORIES = {
  execution: "Agent d'exécution",
  maitrise: "Agent de maîtrise",
  cadre: "Cadre",
} as const
export type Categorie = keyof typeof CATEGORIES

export const CONTRATS = {
  cdi: "CDI",
  cdd: "CDD",
  apprentissage: "Apprentissage",
} as const
export type Contrat = keyof typeof CONTRATS

export const SITUATIONS_FAMILIALES = {
  celibataire: "Célibataire",
  marie: "Marié(e)",
  divorce: "Divorcé(e)",
  veuf: "Veuf / veuve",
} as const
export type SituationFamiliale = keyof typeof SITUATIONS_FAMILIALES

export const MODES_PAIEMENT = {
  virement: "Virement bancaire",
  airtel_money: "Airtel Money",
  moov_money: "Moov Money",
} as const
export type ModePaiement = keyof typeof MODES_PAIEMENT

export const STATUTS_AGENT = {
  actif: "En activité",
  suspendu: "Suspendu",
  sorti: "Sorti des effectifs",
} as const
export type StatutAgent = keyof typeof STATUTS_AGENT

export const TYPES_MOUVEMENT = {
  embauche: "Embauche",
  mutation: "Mutation",
  promotion: "Promotion",
  revision_salaire: "Révision de salaire",
  suspension: "Suspension",
  reintegration: "Réintégration",
  sortie: "Sortie des effectifs",
} as const
export type TypeMouvement = keyof typeof TYPES_MOUVEMENT

export const MOTIFS_SORTIE = {
  demission: "Démission",
  fin_cdd: "Fin de CDD",
  licenciement: "Licenciement",
  retraite: "Départ à la retraite",
  deces: "Décès",
  rupture_conventionnelle: "Rupture d'un commun accord",
} as const
export type MotifSortie = keyof typeof MOTIFS_SORTIE

export const TYPES_HABILITATION = {
  conduite_ligne: { libelle: "Conduite de ligne", dureeMois: 36 },
  chef_train: { libelle: "Chef de train", dureeMois: 36 },
  securite_ferroviaire: {
    libelle: "Sécurité des circulations",
    dureeMois: 24,
  },
  manoeuvre: { libelle: "Manœuvre et formation des trains", dureeMois: 36 },
  tmd: { libelle: "Transport de matières dangereuses", dureeMois: 24 },
  travaux_voie: { libelle: "Travaux sur voie et protection", dureeMois: 24 },
  habilitation_electrique: {
    libelle: "Habilitation électrique",
    dureeMois: 36,
  },
  secourisme: { libelle: "Sauveteur secouriste du travail", dureeMois: 24 },
} as const
export type TypeHabilitation = keyof typeof TYPES_HABILITATION
export const TYPE_HABILITATION_CODES = Object.keys(TYPES_HABILITATION) as [
  TypeHabilitation,
  ...TypeHabilitation[],
]

export const STATUTS_HABILITATION = {
  valide: "Valide",
  suspendue: "Suspendue",
  retiree: "Retirée",
} as const
export type StatutHabilitation = keyof typeof STATUTS_HABILITATION

/* ══════════════════════════════ Gares ═══════════════════════════════════ */

/** Gares du Transgabonais (référentiel CDC) : code, nom, point kilométrique. */
export const GARES = [
  { code: "OWE", nom: "Owendo", pk: 0 },
  { code: "NTM", nom: "Ntoum", pk: 35 },
  { code: "AND", nom: "Andem", pk: 57 },
  { code: "MBE", nom: "Mbel", pk: 85 },
  { code: "OYA", nom: "Oyan", pk: 118 },
  { code: "ABA", nom: "Abanga", pk: 148 },
  { code: "NDJ", nom: "Ndjolé", pk: 182 },
  { code: "ALE", nom: "Alembé", pk: 202 },
  { code: "OTO", nom: "Otoumbi", pk: 226 },
  { code: "BIS", nom: "Bissouma", pk: 244 },
  { code: "AYE", nom: "Ayem", pk: 267 },
  { code: "LOP", nom: "Lopé", pk: 290 },
  { code: "OFF", nom: "Offoué", pk: 312 },
  { code: "BOO", nom: "Booué", pk: 338 },
  { code: "IVI", nom: "Ivindo", pk: 375 },
  { code: "MOU", nom: "Mouyabi", pk: 411 },
  { code: "MIL", nom: "Milolé", pk: 448 },
  { code: "LTV", nom: "Lastourville", pk: 484 },
  { code: "DOU", nom: "Doumé", pk: 514 },
  { code: "LIF", nom: "Lifouta", pk: 549 },
  { code: "MBA", nom: "Mboungou Badouma", pk: 584 },
  { code: "MOA", nom: "Moanda", pk: 619 },
  { code: "FCV", nom: "Franceville", pk: 669 },
] as const

export function nomGare(code: string | undefined | null): string {
  if (!code) return "—"
  return GARES.find((gare) => gare.code === code)?.nom ?? code
}

export function estGareConnue(code: string): boolean {
  return GARES.some((gare) => gare.code === code)
}

/* ═════════════════════════════ Dates ════════════════════════════════════ */

const JOUR_MS = 86_400_000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Valide et normalise une date « AAAA-MM-JJ ». */
export function dateIso(valeur: string, libelle = "La date"): string {
  const texte = valeur.trim()
  if (!DATE_RE.test(texte)) {
    throw new Error(`${libelle} doit être au format AAAA-MM-JJ.`)
  }
  const instant = Date.parse(`${texte}T00:00:00Z`)
  if (
    Number.isNaN(instant) ||
    new Date(instant).toISOString().slice(0, 10) !== texte
  ) {
    throw new Error(`${libelle} n'existe pas au calendrier.`)
  }
  return texte
}

/** Date de Libreville d'un instant. */
export function dateLibreville(instant: number): string {
  return new Date(instant + 3_600_000).toISOString().slice(0, 10)
}

/** Début de journée à Libreville (00:00 UTC+1). */
export function debutJournee(date: string): number {
  return Date.parse(`${date}T00:00:00+01:00`)
}

export function ajouterJours(date: string, jours: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + jours * JOUR_MS)
    .toISOString()
    .slice(0, 10)
}

export function ajouterMois(date: string, mois: number): string {
  const [annee, m, j] = date.split("-").map(Number) as [number, number, number]
  const total = annee * 12 + (m - 1) + mois
  const nouvelleAnnee = Math.floor(total / 12)
  const nouveauMois = (total % 12) + 1
  const dernierJour = new Date(
    Date.UTC(nouvelleAnnee, nouveauMois, 0)
  ).getUTCDate()
  return `${nouvelleAnnee}-${String(nouveauMois).padStart(2, "0")}-${String(
    Math.min(j, dernierJour)
  ).padStart(2, "0")}`
}

/** Nombre de jours calendaires de `debut` à `fin` inclus. */
export function joursCalendaires(debut: string, fin: string): number {
  return (
    Math.round(
      (Date.parse(`${fin}T12:00:00Z`) - Date.parse(`${debut}T12:00:00Z`)) /
        JOUR_MS
    ) + 1
  )
}

/**
 * Jours ouvrables (du lundi au samedi) de `debut` à `fin` inclus : c'est
 * l'unité des congés payés au Code du travail gabonais.
 */
export function joursOuvrables(debut: string, fin: string): number {
  let total = 0
  for (let jour = debut; jour <= fin; jour = ajouterJours(jour, 1)) {
    if (new Date(`${jour}T12:00:00Z`).getUTCDay() !== 0) total += 1
  }
  return total
}

/** Chevauchement en jours calendaires de deux intervalles inclusifs. */
export function joursCommuns(
  a: { du: string; au: string },
  b: { du: string; au: string }
): number {
  const debut = a.du > b.du ? a.du : b.du
  const fin = a.au < b.au ? a.au : b.au
  return debut > fin ? 0 : joursCalendaires(debut, fin)
}

/** Ancienneté en années révolues à une date. */
export function ancienneteAnnees(dateEmbauche: string, aLaDate: string) {
  const [ae, me, je] = dateEmbauche.split("-").map(Number) as [
    number,
    number,
    number,
  ]
  const [a, m, j] = aLaDate.split("-").map(Number) as [number, number, number]
  let annees = a - ae
  if (m < me || (m === me && j < je)) annees -= 1
  return Math.max(0, annees)
}

/* ═════════════════════════ Période de paie ══════════════════════════════ */

const PERIODE_RE = /^(\d{4})-(0[1-9]|1[0-2])$/
const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const

export function bornesPeriode(code: string): {
  code: string
  libelle: string
  debut: string
  fin: string
} {
  const correspondance = PERIODE_RE.exec(code.trim())
  if (!correspondance) {
    throw new Error("La période de paie doit être au format AAAA-MM.")
  }
  const annee = Number(correspondance[1])
  const mois = Number(correspondance[2])
  const dernierJour = new Date(Date.UTC(annee, mois, 0)).getUTCDate()
  const prefixe = `${annee}-${String(mois).padStart(2, "0")}`
  return {
    code: prefixe,
    libelle: `${MOIS[mois - 1]} ${annee}`.replace(/^./, (c) => c.toUpperCase()),
    debut: `${prefixe}-01`,
    fin: `${prefixe}-${String(dernierJour).padStart(2, "0")}`,
  }
}

export function periodeSuivante(code: string): string {
  const { debut } = bornesPeriode(code)
  return ajouterMois(debut, 1).slice(0, 7)
}

/* ════════════════════════ Aptitude médicale ═════════════════════════════ */

export const TYPES_VISITE = {
  embauche: "Visite d'embauche",
  periodique: "Visite périodique",
  reprise: "Visite de reprise",
  demande: "Visite à la demande",
} as const
export type TypeVisite = keyof typeof TYPES_VISITE

export const RESULTATS_APTITUDE = {
  apte: "Apte",
  apte_restriction: "Apte avec restriction",
  inapte_temporaire: "Inapte temporaire",
  inapte_definitif: "Inapte définitif",
} as const
export type ResultatAptitude = keyof typeof RESULTATS_APTITUDE

export const ETATS_APTITUDE = {
  apte: "Apte",
  apte_restriction: "Apte avec restriction",
  a_renouveler: "À renouveler",
  expiree: "Aptitude expirée",
  inapte_temporaire: "Inapte temporaire",
  inapte_definitif: "Inapte définitif",
  aucune: "Aucune visite",
} as const
export type EtatAptitude = keyof typeof ETATS_APTITUDE

/** Préavis d'alerte avant l'échéance d'une aptitude ou d'une habilitation. */
export const PREAVIS_ECHEANCE_JOURS = 60

/** Périodicité de la visite selon le métier (en mois). */
export function periodiciteVisiteMois(metier: Metier): number {
  return METIERS[metier].securite ? 12 : 24
}

export interface VisiteRealisee {
  resultat: ResultatAptitude
  valideJusquau?: string
  realiseeLe: number
}

/**
 * État d'aptitude d'un agent à une date, d'après sa dernière visite réalisée.
 * Ce statut, et lui seul, est visible hors du service médical.
 */
export function etatAptitude(
  derniere: VisiteRealisee | null | undefined,
  aLaDate: string
): { etat: EtatAptitude; valideJusquau?: string } {
  if (!derniere) return { etat: "aucune" }
  if (derniere.resultat === "inapte_definitif") {
    return { etat: "inapte_definitif" }
  }
  const valideJusquau = derniere.valideJusquau
  if (derniere.resultat === "inapte_temporaire") {
    if (!valideJusquau || valideJusquau >= aLaDate) {
      return { etat: "inapte_temporaire", valideJusquau }
    }
    return { etat: "expiree", valideJusquau }
  }
  if (!valideJusquau) return { etat: derniere.resultat }
  if (valideJusquau < aLaDate) return { etat: "expiree", valideJusquau }
  if (valideJusquau <= ajouterJours(aLaDate, PREAVIS_ECHEANCE_JOURS)) {
    return { etat: "a_renouveler", valideJusquau }
  }
  return { etat: derniere.resultat, valideJusquau }
}

/** L'agent peut-il tenir un poste de sécurité à cette date ? */
export function aptePosteSecurite(
  derniere: VisiteRealisee | null | undefined,
  aLaDate: string
): boolean {
  const { etat } = etatAptitude(derniere, aLaDate)
  return etat === "apte" || etat === "apte_restriction" || etat === "a_renouveler"
}

/* ══════════════════════════ Habilitations ═══════════════════════════════ */

export function etatHabilitation(
  habilitation: { statut: StatutHabilitation; expireLe: string },
  aLaDate: string
): "valide" | "a_renouveler" | "expiree" | "suspendue" | "retiree" {
  if (habilitation.statut !== "valide") return habilitation.statut
  if (habilitation.expireLe < aLaDate) return "expiree"
  if (habilitation.expireLe <= ajouterJours(aLaDate, PREAVIS_ECHEANCE_JOURS)) {
    return "a_renouveler"
  }
  return "valide"
}

/* ════════════════════════════ Roulements ════════════════════════════════ */

export const TYPES_SERVICE = {
  conduite: { libelle: "Conduite", habilitation: "conduite_ligne" },
  accompagnement: { libelle: "Chef de train", habilitation: "chef_train" },
  controle: { libelle: "Contrôle à bord", habilitation: null },
  manoeuvre: { libelle: "Manœuvre", habilitation: "manoeuvre" },
  reserve: { libelle: "Réserve", habilitation: null },
  formation: { libelle: "Formation", habilitation: null },
} as const satisfies Record<
  string,
  { libelle: string; habilitation: TypeHabilitation | null }
>
export type TypeService = keyof typeof TYPES_SERVICE
export const TYPE_SERVICE_CODES = Object.keys(TYPES_SERVICE) as [
  TypeService,
  ...TypeService[],
]

/** Services exigeant une aptitude médicale de sécurité valide. */
const SERVICES_SECURITE: readonly TypeService[] = [
  "conduite",
  "accompagnement",
  "controle",
  "manoeuvre",
]

/**
 * Paramètres du roulement. Le Code du travail gabonais fixe le cadre
 * (repos quotidien, durée hebdomadaire) ; la règle des six heures de conduite
 * continue est celle du référentiel SETRAG (document 05, §4.2).
 */
export const REGLES_ROULEMENT = {
  reposMinimalHeures: 12,
  conduiteContinueMaxHeures: 6,
  pauseMinimaleMinutes: 30,
  dureeMaxServiceHeures: 12,
  plafondHebdomadaireHeures: 48,
} as const

export const TYPES_CONFLIT = {
  chevauchement: { libelle: "Services qui se chevauchent", bloquant: true },
  agent_indisponible: { libelle: "Agent hors activité", bloquant: true },
  aptitude: { libelle: "Aptitude médicale non valide", bloquant: true },
  habilitation: { libelle: "Habilitation manquante ou expirée", bloquant: true },
  conge: { libelle: "Agent en congé validé", bloquant: true },
  repos: { libelle: "Repos quotidien insuffisant", bloquant: false },
  conduite_continue: {
    libelle: "Conduite continue au-delà de 6 h",
    bloquant: false,
  },
  duree_service: { libelle: "Service de plus de 12 h", bloquant: false },
  plafond_hebdomadaire: {
    libelle: "Plus de 48 h sur 7 jours",
    bloquant: false,
  },
} as const
export type TypeConflit = keyof typeof TYPES_CONFLIT

export interface ServicePlanifie {
  id: string
  agentId: string
  debut: number
  fin: number
  type: TypeService
  pauseMinutes: number
}

export interface ContexteAgentRoulement {
  statut: StatutAgent
  aptitude: VisiteRealisee | null
  habilitations: readonly {
    type: TypeHabilitation
    statut: StatutHabilitation
    expireLe: string
  }[]
  conges: readonly { du: string; au: string }[]
}

export interface Conflit {
  type: TypeConflit
  bloquant: boolean
  message: string
  autreServiceId?: string
}

const HEURE_MS = 3_600_000

function heures(ms: number) {
  return Math.round((ms / HEURE_MS) * 10) / 10
}

/** Valide la forme d'un service avant toute règle métier. */
export function controlerFormeService(service: {
  debut: number
  fin: number
  pauseMinutes: number
}) {
  if (!Number.isFinite(service.debut) || !Number.isFinite(service.fin)) {
    throw new Error("Les heures de prise et de fin de service sont requises.")
  }
  if (service.fin <= service.debut) {
    throw new Error("La fin de service doit suivre la prise de service.")
  }
  if (service.fin - service.debut > 24 * HEURE_MS) {
    throw new Error("Un service ne peut pas dépasser 24 heures.")
  }
  if (
    !Number.isInteger(service.pauseMinutes) ||
    service.pauseMinutes < 0 ||
    service.pauseMinutes * 60_000 >= service.fin - service.debut
  ) {
    throw new Error("La pause doit être un nombre de minutes inférieur au service.")
  }
}

/**
 * Conflits d'un service avec les règles de roulement, compte tenu des autres
 * services du même agent (annulés exclus) et de sa situation (activité,
 * aptitude, habilitations, congés validés).
 */
export function conflitsService(
  service: ServicePlanifie,
  autres: readonly ServicePlanifie[],
  agent: ContexteAgentRoulement
): Conflit[] {
  const conflits: Conflit[] = []
  const date = dateLibreville(service.debut)
  const memeAgent = autres
    .filter((autre) => autre.agentId === service.agentId && autre.id !== service.id)
    .sort((a, b) => a.debut - b.debut)

  if (agent.statut !== "actif") {
    conflits.push({
      type: "agent_indisponible",
      bloquant: true,
      message: `L'agent est ${STATUTS_AGENT[agent.statut].toLowerCase()}.`,
    })
  }

  if (SERVICES_SECURITE.includes(service.type) && !aptePosteSecurite(agent.aptitude, date)) {
    const { etat } = etatAptitude(agent.aptitude, date)
    conflits.push({
      type: "aptitude",
      bloquant: true,
      message: `Aptitude au ${date} : ${ETATS_APTITUDE[etat].toLowerCase()}.`,
    })
  }

  const habilitationRequise = TYPES_SERVICE[service.type].habilitation
  if (habilitationRequise) {
    const valide = agent.habilitations.some(
      (habilitation) =>
        habilitation.type === habilitationRequise &&
        habilitation.statut === "valide" &&
        habilitation.expireLe >= date
    )
    if (!valide) {
      conflits.push({
        type: "habilitation",
        bloquant: true,
        message: `Habilitation « ${TYPES_HABILITATION[habilitationRequise].libelle} » absente ou expirée au ${date}.`,
      })
    }
  }

  const dateFin = dateLibreville(service.fin - 1)
  const conge = agent.conges.find(
    (periode) => periode.du <= dateFin && periode.au >= date
  )
  if (conge) {
    conflits.push({
      type: "conge",
      bloquant: true,
      message: `Congé validé du ${conge.du} au ${conge.au}.`,
    })
  }

  for (const autre of memeAgent) {
    if (autre.debut < service.fin && service.debut < autre.fin) {
      conflits.push({
        type: "chevauchement",
        bloquant: true,
        message: "Ce service chevauche un autre service de l'agent.",
        autreServiceId: autre.id,
      })
    }
  }

  const precedent = [...memeAgent]
    .filter((autre) => autre.fin <= service.debut)
    .pop()
  if (precedent) {
    const repos = service.debut - precedent.fin
    if (repos < REGLES_ROULEMENT.reposMinimalHeures * HEURE_MS) {
      conflits.push({
        type: "repos",
        bloquant: false,
        message: `Repos de ${heures(repos)} h avant ce service (minimum ${REGLES_ROULEMENT.reposMinimalHeures} h).`,
        autreServiceId: precedent.id,
      })
    }
  }
  const suivant = memeAgent.find((autre) => autre.debut >= service.fin)
  if (suivant) {
    const repos = suivant.debut - service.fin
    if (repos < REGLES_ROULEMENT.reposMinimalHeures * HEURE_MS) {
      conflits.push({
        type: "repos",
        bloquant: false,
        message: `Repos de ${heures(repos)} h après ce service (minimum ${REGLES_ROULEMENT.reposMinimalHeures} h).`,
        autreServiceId: suivant.id,
      })
    }
  }

  const duree = service.fin - service.debut
  if (
    service.type === "conduite" &&
    duree > REGLES_ROULEMENT.conduiteContinueMaxHeures * HEURE_MS &&
    service.pauseMinutes < REGLES_ROULEMENT.pauseMinimaleMinutes
  ) {
    conflits.push({
      type: "conduite_continue",
      bloquant: false,
      message: `${heures(duree)} h de conduite sans pause d'au moins ${REGLES_ROULEMENT.pauseMinimaleMinutes} min.`,
    })
  }
  if (duree > REGLES_ROULEMENT.dureeMaxServiceHeures * HEURE_MS) {
    conflits.push({
      type: "duree_service",
      bloquant: false,
      message: `Service de ${heures(duree)} h (maximum ${REGLES_ROULEMENT.dureeMaxServiceHeures} h).`,
    })
  }

  const fenetreDebut = service.fin - 7 * 24 * HEURE_MS
  const travail = [service, ...memeAgent]
    .filter((s) => s.fin > fenetreDebut && s.debut < service.fin)
    .reduce(
      (total, s) =>
        total +
        Math.min(s.fin, service.fin) -
        Math.max(s.debut, fenetreDebut) -
        s.pauseMinutes * 60_000,
      0
    )
  if (travail > REGLES_ROULEMENT.plafondHebdomadaireHeures * HEURE_MS) {
    conflits.push({
      type: "plafond_hebdomadaire",
      bloquant: false,
      message: `${heures(travail)} h travaillées sur les 7 jours précédents (plafond ${REGLES_ROULEMENT.plafondHebdomadaireHeures} h).`,
    })
  }

  return conflits
}

/* ══════════════════════════════ Congés ══════════════════════════════════ */

export const TYPES_CONGE = {
  annuel: { libelle: "Congé annuel payé", decompte: true, paye: true },
  maladie: { libelle: "Congé maladie", decompte: false, paye: true },
  maternite: { libelle: "Congé de maternité", decompte: false, paye: true },
  evenement_familial: {
    libelle: "Permission pour événement familial",
    decompte: false,
    paye: true,
  },
  recuperation: {
    libelle: "Repos compensateur",
    decompte: false,
    paye: true,
  },
  sans_solde: { libelle: "Congé sans solde", decompte: false, paye: false },
  absence_injustifiee: {
    libelle: "Absence injustifiée",
    decompte: false,
    paye: false,
  },
} as const
export type TypeConge = keyof typeof TYPES_CONGE
export const TYPE_CONGE_CODES = Object.keys(TYPES_CONGE) as [
  TypeConge,
  ...TypeConge[],
]

export const STATUTS_CONGE = {
  demande: "En attente de validation",
  valide: "Validé",
  refuse: "Refusé",
  annule: "Annulé",
} as const
export type StatutConge = keyof typeof STATUTS_CONGE

/** Deux jours ouvrables par mois de service, soit 24 jours par an. */
export const JOURS_CONGE_PAR_MOIS = 2

/**
 * Droits à congé annuel acquis sur l'année civile de `aLaDate`, au prorata
 * des mois de service commencés depuis l'embauche.
 */
export function droitsCongeAnnuel(dateEmbauche: string, annee: number): number {
  const debutAnnee = `${annee}-01-01`
  const debut = dateEmbauche > debutAnnee ? dateEmbauche : debutAnnee
  if (debut > `${annee}-12-31`) return 0
  const moisDebut = Number(debut.slice(5, 7))
  return (12 - moisDebut + 1) * JOURS_CONGE_PAR_MOIS
}

/* ═════════════════════════════ Textes ═══════════════════════════════════ */

export function texteRequis(valeur: string, libelle: string, max = 500): string {
  const texte = valeur.trim()
  if (texte.length === 0) throw new Error(`${libelle} est obligatoire.`)
  if (texte.length > max) {
    throw new Error(`${libelle} dépasse ${max} caractères.`)
  }
  return texte
}

export function texteFacultatif(
  valeur: string | undefined,
  libelle: string,
  max = 500
): string | undefined {
  if (valeur === undefined) return undefined
  const texte = valeur.trim()
  if (texte.length === 0) return undefined
  if (texte.length > max) {
    throw new Error(`${libelle} dépasse ${max} caractères.`)
  }
  return texte
}

export function entierPositif(
  valeur: number,
  libelle: string,
  max = Number.MAX_SAFE_INTEGER
): number {
  if (!Number.isInteger(valeur) || valeur < 0 || valeur > max) {
    throw new Error(`${libelle} doit être un entier compris entre 0 et ${max}.`)
  }
  return valeur
}

export function nomComplet(agent: { nom: string; prenom: string }): string {
  return `${agent.prenom} ${agent.nom.toUpperCase()}`
}
