/**
 * Données du jeu de démonstration GED : plan de classement, gabarits de
 * pièces, circuits, courriers et notes. Fichier de données pur, sans Convex.
 *
 * Les durées de conservation sont signalées « à valider » quand elles ne
 * reposent pas sur un texte précis : seul l'Acte uniforme OHADA relatif au
 * droit comptable (AUDCIF, art. 24 : dix ans pour les livres et pièces
 * justificatives) et la prescription commerciale OHADA (AUDCG, art. 16 :
 * cinq ans) sont cités comme bases légales.
 */

import type { GedClassification, GedType } from "./model"

export interface SerieClassement {
  code: string
  libelle: string
  direction: string
  processus: string
  description: string
  conservationAnnees: number | null
  baseConservation: string
  aValider: boolean
  sortFinal: "destruction" | "conservation_definitive" | "tri"
  classificationParDefaut: GedClassification
}

const AUDCIF = "AUDCIF OHADA, art. 24 : livres et pièces justificatives conservés dix ans"
const POLITIQUE = "Politique d'archivage SETRAG — durée à confirmer par la Direction juridique"

export const PLAN_CLASSEMENT: readonly SerieClassement[] = [
  {
    code: "BOC.ARR",
    libelle: "Courrier arrivé",
    direction: "BOC",
    processus: "Courrier officiel",
    description: "Courriers reçus des ministères, de l'ARTF, des clients et des riverains, numérisés à l'arrivée.",
    conservationAnnees: 5,
    baseConservation: POLITIQUE,
    aValider: true,
    sortFinal: "tri",
    classificationParDefaut: "interne",
  },
  {
    code: "BOC.DEP",
    libelle: "Courrier départ",
    direction: "BOC",
    processus: "Courrier officiel",
    description: "Courriers signés et expédiés par la SETRAG, avec leur accusé d'envoi.",
    conservationAnnees: 5,
    baseConservation: POLITIQUE,
    aValider: true,
    sortFinal: "tri",
    classificationParDefaut: "interne",
  },
  {
    code: "DG.CA",
    libelle: "Conseil d'administration",
    direction: "DG",
    processus: "Gouvernance",
    description: "Procès-verbaux, délibérations et dossiers du conseil d'administration.",
    conservationAnnees: null,
    baseConservation: "Registre des délibérations : conservation définitive (AUSCGIE OHADA) — à confirmer",
    aValider: true,
    sortFinal: "conservation_definitive",
    classificationParDefaut: "restreint",
  },
  {
    code: "DG.NS",
    libelle: "Notes de service et circulaires",
    direction: "DG",
    processus: "Communication interne",
    description: "Notes de service, circulaires et instructions diffusées au personnel.",
    conservationAnnees: 10,
    baseConservation: POLITIQUE,
    aValider: true,
    sortFinal: "tri",
    classificationParDefaut: "interne",
  },
  {
    code: "DJ.CTR",
    libelle: "Contrats et conventions",
    direction: "DJ",
    processus: "Contrats",
    description: "Contrats de transport, de fourniture et de maintenance, conventions et avenants.",
    conservationAnnees: 10,
    baseConservation:
      "Prescription commerciale OHADA (AUDCG, art. 16 : cinq ans) majorée par la politique SETRAG — à confirmer",
    aValider: true,
    sortFinal: "tri",
    classificationParDefaut: "confidentiel",
  },
  {
    code: "DJ.CONT",
    libelle: "Contentieux",
    direction: "DJ",
    processus: "Contentieux",
    description: "Dossiers de litiges clients, fournisseurs et riverains.",
    conservationAnnees: 10,
    baseConservation: POLITIQUE,
    aValider: true,
    sortFinal: "tri",
    classificationParDefaut: "restreint",
  },
  {
    code: "DFC.PJ",
    libelle: "Pièces justificatives comptables",
    direction: "DFC",
    processus: "Comptabilité",
    description: "Factures, bons de commande, relevés et justificatifs d'écritures.",
    conservationAnnees: 10,
    baseConservation: AUDCIF,
    aValider: false,
    sortFinal: "destruction",
    classificationParDefaut: "interne",
  },
  {
    code: "DFC.EF",
    libelle: "États financiers et livres",
    direction: "DFC",
    processus: "Comptabilité",
    description: "Grand livre, balances, états financiers annuels et rapports du commissaire aux comptes.",
    conservationAnnees: 10,
    baseConservation: AUDCIF,
    aValider: false,
    sortFinal: "tri",
    classificationParDefaut: "confidentiel",
  },
  {
    code: "DRH.PAIE",
    libelle: "Paie et déclarations sociales",
    direction: "DRH",
    processus: "Paie",
    description: "Journaux de paie, déclarations CNSS et CNAMGS.",
    conservationAnnees: 10,
    baseConservation: AUDCIF,
    aValider: false,
    sortFinal: "destruction",
    classificationParDefaut: "restreint",
  },
  {
    code: "DRH.ORG",
    libelle: "Organisation et roulements",
    direction: "DRH",
    processus: "Organisation du travail",
    description: "Organigrammes, roulements, plannings de repos et accords d'établissement.",
    conservationAnnees: 5,
    baseConservation: POLITIQUE,
    aValider: true,
    sortFinal: "destruction",
    classificationParDefaut: "interne",
  },
  {
    code: "DEF.SEC",
    libelle: "Sécurité de l'exploitation",
    direction: "DEF",
    processus: "Exploitation",
    description: "Rapports d'événements de sécurité, procès-verbaux d'incidents et retours d'expérience.",
    conservationAnnees: 10,
    baseConservation: POLITIQUE,
    aValider: true,
    sortFinal: "tri",
    classificationParDefaut: "interne",
  },
  {
    code: "DEF.REG",
    libelle: "Règlementation d'exploitation",
    direction: "DEF",
    processus: "Exploitation",
    description: "Règlement général d'exploitation, consignes de ligne et avis de modification.",
    conservationAnnees: null,
    baseConservation: "Référentiel réglementaire : conservation définitive des versions successives",
    aValider: false,
    sortFinal: "conservation_definitive",
    classificationParDefaut: "interne",
  },
  {
    code: "DMAT.MAINT",
    libelle: "Maintenance du matériel roulant",
    direction: "DMAT",
    processus: "Maintenance",
    description: "Rapports de visite, dossiers de révision et expertises des locomotives et wagons.",
    conservationAnnees: 15,
    baseConservation: POLITIQUE,
    aValider: true,
    sortFinal: "tri",
    classificationParDefaut: "interne",
  },
  {
    code: "DINFRA.PLANS",
    libelle: "Plans et ouvrages",
    direction: "DINFRA",
    processus: "Patrimoine",
    description: "Plans de voie, d'ouvrages d'art et de bâtiments ; dossiers des ouvrages exécutés.",
    conservationAnnees: null,
    baseConservation: "Dossier des ouvrages : conservation définitive (patrimoine ferroviaire)",
    aValider: true,
    sortFinal: "conservation_definitive",
    classificationParDefaut: "interne",
  },
  {
    code: "DCFV.FRET",
    libelle: "Documents de transport fret",
    direction: "DCFV",
    processus: "Commercial fret",
    description: "Lettres de voiture, bordereaux de pesée et attestations de livraison.",
    conservationAnnees: 10,
    baseConservation: AUDCIF,
    aValider: false,
    sortFinal: "destruction",
    classificationParDefaut: "interne",
  },
  {
    code: "DSED.ENV",
    libelle: "Environnement et parc de la Lopé",
    direction: "DSED",
    processus: "Environnement",
    description: "Rapports de suivi environnemental, corridors de faune, prévention des feux.",
    conservationAnnees: 10,
    baseConservation: POLITIQUE,
    aValider: true,
    sortFinal: "tri",
    classificationParDefaut: "interne",
  },
  {
    code: "DSI.PROJ",
    libelle: "Projets du système d'information",
    direction: "DSI",
    processus: "Projets SI",
    description: "Dossiers de cadrage, recettes et procès-verbaux de mise en service.",
    conservationAnnees: 5,
    baseConservation: POLITIQUE,
    aValider: true,
    sortFinal: "destruction",
    classificationParDefaut: "interne",
  },
]

