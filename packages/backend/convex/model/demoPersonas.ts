import type { ModuleCode } from "../modules/platform/catalog"
import type { AppRole } from "./permissions"

export const DEMO_PERSONA_GROUPS = {
  gouvernance: "Gouvernance",
  dsi: "DSI · Systèmes d’information & projets métiers",
  def: "DEF · Exploitation ferroviaire",
  dmat: "DMAT · Matériel roulant",
  dinfra: "DINFRA · Installations fixes",
  dcfv: "DCFV · Commercial fret & voyageurs",
  dfc: "DFC · Finance & comptabilité",
  drh: "DRH · Ressources humaines",
  dsed: "DSED · Sécurité & environnement",
  partenaires_industriels: "Partenaires industriels",
  institutions_publiques: "Institutions publiques",
  bailleurs_fonds: "Bailleurs de fonds",
} as const

export type DemoPersonaGroup = keyof typeof DEMO_PERSONA_GROUPS
export type DemoActorType = "interne" | "externe"

export interface DemoPersona {
  readonly key: string
  readonly label: string
  readonly description: string
  readonly actorType: DemoActorType
  readonly group: DemoPersonaGroup
  readonly groupLabel: (typeof DEMO_PERSONA_GROUPS)[DemoPersonaGroup]
  readonly role: AppRole
  readonly landingPath: string
  readonly moduleCodes: readonly ModuleCode[]
  readonly firstName: string
  readonly lastName: string
  /**
   * Point de vente de rattachement, pour les profils qui encaissent : sans
   * lui, le compte ne peut ouvrir aucune caisse.
   */
  readonly pointOfSaleCode?: string
}

function persona(value: Omit<DemoPersona, "groupLabel">): DemoPersona {
  return { ...value, groupLabel: DEMO_PERSONA_GROUPS[value.group] }
}

/**
 * Catalogue pur des profils proposés par les environnements de démonstration.
 *
 * Les groupes, rôles et modules reprennent la cartographie des acteurs SETRAG ;
 * les identités sont volontairement génériques et ne représentent personne.
 */
