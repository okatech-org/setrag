/**
 * Jeu de démonstration du module Matériel roulant et GMAO.
 *
 * Commandes (depuis `packages/backend`, variable DEMO_ACCOUNTS_ENABLED=true
 * posée sur le déploiement) :
 *
 *   bunx convex run modules/gmao/seed:run '{}'              # peuple si vide
 *   bunx convex run modules/gmao/seed:run '{"reset": true}' # purge puis repeuple
 *
 * Idempotent : un second appel sans `reset` ne réécrit rien. Le `reset`
 * purge les tables `gmao*` et les numéros `gmao:*`, puis relance le
 * peuplement dans une seconde transaction (planificateur) pour rester sous
 * les limites d'écriture d'une mutation.
 *
 * Tout est synthétique : séries, numéros, pannes, coûts et fournisseurs sont
 * plausibles mais inventés, et chaque fiche le rappelle. Le jeu s'adosse au
 * référentiel existant quand il est présent : voitures de `coaches`, trains
 * de `trains`, circulations du jour de `trips`, gares de `stations`.
 * Générateur pseudo-aléatoire à graine fixe : le jeu est reproductible, ses
 * dates sont relatives au jour du peuplement.
 */
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import type { AppRole } from "../../model/permissions"
import {
  CONTROLES_VISITE,
  HEURE_MS,
  JOUR_MS,
  prioriteDefaut,
  type Famille,
  type GraviteDefaut,
  type Priorite,
} from "./model"

const NOTE_DEMO = "Fiche de démonstration — données synthétiques."

const TABLES_GMAO = [
  "gmaoEvenements",
  "gmaoMouvements",
  "gmaoTempsPasses",
  "gmaoDemandesAchat",
  "gmaoVisites",
  "gmaoOrdresTravail",
  "gmaoPlansEquipements",
  "gmaoPlans",
  "gmaoReleves",
  "gmaoStocks",
  "gmaoArticles",
  "gmaoEquipements",
  "gmaoAteliers",
] as const

type Volume = "complet" | "reduit"

export interface ResultatSeedGmao {
  statut: "cree" | "deja" | "purge"
  relance?: boolean
  supprimes?: number
  comptes: Record<string, number>
}

export const run = internalMutation({
  args: {
    reset: v.optional(v.boolean()),
    volume: v.optional(v.union(v.literal("complet"), v.literal("reduit"))),
  },
  handler: async (ctx, args): Promise<ResultatSeedGmao> => {
    if (process.env.DEMO_ACCOUNTS_ENABLED !== "true") {
      throw new Error("Peuplement refusé : DEMO_ACCOUNTS_ENABLED doit valoir true.")
    }
    if (args.reset) {
      const supprimes = await purger(ctx)
      await ctx.scheduler.runAfter(0, internal.modules.gmao.seed.run, {
        volume: args.volume,
      })
      return { statut: "purge", relance: true, supprimes, comptes: {} }
    }
    if (await ctx.db.query("gmaoAteliers").first()) {
      return { statut: "deja", comptes: await compter(ctx) }
    }
    await peupler(ctx, args.volume ?? "complet")
    return { statut: "cree", comptes: await compter(ctx) }
  },
})

async function purger(ctx: MutationCtx): Promise<number> {
  let total = 0
  for (const table of TABLES_GMAO) {
    for (const ligne of await ctx.db.query(table).collect()) {
      await ctx.db.delete(ligne._id)
      total += 1
    }
  }
  for (const sequence of await ctx.db.query("sequences").collect()) {
    if (sequence.key.startsWith("gmao:")) {
      await ctx.db.delete(sequence._id)
      total += 1
    }
  }
  return total
}

async function compter(ctx: MutationCtx): Promise<Record<string, number>> {
  const comptes: Record<string, number> = {}
  for (const table of TABLES_GMAO) {
    comptes[table] = (await ctx.db.query(table).collect()).length
  }
  return comptes
}

/* ===================================================== Hasard reproductible */

function generateur(graine: number) {
  let etat = graine >>> 0
  const suivant = () => {
    etat = (etat + 0x6d2b79f5) >>> 0
    let t = etat
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    reel: suivant,
    entre: (a: number, b: number) => a + suivant() * (b - a),
    entier: (a: number, b: number) => Math.floor(a + suivant() * (b - a + 1)),
    choisir: <T>(liste: readonly T[]): T => liste[Math.floor(suivant() * liste.length)]!,
    probable: (p: number) => suivant() < p,
  }
}

/* ============================================================ Référentiel */

const ATELIERS = [
  {
    code: "OWE",
    nom: "Atelier central d'Owendo",
    gare: "OWE",
    kilometerPoint: 0,
    description: "Grand entretien des locomotives, tour en fosse, ateliers voitures et wagons.",
    tauxHoraireFcfa: 18_500,
  },
  {
    code: "BOO",
    nom: "Atelier relais traction de Booué",
    gare: "BOO",
    kilometerPoint: 338,
    description: "Entretien courant des locomotives de ligne et dépannage à mi-parcours.",
    tauxHoraireFcfa: 16_500,
  },
  {
    code: "MOA",
    nom: "Dépôt wagons de Moanda",
    gare: "MOA",
    kilometerPoint: 619,
    description: "Visites et réparations des rames minéralières au départ du plateau.",
    tauxHoraireFcfa: 15_500,
  },
] as const

type CodeAtelier = (typeof ATELIERS)[number]["code"]

const SERIES_LOCO = [
  { prefixe: "CC-21", serie: "CC 2100 · EMD GT26CW-2", constructeur: "EMD", annees: [1986, 1989], nombre: 10, kmAn: [70_000, 95_000], atelier: "BOO" },
  { prefixe: "CC-22", serie: "CC 2200 · GE C30-ACi", constructeur: "General Electric", annees: [2012, 2014], nombre: 16, kmAn: [95_000, 125_000], atelier: "OWE" },
  { prefixe: "CC-23", serie: "CC 2300 · EMD GT46MAC", constructeur: "EMD", annees: [2021, 2022], nombre: 12, kmAn: [110_000, 135_000], atelier: "OWE" },
  { prefixe: "BB-5", serie: "BB 500 · locotracteur de manœuvre", constructeur: "Alstom", annees: [1998, 1999], nombre: 6, kmAn: [15_000, 25_000], atelier: "OWE" },
] as const

const SERIES_WAGON = [
  { prefixe: "WTM-", debut: 1001, serie: "Trémie minéralière 80 t", constructeur: "Astra Vagoane", annees: [1999, 2018], part: 0.6, proprietaire: ["COMILOG", "COMILOG", "SETRAG"], tare: 24, charge: 80, atelier: "MOA" },
  { prefixe: "WGR-", debut: 2001, serie: "Wagon grumier à ranchers", constructeur: "Arbel", annees: [1990, 2012], part: 0.2, proprietaire: ["SETRAG"], tare: 22, charge: 60, atelier: "OWE" },
  { prefixe: "WCI-", debut: 3001, serie: "Wagon citerne hydrocarbures", constructeur: "Arbel", annees: [1995, 2015], part: 0.1, proprietaire: ["SETRAG", "Pétrolier loueur"], tare: 25, charge: 55, atelier: "OWE" },
  { prefixe: "WPC-", debut: 4001, serie: "Wagon plat porte-conteneurs", constructeur: "Astra Vagoane", annees: [2008, 2019], part: 0.067, proprietaire: ["SETRAG"], tare: 21, charge: 60, atelier: "OWE" },
  { prefixe: "WCO-", debut: 5001, serie: "Wagon couvert", constructeur: "Arbel", annees: [1988, 2005], part: 0.033, proprietaire: ["SETRAG"], tare: 23, charge: 50, atelier: "BOO" },
] as const

const PLANS = [
  { code: "LOC-IP30", libelle: "Inspection périodique 30 jours", famille: "locomotive", series: [], seuilJours: 30, alertePct: 15, dureeHeures: 6, immobilisant: true, operations: ["Contrôle des niveaux et fuites", "Essai de frein et de veille automatique", "Contrôle des organes de roulement", "Relevé des défauts de l'ordinateur de bord"] },
  { code: "LOC-VL", libelle: "Visite limitée 25 000 km", famille: "locomotive", series: [], seuilKm: 25_000, seuilJours: 90, alertePct: 10, dureeHeures: 16, immobilisant: true, operations: ["Vidange moteur et remplacement des filtres", "Contrôle des balais de moteurs de traction", "Graissage des boîtes d'essieux", "Contrôle des semelles de frein"] },
  { code: "LOC-VG", libelle: "Visite générale 125 000 km", famille: "locomotive", series: [], seuilKm: 125_000, seuilJours: 540, alertePct: 10, dureeHeures: 72, immobilisant: true, operations: ["Contrôle des injecteurs et du turbocompresseur", "Mesure des profils de roues", "Révision du compresseur principal", "Essais de puissance en charge"] },
  { code: "LOC-RG", libelle: "Révision générale 250 000 km", famille: "locomotive", series: ["CC 2100 · EMD GT26CW-2", "CC 2200 · GE C30-ACi", "CC 2300 · EMD GT46MAC"], seuilKm: 250_000, seuilJours: 2_190, alertePct: 8, dureeHeures: 600, immobilisant: true, operations: ["Dépose et révision du moteur diesel", "Révision des bogies et des moteurs de traction", "Reprofilage des roues au tour en fosse", "Contrôle non destructif des attelages"] },
  { code: "VOY-VP", libelle: "Visite périodique voitures", famille: "voiture", series: [], seuilKm: 40_000, seuilJours: 60, alertePct: 15, dureeHeures: 12, immobilisant: true, operations: ["Contrôle des bogies et de la suspension", "Essai des portes et intercirculations", "Contrôle de l'éclairage et des sanitaires", "Essai de frein"] },
  { code: "VOY-CLIM", libelle: "Entretien de la climatisation", famille: "voiture", series: [], seuilJours: 90, alertePct: 15, dureeHeures: 4, immobilisant: false, operations: ["Nettoyage des filtres", "Contrôle de la charge de gaz", "Essai de régulation"] },
  { code: "WAG-VP", libelle: "Visite périodique wagons", famille: "wagon", series: [], seuilKm: 60_000, seuilJours: 365, alertePct: 10, dureeHeures: 8, immobilisant: true, operations: ["Contrôle de la timonerie et des semelles", "Contrôle des attelages et tampons", "Contrôle de la caisse et des portes", "Essai de frein"] },
  { code: "WAG-ESS", libelle: "Reprofilage des essieux au tour en fosse", famille: "wagon", series: ["Trémie minéralière 80 t", "Wagon grumier à ranchers"], seuilKm: 80_000, alertePct: 10, dureeHeures: 10, immobilisant: true, operations: ["Mesure des profils et des boudins", "Reprofilage au tour en fosse d'Owendo", "Contrôle des boîtes d'essieux"] },
  { code: "CIT-EPR", libelle: "Épreuve réglementaire des citernes", famille: "wagon", series: ["Wagon citerne hydrocarbures"], seuilJours: 1_095, alertePct: 8, dureeHeures: 24, immobilisant: true, operations: ["Dégazage et nettoyage", "Épreuve hydraulique de la citerne", "Contrôle des vannes et du dôme", "Pose de la plaque d'épreuve"] },
] as const