/** Clés des acteurs du jeu, résolues par rôle au moment du seed. */
export type CleActeur =
  | "juriste"
  | "direction"
  | "audit"
  | "gestionnaire"
  | "comptable"
  | "exploitation"
  | "fret"
  | "infra"
  | "materiel"
  | "rh"
  | "securite"

export const ROLES_ACTEURS: Record<CleActeur, readonly string[]> = {
  juriste: ["juriste"],
  direction: ["direction_generale"],
  audit: ["audit_risques"],
  gestionnaire: ["admin_fonctionnel"],
  comptable: ["comptable", "comptable_auxiliaire", "fiscaliste_tresorier", "tresorier"],
  exploitation: ["chef_gare", "chef_train", "regulateur_cotraf"],
  fret: ["gestionnaire_fret", "gestionnaire_litiges_fret"],
  infra: ["responsable_prn", "agent_voie", "agent_ouvrages_ponts"],
  materiel: ["responsable_atelier", "ingenieur_atelier", "contremaitre_atelier"],
  rh: ["gestionnaire_paie", "planificateur_roulements"],
  securite: ["inspecteur_securite", "enqueteur_accidents", "responsable_environnement"],
}

export interface GabaritPiece {
  serie: string
  type: GedType
  titre: string
  motsCles: readonly string[]
  auteur: CleActeur
  correspondant?: string
  classification?: GedClassification
}