export const DEMO_PERSONAS = [
  persona({
    key: "gestion",
    label: "Direction générale",
    description: "Pilotage exécutif du réseau SETRAG",
    actorType: "interne",
    group: "gouvernance",
    role: "direction_generale",
    landingPath: "/direction",
    moduleCodes: [
      "voyageurs",
      "fret",
      "cotraf",
      "gmao",
      "infrastructure",
      "finance",
      "rh",
      "ged",
      "securite",
      "copilot",
    ],
    firstName: "Démo",
    lastName: "Direction",
  }),
  persona({
    key: "audit",
    label: "Audit & risques",
    description: "Contrôle interne, conformité et maîtrise des risques",
    actorType: "interne",
    group: "gouvernance",
    role: "audit_risques",
    landingPath: "/securite",
    moduleCodes: ["finance", "ged", "securite", "copilot"],
    firstName: "Démo",
    lastName: "Audit",
  }),
  persona({
    key: "juridique",
    label: "Affaires juridiques",
    description: "Contrats, contentieux et conformité documentaire",
    actorType: "interne",
    group: "gouvernance",
    role: "juriste",
    landingPath: "/bureautique",
    moduleCodes: ["ged", "securite", "copilot"],
    firstName: "Démo",
    lastName: "Juridique",
  }),
  persona({
    key: "dsi",
    label:
      "Administrateur système — Direction des Systèmes d’Information & Projets Métiers",
    description:
      "Administration du SI SETRAG : architecture, accès, exploitation et gouvernance des systèmes maîtres",
    actorType: "interne",
    group: "dsi",
    role: "admin_it",
    landingPath: "/administration",
    moduleCodes: [
      "voyageurs",
      "fret",
      "cotraf",
      "gmao",
      "infrastructure",
      "finance",
      "rh",
      "ged",
      "securite",
      "copilot",
    ],
    firstName: "Démo",
    lastName: "DSI",
  }),
  persona({
    key: "admin-fonctionnel",
    label: "Administrateur fonctionnel billettique",
    description: "Paramétrage commercial : livrets, grilles tarifaires, yield, points de vente",
    actorType: "interne",
    group: "dsi",
    role: "admin_fonctionnel",
    landingPath: "/gestion",
    // Sécurité : les incidents d'exploitation et les procès-verbaux en
    // relèvent, et ce rôle les administre.
    moduleCodes: ["voyageurs", "finance", "securite", "rh", "ged", "copilot"],
    firstName: "Démo",
    lastName: "Paramétrage",
  }),
  persona({
    key: "cotraf",
    label: "Régulateur COTRAF",
    description: "Régulation en temps réel de la circulation ferroviaire",
    actorType: "interne",
    group: "def",
    role: "regulateur_cotraf",
    landingPath: "/cotraf",
    moduleCodes: ["cotraf", "securite", "copilot"],
    firstName: "Démo",
    lastName: "Régulation",
  }),
  persona({
    key: "chef-gare",
    label: "Chef de gare",
    description: "Circulation locale, quais et interface chargeurs",
    actorType: "interne",
    group: "def",
    role: "chef_gare",
    landingPath: "/cotraf",
    moduleCodes: ["voyageurs", "fret", "cotraf", "ged", "securite"],
    firstName: "Démo",
    lastName: "Gare",
  }),
  persona({
    key: "conducteur",
    label: "Conducteur de ligne",
    description: "Conduite des trains et application des bulletins de marche",
    actorType: "interne",
    group: "def",
    role: "conducteur_ligne",
    landingPath: "/cotraf",
    moduleCodes: ["cotraf", "ged", "securite"],
    firstName: "Démo",
    lastName: "Conduite",
  }),
  persona({
    key: "controle",
    label: "Contrôleur",
    description: "Contrôle des titres, litiges et procès-verbaux à bord",
    actorType: "interne",
    group: "def",
    role: "controleur_train",
    landingPath: "/securite",
    moduleCodes: ["voyageurs", "securite", "ged"],
    firstName: "Démo",
    lastName: "Contrôle",
  }),
  persona({
    key: "chef-train",
    label: "Chef de train",
    description: "Sécurité du train et coordination des opérations à bord",
    actorType: "interne",
    group: "def",
    role: "chef_train",
    landingPath: "/securite",
    moduleCodes: ["voyageurs", "cotraf", "ged", "securite"],
    firstName: "Démo",
    lastName: "Chef-de-train",
  }),
  persona({
    key: "visite-rames",
    label: "Visiteur de rames",
    description: "Inspection technique des wagons avant départ",
    actorType: "interne",
    group: "def",
    role: "visiteur_rames",
    landingPath: "/materiel",
    moduleCodes: ["gmao", "securite"],
    firstName: "Démo",
    lastName: "Visite",
  }),
  persona({
    key: "atelier",
    label: "Ingénieur d’atelier",
    description: "Ingénierie de maintenance du matériel roulant",
    actorType: "interne",
    group: "dmat",
    role: "ingenieur_atelier",
    landingPath: "/materiel",
    moduleCodes: ["gmao", "finance", "ged", "copilot"],
    firstName: "Démo",
    lastName: "Atelier",
  }),
  persona({
    key: "contremaitre-atelier",
    label: "Contremaître d’atelier",
    description: "Encadrement des travaux de maintenance en atelier",
    actorType: "interne",
    group: "dmat",
    role: "contremaitre_atelier",
    landingPath: "/materiel",
    moduleCodes: ["gmao", "ged", "securite"],
    firstName: "Démo",
    lastName: "Contremaître",
  }),
  persona({
    key: "magasin",
    label: "Magasinier pièces",
    description: "Stocks et traçabilité des pièces de rechange",
    actorType: "interne",
    group: "dmat",
    role: "magasinier",
    landingPath: "/materiel",
    moduleCodes: ["gmao", "finance"],
    firstName: "Démo",
    lastName: "Magasin",
  }),
  persona({
    key: "stocks",
    label: "Gestionnaire de stocks",
    description: "Réapprovisionnement et pilotage des stocks critiques",
    actorType: "interne",
    group: "dmat",
    role: "gestionnaire_stocks",
    landingPath: "/materiel",
    moduleCodes: ["gmao", "finance", "copilot"],
    firstName: "Démo",
    lastName: "Stocks",
  }),
  persona({
    key: "voie",
    label: "Brigade de voie",
    description: "Surveillance terrain et anomalies de la voie",
    actorType: "interne",
    group: "dinfra",
    role: "agent_voie",
    landingPath: "/infrastructures",
    moduleCodes: ["infrastructure", "ged", "securite"],
    firstName: "Démo",
    lastName: "Voie",
  }),
  persona({
    key: "cantonnier",
    label: "Cantonnier",
    description: "Surveillance à pied et signalement des défauts de voie",
    actorType: "interne",
    group: "dinfra",
    role: "cantonnier",
    landingPath: "/infrastructures",
    moduleCodes: ["infrastructure", "ged", "securite"],
    firstName: "Démo",
    lastName: "Cantonnier",
  }),
  persona({
    key: "prn",
    label: "Responsable PRN",
    description: "Planification et suivi du programme de remise à niveau",
    actorType: "interne",
    group: "dinfra",
    role: "responsable_prn",
    landingPath: "/infrastructures",
    moduleCodes: ["cotraf", "infrastructure", "finance", "ged", "copilot"],
    firstName: "Démo",
    lastName: "PRN",
  }),
  persona({
    key: "ouvrages-ponts",
    label: "Responsable ouvrages d’art & ponts",
    description: "Surveillance et maintenance des ouvrages d’art",
    actorType: "interne",
    group: "dinfra",
    role: "agent_ouvrages_ponts",
    landingPath: "/infrastructures",
    moduleCodes: ["gmao", "infrastructure", "ged", "securite"],
    firstName: "Démo",
    lastName: "Ouvrages",
  }),
  persona({
    key: "signalisation",
    label: "Technicien signalisation",
    description: "Maintenance des feux, boucles et passages à niveau",
    actorType: "interne",
    group: "dinfra",
    role: "technicien_signalisation",
    landingPath: "/infrastructures",
    moduleCodes: ["cotraf", "gmao", "infrastructure", "securite"],
    firstName: "Démo",
    lastName: "Signalisation",
  }),
  persona({
    key: "telecoms",
    label: "Technicien télécoms",
    description: "Maintenance du réseau radio sol-train et de la fibre",
    actorType: "interne",
    group: "dinfra",
    role: "technicien_telecoms",
    landingPath: "/infrastructures",
    moduleCodes: ["cotraf", "gmao", "infrastructure", "securite"],
    firstName: "Démo",
    lastName: "Télécoms",
  }),
  persona({
    key: "agent",
    label: "Guichetier",
    description: "Vente et encaissement au guichet",
    actorType: "interne",
    group: "dcfv",
    role: "vendeur_guichet",
    landingPath: "/vente",
    moduleCodes: ["voyageurs", "ged"],
    firstName: "Démo",
    lastName: "Vente",
    pointOfSaleCode: "OWE-PV",
  }),
  persona({
    key: "agence",
    label: "Vendeur en agence accréditée",
    description: "Vente pour le compte de SETRAG dans une agence partenaire",
    actorType: "interne",
    group: "dcfv",
    role: "vendeur_agence",
    landingPath: "/vente",
    moduleCodes: ["voyageurs"],
    firstName: "Démo",
    lastName: "Agence",
    pointOfSaleCode: "AG-LBV-MBT",
  }),
  persona({
    key: "chef-vente",
    label: "Chef de vente",
    description: "Supervision de la billetterie et des arrêtés de caisse",
    actorType: "interne",
    group: "dcfv",
    role: "chef_vente",
    landingPath: "/gestion",
    moduleCodes: ["voyageurs", "finance", "copilot"],
    firstName: "Démo",
    lastName: "Chef-de-vente",
  }),
  persona({
    key: "fret",
    label: "Gestionnaire grands comptes fret",
    description: "Contrats, lettres de voiture et facturation fret",
    actorType: "interne",
    group: "dcfv",
    role: "gestionnaire_fret",
    landingPath: "/fret",
    moduleCodes: ["fret", "finance", "ged", "copilot"],
    firstName: "Démo",
    lastName: "Fret",
  }),
  persona({
    key: "litiges-fret",
    label: "Gestionnaire des litiges fret",
    description: "Traitement des litiges, pénalités et immobilisations fret",
    actorType: "interne",
    group: "dcfv",
    role: "gestionnaire_litiges_fret",
    landingPath: "/fret",
    moduleCodes: ["fret", "finance", "ged"],
    firstName: "Démo",
    lastName: "Litiges-fret",
  }),
  persona({
    key: "comptable",
    label: "Comptable général",
    description: "Tenue des comptes généraux selon le SYSCOHADA",
    actorType: "interne",
    group: "dfc",
    role: "comptable",
    landingPath: "/finances",
    moduleCodes: ["voyageurs", "fret", "finance", "ged"],
    firstName: "Démo",
    lastName: "Comptabilité",
  }),
  persona({
    key: "recettes",
    label: "Contrôleur des recettes",
    description: "Visa des caisses, rapprochements et clôture des journées comptables",
    actorType: "interne",
    group: "dfc",
    role: "controleur_recettes",
    landingPath: "/gestion",
    moduleCodes: ["voyageurs", "finance", "copilot"],
    firstName: "Démo",
    lastName: "Recettes",
  }),
  persona({
    key: "comptable-auxiliaire",
    label: "Comptable auxiliaire",
    description: "Suivi des comptes fournisseurs et clients",
    actorType: "interne",
    group: "dfc",
    role: "comptable_auxiliaire",
    landingPath: "/finances",
    moduleCodes: ["voyageurs", "fret", "finance", "ged"],
    firstName: "Démo",
    lastName: "Comptabilité-auxiliaire",
  }),
  persona({
    key: "fiscalite",
    label: "Fiscaliste",
    description: "Déclarations fiscales et liasse financière gabonaise",
    actorType: "interne",
    group: "dfc",
    role: "fiscaliste",
    landingPath: "/finances",
    moduleCodes: ["finance", "ged", "copilot"],
    firstName: "Démo",
    lastName: "Fiscalité",
  }),
  persona({
    key: "tresorerie",
    label: "Trésorier",
    description: "Trésorerie multidevise et équilibres bancaires",
    actorType: "interne",
    group: "dfc",
    role: "tresorier",
    landingPath: "/finances",
    moduleCodes: ["finance", "ged", "copilot"],
    firstName: "Démo",
    lastName: "Trésorerie",
  }),
  persona({
    key: "paie",
    label: "Gestionnaire de paie",
    description: "Paie gabonaise et déclarations sociales",
    actorType: "interne",
    group: "drh",
    role: "gestionnaire_paie",
    landingPath: "/rh",
    moduleCodes: ["finance", "rh", "ged"],
    firstName: "Démo",
    lastName: "Paie",
  }),
  persona({
    key: "roulements",
    label: "Planificateur des roulements",
    description: "Planification des équipes ferroviaires en régime 3x8",
    actorType: "interne",
    group: "drh",
    role: "planificateur_roulements",
    landingPath: "/rh",
    moduleCodes: ["cotraf", "rh", "ged", "copilot"],
    firstName: "Démo",
    lastName: "Roulements",
  }),
  persona({
    key: "medecine",
    label: "Médecin du travail",
    description: "Aptitudes médicales et habilitations de sécurité",
    actorType: "interne",
    group: "drh",
    role: "medecin_travail",
    landingPath: "/rh",
    moduleCodes: ["rh", "ged", "securite"],
    firstName: "Démo",
    lastName: "Médecine",
  }),
  persona({
    key: "infirmerie",
    label: "Infirmier du travail",
    description: "Suivi médical et préparation des visites d’aptitude",
    actorType: "interne",
    group: "drh",
    role: "infirmier_travail",
    landingPath: "/rh",
    moduleCodes: ["rh", "ged", "securite"],
    firstName: "Démo",
    lastName: "Infirmerie",
  }),
  persona({
    key: "securite",
    label: "Responsable sécurité des circulations",
    description: "Prévention et contrôle de la sécurité ferroviaire",
    actorType: "interne",
    group: "dsed",
    role: "inspecteur_securite",
    landingPath: "/securite",
    moduleCodes: [
      "cotraf",
      "gmao",
      "infrastructure",
      "ged",
      "securite",
      "copilot",
    ],
    firstName: "Démo",
    lastName: "Sécurité",
  }),
  persona({
    key: "enquetes-accidents",
    label: "Enquêteur accidents ferroviaires",
    description: "Analyse des accidents et suivi des actions correctives",
    actorType: "interne",
    group: "dsed",
    role: "enqueteur_accidents",
    landingPath: "/securite",
    moduleCodes: [
      "cotraf",
      "gmao",
      "infrastructure",
      "ged",
      "securite",
      "copilot",
    ],
    firstName: "Démo",
    lastName: "Enquêtes",
  }),
  persona({
    key: "environnement-lope",
    label: "Responsable environnement & Lopé",
    description: "Suivi environnemental et protection du parc de la Lopé",
    actorType: "interne",
    group: "dsed",
    role: "responsable_environnement",
    landingPath: "/securite",
    moduleCodes: ["fret", "infrastructure", "ged", "securite", "copilot"],
    firstName: "Démo",
    lastName: "Environnement",
  }),
  persona({
    key: "comilog",
    label: "Eramet / COMILOG",
    description: "Actionnaire majoritaire et premier client fret",
    actorType: "externe",
    group: "partenaires_industriels",
    role: "representant_comilog",
    landingPath: "/fret",
    moduleCodes: ["fret", "cotraf", "finance", "ged"],
    firstName: "Démo",
    lastName: "COMILOG",
  }),
  persona({
    key: "meridiam",
    label: "Meridiam",
    description: "Actionnaire stratégique et cofinanceur du PRN",
    actorType: "externe",
    group: "partenaires_industriels",
    role: "representant_meridiam",
    landingPath: "/infrastructures",
    moduleCodes: ["infrastructure", "finance", "ged", "securite", "copilot"],
    firstName: "Démo",
    lastName: "Meridiam",
  }),
  persona({
    key: "etat",
    label: "État gabonais",
    description: "Actionnaire, concédant et garant du service public",
    actorType: "externe",
    group: "institutions_publiques",
    role: "representant_etat",
    landingPath: "/gestion",
    moduleCodes: [
      "voyageurs",
      "fret",
      "cotraf",
      "gmao",
      "infrastructure",
      "finance",
      "rh",
      "ged",
      "securite",
      "copilot",
    ],
    firstName: "Démo",
    lastName: "État",
  }),
  persona({
    key: "artf",
    label: "ARTF",
    description: "Régulation, homologation et audits ferroviaires",
    actorType: "externe",
    group: "institutions_publiques",
    role: "auditeur_artf",
    landingPath: "/securite",
    moduleCodes: ["cotraf", "gmao", "infrastructure", "ged", "securite"],
    firstName: "Démo",
    lastName: "ARTF",
  }),
  persona({
    key: "eaux-forets",
    label: "Ministère des Eaux et Forêts",
    description: "Contrôle de la légalité et de la traçabilité du bois",
    actorType: "externe",
    group: "institutions_publiques",
    role: "controleur_eaux_forets",
    landingPath: "/fret",
    moduleCodes: ["fret", "ged", "securite"],
    firstName: "Démo",
    lastName: "Eaux-et-Forêts",
  }),
  persona({
    key: "douanes",
    label: "Douanes gabonaises",
    description: "Contrôle douanier des flux et manifestes fret",
    actorType: "externe",
    group: "institutions_publiques",
    role: "agent_douanes",
    landingPath: "/fret",
    moduleCodes: ["fret", "finance", "ged"],
    firstName: "Démo",
    lastName: "Douanes",
  }),
  persona({
    key: "gsez",
    label: "GSEZ",
    description: "Opérateur de zone spéciale et des terminaux portuaires",
    actorType: "externe",
    group: "partenaires_industriels",
    role: "operateur_gsez",
    landingPath: "/fret",
    moduleCodes: ["fret", "cotraf", "ged"],
    firstName: "Démo",
    lastName: "GSEZ",
  }),
  persona({
    key: "dgi",
    label: "Direction générale des impôts",
    description: "Télédéclarations et piste d’audit fiscal",
    actorType: "externe",
    group: "institutions_publiques",
    role: "agent_dgi",
    landingPath: "/finances",
    moduleCodes: ["finance", "ged"],
    firstName: "Démo",
    lastName: "DGI",
  }),
  persona({
    key: "cnss-cnamgs",
    label: "CNSS & CNAMGS",
    description: "Déclarations sociales, retraite et assurance maladie",
    actorType: "externe",
    group: "institutions_publiques",
    role: "organisme_social",
    landingPath: "/rh",
    moduleCodes: ["finance", "rh", "ged"],
    firstName: "Démo",
    lastName: "Protection-sociale",
  }),
  persona({
    key: "bailleurs",
    label: "AFD / SFI / Proparco / UE",
    description: "Suivi des financements et audits environnementaux du PRN",
    actorType: "externe",
    group: "bailleurs_fonds",
    role: "bailleur_fonds",
    landingPath: "/infrastructures",
    moduleCodes: ["infrastructure", "finance", "ged", "securite"],
    firstName: "Démo",
    lastName: "Bailleurs",
  }),
] as const satisfies readonly DemoPersona[]

