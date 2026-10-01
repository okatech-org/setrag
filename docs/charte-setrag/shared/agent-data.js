// Portail agent — données de démonstration. Fictives, mais tenues entre elles :
// mêmes trains, horaires et prix que la maquette de la billetterie (web.html),
// barèmes kilométriques, réductions et taxes du cahier des charges.

export const AUJOURDHUI = "Jeu. 1er oct. 2026"
export const DEMAIN = "Ven. 2 oct."
export const HEURE = "13:18"

export const PROFILS = {
  vendeur: { nom: "Nadège Moussavou", initiales: "NM", role: "Vendeuse guichet", matricule: "V-101", poste: "Gare d'Owendo · guichet 2", accueil: "/vente" },
  chef: { nom: "Serge Ndong Obiang", initiales: "SN", role: "Chef de gare", matricule: "G-044", poste: "Gare d'Owendo · supervision", accueil: "/gestion/tableau-de-bord" },
  admin: { nom: "Clarisse Mba", initiales: "CM", role: "Administratrice fonctionnelle", matricule: "A-007", poste: "Siège SETRAG · Owendo", accueil: "/gestion/tableau-de-bord" },
}

/** Catégories tarifaires du CDC : réduction appliquée au prix adulte. */
export const CATEGORIES = {
  adulte: { libelle: "Adulte", remise: 0 },
  enfant: { libelle: "Enfant 4–11 ans", remise: 0.5 },
  militaire: { libelle: "Militaire (ordre de mission)", remise: 0.1 },
  groupe10: { libelle: "Groupe 10–49", remise: 0.3 },
}

/** Dessertes Owendo → Franceville du vendredi 2 octobre. */
export const DESSERTES = [
  {
    id: "E201", train: "Express 201", dep: "07:40", arr: "19:25", duree: "11 h 45", arrets: "6 arrêts", etat: ["ok", "À l'heure"],
    classes: { vip: { prix: 65000, reste: 6, total: 24 }, p1: { prix: 48000, reste: 24, total: 48 }, p2: { prix: 32500, reste: 86, total: 256 } },
  },
  {
    id: "E205", train: "Express 205", dep: "10:15", arr: "22:00", duree: "11 h 45", arrets: "6 arrêts", etat: ["annule", "Supprimé · travaux à Lopé"], annulee: true,
    classes: { vip: null, p1: null, p2: null },
  },
  {
    id: "E207", train: "Express 207", dep: "14:05", arr: "01:55", plus1: true, duree: "11 h 50", arrets: "6 arrêts", etat: ["retard", "Prévu 14:30 · +25 min"],
    classes: { vip: { prix: 65000, reste: 14, total: 24 }, p1: { prix: 48000, reste: 40, total: 48 }, p2: { prix: 32500, reste: 112, total: 256 } },
  },
  {
    id: "O403", train: "Omnibus 403", dep: "18:10", arr: "07:30", plus1: true, duree: "13 h 20", arrets: "22 arrêts", etat: ["neutre", "Toutes gares", null],
    classes: { vip: null, p1: { prix: 36000, reste: 3, total: 48 }, p2: { prix: 24000, reste: 12, total: 320 } },
  },
]
export const CLASSES = { vip: "VIP", p1: "1re classe", p2: "2e classe" }

/** Voitures de l'Express 201 : numéro, classe, places libres. */
export const VOITURES = [
  { n: 1, classe: "vip", libres: 6, rangs: 6 },
  { n: 2, classe: "p1", libres: 24, rangs: 12 },
  { n: 3, classe: "p2", libres: 18, rangs: 16 },
  { n: 4, classe: "p2", libres: 31, rangs: 16 },
  { n: 5, classe: "p2", libres: 37, rangs: 16 },
  { n: 6, classe: "p2", libres: 0, rangs: 16 },
]

/** Places déjà vendues dans la voiture 4 (tirage fixe, pour que la maquette ne bouge pas). */
export const OCCUPEES_V4 = new Set(["1A", "1C", "2A", "2B", "2D", "3B", "3C", "4A", "4D", "5A", "5B", "5C", "5D", "6C", "7A", "7B", "8B", "8C", "8D", "9A", "9D", "10B", "10C", "11A", "11D", "13A", "13B", "13C", "14A", "14D", "15B", "15C", "16A"])
export const BLOQUEES_V4 = { "1B": "Aide à la mobilité", "1D": "Aide à la mobilité", "16C": "Maintenance · tablette", "16D": "Maintenance · tablette" }

export const MOYENS = [
  { id: "especes", libelle: "Espèces", aide: "Rendu calculé", touche: "E", icone: "banknote" },
  { id: "airtel", libelle: "Airtel Money", aide: "Demande sur le téléphone", touche: "A", icone: "smartphone" },
  { id: "moov", libelle: "Moov Money", aide: "Demande sur le téléphone", touche: "M", icone: "smartphone" },
  { id: "carte", libelle: "Carte bancaire", aide: "Visa, Mastercard · TPE", touche: "T", icone: "credit-card" },
  { id: "clickpay", libelle: "Click&Pay", aide: "Lien de paiement par SMS", touche: "L", icone: "send" },
  { id: "compte", libelle: "En compte", aide: "Client conventionné", touche: "K", icone: "building-2" },
]

/** Opérations du jour au guichet 2 (plus récentes d'abord). */
export const OPERATIONS = [
  { n: "V-OWE-4820", h: "13:02", produit: "Billet", desserte: "Express 201 · ven. 2 oct.", trajet: "Owendo → Franceville", qui: "Paul Ella Nguema", montant: 48000, moyen: "Airtel Money", etat: ["ok", "Émis"], place: "V2 · 7C" },
  { n: "V-OWE-4819", h: "12:47", produit: "Colis", desserte: "Omnibus 403 · jeu. 1er oct.", trajet: "Owendo → Moanda", qui: "Ets Mouloungui", montant: 9800, moyen: "En compte", etat: ["ok", "Enregistré"] },
  { n: "V-OWE-4818", h: "12:31", produit: "Billet", desserte: "Express 207 · jeu. 1er oct.", trajet: "Owendo → Booué", qui: "Grâce Mintsa", montant: 32500, moyen: "Espèces", etat: ["ok", "Émis"], place: "V4 · 6A", remboursable: true },
  { n: "V-OWE-4817", h: "11:58", produit: "Bagage", desserte: "Express 207 · jeu. 1er oct.", trajet: "Owendo → Franceville", qui: "Rodrigue Mbina", montant: 3200, moyen: "Espèces", etat: ["ok", "Étiqueté"] },
  { n: "R-OWE-0041", h: "11:20", produit: "Remboursement", desserte: "Express 201 · jeu. 1er oct.", trajet: "Owendo → Lastourville", qui: "Linda Boussougou", montant: -29250, moyen: "Espèces", etat: ["info", "Remboursé", "rotate-ccw"] },
  { n: "V-OWE-4812", h: "07:12", produit: "Billet", desserte: "Express 201 · jeu. 1er oct.", trajet: "Owendo → Ndjolé", qui: "Hervé Obame", montant: 11500, moyen: "Moov Money", etat: ["accent", "Contrôlé à bord", "scan-line"], controle: true, place: "V3 · 2B" },
  { n: "V-OWE-4809", h: "06:55", produit: "Billet", desserte: "Express 201 · jeu. 1er oct.", trajet: "Owendo → Franceville", qui: "Sylvie Nziengui", montant: 65000, moyen: "Carte bancaire", etat: ["accent", "Contrôlé à bord", "scan-line"], controle: true, place: "V1 · 3A" },
]