/** Gabarits par série : chacun devient une ou deux pièces datées. */
export const GABARITS: readonly GabaritPiece[] = [
  // Courrier arrivé
  { serie: "BOC.ARR", type: "courrier_entrant", titre: "Demande de rapport trimestriel de sécurité", motsCles: ["artf", "sécurité", "rapport"], auteur: "juriste", correspondant: "ARTF — Direction du contrôle" },
  { serie: "BOC.ARR", type: "courrier_entrant", titre: "Programmation des tonnages de manganèse du trimestre", motsCles: ["comilog", "manganèse", "programmation"], auteur: "fret", correspondant: "COMILOG — Direction logistique" },
  { serie: "BOC.ARR", type: "courrier_entrant", titre: "Réclamation de riverains sur le passage à niveau de Ndjolé", motsCles: ["riverains", "passage à niveau", "ndjolé"], auteur: "juriste", correspondant: "Collectif des riverains de Ndjolé" },
  { serie: "BOC.ARR", type: "courrier_entrant", titre: "Convocation à la réunion de suivi de la concession", motsCles: ["ministère", "concession", "réunion"], auteur: "direction", correspondant: "Ministère des Transports" },
  { serie: "BOC.ARR", type: "courrier_entrant", titre: "Demande d'attestation de transport de grumes", motsCles: ["bois", "attestation", "eaux et forêts"], auteur: "fret", correspondant: "Direction générale des Eaux et Forêts" },
  { serie: "BOC.ARR", type: "courrier_entrant", titre: "Notification d'audit de conformité douanière", motsCles: ["douanes", "audit", "conformité"], auteur: "comptable", correspondant: "Direction générale des Douanes" },
  { serie: "BOC.ARR", type: "courrier_entrant", titre: "Proposition commerciale de fourniture de traverses béton", motsCles: ["traverses", "fournisseur", "offre"], auteur: "infra", correspondant: "Fournisseur de traverses — offre spontanée" },
  { serie: "BOC.ARR", type: "courrier_entrant", titre: "Relance sur le règlement de la facture de maintenance", motsCles: ["facture", "relance", "maintenance"], auteur: "comptable", correspondant: "Prestataire de maintenance" },
  // Courrier départ
  { serie: "BOC.DEP", type: "courrier_sortant", titre: "Transmission du rapport trimestriel de sécurité", motsCles: ["artf", "sécurité", "transmission"], auteur: "securite", correspondant: "ARTF — Direction du contrôle" },
  { serie: "BOC.DEP", type: "courrier_sortant", titre: "Réponse aux riverains sur la signalisation du passage à niveau", motsCles: ["riverains", "réponse", "signalisation"], auteur: "juriste", correspondant: "Collectif des riverains de Ndjolé" },
  { serie: "BOC.DEP", type: "courrier_sortant", titre: "Confirmation du plan de transport minerai", motsCles: ["comilog", "plan de transport"], auteur: "fret", correspondant: "COMILOG — Direction logistique" },
  { serie: "BOC.DEP", type: "courrier_sortant", titre: "Attestation de transport de grumes délivrée", motsCles: ["bois", "attestation"], auteur: "fret", correspondant: "Direction générale des Eaux et Forêts" },
  // Conseil d'administration
  { serie: "DG.CA", type: "proces_verbal", titre: "Procès-verbal du conseil d'administration — session ordinaire", motsCles: ["conseil", "délibérations"], auteur: "direction", classification: "restreint" },
  { serie: "DG.CA", type: "rapport", titre: "Dossier du conseil — budget d'investissement voie", motsCles: ["conseil", "budget", "voie"], auteur: "direction", classification: "restreint" },
  // Notes de service
  { serie: "DG.NS", type: "note_service", titre: "Port obligatoire des équipements de protection en atelier", motsCles: ["epi", "atelier", "sécurité"], auteur: "securite" },
  { serie: "DG.NS", type: "note_service", titre: "Horaires d'été des guichets voyageurs", motsCles: ["guichets", "horaires"], auteur: "exploitation" },
  { serie: "DG.NS", type: "note_service", titre: "Procédure de déclaration des heurts d'animaux", motsCles: ["faune", "lopé", "déclaration"], auteur: "securite" },
  { serie: "DG.NS", type: "note_service", titre: "Campagne de visite médicale d'aptitude des conducteurs", motsCles: ["aptitude", "médecine du travail", "conducteurs"], auteur: "rh" },
  { serie: "DG.NS", type: "note_service", titre: "Gel des engagements de dépenses non prioritaires", motsCles: ["budget", "dépenses"], auteur: "comptable" },
  { serie: "DG.NS", type: "note_service", titre: "Mise en service du parapheur électronique", motsCles: ["parapheur", "ged", "dématérialisation"], auteur: "gestionnaire" },
  // Contrats
  { serie: "DJ.CTR", type: "contrat", titre: "Avenant à la convention de transport de minerai", motsCles: ["comilog", "avenant", "minerai"], auteur: "juriste", correspondant: "COMILOG" },
  { serie: "DJ.CTR", type: "contrat", titre: "Contrat de maintenance des locomotives de ligne", motsCles: ["locomotives", "maintenance", "contrat"], auteur: "juriste", correspondant: "Prestataire de maintenance" },
  { serie: "DJ.CTR", type: "contrat", titre: "Contrat de fourniture de gazole de traction", motsCles: ["gazole", "fourniture"], auteur: "juriste", correspondant: "Distributeur pétrolier" },
  { serie: "DJ.CTR", type: "contrat", titre: "Bail des logements de la cité cheminote de Booué", motsCles: ["bail", "booué", "logements"], auteur: "juriste", correspondant: "Bailleur privé" },
  { serie: "DJ.CTR", type: "contrat", titre: "Convention de transport de bois transformé vers Nkok", motsCles: ["bois", "nkok", "convention"], auteur: "juriste", correspondant: "Opérateur de la zone de Nkok" },
  // Contentieux
  { serie: "DJ.CONT", type: "rapport", titre: "Dossier de litige — avarie sur wagon de grumes", motsCles: ["litige", "avarie", "grumes"], auteur: "juriste", classification: "restreint" },
  // Pièces comptables
  { serie: "DFC.PJ", type: "piece_comptable", titre: "Facture de semelles de frein composite", motsCles: ["facture", "freinage", "achats"], auteur: "comptable", correspondant: "Fournisseur ferroviaire" },
  { serie: "DFC.PJ", type: "piece_comptable", titre: "Bon de commande de ballast pour la section Lopé", motsCles: ["ballast", "commande"], auteur: "comptable", correspondant: "Carrière agréée" },
  { serie: "DFC.PJ", type: "piece_comptable", titre: "Relevé bancaire mensuel du compte recettes", motsCles: ["banque", "relevé", "recettes"], auteur: "comptable" },
  { serie: "DFC.PJ", type: "piece_comptable", titre: "Facture de transport de manganèse", motsCles: ["facture", "manganèse", "fret"], auteur: "comptable", correspondant: "COMILOG" },
  // États financiers
  { serie: "DFC.EF", type: "rapport", titre: "Balance générale de clôture mensuelle", motsCles: ["balance", "clôture"], auteur: "comptable", classification: "confidentiel" },
  // Paie
  { serie: "DRH.PAIE", type: "piece_comptable", titre: "Journal de paie mensuel", motsCles: ["paie", "journal"], auteur: "rh", classification: "restreint" },
  { serie: "DRH.PAIE", type: "rapport", titre: "Déclaration mensuelle CNSS", motsCles: ["cnss", "déclaration"], auteur: "rh", classification: "restreint" },
  // Organisation
  { serie: "DRH.ORG", type: "procedure", titre: "Roulement des équipes de conduite — secteur Booué", motsCles: ["roulement", "conduite", "booué"], auteur: "rh" },
  { serie: "DRH.ORG", type: "rapport", titre: "Organigramme de la direction de l'exploitation", motsCles: ["organigramme", "exploitation"], auteur: "rh" },
  // Sécurité d'exploitation
  { serie: "DEF.SEC", type: "proces_verbal", titre: "Procès-verbal d'incident — heurt d'animal au PK 214", motsCles: ["incident", "faune", "pk 214"], auteur: "exploitation" },
  { serie: "DEF.SEC", type: "rapport", titre: "Retour d'expérience — rupture d'attelage en ligne", motsCles: ["rex", "attelage"], auteur: "securite" },
  { serie: "DEF.SEC", type: "rapport", titre: "Rapport trimestriel des événements de sécurité", motsCles: ["sécurité", "trimestriel", "artf"], auteur: "securite" },
  // Règlementation
  { serie: "DEF.REG", type: "procedure", titre: "Consigne de croisement en voie unique — gare de Booué", motsCles: ["croisement", "voie unique", "booué"], auteur: "exploitation" },
  { serie: "DEF.REG", type: "procedure", titre: "Avis de limitation temporaire de vitesse — section Lopé", motsCles: ["ltv", "vitesse", "lopé"], auteur: "infra" },
  // Maintenance
  { serie: "DMAT.MAINT", type: "rapport", titre: "Rapport de révision générale de locomotive", motsCles: ["révision", "locomotive"], auteur: "materiel" },
  { serie: "DMAT.MAINT", type: "rapport", titre: "Expertise d'usure des essieux — tour en fosse d'Owendo", motsCles: ["essieux", "usure", "owendo"], auteur: "materiel" },
  { serie: "DMAT.MAINT", type: "procedure", titre: "Gamme de visite des wagons minéraliers", motsCles: ["wagons", "visite", "minéraliers"], auteur: "materiel" },
  // Plans
  { serie: "DINFRA.PLANS", type: "plan_technique", titre: "Plan du pont sur l'Ogooué — relevé de structure", motsCles: ["pont", "ogooué", "ouvrage d'art"], auteur: "infra" },
  { serie: "DINFRA.PLANS", type: "plan_technique", titre: "Plan des voies de la gare de triage d'Owendo", motsCles: ["triage", "owendo", "voies"], auteur: "infra" },
  { serie: "DINFRA.PLANS", type: "rapport", titre: "Dossier des ouvrages exécutés — renouvellement de voie", motsCles: ["renouvellement", "voie", "doe"], auteur: "infra" },
  // Fret
  { serie: "DCFV.FRET", type: "piece_comptable", titre: "Lettre de voiture — train minéralier", motsCles: ["lettre de voiture", "minerai"], auteur: "fret" },
  { serie: "DCFV.FRET", type: "rapport", titre: "Bordereau de pesée dynamique — Moanda", motsCles: ["pesée", "moanda"], auteur: "fret" },
  { serie: "DCFV.FRET", type: "piece_comptable", titre: "Attestation de livraison de bois transformé", motsCles: ["livraison", "bois"], auteur: "fret" },
  // Environnement
  { serie: "DSED.ENV", type: "rapport", titre: "Suivi des corridors de passage d'éléphants", motsCles: ["éléphants", "corridors", "lopé"], auteur: "securite" },
  { serie: "DSED.ENV", type: "rapport", titre: "Plan de prévention des feux de brousse", motsCles: ["feux", "prévention"], auteur: "securite" },
  // SI
  { serie: "DSI.PROJ", type: "rapport", titre: "Procès-verbal de recette du portail agent", motsCles: ["recette", "portail", "si"], auteur: "gestionnaire" },
  { serie: "DSI.PROJ", type: "rapport", titre: "Dossier de cadrage de la GED", motsCles: ["ged", "cadrage"], auteur: "gestionnaire" },
]