const DEFAILLANCES: Record<Famille, readonly { titre: string; organe: string }[]> = {
  locomotive: [
    { titre: "Échauffement du palier de turbocompresseur", organe: "Turbocompresseur" },
    { titre: "Fuite d'huile au carter moteur", organe: "Moteur diesel" },
    { titre: "Défaut d'excitation de l'alternateur principal", organe: "Alternateur principal" },
    { titre: "Patinage répété — capteur de vitesse défaillant", organe: "Capteur de vitesse" },
    { titre: "Pression insuffisante du compresseur principal", organe: "Compresseur principal" },
    { titre: "Isolement du moteur de traction n° 3", organe: "Moteur de traction" },
    { titre: "Surchauffe eau — radiateur colmaté", organe: "Circuit de refroidissement" },
    { titre: "Radio sol-train hors service", organe: "Radio sol-train" },
    { titre: "Fuite sur la conduite générale de frein", organe: "Conduite générale" },
    { titre: "Avertisseur sonore et phare en défaut", organe: "Équipements de cabine" },
  ],
  voiture: [
    { titre: "Climatisation en panne", organe: "Climatisation" },
    { titre: "Porte d'accès bloquée en position fermée", organe: "Portes" },
    { titre: "Éclairage intérieur défaillant", organe: "Éclairage" },
    { titre: "Sanitaires hors service", organe: "Sanitaires" },
    { titre: "Soufflet d'intercirculation déchiré", organe: "Intercirculation" },
    { titre: "Sièges endommagés en salle", organe: "Aménagements" },
    { titre: "Bruit anormal de bogie", organe: "Bogie" },
  ],
  wagon: [
    { titre: "Méplat sur essieu", organe: "Essieu" },
    { titre: "Semelles de frein usées au-delà de la cote", organe: "Freinage" },
    { titre: "Porte de trémie bloquée", organe: "Porte de trémie" },
    { titre: "Tampon de choc fissuré", organe: "Attelage" },
    { titre: "Boîte d'essieu chaude détectée en ligne", organe: "Boîte d'essieu" },
    { titre: "Timonerie de frein déréglée", organe: "Freinage" },
    { titre: "Ressort de suspension cassé", organe: "Suspension" },
    { titre: "Ranchers déformés", organe: "Ranchers" },
    { titre: "Fuite à la vanne de vidange", organe: "Vanne de vidange" },
  ],
}

const INTERVENANTS = [
  ["J. Moussavou", "SET-01842"],
  ["P. Ndong Mba", "SET-02217"],
  ["A. Mintsa", "SET-01509"],
  ["R. Koumba", "SET-03126"],
  ["S. Ondo Ella", "SET-02784"],
  ["F. Bibang", "SET-01977"],
  ["L. Mouélé", "SET-03341"],
  ["C. Nguema", "SET-02650"],
  ["E. Ella Ndong", "SET-01288"],
  ["M. Nzé Obame", "SET-03017"],
] as const

const EQUIPES: Record<Famille, readonly string[]> = {
  locomotive: ["Équipe traction A — mécanique", "Équipe traction B — électricité"],
  voiture: ["Équipe voitures voyageurs"],
  wagon: ["Équipe wagons", "Équipe tour en fosse"],
}

