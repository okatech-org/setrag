/**
 * Libellés du module RH. Les codes viennent du serveur
 * (`packages/backend/convex/modules/rh/model.ts`) ; l'écran les dit en
 * français. Toute évolution d'énumération part du serveur.
 */

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

export const METIERS = {
  conducteur_ligne: "Conducteur de ligne",
  chef_train: "Chef de train",
  controleur_train: "Contrôleur à bord",
  regulateur: "Régulateur COTRAF",
  agent_manoeuvre: "Agent de manœuvre",
  agent_voie: "Agent de la voie",
  agent_gare: "Agent de gare",
  vendeur: "Agent de vente",
  technicien_atelier: "Technicien d'atelier",
  technicien_signalisation: "Technicien signalisation & télécoms",
  administratif: "Personnel administratif",
  cadre: "Cadre",
  medical: "Personnel médical",
} as const
export type Metier = keyof typeof METIERS

export const CATEGORIES = { execution: "Agent d'exécution", maitrise: "Agent de maîtrise", cadre: "Cadre" } as const
export type Categorie = keyof typeof CATEGORIES

export const CONTRATS = { cdi: "CDI", cdd: "CDD", apprentissage: "Apprentissage" } as const
export type Contrat = keyof typeof CONTRATS

export const SITUATIONS = { celibataire: "Célibataire", marie: "Marié(e)", divorce: "Divorcé(e)", veuf: "Veuf / veuve" } as const
export type Situation = keyof typeof SITUATIONS

export const MODES_PAIEMENT = { virement: "Virement bancaire", airtel_money: "Airtel Money", moov_money: "Moov Money" } as const
export type ModePaiement = keyof typeof MODES_PAIEMENT

export const STATUTS_AGENT = { actif: "En activité", suspendu: "Suspendu", sorti: "Sorti des effectifs" } as const
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
  conduite_ligne: "Conduite de ligne",
  chef_train: "Chef de train",
  securite_ferroviaire: "Sécurité des circulations",
  manoeuvre: "Manœuvre et formation des trains",
  tmd: "Transport de matières dangereuses",
  travaux_voie: "Travaux sur voie et protection",
  habilitation_electrique: "Habilitation électrique",
  secourisme: "Sauveteur secouriste du travail",
} as const
export type TypeHabilitation = keyof typeof TYPES_HABILITATION

export const ETATS_HABILITATION = {
  valide: "Valide",
  a_renouveler: "À renouveler",
  expiree: "Expirée",
  suspendue: "Suspendue",
  retiree: "Retirée",
} as const

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

export const RESULTATS_APTITUDE = {
  apte: "Apte",
  apte_restriction: "Apte avec restriction",
  inapte_temporaire: "Inapte temporaire",
  inapte_definitif: "Inapte définitif",
} as const
export type ResultatAptitude = keyof typeof RESULTATS_APTITUDE

export const TYPES_VISITE = {
  embauche: "Visite d'embauche",
  periodique: "Visite périodique",
  reprise: "Visite de reprise",
  demande: "Visite à la demande",
} as const
export type TypeVisite = keyof typeof TYPES_VISITE

export const STATUTS_VISITE = { programmee: "Programmée", realisee: "Réalisée", annulee: "Annulée" } as const

export const TYPES_SERVICE = {
  conduite: "Conduite",
  accompagnement: "Chef de train",
  controle: "Contrôle à bord",
  manoeuvre: "Manœuvre",
  reserve: "Réserve",
  formation: "Formation",
} as const
export type TypeService = keyof typeof TYPES_SERVICE

export const STATUTS_SERVICE = { planifie: "Planifié", publie: "Publié", annule: "Annulé" } as const

export const TYPES_CONGE = {
  annuel: "Congé annuel payé",
  maladie: "Congé maladie",
  maternite: "Congé de maternité",
  evenement_familial: "Événement familial",
  recuperation: "Repos compensateur",
  sans_solde: "Congé sans solde",
  absence_injustifiee: "Absence injustifiée",
} as const
export type TypeConge = keyof typeof TYPES_CONGE

export const STATUTS_CONGE = { demande: "En attente", valide: "Validé", refuse: "Refusé", annule: "Annulé" } as const
export type StatutConge = keyof typeof STATUTS_CONGE

export const STATUTS_PERIODE = { ouverte: "Ouverte à la saisie", calculee: "Calculée, à valider", validee: "Validée", cloturee: "Clôturée" } as const
export type StatutPeriode = keyof typeof STATUTS_PERIODE

export const STATUTS_DECLARATION = { transmise: "Transmise, accusé attendu", accusee: "Accusé reçu", rejetee: "Rejetée" } as const

/** Gares du Transgabonais : code et nom. */
export const GARES = [
  ["OWE", "Owendo"],
  ["NTM", "Ntoum"],
  ["AND", "Andem"],
  ["MBE", "Mbel"],
  ["OYA", "Oyan"],
  ["ABA", "Abanga"],
  ["NDJ", "Ndjolé"],
  ["ALE", "Alembé"],
  ["OTO", "Otoumbi"],
  ["BIS", "Bissouma"],
  ["AYE", "Ayem"],
  ["LOP", "Lopé"],
  ["OFF", "Offoué"],
  ["BOO", "Booué"],
  ["IVI", "Ivindo"],
  ["MOU", "Mouyabi"],
  ["MIL", "Milolé"],
  ["LTV", "Lastourville"],
  ["DOU", "Doumé"],
  ["LIF", "Lifouta"],
  ["MBA", "Mboungou Badouma"],
  ["MOA", "Moanda"],
  ["FCV", "Franceville"],
] as const

export function nomGare(code: string | null | undefined) {
  if (!code) return "—"
  return GARES.find(([c]) => c === code)?.[1] ?? code
}

/** Libellé d'un code d'énumération, avec repli sur le code lui-même. */
export function libelle<T extends Record<string, string>>(table: T, code: string | null | undefined) {
  if (!code) return "—"
  return (table as Record<string, string>)[code] ?? code
}