/** Pièces portant un vrai fichier généré : clé de gabarit → contenu. */
export interface FichierDemo {
  titre: string
  surtitre: string
  emetteur: string
  destinataire?: string
  paragraphes: readonly string[]
  signature?: string
}

export const MENTION_DEMO =
  "Document de démonstration généré automatiquement pour la recette de la GED SETRAG. Contenu fictif, sans valeur juridique, comptable ni probante."

export const FICHIERS_DEMO: Record<string, FichierDemo> = {
  "Mise en service du parapheur électronique": {
    titre: "Mise en service du parapheur électronique",
    surtitre: "Note de service",
    emetteur: "Direction générale",
    destinataire: "Ensemble du personnel",
    paragraphes: [
      "À compter de la date de diffusion de la présente note, les notes de service, les contrats et le courrier sortant suivent un circuit de validation dans la GED : visas successifs, signature, puis diffusion.",
      "Chaque intervenant reçoit la pièce dans son parapheur. Un refus est toujours motivé ; il renvoie la pièce à son auteur pour correction.",
      "Les notes diffusées doivent faire l'objet d'un accusé de lecture dans un délai de cinq jours ouvrés.",
    ],
    signature: "La Direction générale",
  },
  "Port obligatoire des équipements de protection en atelier": {
    titre: "Port obligatoire des équipements de protection en atelier",
    surtitre: "Note de service",
    emetteur: "Direction sécurité et environnement",
    destinataire: "Personnel des ateliers d'Owendo",
    paragraphes: [
      "Le port du casque, des chaussures de sécurité et des lunettes de protection est obligatoire dans l'enceinte des ateliers, y compris pour les visiteurs.",
      "Les chefs d'équipe vérifient le port des équipements à la prise de service et consignent tout manquement.",
    ],
    signature: "Le Directeur sécurité et environnement",
  },
  "Avenant à la convention de transport de minerai": {
    titre: "Avenant à la convention de transport de minerai",
    surtitre: "Contrat — projet soumis à visa",
    emetteur: "Direction des affaires juridiques",
    destinataire: "Client minier",
    paragraphes: [
      "Article 1 — Objet. Le présent avenant ajuste le programme prévisionnel de tonnages et le calendrier des rotations des trains minéraliers.",
      "Article 2 — Programmation. Les parties arrêtent chaque trimestre un plan de transport, révisable d'un commun accord en cas d'aléa d'exploitation.",
      "Article 3 — Entrée en vigueur. L'avenant prend effet à la date de sa signature par les deux parties.",
    ],
    signature: "Pour la SETRAG, la Direction générale",
  },
  "Demande de rapport trimestriel de sécurité": {
    titre: "Demande de rapport trimestriel de sécurité",
    surtitre: "Courrier arrivé",
    emetteur: "Autorité de régulation des transports ferroviaires",
    destinataire: "Direction générale de la SETRAG",
    paragraphes: [
      "Nous vous prions de bien vouloir nous transmettre le rapport trimestriel des événements de sécurité survenus sur le réseau, accompagné des mesures correctives engagées.",
      "Ce rapport est attendu dans un délai de trente jours à compter de la réception du présent courrier.",
    ],
    signature: "Le Directeur du contrôle",
  },
  "Procès-verbal d'incident — heurt d'animal au PK 214": {
    titre: "Procès-verbal d'incident — heurt d'animal au PK 214",
    surtitre: "Procès-verbal",
    emetteur: "Direction de l'exploitation",
    paragraphes: [
      "Un train de voyageurs a heurté un animal au point kilométrique 214, dans la traversée du parc national de la Lopé. Aucun blessé n'est à déplorer.",
      "Le train a repris sa marche après inspection visuelle du bogie avant. Le retard constaté à l'arrivée est de 24 minutes.",
      "Le service environnement est informé pour le suivi des corridors de faune.",
    ],
    signature: "Le Chef de gare",
  },
  "Rapport de révision générale de locomotive": {
    titre: "Rapport de révision générale de locomotive",
    surtitre: "Rapport de maintenance",
    emetteur: "Direction du matériel roulant — ateliers d'Owendo",
    paragraphes: [
      "La révision générale comprend le démontage des bogies, le reprofilage des essieux, le contrôle des moteurs de traction et la remise à niveau du circuit de freinage.",
      "Les mesures d'usure relevées restent dans les tolérances. La locomotive est remise en service après essais statiques et dynamiques.",
    ],
    signature: "L'Ingénieur atelier",
  },
  "Facture de semelles de frein composite": {
    titre: "Facture de semelles de frein composite",
    surtitre: "Pièce comptable",
    emetteur: "Fournisseur ferroviaire",
    destinataire: "SETRAG — Direction finance et comptabilité",
    paragraphes: [
      "Fourniture de semelles de frein composite pour wagons minéraliers, conformément au bon de commande associé.",
      "Montant à régler selon les conditions contractuelles. Pièce justificative à conserver dix ans (AUDCIF OHADA, article 24).",
    ],
  },
  "Transmission du rapport trimestriel de sécurité": {
    titre: "Transmission du rapport trimestriel de sécurité",
    surtitre: "Courrier départ",
    emetteur: "Direction générale de la SETRAG",
    destinataire: "Autorité de régulation des transports ferroviaires",
    paragraphes: [
      "Faisant suite à votre courrier, nous vous transmettons le rapport trimestriel des événements de sécurité et le plan d'actions correctives associé.",
      "Nous restons à votre disposition pour toute précision.",
    ],
    signature: "La Direction générale",
  },
}