/** Articles : désignation, famille, unité, prix (XAF), délai (jours), critique, compatibilité, variantes. */
const CATALOGUE: readonly {
  designation: string
  famille: string
  unite: string
  prix: number
  delai: number
  critique: boolean
  pour: readonly Famille[]
  variantes?: readonly string[]
  fournisseur: string
}[] = [
  { designation: "Semelle de frein composite", famille: "Freinage", unite: "u", prix: 38_000, delai: 45, critique: true, pour: ["wagon"], variantes: ["type K", "type LL", "type P10"], fournisseur: "Knorr-Bremse (simulé)" },
  { designation: "Semelle de frein fonte", famille: "Freinage", unite: "u", prix: 22_000, delai: 30, critique: false, pour: ["locomotive", "voiture"], variantes: ["CC 2100", "CC 2200", "CC 2300", "voitures"], fournisseur: "Faiveley Afrique (simulé)" },
  { designation: "Cylindre de frein 10 pouces", famille: "Freinage", unite: "u", prix: 410_000, delai: 60, critique: true, pour: ["wagon", "voiture"], variantes: ["wagon", "voiture"], fournisseur: "Knorr-Bremse (simulé)" },
  { designation: "Valve de distribution KE", famille: "Freinage", unite: "u", prix: 1_250_000, delai: 90, critique: true, pour: ["wagon", "voiture", "locomotive"], variantes: ["KE1c", "KE2c", "KES"], fournisseur: "Knorr-Bremse (simulé)" },
  { designation: "Boyau d'accouplement de frein", famille: "Freinage", unite: "u", prix: 46_000, delai: 30, critique: true, pour: ["wagon", "voiture", "locomotive"], variantes: ["CG", "CP"], fournisseur: "Faiveley Afrique (simulé)" },
  { designation: "Robinet d'arrêt de conduite générale", famille: "Freinage", unite: "u", prix: 95_000, delai: 45, critique: false, pour: ["wagon", "voiture", "locomotive"], variantes: ["1 pouce", "1¼ pouce"], fournisseur: "Faiveley Afrique (simulé)" },
  { designation: "Timonerie — tirant de frein", famille: "Freinage", unite: "u", prix: 64_000, delai: 40, critique: false, pour: ["wagon"], variantes: ["trémie", "grumier", "citerne"], fournisseur: "Forges de l'Estuaire (simulé)" },
  { designation: "Roulement à rouleaux coniques", famille: "Roulement", unite: "u", prix: 520_000, delai: 120, critique: true, pour: ["wagon", "voiture"], variantes: ["6½ × 12", "6 × 11"], fournisseur: "SKF Railway (simulé)" },
  { designation: "Boîte d'essieu complète", famille: "Roulement", unite: "u", prix: 1_900_000, delai: 150, critique: true, pour: ["wagon"], variantes: ["trémie", "grumier"], fournisseur: "SKF Railway (simulé)" },
  { designation: "Essieu monté", famille: "Roulement", unite: "u", prix: 7_800_000, delai: 210, critique: true, pour: ["wagon", "voiture"], variantes: ["wagon 22,5 t", "voiture"], fournisseur: "Lucchini RS (simulé)" },
  { designation: "Bandage de roue de locomotive", famille: "Roulement", unite: "u", prix: 2_300_000, delai: 180, critique: true, pour: ["locomotive"], variantes: ["CC 2100", "CC 2200", "CC 2300"], fournisseur: "Lucchini RS (simulé)" },
  { designation: "Joint de boîte d'essieu", famille: "Roulement", unite: "u", prix: 18_000, delai: 30, critique: false, pour: ["wagon", "voiture", "locomotive"], variantes: ["wagon", "voiture", "locomotive"], fournisseur: "SKF Railway (simulé)" },
  { designation: "Graisse pour boîtes d'essieux", famille: "Lubrifiants", unite: "kg", prix: 6_500, delai: 20, critique: false, pour: ["wagon", "voiture", "locomotive"], fournisseur: "TotalEnergies Gabon (simulé)" },
  { designation: "Huile moteur SAE 40", famille: "Lubrifiants", unite: "l", prix: 2_900, delai: 15, critique: true, pour: ["locomotive"], fournisseur: "TotalEnergies Gabon (simulé)" },
  { designation: "Huile de compresseur", famille: "Lubrifiants", unite: "l", prix: 4_200, delai: 20, critique: false, pour: ["locomotive"], fournisseur: "TotalEnergies Gabon (simulé)" },
  { designation: "Liquide de refroidissement", famille: "Lubrifiants", unite: "l", prix: 3_100, delai: 20, critique: false, pour: ["locomotive"], fournisseur: "TotalEnergies Gabon (simulé)" },
  { designation: "Injecteur", famille: "Moteur", unite: "u", prix: 780_000, delai: 90, critique: true, pour: ["locomotive"], variantes: ["EMD 645", "GE 7FDL", "EMD 710"], fournisseur: "Progress Rail (simulé)" },
  { designation: "Turbocompresseur (échange standard)", famille: "Moteur", unite: "u", prix: 38_500_000, delai: 240, critique: true, pour: ["locomotive"], variantes: ["CC 2100", "CC 2200", "CC 2300"], fournisseur: "Wabtec Services (simulé)" },
  { designation: "Filtre à huile moteur", famille: "Moteur", unite: "u", prix: 48_000, delai: 30, critique: true, pour: ["locomotive"], variantes: ["CC 2100", "CC 2200", "CC 2300", "BB 500"], fournisseur: "Wabtec Services (simulé)" },
  { designation: "Filtre à gazole", famille: "Moteur", unite: "u", prix: 36_000, delai: 30, critique: false, pour: ["locomotive"], variantes: ["CC 2100", "CC 2200", "CC 2300", "BB 500"], fournisseur: "Wabtec Services (simulé)" },
  { designation: "Cartouche de filtre à air", famille: "Moteur", unite: "u", prix: 72_000, delai: 30, critique: false, pour: ["locomotive"], variantes: ["CC 2100", "CC 2200", "CC 2300"], fournisseur: "Wabtec Services (simulé)" },
  { designation: "Chemise de cylindre", famille: "Moteur", unite: "u", prix: 1_150_000, delai: 120, critique: false, pour: ["locomotive"], variantes: ["EMD 645", "GE 7FDL", "EMD 710"], fournisseur: "Progress Rail (simulé)" },
  { designation: "Jeu de segments de piston", famille: "Moteur", unite: "jeu", prix: 240_000, delai: 90, critique: false, pour: ["locomotive"], variantes: ["EMD 645", "GE 7FDL", "EMD 710"], fournisseur: "Progress Rail (simulé)" },
  { designation: "Pompe à eau", famille: "Moteur", unite: "u", prix: 2_400_000, delai: 120, critique: false, pour: ["locomotive"], variantes: ["CC 2100", "CC 2200", "CC 2300"], fournisseur: "Wabtec Services (simulé)" },
  { designation: "Balais de moteur de traction", famille: "Électrique", unite: "jeu", prix: 135_000, delai: 60, critique: true, pour: ["locomotive"], variantes: ["D77", "GE 752", "AC 6FRA"], fournisseur: "Mersen (simulé)" },
  { designation: "Contacteur de puissance", famille: "Électrique", unite: "u", prix: 690_000, delai: 90, critique: false, pour: ["locomotive"], variantes: ["CC 2100", "CC 2200"], fournisseur: "Wabtec Services (simulé)" },
  { designation: "Carte électronique de commande", famille: "Électrique", unite: "u", prix: 4_600_000, delai: 150, critique: true, pour: ["locomotive"], variantes: ["CC 2200", "CC 2300"], fournisseur: "Wabtec Services (simulé)" },
  { designation: "Batterie de démarrage 74 V", famille: "Électrique", unite: "u", prix: 1_850_000, delai: 60, critique: false, pour: ["locomotive"], variantes: ["CC 2100", "CC 2200", "CC 2300"], fournisseur: "Saft (simulé)" },
  { designation: "Capteur de vitesse", famille: "Électrique", unite: "u", prix: 320_000, delai: 60, critique: true, pour: ["locomotive"], variantes: ["CC 2200", "CC 2300"], fournisseur: "Wabtec Services (simulé)" },
  { designation: "Projecteur LED de cabine", famille: "Électrique", unite: "u", prix: 210_000, delai: 45, critique: false, pour: ["locomotive"], variantes: ["CC 2200", "CC 2300"], fournisseur: "Mersen (simulé)" },
  { designation: "Tube d'éclairage LED de salle", famille: "Électrique", unite: "u", prix: 26_000, delai: 30, critique: false, pour: ["voiture"], fournisseur: "Mersen (simulé)" },
  { designation: "Attelage automatique SA3", famille: "Attelage", unite: "u", prix: 3_900_000, delai: 180, critique: true, pour: ["wagon"], fournisseur: "Forges de l'Estuaire (simulé)" },
  { designation: "Tampon de choc", famille: "Attelage", unite: "u", prix: 290_000, delai: 60, critique: true, pour: ["wagon", "voiture"], variantes: ["wagon", "voiture"], fournisseur: "Forges de l'Estuaire (simulé)" },
  { designation: "Crochet de traction", famille: "Attelage", unite: "u", prix: 420_000, delai: 90, critique: false, pour: ["wagon", "voiture"], variantes: ["wagon", "voiture"], fournisseur: "Forges de l'Estuaire (simulé)" },
  { designation: "Chaîne de sécurité", famille: "Attelage", unite: "u", prix: 58_000, delai: 30, critique: false, pour: ["wagon"], fournisseur: "Forges de l'Estuaire (simulé)" },
  { designation: "Ressort hélicoïdal de bogie", famille: "Suspension", unite: "u", prix: 115_000, delai: 60, critique: false, pour: ["wagon", "voiture"], variantes: ["Y25 extérieur", "Y25 intérieur", "voiture"], fournisseur: "Forges de l'Estuaire (simulé)" },
  { designation: "Amortisseur vertical", famille: "Suspension", unite: "u", prix: 380_000, delai: 90, critique: false, pour: ["voiture", "locomotive"], variantes: ["voiture", "CC 2200", "CC 2300"], fournisseur: "Koni Rail (simulé)" },
  { designation: "Lisoir de bogie", famille: "Suspension", unite: "u", prix: 62_000, delai: 45, critique: false, pour: ["wagon"], variantes: ["Y25", "Y21"], fournisseur: "Forges de l'Estuaire (simulé)" },
  { designation: "Compresseur de climatisation 25 kW", famille: "Climatisation", unite: "u", prix: 5_400_000, delai: 120, critique: true, pour: ["voiture"], fournisseur: "Faiveley Afrique (simulé)" },
  { designation: "Gaz frigorigène R407C (11 kg)", famille: "Climatisation", unite: "u", prix: 145_000, delai: 30, critique: false, pour: ["voiture"], fournisseur: "Faiveley Afrique (simulé)" },
  { designation: "Filtre d'air de climatisation", famille: "Climatisation", unite: "u", prix: 19_500, delai: 20, critique: false, pour: ["voiture"], variantes: ["1re classe et VIP", "2e classe"], fournisseur: "Faiveley Afrique (simulé)" },
  { designation: "Ventilateur d'évaporateur", famille: "Climatisation", unite: "u", prix: 690_000, delai: 90, critique: false, pour: ["voiture"], fournisseur: "Faiveley Afrique (simulé)" },
  { designation: "Vitrage latéral de voiture", famille: "Carrosserie", unite: "u", prix: 340_000, delai: 90, critique: false, pour: ["voiture"], variantes: ["fixe", "ouvrant"], fournisseur: "Verre Industriel (simulé)" },
  { designation: "Serrure de porte d'accès", famille: "Carrosserie", unite: "u", prix: 88_000, delai: 45, critique: false, pour: ["voiture"], variantes: ["porte d'accès", "porte de toilettes"], fournisseur: "Faiveley Afrique (simulé)" },
  { designation: "Joint de porte d'accès", famille: "Carrosserie", unite: "m", prix: 9_000, delai: 30, critique: false, pour: ["voiture"], fournisseur: "Faiveley Afrique (simulé)" },
  { designation: "Assise de siège", famille: "Carrosserie", unite: "u", prix: 75_000, delai: 60, critique: false, pour: ["voiture"], variantes: ["2e classe", "1re classe", "VIP"], fournisseur: "Sellerie de Libreville (simulé)" },
  { designation: "Soufflet d'intercirculation", famille: "Carrosserie", unite: "u", prix: 1_650_000, delai: 120, critique: false, pour: ["voiture"], fournisseur: "Faiveley Afrique (simulé)" },
  { designation: "Peinture anticorrosion (pot 20 l)", famille: "Carrosserie", unite: "u", prix: 168_000, delai: 30, critique: false, pour: ["wagon", "voiture", "locomotive"], variantes: ["gris SETRAG", "primaire", "noir châssis"], fournisseur: "Peintures du Gabon (simulé)" },
  { designation: "Vérin de porte de trémie", famille: "Trémie", unite: "u", prix: 880_000, delai: 90, critique: true, pour: ["wagon"], variantes: ["gauche", "droit"], fournisseur: "Astra Vagoane (simulé)" },
  { designation: "Charnière de porte de trémie", famille: "Trémie", unite: "u", prix: 145_000, delai: 60, critique: false, pour: ["wagon"], variantes: ["haute", "basse"], fournisseur: "Astra Vagoane (simulé)" },
  { designation: "Tôle d'usure de trémie", famille: "Trémie", unite: "u", prix: 260_000, delai: 60, critique: false, pour: ["wagon"], variantes: ["fond", "paroi"], fournisseur: "Astra Vagoane (simulé)" },
  { designation: "Rancher amovible", famille: "Grumier", unite: "u", prix: 210_000, delai: 60, critique: false, pour: ["wagon"], variantes: ["1,8 m", "2,4 m"], fournisseur: "Forges de l'Estuaire (simulé)" },
  { designation: "Sangle d'arrimage de grumes", famille: "Grumier", unite: "u", prix: 32_000, delai: 20, critique: false, pour: ["wagon"], fournisseur: "Forges de l'Estuaire (simulé)" },
  { designation: "Vanne de vidange de citerne", famille: "Citerne", unite: "u", prix: 760_000, delai: 90, critique: true, pour: ["wagon"], variantes: ["DN 80", "DN 100"], fournisseur: "Arbel (simulé)" },
  { designation: "Joint de dôme de citerne", famille: "Citerne", unite: "u", prix: 54_000, delai: 30, critique: false, pour: ["wagon"], fournisseur: "Arbel (simulé)" },
  { designation: "Filtre déshuileur de compresseur", famille: "Moteur", unite: "u", prix: 58_000, delai: 45, critique: false, pour: ["locomotive"], variantes: ["CC 2100", "CC 2200", "CC 2300"], fournisseur: "Wabtec Services (simulé)" },
  { designation: "Durite de radiateur", famille: "Moteur", unite: "u", prix: 44_000, delai: 30, critique: false, pour: ["locomotive"], variantes: ["CC 2100", "CC 2200", "CC 2300"], fournisseur: "Wabtec Services (simulé)" },
  { designation: "Courroie d'alternateur auxiliaire", famille: "Moteur", unite: "u", prix: 39_000, delai: 30, critique: false, pour: ["locomotive"], variantes: ["CC 2100", "CC 2200", "CC 2300", "BB 500"], fournisseur: "Wabtec Services (simulé)" },
  { designation: "Thermostat de refroidissement", famille: "Moteur", unite: "u", prix: 67_000, delai: 45, critique: false, pour: ["locomotive"], variantes: ["EMD 645", "GE 7FDL", "EMD 710"], fournisseur: "Progress Rail (simulé)" },
  { designation: "Fusible haute tension", famille: "Électrique", unite: "u", prix: 54_000, delai: 30, critique: true, pour: ["locomotive"], variantes: ["400 A", "630 A", "1 000 A"], fournisseur: "Mersen (simulé)" },
  { designation: "Relais auxiliaire 74 V", famille: "Électrique", unite: "u", prix: 46_000, delai: 30, critique: false, pour: ["locomotive", "voiture"], variantes: ["temporisé", "instantané"], fournisseur: "Mersen (simulé)" },
  { designation: "Disque de frein de voiture", famille: "Freinage", unite: "u", prix: 690_000, delai: 120, critique: true, pour: ["voiture"], fournisseur: "Knorr-Bremse (simulé)" },
  { designation: "Garniture de frein à disque", famille: "Freinage", unite: "jeu", prix: 155_000, delai: 60, critique: true, pour: ["voiture"], variantes: ["organique", "frittée"], fournisseur: "Knorr-Bremse (simulé)" },
  { designation: "Lanterne de fin de convoi", famille: "Sécurité", unite: "u", prix: 85_000, delai: 30, critique: true, pour: ["wagon", "voiture"], variantes: ["LED", "à réflecteur"], fournisseur: "Mersen (simulé)" },
  { designation: "Extincteur 6 kg", famille: "Sécurité", unite: "u", prix: 62_000, delai: 20, critique: true, pour: ["locomotive", "voiture"], variantes: ["poudre ABC", "CO2"], fournisseur: "Sécurité Incendie Gabon (simulé)" },
  { designation: "Boîte à pharmacie de cabine", famille: "Sécurité", unite: "u", prix: 38_000, delai: 15, critique: false, pour: ["locomotive", "voiture"], fournisseur: "Sécurité Incendie Gabon (simulé)" },
  { designation: "Câble de commande de porte", famille: "Carrosserie", unite: "m", prix: 7_500, delai: 30, critique: false, pour: ["voiture"], fournisseur: "Faiveley Afrique (simulé)" },
  { designation: "Plaque d'identification de wagon", famille: "Carrosserie", unite: "u", prix: 14_000, delai: 20, critique: false, pour: ["wagon"], variantes: ["trémie", "grumier", "citerne", "plat"], fournisseur: "Quincaillerie d'Owendo (simulé)" },
  { designation: "Ressort de tampon", famille: "Attelage", unite: "u", prix: 72_000, delai: 45, critique: false, pour: ["wagon", "voiture"], variantes: ["wagon", "voiture"], fournisseur: "Forges de l'Estuaire (simulé)" },
  { designation: "Bague de bogie (pivot)", famille: "Suspension", unite: "u", prix: 98_000, delai: 60, critique: false, pour: ["wagon", "voiture", "locomotive"], variantes: ["Y25", "voiture", "locomotive"], fournisseur: "Forges de l'Estuaire (simulé)" },
  { designation: "Sabot de frein de locomotive", famille: "Freinage", unite: "u", prix: 31_000, delai: 30, critique: true, pour: ["locomotive"], variantes: ["CC 2100", "CC 2200", "CC 2300", "BB 500"], fournisseur: "Faiveley Afrique (simulé)" },
  { designation: "Joint torique (assortiment)", famille: "Quincaillerie", unite: "lot", prix: 24_000, delai: 20, critique: false, pour: ["wagon", "voiture", "locomotive"], variantes: ["frein", "hydraulique", "carburant"], fournisseur: "Quincaillerie d'Owendo (simulé)" },
  { designation: "Manomètre de frein", famille: "Freinage", unite: "u", prix: 58_000, delai: 45, critique: false, pour: ["locomotive"], variantes: ["cabine", "banc d'essai"], fournisseur: "Faiveley Afrique (simulé)" },
  { designation: "Électrovanne de sablage", famille: "Électrique", unite: "u", prix: 210_000, delai: 60, critique: false, pour: ["locomotive"], variantes: ["CC 2100", "CC 2200", "CC 2300"], fournisseur: "Wabtec Services (simulé)" },
  { designation: "Sable de freinage (sac de 25 kg)", famille: "Consommables", unite: "u", prix: 6_500, delai: 10, critique: true, pour: ["locomotive"], fournisseur: "Carrières de l'Estuaire (simulé)" },
  { designation: "Balai d'essuie-glace de cabine", famille: "Carrosserie", unite: "u", prix: 18_000, delai: 20, critique: false, pour: ["locomotive"], variantes: ["CC 2100", "CC 2200", "CC 2300"], fournisseur: "Wabtec Services (simulé)" },
  { designation: "Siège de conducteur", famille: "Carrosserie", unite: "u", prix: 950_000, delai: 120, critique: false, pour: ["locomotive"], variantes: ["CC 2200", "CC 2300"], fournisseur: "Wabtec Services (simulé)" },
  { designation: "Ventilateur de moteur de traction", famille: "Électrique", unite: "u", prix: 1_350_000, delai: 120, critique: false, pour: ["locomotive"], variantes: ["CC 2100", "CC 2200", "CC 2300"], fournisseur: "Wabtec Services (simulé)" },
  { designation: "Alternateur auxiliaire", famille: "Électrique", unite: "u", prix: 3_200_000, delai: 150, critique: true, pour: ["locomotive"], variantes: ["CC 2100", "CC 2200", "CC 2300"], fournisseur: "Wabtec Services (simulé)" },
  { designation: "Démarreur de moteur diesel", famille: "Électrique", unite: "u", prix: 1_100_000, delai: 120, critique: false, pour: ["locomotive"], variantes: ["CC 2100", "BB 500"], fournisseur: "Progress Rail (simulé)" },
  { designation: "Ressort de suspension primaire", famille: "Suspension", unite: "u", prix: 260_000, delai: 90, critique: false, pour: ["locomotive"], variantes: ["CC 2100", "CC 2200", "CC 2300"], fournisseur: "Forges de l'Estuaire (simulé)" },
  { designation: "Roue monobloc de voiture", famille: "Roulement", unite: "u", prix: 1_450_000, delai: 180, critique: true, pour: ["voiture"], fournisseur: "Lucchini RS (simulé)" },
  { designation: "Rideau de baie", famille: "Carrosserie", unite: "u", prix: 21_000, delai: 30, critique: false, pour: ["voiture"], variantes: ["1re classe et VIP", "2e classe"], fournisseur: "Sellerie de Libreville (simulé)" },
  { designation: "Pompe de toilettes à vide", famille: "Carrosserie", unite: "u", prix: 780_000, delai: 90, critique: false, pour: ["voiture"], fournisseur: "Faiveley Afrique (simulé)" },
  { designation: "Graisse de boudin", famille: "Lubrifiants", unite: "kg", prix: 7_200, delai: 20, critique: false, pour: ["locomotive"], fournisseur: "TotalEnergies Gabon (simulé)" },
  { designation: "Gyrophare de manœuvre", famille: "Sécurité", unite: "u", prix: 64_000, delai: 30, critique: false, pour: ["locomotive"], variantes: ["BB 500"], fournisseur: "Mersen (simulé)" },
  { designation: "Boulonnerie HR (lot de 50)", famille: "Quincaillerie", unite: "lot", prix: 42_000, delai: 15, critique: false, pour: ["wagon", "voiture", "locomotive"], variantes: ["M16", "M20", "M24"], fournisseur: "Quincaillerie d'Owendo (simulé)" },
  { designation: "Goupilles fendues (lot de 100)", famille: "Quincaillerie", unite: "lot", prix: 12_000, delai: 15, critique: false, pour: ["wagon", "voiture", "locomotive"], fournisseur: "Quincaillerie d'Owendo (simulé)" },
  { designation: "Rivets acier (lot de 200)", famille: "Quincaillerie", unite: "lot", prix: 26_000, delai: 15, critique: false, pour: ["wagon"], fournisseur: "Quincaillerie d'Owendo (simulé)" },
  { designation: "Électrodes de soudure (boîte)", famille: "Quincaillerie", unite: "u", prix: 18_500, delai: 15, critique: false, pour: ["wagon", "voiture", "locomotive"], variantes: ["2,5 mm", "3,2 mm", "4 mm"], fournisseur: "Quincaillerie d'Owendo (simulé)" },
]

