export const MANAGEMENT_SECTIONS = {
  "tableau-de-bord": {
    code: "AW-G-01",
    title: "Vue d’ensemble",
    description:
      "Pilotage commercial et opérationnel du réseau ferroviaire SETRAG.",
    action: "Exporter la synthèse",
    columns: ["Indicateur", "Périmètre", "Valeur", "État"],
    rows: [
      ["Recette nette", "Réseau · juillet", "184 650 000 F", "En hausse"],
      ["Billets émis", "Tous canaux", "12 486", "Conforme"],
      ["Remplissage moyen", "Desserte voyageurs", "71,4 %", "À suivre"],
      ["Paniers moyens", "Tous produits", "14 789 F", "Conforme"],
    ],
  },
  livrets: {
    code: "AW-G-02",
    title: "Livrets horaires",
    description:
      "Un livret fixe les circulations d’une saison et suit un cycle de validation audité.",
    action: "Nouveau livret",
    columns: ["Livret", "Validité", "Circulations", "État"],
    rows: [
      ["Été 2026", "01/06 → 31/08", "186", "Actif"],
      ["Rentrée 2026", "01/09 → 15/12", "224", "À valider"],
      ["Fêtes 2026", "16/12 → 05/01", "48", "Brouillon"],
    ],
  },
  tarifs: {
    code: "AW-G-03",
    title: "Tarifs",
    description:
      "Grilles kilométriques, fiscalité et réductions avec simulation avant validation.",
    action: "Soumettre à validation",
    columns: ["Type de train", "Classe", "0 – 99 km", "100 km et +"],
    rows: [
      ["Omnibus", "2e classe", "28 F/km", "24 F/km"],
      ["Express", "2e classe", "38 F/km", "34 F/km"],
      ["Express", "1re classe", "53 F/km", "48 F/km"],
      ["Express", "VIP", "78 F/km", "69 F/km"],
    ],
  },
  yield: {
    code: "AW-G-04",
    title: "Yield management",
    description:
      "Modulation bornée des prix selon le remplissage et l’échéance du départ.",
    action: "Nouvelle règle",
    columns: ["Règle", "Déclencheur", "Coefficient", "État"],
    rows: [
      ["Anticipation J−30", "Remplissage < 35 %", "× 0,90", "Active"],
      ["Dernières places", "Remplissage > 85 %", "× 1,20", "Active"],
      ["Départ imminent", "J−2 et remplissage > 70 %", "× 1,12", "Test"],
    ],
  },
  trains: {
    code: "AW-G-05",
    title: "Trains & voitures",
    description:
      "Référentiel du matériel roulant, compositions et capacités par classe.",
    action: "Nouvelle composition",
    columns: ["Train", "Type", "Composition", "Capacité"],
    rows: [
      ["TR-201", "Omnibus", "8 voitures", "428 places"],
      ["TR-202", "Express", "6 voitures", "286 places"],
      ["TR-203", "Express", "7 voitures", "334 places"],
    ],
  },
  places: {
    code: "AW-G-06",
    title: "Places — blocage & traçabilité",
    description:
      "Supervision des occupations, blocages manuels et réaffectations.",
    action: "Ouvrir le plan",
    columns: ["Desserte", "Voiture / place", "Motif", "État"],
    rows: [
      ["TR-201 · 27/07", "B2 · 18A", "Maintenance siège", "Bloquée"],
      ["TR-202 · 27/07", "A1 · 04C", "Réservation protocole", "Réservée"],
      ["TR-203 · 28/07", "C3 · 22B", "Aide mobilité", "Affectée"],
    ],
  },
  "points-de-vente": {
    code: "AW-G-07",
    title: "Points de vente & agences",
    description:
      "Habilitations, rattachements, terminaux et quotas des partenaires.",
    action: "Nouveau point de vente",
    columns: ["Point de vente", "Type", "Rattachement", "État"],
    rows: [
      ["OWE-PV", "Gare", "Owendo · 4 guichets", "Actif"],
      ["FCV-PV", "Gare", "Franceville · 3 guichets", "Actif"],
      ["AG-LBV-04", "Agence", "Libreville · quota 180", "Actif"],
      ["AG-PG-02", "Agence", "Port-Gentil · quota 90", "Suspendu"],
    ],
  },
  voyageurs: {
    code: "AW-G-08",
    title: "Voyageurs & manifeste",
    description:
      "Recherche nominative, manifeste de bord et contacts d’urgence.",
    action: "Exporter le manifeste",
    columns: ["Voyageur", "Billet", "Trajet", "Place"],
    rows: [
      ["Ariane MBADINGA", "B-4822-1", "Owendo → Franceville", "B2 · 1A"],
      ["Paul MBOUMBA", "B-4823-1", "Owendo → Ndjolé", "B2 · 1B"],
      ["Mireille OBAME", "B-4825-1", "Booué → Franceville", "A1 · 4C"],
    ],
  },
  recettes: {
    code: "AW-G-09",
    title: "Contrôle des recettes",
    description:
      "Rapprochement des caisses, écarts et clôture de la journée comptable.",
    action: "Clôturer la journée comptable",
    columns: ["Caisse", "Vendeur", "Théorique", "Écart"],
    rows: [
      ["OWE · guichet 1", "P. MBOUMBA", "1 286 500 F", "0 F"],
      ["OWE · guichet 3", "A. MBOUMBA", "1 246 500 F", "+2 000 F"],
      ["FCV · guichet 2", "M. NZENG", "886 000 F", "0 F"],
    ],
  },
  comptabilite: {
    code: "AW-G-10",
    title: "Comptabilité",
    description:
      "Journal V65, équilibre des écritures et déversements vers SAGE X3.",
    action: "Exporter le journal",
    columns: ["Journée", "Pièces", "Débit / crédit", "Déversement"],
    rows: [
      ["26/07/2026", "184", "8 442 500 F", "Intégré"],
      ["25/07/2026", "201", "9 156 000 F", "Intégré"],
      ["24/07/2026", "176", "7 884 500 F", "À rejouer"],
    ],
  },
  rapports: {
    code: "AW-G-11",
    title: "Rapports & KPI",
    description:
      "Bibliothèque de rapports exportables et programmables par destinataire.",
    action: "Programmer un envoi",
    columns: ["Rapport", "Période", "Format", "Dernière exécution"],
    rows: [
      ["Chiffre d’affaires par canal", "Mensuelle", "XLSX", "Ce matin · 06:00"],
      ["Remplissage par desserte", "Quotidienne", "CSV", "Hier · 23:10"],
      ["Contrôle des annulations", "Hebdomadaire", "PDF", "Lun. · 07:00"],
    ],
  },
  incidents: {
    code: "AW-G-12",
    title: "Procès-verbaux & incidents",
    description:
      "Suivi des irrégularités à bord, pénalités et incidents d’exploitation.",
    action: "Nouveau procès-verbal",
    columns: ["Référence", "Nature", "Train", "État"],
    rows: [
      ["PV-2026-0142", "Absence de titre", "TR-201", "À encaisser"],
      ["INC-2026-0081", "Lecteur indisponible", "TR-202", "En cours"],
      ["PV-2026-0137", "Surclassement", "TR-203", "Soldé"],
    ],
  },
  utilisateurs: {
    code: "AW-G-13",
    title: "Utilisateurs & habilitations",
    description:
      "Comptes nominatifs, rôles, rattachements et journal des accès.",
    action: "Synchroniser l’annuaire",
    columns: ["Utilisateur", "Matricule", "Rôle", "État"],
    rows: [
      ["Aly MBOUMBA", "V-101", "Vendeur guichet", "Actif"],
      ["Mireille NZENG", "C-044", "Contrôle recettes", "Actif"],
      ["Jean OBAME", "A-012", "Administrateur", "Actif"],
      ["Agence Port-Gentil", "AG-022", "Vendeur agence", "Suspendu"],
    ],
  },
  parametrage: {
    code: "AW-G-14",
    title: "Paramétrage",
    description:
      "Fiscalité, délais de tenue, tentatives de paiement et options d’exploitation.",
    action: "Enregistrer",
    columns: ["Paramètre", "Valeur", "Portée", "État"],
    rows: [
      ["TVA billets", "18 %", "Réseau", "Actif"],
      ["Contribution CSS", "0 %", "Billetterie", "Actif"],
      ["Tenue des places", "15 min", "Vente en ligne", "Actif"],
      ["Tentatives mobile", "3", "Tous canaux", "Actif"],
    ],
  },
  integrations: {
    code: "AW-G-15",
    title: "Intégrations & supervision",
    description:
      "Santé de Convex, SAGE X3, paiements, messagerie et files de reprise.",
    action: "Relancer les échecs",
    columns: ["Service", "Dernier échange", "File", "État"],
    rows: [
      ["Convex temps réel", "À l’instant", "0", "Opérationnel"],
      ["SAGE X3", "Il y a 4 min", "2", "Dégradé"],
      ["Airtel Money", "Il y a 1 min", "0", "Opérationnel"],
      ["Moov Money", "Il y a 2 min", "0", "Opérationnel"],
    ],
  },
} as const

export type ManagementSection = keyof typeof MANAGEMENT_SECTIONS

export const MANAGEMENT_SECTION_ALIASES: Record<string, ManagementSection> = {
  livrets: "livrets",
  tarifs: "tarifs",
  yield: "yield",
  trains: "trains",
  places: "places",
  "points-de-vente": "points-de-vente",
  voyageurs: "voyageurs",
  recettes: "recettes",
  comptabilite: "comptabilite",
  rapports: "rapports",
  incidents: "incidents",
  utilisateurs: "utilisateurs",
  parametrage: "parametrage",
  integrations: "integrations",
}