/** Correspondants du registre du courrier. */
export const CORRESPONDANTS_ARRIVEE: readonly { nom: string; objets: readonly string[]; direction: string }[] = [
  { nom: "ARTF — Direction du contrôle", direction: "DSED", objets: ["Demande de rapport de sécurité", "Inspection de la section Lopé", "Avis sur la limitation de vitesse"] },
  { nom: "Ministère des Transports", direction: "DG", objets: ["Convocation à une réunion de suivi", "Demande de statistiques de trafic", "Note sur la tarification sociale"] },
  { nom: "COMILOG — Direction logistique", direction: "DCFV", objets: ["Programmation des tonnages", "Réclamation sur un retard de rotation", "Demande de wagons supplémentaires"] },
  { nom: "Direction générale des Douanes", direction: "DFC", objets: ["Notification d'audit", "Demande de pièces justificatives"] },
  { nom: "Direction générale des Impôts", direction: "DFC", objets: ["Relance de déclaration", "Demande de justificatifs de TVA"] },
  { nom: "CNSS", direction: "DRH", objets: ["Appel de cotisations", "Contrôle d'assiette"] },
  { nom: "Collectif des riverains de Ndjolé", direction: "DJ", objets: ["Réclamation sur un passage à niveau", "Demande d'indemnisation"] },
  { nom: "Direction générale des Eaux et Forêts", direction: "DCFV", objets: ["Demande d'attestation de transport", "Contrôle de traçabilité des grumes"] },
  { nom: "Mairie de Booué", direction: "DEF", objets: ["Demande de desserte supplémentaire", "Projet de traversée piétonne"] },
  { nom: "Bailleur de fonds — mission de supervision", direction: "DINFRA", objets: ["Rapport de mission", "Demande d'avancement des travaux"] },
]

export const CORRESPONDANTS_DEPART: readonly { nom: string; objets: readonly string[]; direction: string }[] = [
  { nom: "ARTF — Direction du contrôle", direction: "DSED", objets: ["Transmission de rapport de sécurité", "Réponse sur la limitation de vitesse"] },
  { nom: "Ministère des Transports", direction: "DG", objets: ["Transmission des statistiques de trafic", "Compte rendu de réunion"] },
  { nom: "COMILOG — Direction logistique", direction: "DCFV", objets: ["Confirmation du plan de transport", "Réponse à réclamation"] },
  { nom: "Direction générale des Impôts", direction: "DFC", objets: ["Transmission de justificatifs"] },
  { nom: "Collectif des riverains de Ndjolé", direction: "DJ", objets: ["Réponse à réclamation"] },
  { nom: "Fournisseur ferroviaire", direction: "DMAT", objets: ["Notification de commande", "Mise en demeure de livraison"] },
]