/* ============================================================ Peuplement */

interface MouvementPrevu {
  articleId: Id<"gmaoArticles">
  atelierId: Id<"gmaoAteliers">
  sens: "entree" | "sortie"
  quantite: number
  motif: string
  le: number
  otId?: Id<"gmaoOrdresTravail">
  auteurId?: Id<"users">
}

async function premierParRole(ctx: MutationCtx, ...roles: AppRole[]) {
  for (const role of roles) {
    const user = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", role))
      .first()
    if (user?.isActive) return user._id
  }
  return undefined
}

async function peupler(ctx: MutationCtx, volume: Volume) {
  const h = generateur(20261001)
  const maintenant = Date.now()
  const annee = new Date(maintenant).getUTCFullYear()
  const reduit = volume === "reduit"
  const joursHistorique = reduit ? 40 : 182
  const debutHistorique = maintenant - joursHistorique * JOUR_MS

  const acteurs = {
    responsable: await premierParRole(ctx, "responsable_atelier", "ingenieur_atelier", "admin_fonctionnel"),
    ingenieur: await premierParRole(ctx, "ingenieur_atelier", "responsable_atelier", "admin_fonctionnel"),
    contremaitre: await premierParRole(ctx, "contremaitre_atelier"),
    visiteur: await premierParRole(ctx, "visiteur_rames", "contremaitre_atelier"),
    magasinier: await premierParRole(ctx, "magasinier", "gestionnaire_stocks"),
    stocks: await premierParRole(ctx, "gestionnaire_stocks", "responsable_atelier"),
  }
  const cloturant =
    acteurs.ingenieur && acteurs.ingenieur !== acteurs.contremaitre ? acteurs.ingenieur : undefined

  const compteurs = new Map<string, number>()
  const numero = (prefixe: "OT" | "DA" | "VT" | "CF", le: number) => {
    const an = new Intl.DateTimeFormat("fr-CA", { timeZone: "Africa/Libreville", year: "numeric" }).format(le)
    const cle = `gmao:${prefixe}:${an}`
    const valeur = (compteurs.get(cle) ?? 0) + 1
    compteurs.set(cle, valeur)
    return `${prefixe}-${an}-${String(valeur).padStart(4, "0")}`
  }
  const evenement = async (
    entite: Doc<"gmaoEvenements">["entite"],
    entiteId: string,
    type: string,
    libelle: string,
    le: number,
    auteurId?: Id<"users">,
    detail?: string
  ) => {
    await ctx.db.insert("gmaoEvenements", { entite, entiteId, type, libelle, detail, auteurId, creeLe: le })
  }

  /* ----------------------------------------------------------- Ateliers */
  const ateliers = new Map<CodeAtelier, Doc<"gmaoAteliers">>()
  for (const definition of ATELIERS) {
    const gare = await ctx.db
      .query("stations")
      .withIndex("by_code", (q) => q.eq("code", definition.gare))
      .first()
    const id = await ctx.db.insert("gmaoAteliers", {
      code: definition.code,
      nom: definition.nom,
      stationId: gare?._id,
      kilometerPoint: gare?.kilometerPoint ?? definition.kilometerPoint,
      description: definition.description,
      tauxHoraireFcfa: definition.tauxHoraireFcfa,
      isActive: true,
    })
    ateliers.set(definition.code, (await ctx.db.get(id))!)
  }
  const atelier = (code: CodeAtelier) => ateliers.get(code)!

  /* ------------------------------------------------------------- Parc */
  const engins: Doc<"gmaoEquipements">[] = []
  const creerEngin = async (valeurs: {
    numero: string
    famille: Famille
    serie: string
    constructeur: string
    annee: number
    kmAn: number
    atelierCode: CodeAtelier
    proprietaire: string
    coachId?: Id<"coaches">
    trainId?: Id<"trains">
    tare?: number
    charge?: number
  }) => {
    const age = Math.max(0.5, annee - valeurs.annee + h.entre(0, 0.9))
    const km = Math.round(age * valeurs.kmAn * h.entre(0.85, 1.08))
    const releveLe = maintenant - h.entier(0, 4) * JOUR_MS - h.entier(1, 20) * HEURE_MS
    const id = await ctx.db.insert("gmaoEquipements", {
      numero: valeurs.numero,
      famille: valeurs.famille,
      serie: valeurs.serie,
      constructeur: valeurs.constructeur,
      anneeMiseEnService: valeurs.annee,
      numeroSerie: `${valeurs.constructeur.slice(0, 3).toUpperCase()}-${valeurs.annee}-${h.entier(10_000, 99_999)}`,
      coachId: valeurs.coachId,
      trainId: valeurs.trainId,
      atelierId: atelier(valeurs.atelierCode)._id,
      statut: "en_service",
      statutDepuis: maintenant - h.entier(5, 120) * JOUR_MS,
      compteurKm: km,
      compteurHeures: valeurs.famille === "locomotive" ? Math.round(km * h.entre(0.028, 0.036)) : 0,
      compteurReleveLe: releveLe,
      proprietaire: valeurs.proprietaire,
      tareTonnes: valeurs.tare,
      chargeUtileTonnes: valeurs.charge,
      notes: NOTE_DEMO,
      creeLe: debutHistorique - 400 * JOUR_MS,
      majLe: maintenant,
    })
    const engin = (await ctx.db.get(id))!
    engins.push(engin)
    if (valeurs.famille === "locomotive") {
      await ctx.db.insert("gmaoReleves", {
        equipementId: id,
        km: Math.max(0, km - Math.round((valeurs.kmAn / 365) * 30)),
        heures: Math.max(0, engin.compteurHeures - 30 * 14),
        releveLe: releveLe - 30 * JOUR_MS,
        source: "telemetrie_simulee",
      })
    }
    await ctx.db.insert("gmaoReleves", {
      equipementId: id,
      km,
      heures: engin.compteurHeures,
      releveLe,
      source: valeurs.famille === "locomotive" ? "telemetrie_simulee" : "visite",
      auteurId: valeurs.famille === "locomotive" ? undefined : acteurs.visiteur,
    })
    return engin
  }

  const trains = (await ctx.db.query("trains").collect()).filter((train) => train.isActive)
  for (const serie of SERIES_LOCO) {
    const nombre = reduit ? Math.ceil(serie.nombre / 3) : serie.nombre
    for (let i = 1; i <= nombre; i += 1) {
      const affectation =
        serie.prefixe === "CC-23" && i <= trains.length ? trains[i - 1]!._id : undefined
      await creerEngin({
        numero: serie.prefixe === "BB-5" ? `BB-5${String(i).padStart(2, "0")}` : `${serie.prefixe}${String(i).padStart(2, "0")}`,
        famille: "locomotive",
        serie: serie.serie,
        constructeur: serie.constructeur,
        annee: h.entier(serie.annees[0], serie.annees[1]),
        kmAn: h.entre(serie.kmAn[0], serie.kmAn[1]),
        atelierCode: serie.atelier,
        proprietaire: "SETRAG",
        trainId: affectation,
        tare: serie.prefixe === "BB-5" ? 72 : 132,
      })
    }
  }

  const classes = { VIP: "Voiture VIP", PREMIERE: "Voiture 1re classe", DEUXIEME: "Voiture 2e classe" } as const
  let voituresReferentiel = 0
  for (const train of trains) {
    const coaches = await ctx.db
      .query("coaches")
      .withIndex("by_train", (q) => q.eq("trainId", train._id))
      .collect()
    for (const coach of coaches.sort((a, b) => a.position - b.position)) {
      voituresReferentiel += 1
      await creerEngin({
        numero: coach.serialNumber ?? `VY-${train.number.replace(/\D/g, "")}-${coach.label}`,
        famille: "voiture",
        serie: classes[coach.serviceClass],
        constructeur: "CRRC Tangshan",
        annee: h.entier(2016, 2019),
        kmAn: h.entre(140_000, 175_000),
        atelierCode: "OWE",
        proprietaire: "SETRAG",
        coachId: coach._id,
        trainId: train._id,
        tare: 46,
      })
    }
  }
  const reserves: { serie: string; nombre: number; prefixe: string }[] = [
    { serie: "Voiture 2e classe", nombre: voituresReferentiel === 0 ? 10 : 6, prefixe: "VY-R2-" },
    { serie: "Voiture 1re classe", nombre: voituresReferentiel === 0 ? 4 : 2, prefixe: "VY-R1-" },
    { serie: "Voiture-bar", nombre: 2, prefixe: "VY-BAR-" },
    { serie: "Fourgon générateur", nombre: 4, prefixe: "FG-" },
  ]
  for (const reserve of reserves) {
    const nombre = reduit ? Math.ceil(reserve.nombre / 2) : reserve.nombre
    for (let i = 1; i <= nombre; i += 1) {
      await creerEngin({
        numero: `${reserve.prefixe}${String(i).padStart(2, "0")}`,
        famille: "voiture",
        serie: reserve.serie,
        constructeur: reserve.serie === "Fourgon générateur" ? "Ganz-Mavag" : "CRRC Tangshan",
        annee: reserve.serie === "Fourgon générateur" ? h.entier(1998, 2004) : h.entier(2016, 2019),
        kmAn: h.entre(90_000, 140_000),
        atelierCode: "OWE",
        proprietaire: "SETRAG",
        tare: 48,
      })
    }
  }

  const totalWagons = reduit ? 30 : 300
  for (const serie of SERIES_WAGON) {
    const nombre = Math.round(totalWagons * serie.part)
    for (let i = 0; i < nombre; i += 1) {
      await creerEngin({
        numero: `${serie.prefixe}${serie.debut + i}`,
        famille: "wagon",
        serie: serie.serie,
        constructeur: serie.constructeur,
        annee: h.entier(serie.annees[0], serie.annees[1]),
        kmAn: h.entre(55_000, 95_000),
        atelierCode: serie.atelier,
        proprietaire: h.choisir(serie.proprietaire),
        tare: serie.tare,
        charge: serie.charge,
      })
    }
  }
  const parFamille = (famille: Famille) => engins.filter((engin) => engin.famille === famille)
  const choisirEngin = (): Doc<"gmaoEquipements"> => {
    const tirage = h.reel()
    const famille: Famille = tirage < 0.35 ? "locomotive" : tirage < 0.5 ? "voiture" : "wagon"
    return h.choisir(parFamille(famille))
  }

  /* ------------------------------------------------------------ Plans */
  const plans: Doc<"gmaoPlans">[] = []
  for (const definition of PLANS) {
    const id = await ctx.db.insert("gmaoPlans", {
      code: definition.code,
      libelle: definition.libelle,
      famille: definition.famille,
      series: [...definition.series],
      seuilKm: "seuilKm" in definition ? definition.seuilKm : undefined,
      seuilJours: "seuilJours" in definition ? definition.seuilJours : undefined,
      alertePct: definition.alertePct,
      dureeHeures: definition.dureeHeures,
      immobilisant: definition.immobilisant,
      operations: [...definition.operations],
      isActive: true,
      creeLe: debutHistorique - 400 * JOUR_MS,
      majLe: debutHistorique - 400 * JOUR_MS,
    })
    plans.push((await ctx.db.get(id))!)
  }
  const plansDe = (engin: Doc<"gmaoEquipements">) =>
    plans.filter(
      (plan) => plan.famille === engin.famille && (plan.series.length === 0 || plan.series.includes(engin.serie))
    )

  const echuesSansOt: { rattachementId: Id<"gmaoPlansEquipements">; plan: Doc<"gmaoPlans">; engin: Doc<"gmaoEquipements"> }[] = []
  for (const engin of engins) {
    for (const plan of plansDe(engin)) {
      const tirage = h.reel()
      const ratio = tirage < 0.05 ? h.entre(1.0, 1.2) : tirage < 0.14 ? h.entre(0.87, 0.99) : h.entre(0.05, 0.85)
      const ratioKm = plan.seuilKm ? ratio : 0
      const ratioTemps = plan.seuilJours ? (plan.seuilKm ? ratio * h.entre(0.55, 0.95) : ratio) : 0
      const id = await ctx.db.insert("gmaoPlansEquipements", {
        planId: plan._id,
        equipementId: engin._id,
        derniereRealisationKm: Math.max(0, Math.round(engin.compteurKm - ratioKm * (plan.seuilKm ?? 0))),
        derniereRealisationLe: Math.round(maintenant - ratioTemps * (plan.seuilJours ?? 0) * JOUR_MS),
      })
      if (ratio >= 1) echuesSansOt.push({ rattachementId: id, plan, engin })
    }
  }

  /* --------------------------------------------------------- Articles */
  const articles: Doc<"gmaoArticles">[] = []
  const stocksPrevus = new Map<string, { articleId: Id<"gmaoArticles">; atelierId: Id<"gmaoAteliers">; initial: number; sousSeuil: boolean }>()
  let rang = 0
  for (const modele of CATALOGUE) {
    const variantes = modele.variantes ?? [""]
    for (const variante of reduit ? variantes.slice(0, 1) : variantes) {
      rang += 1
      const prefixe = modele.famille.slice(0, 3).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      const id = await ctx.db.insert("gmaoArticles", {
        reference: `${prefixe}-${String(1000 + rang * 7).padStart(5, "0")}`,
        designation: variante ? `${modele.designation} — ${variante}` : modele.designation,
        famille: modele.famille,
        unite: modele.unite,
        prixUnitaireFcfa: Math.round(modele.prix * h.entre(0.92, 1.08) / 100) * 100,
        fournisseur: modele.fournisseur,
        delaiApproJours: modele.delai,
        critique: modele.critique,
        compatibilite: modele.pour.map((famille) => (famille === "locomotive" ? "Locomotives" : famille === "voiture" ? "Voitures" : "Wagons")).join(", ") + (variante ? ` · ${variante}` : ""),
        isActive: true,
        creeLe: debutHistorique - 500 * JOUR_MS,
        majLe: debutHistorique - 500 * JOUR_MS,
      })
      const article = (await ctx.db.get(id))!
      articles.push(article)
      const magasins: CodeAtelier[] = ["OWE"]
      if (modele.pour.includes("locomotive") && h.probable(0.7)) magasins.push("BOO")
      if (modele.pour.includes("wagon") && h.probable(0.75)) magasins.push("MOA")
      for (const code of magasins) {
        const unitaireCher = modele.prix > 1_000_000
        const initial =
          modele.unite === "l" ? h.entier(800, 3_000) : modele.unite === "kg" ? h.entier(150, 600) : unitaireCher ? h.entier(1, 6) : h.entier(12, 80)
        stocksPrevus.set(`${id}|${atelier(code)._id}`, {
          articleId: id,
          atelierId: atelier(code)._id,
          initial,
          sousSeuil: h.probable(0.12),
        })
      }
    }
  }
  const articlesPour = (famille: Famille) =>
    articles.filter((article) => article.compatibilite.includes(famille === "locomotive" ? "Locomotives" : famille === "voiture" ? "Voitures" : "Wagons"))
  const mouvementsPrevus: MouvementPrevu[] = []

  /* ------------------------------------------------- Ordres de travail */
  let nombreOt = 0
  const insererOt = async (params: {
    engin: Doc<"gmaoEquipements">
    type: "preventif" | "correctif" | "amelioratif"
    origine: "demande" | "plan" | "visite_technique" | "incident"
    priorite: Priorite
    titre: string
    description: string
    organe?: string
    plan?: Doc<"gmaoPlans">
    planEquipementId?: Id<"gmaoPlansEquipements">
    visiteId?: Id<"gmaoVisites">
    immobilisant: boolean
    demandeLe: number
    issue: "cloture" | "annule" | "demande" | "planifie" | "en_cours" | "travaux_termines"
    retard?: boolean
  }) => {
    nombreOt += 1
    const atelierOt = await ctx.db.get(params.engin.atelierId)
    const taux = atelierOt?.tauxHoraireFcfa ?? 17_000
    const num = numero("OT", params.demandeLe)
    const planifieLe = params.demandeLe + h.entre(2, 40) * HEURE_MS
    const dureeHeures = params.plan ? params.plan.dureeHeures * h.entre(0.85, 1.35) : h.entre(3, 60)
    const calendrierHeures = Math.max(dureeHeures * 1.6, 4)
    const debutPrevu = planifieLe + h.entre(4, 72) * HEURE_MS
    let finPrevue = debutPrevu + calendrierHeures * HEURE_MS
    if (params.retard) finPrevue = maintenant - h.entre(6, 96) * HEURE_MS
    const commence = ["cloture", "en_cours", "travaux_termines"].includes(params.issue)
    const termine = ["cloture", "travaux_termines"].includes(params.issue)
    const debutReel = commence ? (params.issue === "cloture" ? debutPrevu : Math.min(debutPrevu, maintenant - h.entre(4, 60) * HEURE_MS)) : undefined
    const finReelle = termine ? Math.min(maintenant - HEURE_MS, (debutReel ?? debutPrevu) + calendrierHeures * h.entre(0.9, 1.3) * HEURE_MS) : undefined
    const clotureLe = params.issue === "cloture" ? Math.min(maintenant - HEURE_MS / 2, (finReelle ?? maintenant) + h.entre(1, 20) * HEURE_MS) : undefined
    const equipe = h.choisir(EQUIPES[params.engin.famille])
    const coutExterne = params.issue === "cloture" && h.probable(0.05) ? h.entier(4, 30) * 100_000 : 0
    const otId = await ctx.db.insert("gmaoOrdresTravail", {
      numero: num,
      equipementId: params.engin._id,
      type: params.type,
      origine: params.origine,
      planId: params.plan?._id,
      planEquipementId: params.planEquipementId,
      visiteId: params.visiteId,
      priorite: params.priorite,
      titre: params.titre,
      description: params.description,
      statut: params.issue,
      atelierId: params.engin.atelierId,
      equipe: params.issue === "demande" ? undefined : equipe,
      debutPrevu: params.issue === "demande" ? undefined : debutPrevu,
      finPrevue: params.issue === "demande" ? undefined : finPrevue,
      debutReel,
      finReelle,
      immobilisant: params.immobilisant,
      kmDebut: commence ? params.engin.compteurKm : undefined,
      coutMainOeuvreFcfa: 0,
      coutPiecesFcfa: 0,
      coutExterneFcfa: coutExterne,
      heuresPassees: 0,
      compteRendu: termine
        ? params.type === "preventif"
          ? "Gamme réalisée intégralement. Aucune réserve à la réception."
          : `${params.organe ?? "Organe"} remplacé ou remis en état, essais concluants.`
        : undefined,
      organe: params.organe,
      demandeurId: params.origine === "visite_technique" ? acteurs.visiteur : acteurs.contremaitre ?? acteurs.responsable,
      demandeLe: params.demandeLe,
      planifieParId: params.issue === "demande" ? undefined : acteurs.contremaitre ?? acteurs.responsable,
      termineParId: termine ? acteurs.contremaitre : undefined,
      clotureParId: params.issue === "cloture" ? cloturant : undefined,
      clotureLe,
      motifAnnulation: params.issue === "annule" ? h.choisir(["Doublon d'une demande existante", "Défaut non confirmé à l'expertise", "Intervention regroupée avec la visite périodique"]) : undefined,
      majLe: clotureLe ?? finReelle ?? debutReel ?? planifieLe,
    })
    // Temps passés et pièces : seulement pour les travaux commencés.
    let heures = 0
    let coutMo = 0
    let coutPieces = 0
    if (commence && debutReel !== undefined) {
      const aRealiser = params.issue === "en_cours" ? dureeHeures * h.entre(0.2, 0.7) : dureeHeures
      const intervenants = h.entier(1, 3)
      for (let i = 0; i < intervenants; i += 1) {
        const [nom, matricule] = h.choisir(INTERVENANTS)
        const part = Math.max(0.5, Math.round((aRealiser / intervenants) * 4) / 4)
        const tranche = Math.min(16, part)
        heures += tranche
        coutMo += Math.round(tranche * taux)
        await ctx.db.insert("gmaoTempsPasses", {
          otId,
          intervenant: nom,
          matricule,
          date: debutReel + i * 2 * HEURE_MS,
          heures: tranche,
          tauxHoraireFcfa: taux,
          saisiParId: acteurs.contremaitre,
          saisiLe: debutReel + (i + 1) * 3 * HEURE_MS,
        })
      }
      const compatibles = articlesPour(params.engin.famille)
      const nombrePieces = params.issue === "en_cours" ? h.entier(0, 1) : h.entier(0, 3)
      for (let i = 0; i < nombrePieces && compatibles.length > 0; i += 1) {
        const article = h.choisir(compatibles)
        const magasin = stocksPrevus.has(`${article._id}|${params.engin.atelierId}`)
          ? params.engin.atelierId
          : atelier("OWE")._id
        const quantite =
          article.unite === "l" ? h.entier(20, 180) : article.unite === "kg" ? h.entier(2, 15) : article.prixUnitaireFcfa > 1_000_000 ? 1 : h.entier(1, 8)
        coutPieces += Math.round(quantite * article.prixUnitaireFcfa)
        mouvementsPrevus.push({
          articleId: article._id,
          atelierId: magasin,
          sens: "sortie",
          quantite,
          motif: `Consommation sur ${num}`,
          le: debutReel + h.entre(1, 6) * HEURE_MS,
          otId,
          auteurId: acteurs.magasinier,
        })
        if (!stocksPrevus.has(`${article._id}|${magasin}`)) {
          stocksPrevus.set(`${article._id}|${magasin}`, { articleId: article._id, atelierId: magasin, initial: quantite * 3, sousSeuil: false })
        }
      }
      await ctx.db.patch(otId, { heuresPassees: heures, coutMainOeuvreFcfa: coutMo, coutPiecesFcfa: coutPieces })
    }
    // Chronologie essentielle du dossier.
    await evenement("ordre_travail", otId, "creation", `Demande ${num} créée`, params.demandeLe, params.origine === "visite_technique" ? acteurs.visiteur : acteurs.contremaitre, `${params.engin.numero} · ${params.titre}`)
    if (params.issue !== "demande" && params.issue !== "annule") {
      await evenement("ordre_travail", otId, "planification", "OT planifié", planifieLe, acteurs.contremaitre ?? acteurs.responsable, `${atelierOt?.nom ?? ""} · ${equipe}`)
    }
    if (debutReel !== undefined) {
      await evenement("ordre_travail", otId, "demarrage", "Travaux commencés", debutReel, acteurs.contremaitre)
    }
    if (finReelle !== undefined) {
      await evenement("ordre_travail", otId, "fin_travaux", "Travaux terminés — en attente de réception", finReelle, acteurs.contremaitre, `${heures.toLocaleString("fr-FR")} h passées`)
    }
    if (clotureLe !== undefined) {
      await evenement("ordre_travail", otId, "cloture", "OT clôturé — engin réceptionné", clotureLe, cloturant, `Coût total ${(coutMo + coutPieces + coutExterne).toLocaleString("fr-FR")} XAF`)
    }
    if (params.issue === "annule") {
      await evenement("ordre_travail", otId, "annulation", "OT annulé", params.demandeLe + h.entre(6, 48) * HEURE_MS, acteurs.contremaitre ?? acteurs.responsable)
    }
    return { otId, numero: num }
  }

  // Historique : six mois d'OT clôturés ou annulés.
  for (let jour = joursHistorique; jour >= 9; jour -= 1) {
    const nombre = reduit ? (h.probable(0.5) ? 1 : 0) : h.entier(1, 3)
    for (let i = 0; i < nombre; i += 1) {
      const engin = choisirEngin()
      const demandeLe = maintenant - jour * JOUR_MS + h.entre(6, 18) * HEURE_MS
      const tirage = h.reel()
      const issue = h.probable(0.08) ? "annule" : "cloture"
      if (tirage < 0.35 && plansDe(engin).length > 0) {
        const plan = h.choisir(plansDe(engin))
        await insererOt({
          engin,
          type: "preventif",
          origine: "plan",
          priorite: "normale",
          titre: `${plan.code} — ${plan.libelle}`,
          description: plan.operations.map((operation) => `• ${operation}`).join("\n"),
          plan,
          immobilisant: plan.immobilisant,
          demandeLe,
          issue,
        })
      } else {
        const panne = h.choisir(DEFAILLANCES[engin.famille])
        const amelioratif = tirage > 0.95
        await insererOt({
          engin,
          type: amelioratif ? "amelioratif" : "correctif",
          origine: h.probable(0.2) ? "visite_technique" : "demande",
          priorite: h.choisir<Priorite>(["urgente", "haute", "haute", "normale", "normale", "normale", "basse"]),
          titre: amelioratif ? `Modification : fiabilisation — ${panne.organe.toLowerCase()}` : panne.titre,
          description: amelioratif
            ? `Campagne de fiabilisation de l'organe « ${panne.organe} » sur la série ${engin.serie}.`
            : `${panne.titre}. Constat de l'équipe de conduite ou de visite ; diagnostic à confirmer en atelier.`,
          organe: panne.organe,
          immobilisant: h.probable(0.7),
          demandeLe,
          issue,
        })
      }
    }
  }

  // En cours : la charge actuelle des ateliers.
  const dejaOccupes = new Set<string>()
  const enginLibre = (famille?: Famille) => {
    for (let essai = 0; essai < 50; essai += 1) {
      const engin = famille ? h.choisir(parFamille(famille)) : choisirEngin()
      if (!dejaOccupes.has(engin._id)) {
        dejaOccupes.add(engin._id)
        return engin
      }
    }
    return choisirEngin()
  }
  const courants: { issue: "demande" | "planifie" | "en_cours" | "travaux_termines"; nombre: number; retard?: number; urgents?: number }[] = [
    { issue: "en_cours", nombre: reduit ? 2 : 8 },
    { issue: "travaux_termines", nombre: reduit ? 1 : 4 },
    { issue: "planifie", nombre: reduit ? 2 : 10, retard: reduit ? 1 : 3 },
    { issue: "demande", nombre: reduit ? 2 : 10, urgents: reduit ? 1 : 3 },
  ]
  for (const groupe of courants) {
    for (let i = 0; i < groupe.nombre; i += 1) {
      const engin = enginLibre()
      const panne = h.choisir(DEFAILLANCES[engin.famille])
      const urgent = groupe.urgents !== undefined && i < groupe.urgents
      const ancienne = groupe.issue === "demande" && i === groupe.nombre - 1
      await insererOt({
        engin,
        type: "correctif",
        origine: "demande",
        priorite: urgent ? "urgente" : h.choisir<Priorite>(["haute", "normale", "normale", "basse"]),
        titre: panne.titre,
        description: `${panne.titre}. Signalé par l'équipe de conduite ; diagnostic en cours.`,
        organe: panne.organe,
        immobilisant: urgent || groupe.issue === "en_cours" || groupe.issue === "travaux_termines" || h.probable(0.5),
        demandeLe: ancienne ? maintenant - 12 * JOUR_MS : maintenant - h.entre(0.3, 6) * JOUR_MS,
        issue: groupe.issue,
        retard: groupe.retard !== undefined && i < groupe.retard,
      })
    }
  }
  // La moitié des échéances échues a déjà son OT préventif ouvert.
  for (const [index, echue] of echuesSansOt.entries()) {
    if (index % 2 === 1 || dejaOccupes.has(echue.engin._id)) continue
    dejaOccupes.add(echue.engin._id)
    const { otId } = await insererOt({
      engin: echue.engin,
      type: "preventif",
      origine: "plan",
      priorite: "normale",
      titre: `${echue.plan.code} — ${echue.plan.libelle}`,
      description: echue.plan.operations.map((operation) => `• ${operation}`).join("\n"),
      plan: echue.plan,
      planEquipementId: echue.rattachementId,
      immobilisant: echue.plan.immobilisant,
      demandeLe: maintenant - h.entre(0.5, 4) * JOUR_MS,
      issue: h.probable(0.5) ? "planifie" : "demande",
    })
    await ctx.db.patch(echue.rattachementId, { otOuvertId: otId })
  }

  /* --------------------------------------------- Visites avant départ */
  const locosLigne = parFamille("locomotive").filter((engin) => !engin.serie.startsWith("BB"))
  const tremies = parFamille("wagon").filter((engin) => engin.serie.startsWith("Trémie"))
  const grumiers = parFamille("wagon").filter((engin) => engin.serie.startsWith("Wagon grumier"))
  const voitures = parFamille("voiture")
  const composer = (): { convoi: string; engins: Doc<"gmaoEquipements">[]; atelierCode: CodeAtelier } => {
    const tirage = h.reel()
    const pris = <T,>(liste: readonly T[], n: number) => {
      const copie = [...liste]
      const resultat: T[] = []
      while (resultat.length < n && copie.length > 0) resultat.push(copie.splice(Math.floor(h.reel() * copie.length), 1)[0]!)
      return resultat
    }
    if (tirage < 0.55 && tremies.length > 0) {
      return { convoi: `MIN-${h.entier(701, 760)}`, engins: [...pris(locosLigne, 2), ...pris(tremies, reduit ? 8 : 40)], atelierCode: "MOA" }
    }
    if (tirage < 0.75 && grumiers.length > 0) {
      return { convoi: `BOI-${h.entier(301, 340)}`, engins: [...pris(locosLigne, 2), ...pris(grumiers, reduit ? 5 : 18)], atelierCode: "OWE" }
    }
    return { convoi: h.choisir(["TR-201", "TR-202"]), engins: [...pris(locosLigne, 1), ...pris(voitures, reduit ? 3 : 6)], atelierCode: "OWE" }
  }
  const nombreVisites = reduit ? 12 : 130
  for (let i = 0; i < nombreVisites; i += 1) {
    const debutLe = debutHistorique + ((i + 0.5) / nombreVisites) * (joursHistorique - 1) * JOUR_MS
    const { convoi, engins: composition, atelierCode } = composer()
    const familles = [...new Set(composition.map((engin) => engin.famille))]
    const tirage = h.reel()
    const gravite: GraviteDefaut | null = tirage < 0.03 ? "bloquant" : tirage < 0.1 ? "majeur" : tirage < 0.28 ? "mineur" : null
    const defauts = gravite
      ? (() => {
          const cible = h.choisir(composition)
          const panne = h.choisir(DEFAILLANCES[cible.famille])
          return [{ equipementId: cible._id, organe: panne.organe, description: panne.titre, gravite }]
        })()
      : []
    const controles = CONTROLES_VISITE.filter((controle) => controle.familles.some((famille) => familles.includes(famille))).map((controle) => ({
      code: controle.code,
      libelle: controle.libelle,
      resultat: (gravite && (controle.code === "FREIN_ESSAI" || controle.code === "ROUES") && h.probable(0.5) ? "defaut" : "ok") as "ok" | "defaut",
    }))
    if (gravite && !controles.some((controle) => controle.resultat === "defaut")) controles[0]!.resultat = "defaut"
    const aptitude = gravite === "bloquant" ? "inapte" : gravite === "majeur" ? "apte_sous_reserve" : "apte"
    const visiteId = await ctx.db.insert("gmaoVisites", {
      numero: numero("VT", debutLe),
      convoi,
      atelierId: atelier(atelierCode)._id,
      equipementIds: composition.map((engin) => engin._id),
      controles,
      defauts,
      statut: "signee",
      aptitude,
      observations: gravite === "mineur" ? "Défaut mineur noté pour la prochaine visite périodique." : undefined,
      visiteurId: acteurs.visiteur,
      debutLe,
      signeeLe: debutLe + h.entre(0.6, 1.8) * HEURE_MS,
      otIds: [],
    })
    const otIds: Id<"gmaoOrdresTravail">[] = []
    for (const defaut of defauts) {
      if (defaut.gravite === "mineur") continue
      const engin = engins.find((candidat) => candidat._id === defaut.equipementId)!
      const { otId } = await insererOt({
        engin,
        type: "correctif",
        origine: "visite_technique",
        priorite: prioriteDefaut(defaut.gravite),
        titre: `${defaut.organe} — défaut ${defaut.gravite} relevé en visite`,
        description: `${defaut.description}\n\nRelevé lors de la visite du convoi ${convoi}.`,
        organe: defaut.organe,
        visiteId,
        immobilisant: defaut.gravite === "bloquant",
        demandeLe: debutLe + 2 * HEURE_MS,
        issue: "cloture",
      })
      otIds.push(otId)
    }
    if (otIds.length > 0) await ctx.db.patch(visiteId, { otIds })
    await evenement("visite", visiteId, "signature", `Visite signée : ${aptitude === "apte" ? "apte au départ" : aptitude === "inapte" ? "inapte — départ bloqué" : "apte sous réserve"}`, debutLe + 1.5 * HEURE_MS, acteurs.visiteur, `Convoi ${convoi} · ${composition.length} engin(s)`)
  }

  // Aujourd'hui : visites rattachées aux circulations du jour, si elles existent.
  const aujourdhui = new Intl.DateTimeFormat("fr-CA", { timeZone: "Africa/Libreville" }).format(maintenant)
  const tripsDuJour = (
    await ctx.db
      .query("trips")
      .withIndex("by_service_date", (q) => q.eq("serviceDate", aujourdhui))
      .collect()
  ).sort((a, b) => a.departureAt - b.departureAt)
  for (const [index, trip] of tripsDuJour.slice(0, 2).entries()) {
    const loco = parFamille("locomotive").find((engin) => engin.trainId === trip.trainId && !dejaOccupes.has(engin._id)) ?? locosLigne.find((engin) => !dejaOccupes.has(engin._id))
    const voituresTrain = parFamille("voiture").filter((engin) => engin.trainId === trip.trainId)
    const composition = [loco, ...voituresTrain].filter((engin): engin is Doc<"gmaoEquipements"> => engin !== undefined)
    if (composition.length === 0) continue
    composition.forEach((engin) => dejaOccupes.add(engin._id))
    const debutLe = Math.min(maintenant - 20 * 60_000, trip.departureAt - 90 * 60_000)
    const signee = index === 0
    const visiteId = await ctx.db.insert("gmaoVisites", {
      numero: numero("VT", debutLe),
      tripId: trip._id,
      convoi: trip.trainNumber,
      atelierId: atelier("OWE")._id,
      equipementIds: composition.map((engin) => engin._id),
      controles: CONTROLES_VISITE.filter((controle) => controle.familles.some((famille) => composition.some((engin) => engin.famille === famille))).map((controle) => ({ code: controle.code, libelle: controle.libelle, resultat: "ok" as const })),
      defauts: [],
      statut: signee ? "signee" : "en_cours",
      aptitude: signee ? "apte" : undefined,
      visiteurId: acteurs.visiteur,
      debutLe,
      signeeLe: signee ? debutLe + 50 * 60_000 : undefined,
      otIds: [],
    })
    await evenement("visite", visiteId, "ouverture", "Visite ouverte", debutLe, acteurs.visiteur, `Convoi ${trip.trainNumber}`)
    if (signee) await evenement("visite", visiteId, "signature", "Visite signée : apte au départ", debutLe + 50 * 60_000, acteurs.visiteur)
  }
  // Un convoi minéralier déclaré inapte ce matin : départ bloqué, OT urgent.
  {
    const loco = locosLigne.find((engin) => !dejaOccupes.has(engin._id))
    const wagons = tremies.filter((engin) => !dejaOccupes.has(engin._id)).slice(0, reduit ? 6 : 36)
    if (loco && wagons.length > 0) {
      const composition = [loco, ...wagons]
      composition.forEach((engin) => dejaOccupes.add(engin._id))
      const fautif = wagons[Math.min(3, wagons.length - 1)]!
      const debutLe = maintenant - 3 * HEURE_MS
      const defauts = [{ equipementId: fautif._id, organe: "Boîte d'essieu", description: "Boîte d'essieu chaude au thermomètre (92 °C), graisse carbonisée", gravite: "bloquant" as const }]
      const visiteId = await ctx.db.insert("gmaoVisites", {
        numero: numero("VT", debutLe),
        convoi: "MIN-712",
        atelierId: atelier("MOA")._id,
        equipementIds: composition.map((engin) => engin._id),
        controles: CONTROLES_VISITE.filter((controle) => controle.familles.some((famille) => famille === "locomotive" || famille === "wagon")).map((controle) => ({ code: controle.code, libelle: controle.libelle, resultat: (controle.code === "ESSIEUX" ? "defaut" : "ok") as "ok" | "defaut" })),
        defauts,
        statut: "signee",
        aptitude: "inapte",
        observations: "Wagon à retirer de la rame avant tout départ.",
        visiteurId: acteurs.visiteur,
        debutLe,
        signeeLe: debutLe + HEURE_MS,
        otIds: [],
      })
      const { otId } = await insererOt({
        engin: fautif,
        type: "correctif",
        origine: "visite_technique",
        priorite: "urgente",
        titre: "Boîte d'essieu — défaut bloquant relevé en visite",
        description: `${defauts[0]!.description}\n\nRelevé lors de la visite du convoi MIN-712.`,
        organe: "Boîte d'essieu",
        visiteId,
        immobilisant: true,
        demandeLe: debutLe + HEURE_MS,
        issue: "demande",
      })
      await ctx.db.patch(visiteId, { otIds: [otId] })
      await evenement("visite", visiteId, "signature", "Visite signée : inapte — départ bloqué", debutLe + HEURE_MS, acteurs.visiteur, "1 ordre de travail ouvert")
    }
  }

  /* ---------------------------------------- Stock : mouvements chronologiques */
  const courant = new Map<string, number>()
  const premierMouvement = debutHistorique - 2 * JOUR_MS
  for (const [cle, prevu] of stocksPrevus) {
    courant.set(cle, prevu.initial)
    await ctx.db.insert("gmaoMouvements", {
      articleId: prevu.articleId,
      atelierId: prevu.atelierId,
      sens: "entree",
      quantite: prevu.initial,
      quantiteApres: prevu.initial,
      valeurFcfa: Math.round(prevu.initial * (articles.find((article) => article._id === prevu.articleId)?.prixUnitaireFcfa ?? 0)),
      motif: "Report de l'inventaire d'ouverture",
      auteurId: acteurs.magasinier,
      creeLe: premierMouvement,
    })
  }
  mouvementsPrevus.sort((a, b) => a.le - b.le)
  const prixDe = new Map(articles.map((article) => [article._id as string, article]))
  let receptions = 0
  for (const mouvement of mouvementsPrevus) {
    const cle = `${mouvement.articleId}|${mouvement.atelierId}`
    let disponible = courant.get(cle) ?? 0
    const article = prixDe.get(mouvement.articleId)!
    if (disponible < mouvement.quantite) {
      // Réapprovisionnement reçu juste avant : une demande d'achat close.
      const quantite = Math.max(mouvement.quantite * 2, Math.ceil(mouvement.quantite + 4))
      const recueLe = mouvement.le - h.entre(2, 30) * HEURE_MS
      const demandeLe = recueLe - (article.delaiApproJours + h.entier(2, 10)) * JOUR_MS
      const valideLe = demandeLe + h.entre(4, 48) * HEURE_MS
      const numeroDa = numero("DA", demandeLe)
      const demandeId = await ctx.db.insert("gmaoDemandesAchat", {
        numero: numeroDa,
        articleId: article._id,
        atelierId: mouvement.atelierId,
        quantite,
        prixUnitaireFcfa: article.prixUnitaireFcfa,
        montantFcfa: quantite * article.prixUnitaireFcfa,
        motif: "Réapprovisionnement du stock de sécurité",
        origine: "seuil",
        statut: "recue",
        demandeurId: acteurs.magasinier,
        demandeLe,
        valideurId: acteurs.stocks !== acteurs.magasinier ? acteurs.stocks : undefined,
        valideLe,
        commande: {
          numero: numero("CF", valideLe),
          fournisseur: article.fournisseur,
          passeeLe: valideLe + HEURE_MS,
          livraisonPrevueLe: valideLe + article.delaiApproJours * JOUR_MS,
          simulee: true,
        },
        quantiteRecue: quantite,
        recueLe,
        majLe: recueLe,
      })
      receptions += 1
      disponible += quantite
      await ctx.db.insert("gmaoMouvements", {
        articleId: article._id,
        atelierId: mouvement.atelierId,
        sens: "entree",
        quantite,
        quantiteApres: disponible,
        valeurFcfa: quantite * article.prixUnitaireFcfa,
        motif: `Réception de la commande (${numeroDa})`,
        demandeAchatId: demandeId,
        auteurId: acteurs.magasinier,
        creeLe: recueLe,
      })
      await evenement("demande_achat", demandeId, "creation", `Demande ${numeroDa} soumise`, demandeLe, acteurs.magasinier)
      await evenement("demande_achat", demandeId, "reception", `Réception de ${quantite} sur ${quantite}`, recueLe, acteurs.magasinier)
    }
    disponible = Math.round((disponible - mouvement.quantite) * 100) / 100
    courant.set(cle, disponible)
    await ctx.db.insert("gmaoMouvements", {
      articleId: mouvement.articleId,
      atelierId: mouvement.atelierId,
      sens: "sortie",
      quantite: mouvement.quantite,
      quantiteApres: disponible,
      valeurFcfa: Math.round(mouvement.quantite * article.prixUnitaireFcfa),
      motif: mouvement.motif,
      otId: mouvement.otId,
      auteurId: mouvement.auteurId,
      creeLe: mouvement.le,
    })
  }
  const stocksSousSeuil: { articleId: Id<"gmaoArticles">; atelierId: Id<"gmaoAteliers">; quantite: number; seuil: number; reappro: number }[] = []
  for (const [cle, prevu] of stocksPrevus) {
    const quantite = courant.get(cle) ?? prevu.initial
    const article = prixDe.get(prevu.articleId)!
    const seuil = prevu.sousSeuil
      ? Math.max(1, Math.round(quantite + h.entier(1, 5)))
      : Math.max(1, Math.floor(prevu.initial * h.entre(0.15, 0.35)))
    const reappro = Math.max(1, Math.round(seuil * 2))
    await ctx.db.insert("gmaoStocks", {
      articleId: prevu.articleId,
      atelierId: prevu.atelierId,
      quantite,
      seuilReappro: Math.min(seuil, prevu.sousSeuil ? seuil : Math.max(1, quantite - 1)),
      quantiteReappro: reappro,
      emplacement: `${article.famille.slice(0, 3).toUpperCase()}-${String.fromCharCode(65 + h.entier(0, 7))}${h.entier(1, 24)}`,
      majLe: maintenant,
    })
    if (prevu.sousSeuil) stocksSousSeuil.push({ articleId: prevu.articleId, atelierId: prevu.atelierId, quantite, seuil, reappro })
  }

  /* ---------------------------------------- Demandes d'achat en cours */
  const enCours: { statut: "soumise" | "validee" | "commandee" | "refusee" | "annulee"; nombre: number }[] = [
    { statut: "soumise", nombre: reduit ? 2 : 6 },
    { statut: "validee", nombre: reduit ? 1 : 4 },
    { statut: "commandee", nombre: reduit ? 1 : 5 },
    { statut: "refusee", nombre: reduit ? 0 : 2 },
    { statut: "annulee", nombre: reduit ? 0 : 1 },
  ]
  let indexSousSeuil = 0
  for (const groupe of enCours) {
    for (let i = 0; i < groupe.nombre; i += 1) {
      const cible = stocksSousSeuil[indexSousSeuil] ?? null
      indexSousSeuil += 1
      const article = cible ? prixDe.get(cible.articleId)! : h.choisir(articles)
      const atelierId = cible?.atelierId ?? atelier("OWE")._id
      const quantite = cible ? cible.reappro : h.entier(2, 20)
      const demandeLe = maintenant - h.entre(1, 25) * JOUR_MS
      const valideLe = demandeLe + h.entre(4, 30) * HEURE_MS
      const numeroDa = numero("DA", demandeLe)
      const commandee = groupe.statut === "commandee"
      const livraisonPrevueLe = valideLe + article.delaiApproJours * JOUR_MS * (i === 0 && commandee ? 0.1 : 1)
      const demandeId = await ctx.db.insert("gmaoDemandesAchat", {
        numero: numeroDa,
        articleId: article._id,
        atelierId,
        quantite,
        prixUnitaireFcfa: article.prixUnitaireFcfa,
        montantFcfa: quantite * article.prixUnitaireFcfa,
        motif: cible ? `Stock sous le seuil (${cible.quantite} pour un seuil de ${cible.seuil})` : "Constitution d'un stock de sécurité avant la saison des pluies",
        origine: cible ? "seuil" : "manuelle",
        statut: groupe.statut,
        demandeurId: acteurs.magasinier,
        demandeLe,
        valideurId: groupe.statut === "soumise" ? undefined : acteurs.stocks !== acteurs.magasinier ? acteurs.stocks : undefined,
        valideLe: groupe.statut === "soumise" ? undefined : valideLe,
        motifRefus: groupe.statut === "refusee" ? "Budget atelier du trimestre épuisé : à reporter." : groupe.statut === "annulee" ? "Article remplacé par une référence équivalente." : undefined,
        commande: commandee
          ? { numero: numero("CF", valideLe), fournisseur: article.fournisseur, passeeLe: valideLe + HEURE_MS, livraisonPrevueLe, simulee: true }
          : undefined,
        majLe: valideLe,
      })
      await evenement("demande_achat", demandeId, "creation", `Demande ${numeroDa} soumise`, demandeLe, acteurs.magasinier, `${quantite} ${article.unite} · ${article.reference}`)
      if (groupe.statut !== "soumise") {
        await evenement("demande_achat", demandeId, groupe.statut === "refusee" ? "refus" : groupe.statut === "annulee" ? "annulation" : "validation", groupe.statut === "refusee" ? "Demande refusée" : groupe.statut === "annulee" ? "Demande annulée" : "Demande validée", valideLe, acteurs.stocks)
      }
      if (commandee) {
        await evenement("demande_achat", demandeId, "commande", "Commande transmise (simulée)", valideLe + HEURE_MS, acteurs.stocks, article.fournisseur)
      }
    }
  }

  /* ------------------------------------------ Disponibilité du parc */
  const ouverts = (await ctx.db.query("gmaoOrdresTravail").collect()).filter((ot) =>
    ["demande", "planifie", "en_cours", "travaux_termines"].includes(ot.statut)
  )
  for (const engin of engins) {
    const siens = ouverts.filter((ot) => ot.equipementId === engin._id && ot.immobilisant)
    const enCoursOt = siens.find((ot) => ot.statut === "en_cours" || ot.statut === "travaux_termines")
    const bloquant = siens.find((ot) => ot.priorite === "urgente" || ot.origine === "visite_technique")
    if (enCoursOt) {
      await ctx.db.patch(engin._id, { statut: "en_atelier", motifStatut: `Travaux de l'${enCoursOt.numero}`, statutDepuis: enCoursOt.debutReel ?? maintenant })
    } else if (bloquant) {
      await ctx.db.patch(engin._id, { statut: "immobilise", motifStatut: `En attente de l'${bloquant.numero}`, statutDepuis: bloquant.demandeLe })
    }
  }
  // Décisions hors OT : deux immobilisations et quelques réformes.
  const libres = parFamille("wagon").filter((engin) => !dejaOccupes.has(engin._id) && !ouverts.some((ot) => ot.equipementId === engin._id))
  const decisions = [
    { motif: "Expertise après déraillement en gare de Booué — attente du rapport d'enquête" },
    { motif: "Caisse corrodée : attente d'un arbitrage de réparation ou de réforme" },
  ]
  for (const [index, decision] of decisions.entries()) {
    const engin = libres[index]
    if (!engin) break
    await ctx.db.patch(engin._id, { statut: "immobilise", immobilisationManuelle: decision.motif, motifStatut: decision.motif, statutDepuis: maintenant - h.entier(3, 20) * JOUR_MS })
    await evenement("equipement", engin._id, "immobilisation", "Immobilisation décidée", maintenant - h.entier(3, 20) * JOUR_MS, acteurs.responsable, decision.motif)
  }
  for (const engin of libres.slice(decisions.length, decisions.length + (reduit ? 1 : 5))) {
    const le = maintenant - h.entier(20, 150) * JOUR_MS
    await ctx.db.patch(engin._id, { statut: "reforme", motifStatut: "Fin de vie : châssis fissuré, réparation non rentable", statutDepuis: le, trainId: undefined })
    for (const rattachement of await ctx.db.query("gmaoPlansEquipements").withIndex("by_equipement", (q) => q.eq("equipementId", engin._id)).collect()) {
      await ctx.db.delete(rattachement._id)
    }
    await evenement("equipement", engin._id, "reforme", "Engin réformé", le, acteurs.responsable, "Fin de vie : châssis fissuré, réparation non rentable")
  }

  /* --------------------------------------------------------- Numérotation */
  for (const [key, value] of compteurs) {
    const existant = await ctx.db.query("sequences").withIndex("by_key", (q) => q.eq("key", key)).unique()
    if (existant) await ctx.db.patch(existant._id, { value: Math.max(existant.value, value) })
    else await ctx.db.insert("sequences", { key, value })
  }
  return { ot: nombreOt, receptions }
}