export type DemoPersonaKey = (typeof DEMO_PERSONAS)[number]["key"]

export interface DemoAccount extends DemoPersona {
  readonly email: string
  readonly password: string
}

export interface DemoAccountsEnvironment {
  readonly [name: string]: string | undefined
  readonly DEMO_PERSONAS_PASSWORD?: string
  readonly DEMO_PERSONAS_EMAIL_DOMAIN?: string
  readonly DEMO_AGENT_EMAIL?: string
  readonly DEMO_AGENT_PASSWORD?: string
  readonly DEMO_MANAGEMENT_EMAIL?: string
  readonly DEMO_MANAGEMENT_PASSWORD?: string
  readonly DEMO_CONTROL_EMAIL?: string
  readonly DEMO_CONTROL_PASSWORD?: string
}

function legacyCredential(
  key: DemoPersonaKey,
  source: DemoAccountsEnvironment
): { email?: string; password?: string } | undefined {
  if (key === "agent") {
    return {
      email: source.DEMO_AGENT_EMAIL,
      password: source.DEMO_AGENT_PASSWORD,
    }
  }
  if (key === "gestion") {
    return {
      email: source.DEMO_MANAGEMENT_EMAIL,
      password: source.DEMO_MANAGEMENT_PASSWORD,
    }
  }
  if (key === "controle") {
    return {
      email: source.DEMO_CONTROL_EMAIL,
      password: source.DEMO_CONTROL_PASSWORD,
    }
  }
  return undefined
}

/** Résout les identifiants configurés sans consulter ni modifier Convex. */
export function configuredDemoAccounts(
  source: DemoAccountsEnvironment
): readonly DemoAccount[] {
  const sharedPassword = source.DEMO_PERSONAS_PASSWORD
  const domain =
    source.DEMO_PERSONAS_EMAIL_DOMAIN?.trim().replace(/^@/, "") ||
    "demo.setrag.ga"

  return DEMO_PERSONAS.flatMap((profile) => {
    const legacy = legacyCredential(profile.key, source)
    const legacyEmail = legacy?.email?.trim().toLowerCase()
    const legacyPassword = legacy?.password
    if (legacyEmail && legacyPassword) {
      return [{ ...profile, email: legacyEmail, password: legacyPassword }]
    }
    if (!sharedPassword) return []
    return [
      {
        ...profile,
        email: `${profile.key}@${domain}`.toLowerCase(),
        password: sharedPassword,
      },
    ]
  })
}
