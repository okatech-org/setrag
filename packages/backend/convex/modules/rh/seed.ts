/**
 * Jeu de démonstration du module Ressources humaines.
 *
 * Commande (depuis `packages/backend`, déploiement de démonstration) :
 *
 *   bunx convex run modules/rh/seed:peupler '{}'
 *   bunx convex run modules/rh/seed:peupler '{"reset": true}'
 *
 * - Refuse de tourner si `DEMO_ACCOUNTS_ENABLED` ne vaut pas « true ».
 * - Idempotent : relancé sans `reset`, il ne modifie rien (marqueur
 *   `demo:rh` dans `rhSequences`).
 * - `reset: true` vide TOUTES les tables du module RH (données saisies au
 *   portail comprises) puis reconstruit le jeu.
 *
 * Contenu, daté par rapport au jour du peuplement : 150 agents aux noms
 * gabonais répartis par gare et par métier, habilitations, visites et
 * examens médicaux, congés, trois mois de paie calculés par le moteur réel
 * (deux clôturés et déclarés, le dernier en attente de validation), et le
 * roulement des deux prochaines semaines construit sous les règles réelles
 * de repos et d'aptitude, avec quelques conflits à résoudre. Les agents sont
 * reliés aux comptes de démonstration existants quand le rôle correspond.
 * Toutes les identités sont fictives.
 */

import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import type { AppRole } from "../../model/permissions"
import { prochainNumero } from "./acces"
import {
  TYPES_HABILITATION,
  ajouterJours,
  ajouterMois,
  bornesPeriode,
  conflitsService,
  dateLibreville,
  debutJournee,
  joursCalendaires,
  joursOuvrables,
  nomComplet,
  periodiciteVisiteMois,
  type Categorie,
  type ContexteAgentRoulement,
  type Direction,
  type Metier,
  type ResultatAptitude,
  type ServicePlanifie,
  type SituationFamiliale,
  type TypeHabilitation,
  type TypeService,
} from "./model"
import { creerDeclaration, genererBulletins } from "./paie"

const MARQUEUR = "demo:rh"
const TABLES_RH = [
  "rhJournal",
  "rhExamensMedicaux",
  "rhVisitesMedicales",
  "rhServices",
  "rhConges",
  "rhDeclarationsSociales",
  "rhBulletins",
  "rhVariablesPaie",
  "rhPeriodesPaie",
  "rhMouvements",
  "rhHabilitations",
  "rhAgents",
  "rhSequences",
] as const

/* ═════════════════════════ Générateur stable ════════════════════════════ */

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
    entier: (min: number, max: number) => min + Math.floor(suivant() * (max - min + 1)),
    choix: <T>(liste: readonly T[]): T => liste[Math.floor(suivant() * liste.length)]!,
    vrai: (probabilite: number) => suivant() < probabilite,
  }
}

const NOMS = [
  "OBAME", "NDONG", "MBA", "NZE", "ESSONO", "ELLA", "MOUSSAVOU", "MBOUMBA", "KOUMBA", "MOUKETOU",
  "NZAMBA", "ONDO", "MINTSA", "NGUEMA", "BEKALE", "MENGUE", "EYANG", "ASSOUMOU", "OVONO", "BIYOGHE",
  "NGOUA", "MABIKA", "MOUKAGNI", "BOUSSOUGOU", "MAYOMBO", "IBINGA", "MOUNGUENGUI", "NZIENGUI", "PAMBOU", "BOUKANDOU",
  "MBINA", "TSAMBA", "KOMBILA", "MAPANGOU", "NYANGUI", "NDOUTOUME", "OWONO", "EDZANG", "ABESSOLO", "NGOMA",
  "MOUBAMBA", "BIBANG", "MBOULA", "IWANGOU", "OGANDAGA", "NKOGHE", "MEZUI", "EKOMIE", "ALLOGO", "ENGONE",
] as const
const PRENOMS_H = [
  "Jean-Pierre", "Guy-Roger", "Serge", "Patrice", "Landry", "Rodrigue", "Brice", "Christian", "Fabrice", "Hervé",
  "Ghislain", "Arsène", "Davy", "Ulrich", "Steeve", "Wilfried", "Aimé", "Blaise", "Jean-Fidèle", "Rufin",
  "Cyriaque", "Paterne", "Euloge", "Martial", "Anicet", "Thierry",
] as const
const PRENOMS_F = [
  "Carine", "Nadège", "Sylvie", "Prisca", "Laetitia", "Marlène", "Pélagie", "Gisèle", "Murielle", "Chantal",
  "Rachel", "Edwige", "Flore", "Larissa", "Annick", "Judith",
] as const
const VILLES = ["Libreville", "Owendo", "Franceville", "Moanda", "Lambaréné", "Oyem", "Mouila", "Booué", "Lastourville", "Port-Gentil", "Makokou", "Koulamoutou"] as const

interface Profil {
  metier: Metier
  direction: Direction
  categorie: Categorie
  poste: string
  gares: readonly (readonly [string, number])[]
  salaire: readonly [number, number]
  sujetion: readonly [number, number]
  habilitations: readonly TypeHabilitation[]
  /** Compte de démonstration à relier, par rôle. */
  roles?: readonly AppRole[]
}

const PROFILS: readonly Profil[] = [
  { metier: "conducteur_ligne", direction: "DEF", categorie: "maitrise", poste: "Conducteur de ligne", gares: [["OWE", 10], ["BOO", 7], ["FCV", 5], ["MOA", 4]], salaire: [420_000, 650_000], sujetion: [45_000, 70_000], habilitations: ["conduite_ligne", "securite_ferroviaire"], roles: ["conducteur_ligne"] },
  { metier: "chef_train", direction: "DEF", categorie: "maitrise", poste: "Chef de train", gares: [["OWE", 6], ["BOO", 4], ["FCV", 4]], salaire: [380_000, 520_000], sujetion: [40_000, 60_000], habilitations: ["chef_train", "securite_ferroviaire", "secourisme"], roles: ["chef_train"] },
  { metier: "controleur_train", direction: "DCFV", categorie: "execution", poste: "Contrôleur à bord", gares: [["OWE", 8], ["BOO", 5], ["FCV", 5]], salaire: [260_000, 380_000], sujetion: [30_000, 45_000], habilitations: ["secourisme"], roles: ["controleur_train"] },
  { metier: "regulateur", direction: "DEF", categorie: "maitrise", poste: "Régulateur COTRAF", gares: [["OWE", 3], ["BOO", 3], ["FCV", 2]], salaire: [450_000, 620_000], sujetion: [35_000, 50_000], habilitations: ["securite_ferroviaire"], roles: ["regulateur_cotraf"] },
  { metier: "agent_manoeuvre", direction: "DEF", categorie: "execution", poste: "Agent de manœuvre", gares: [["OWE", 4], ["MOA", 2], ["FCV", 2]], salaire: [220_000, 300_000], sujetion: [25_000, 40_000], habilitations: ["manoeuvre", "securite_ferroviaire"] },
  { metier: "agent_voie", direction: "DINFRA", categorie: "execution", poste: "Agent de la voie", gares: [["NDJ", 3], ["OTO", 2], ["AYE", 2], ["LOP", 3], ["BOO", 3], ["IVI", 2], ["LTV", 2], ["MOA", 1]], salaire: [180_000, 280_000], sujetion: [30_000, 55_000], habilitations: ["travaux_voie"], roles: ["agent_voie", "cantonnier"] },
  { metier: "technicien_signalisation", direction: "DINFRA", categorie: "maitrise", poste: "Technicien signalisation & télécoms", gares: [["OWE", 2], ["BOO", 2], ["FCV", 2]], salaire: [350_000, 500_000], sujetion: [20_000, 35_000], habilitations: ["habilitation_electrique", "travaux_voie"], roles: ["technicien_signalisation", "technicien_telecoms"] },
  { metier: "technicien_atelier", direction: "DMAT", categorie: "execution", poste: "Technicien d'atelier matériel roulant", gares: [["OWE", 9], ["FCV", 3]], salaire: [280_000, 450_000], sujetion: [0, 0], habilitations: ["habilitation_electrique"], roles: ["contremaitre_atelier", "visiteur_rames"] },
  { metier: "agent_gare", direction: "DEF", categorie: "execution", poste: "Agent de gare", gares: [["OWE", 2], ["NTM", 1], ["NDJ", 1], ["LOP", 2], ["BOO", 2], ["LTV", 1], ["MOA", 1], ["FCV", 2]], salaire: [200_000, 320_000], sujetion: [15_000, 30_000], habilitations: [], roles: ["chef_gare"] },
  { metier: "vendeur", direction: "DCFV", categorie: "execution", poste: "Agent de vente guichet", gares: [["OWE", 4], ["BOO", 2], ["FCV", 2], ["LTV", 1], ["MOA", 1]], salaire: [190_000, 280_000], sujetion: [0, 0], habilitations: [], roles: ["vendeur_guichet"] },
  { metier: "administratif", direction: "DFC", categorie: "execution", poste: "Assistant comptable", gares: [["OWE", 5]], salaire: [250_000, 420_000], sujetion: [0, 0], habilitations: [], roles: ["comptable_auxiliaire"] },
  { metier: "administratif", direction: "DRH", categorie: "maitrise", poste: "Gestionnaire de paie", gares: [["OWE", 2]], salaire: [380_000, 480_000], sujetion: [0, 0], habilitations: [], roles: ["gestionnaire_paie"] },
  { metier: "administratif", direction: "DSI", categorie: "maitrise", poste: "Technicien informatique", gares: [["OWE", 2]], salaire: [350_000, 450_000], sujetion: [0, 0], habilitations: [] },
  { metier: "administratif", direction: "DRH", categorie: "execution", poste: "Assistant RH", gares: [["OWE", 1]], salaire: [260_000, 320_000], sujetion: [0, 0], habilitations: [] },
  { metier: "cadre", direction: "DG", categorie: "cadre", poste: "Directeur général adjoint", gares: [["OWE", 1]], salaire: [1_600_000, 1_800_000], sujetion: [0, 0], habilitations: [], roles: ["direction_generale"] },
  { metier: "cadre", direction: "DEF", categorie: "cadre", poste: "Chef du service des roulements", gares: [["OWE", 1]], salaire: [950_000, 1_100_000], sujetion: [0, 0], habilitations: [], roles: ["planificateur_roulements"] },
  { metier: "cadre", direction: "DMAT", categorie: "cadre", poste: "Ingénieur matériel roulant", gares: [["OWE", 1]], salaire: [900_000, 1_050_000], sujetion: [0, 0], habilitations: [], roles: ["ingenieur_atelier"] },
  { metier: "cadre", direction: "DSED", categorie: "cadre", poste: "Responsable sécurité des circulations", gares: [["OWE", 1]], salaire: [1_000_000, 1_200_000], sujetion: [0, 0], habilitations: ["securite_ferroviaire"], roles: ["inspecteur_securite"] },
  { metier: "cadre", direction: "DSED", categorie: "cadre", poste: "Enquêteur accidents ferroviaires", gares: [["OWE", 1]], salaire: [900_000, 1_000_000], sujetion: [0, 0], habilitations: ["securite_ferroviaire"], roles: ["enqueteur_accidents"] },
  { metier: "cadre", direction: "DSED", categorie: "cadre", poste: "Responsable environnement & Lopé", gares: [["LOP", 1]], salaire: [850_000, 950_000], sujetion: [40_000, 40_000], habilitations: [], roles: ["responsable_environnement"] },
  { metier: "medical", direction: "DRH", categorie: "cadre", poste: "Médecin du travail", gares: [["OWE", 1]], salaire: [1_100_000, 1_200_000], sujetion: [0, 0], habilitations: [], roles: ["medecin_travail"] },
  { metier: "medical", direction: "DRH", categorie: "maitrise", poste: "Infirmier du travail", gares: [["OWE", 1]], salaire: [420_000, 480_000], sujetion: [0, 0], habilitations: ["secourisme"], roles: ["infirmier_travail"] },
]

/* ════════════════════════════ Peuplement ════════════════════════════════ */

interface Contexte {
  ctx: MutationCtx
  aujourdhui: string
  now: number
  alea: ReturnType<typeof generateur>
  operateur: { id?: Id<"users">; nom: string }
}

async function journal(
  c: Contexte,
  entree: Omit<Doc<"rhJournal">, "_id" | "_creationTime" | "confidentiel" | "acteurNom"> & { confidentiel?: boolean; acteurNom?: string }
) {
  await c.ctx.db.insert("rhJournal", { ...entree, confidentiel: entree.confidentiel ?? false, acteurNom: entree.acteurNom ?? c.operateur.nom })
}

const midi = (date: string) => debutJournee(date) + 12 * 3_600_000

async function creerAgents(c: Contexte) {
  const { ctx, alea, aujourdhui } = c
  const comptes = new Map<AppRole, Id<"users">>()
  const agents: Doc<"rhAgents">[] = []
  let rang = 0
  for (const profil of PROFILS) {
    for (const [gareCode, nombre] of profil.gares) {
      for (let i = 0; i < nombre; i += 1) {
        rang += 1
        const femme = profil.metier === "medical" ? i % 2 === 0 : alea.vrai(profil.metier === "conducteur_ligne" ? 0.08 : 0.3)
        const age = alea.entier(profil.categorie === "cadre" ? 34 : 23, 58)
        const naissance = `${Number(aujourdhui.slice(0, 4)) - age}-${String(alea.entier(1, 12)).padStart(2, "0")}-${String(alea.entier(1, 28)).padStart(2, "0")}`
        const recrue = rang % 29 === 0
        const ancienneteMax = Math.max(1, age - 21)
        const embauche = recrue
          ? ajouterJours(aujourdhui, -alea.entier(20, 240))
          : ajouterJours(aujourdhui, -alea.entier(365, Math.min(ancienneteMax, 32) * 365))
        const situation: SituationFamiliale = age < 28 ? alea.choix(["celibataire", "celibataire", "marie"] as const) : alea.choix(["marie", "marie", "celibataire", "divorce", "veuf"] as const)
        const salaire = Math.round(alea.entier(profil.salaire[0], profil.salaire[1]) / 5_000) * 5_000
        const modePaiement = alea.vrai(0.75) ? ("virement" as const) : alea.choix(["airtel_money", "moov_money"] as const)
        const matricule = await prochainNumero(ctx, "SET", 5)
        const contrat = recrue && alea.vrai(0.6) ? ("cdd" as const) : ("cdi" as const)
        const agentId = await ctx.db.insert("rhAgents", {
          matricule,
          nom: alea.choix(NOMS),
          prenom: femme ? alea.choix(PRENOMS_F) : alea.choix(PRENOMS_H),
          sexe: femme ? "F" : "M",
          dateNaissance: naissance,
          lieuNaissance: alea.choix(VILLES),
          telephone: `+241 ${alea.choix(["74", "77", "66", "62"])} ${alea.entier(10, 99)} ${alea.entier(10, 99)} ${alea.entier(10, 99)}`,
          situationFamiliale: situation,
          enfantsACharge: situation === "celibataire" ? alea.entier(0, 1) : alea.entier(0, 5),
          direction: profil.direction,
          metier: profil.metier,
          poste: profil.poste,
          gareCode,
          categorie: profil.categorie,
          echelon: Math.min(12, 1 + Math.floor(joursCalendaires(embauche, aujourdhui) / 365 / 3)),
          contrat,
          dateEmbauche: embauche,
          dateFinContrat: contrat === "cdd" ? ajouterMois(embauche, 18) : undefined,
          salaireBaseFcfa: salaire,
          primeFonctionFcfa: Math.round((salaire * alea.entier(5, 15)) / 100 / 1_000) * 1_000,
          primeSujetionFcfa: Math.round(alea.entier(profil.sujetion[0], profil.sujetion[1]) / 1_000) * 1_000,
          modePaiement,
          comptePaiement: modePaiement === "virement" ? `GA21 •••• ${alea.entier(1000, 9999)}` : `+241 •• •• •• ${alea.entier(10, 99)}`,
          numeroCnss: `${alea.entier(1_000_000, 9_999_999)}`,
          numeroCnamgs: `${alea.entier(100_000_000, 999_999_999)}`,
          statut: "actif",
          origine: "demo",
          createdAt: midi(embauche),
          updatedAt: c.now,
        })
        // Relie le premier agent du profil à un compte de démonstration du même rôle.
        for (const role of profil.roles ?? []) {
          if (comptes.has(role)) continue
          const user = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", role)).first()
          if (user && i === 0) {
            await ctx.db.patch(agentId, { userId: user._id })
            comptes.set(role, user._id)
            break
          }
        }
        await ctx.db.insert("rhMouvements", {
          agentId,
          type: "embauche",
          dateEffet: embauche,
          apres: { direction: profil.direction, metier: profil.metier, poste: profil.poste, gareCode, categorie: profil.categorie, salaireBaseFcfa: salaire, statut: "actif" },
          motif: `Embauche en ${contrat.toUpperCase()}`,
          acteurNom: "Service du personnel",
          createdAt: midi(embauche),
        })
        await journal(c, { agentId, entite: "agent", entiteId: agentId, action: "rh.agent.embaucher", libelle: "Embauche et ouverture du dossier", detail: `${matricule} · ${profil.poste}`, acteurNom: "Service du personnel", at: midi(embauche) })
        agents.push((await ctx.db.get(agentId))!)
      }
    }
  }
  return { agents, comptes }
}

async function mouvementsDeCarriere(c: Contexte, agents: Doc<"rhAgents">[]) {
  const { ctx, aujourdhui } = c
  const anciens = agents.filter((a) => a.dateEmbauche < ajouterJours(aujourdhui, -800))
  const mutation = anciens.find((a) => a.metier === "agent_gare" && a.gareCode === "NDJ")
  if (mutation) {
    const date = ajouterJours(aujourdhui, -150)
    await ctx.db.patch(mutation._id, { gareCode: "LOP" })
    await ctx.db.insert("rhMouvements", { agentId: mutation._id, type: "mutation", dateEffet: date, avant: { gareCode: "NDJ" }, apres: { gareCode: "LOP" }, motif: "Renfort de la gare de Lopé pour la saison touristique", acteurNom: c.operateur.nom, createdAt: midi(date) })
    await journal(c, { agentId: mutation._id, entite: "agent", entiteId: mutation._id, action: "rh.agent.mouvement.mutation", libelle: "Mutation", detail: "Ndjolé → Lopé", at: midi(date) })
  }
  const promus = anciens.filter((a) => a.metier === "controleur_train").slice(0, 2)
  for (const agent of promus) {
    const date = ajouterJours(aujourdhui, -95)
    const salaire = agent.salaireBaseFcfa + 35_000
    await ctx.db.patch(agent._id, { echelon: agent.echelon + 1, salaireBaseFcfa: salaire })
    await ctx.db.insert("rhMouvements", { agentId: agent._id, type: "promotion", dateEffet: date, avant: { echelon: agent.echelon, salaireBaseFcfa: agent.salaireBaseFcfa }, apres: { echelon: agent.echelon + 1, salaireBaseFcfa: salaire }, motif: "Avancement d'échelon — commission paritaire", acteurNom: c.operateur.nom, createdAt: midi(date) })
    await journal(c, { agentId: agent._id, entite: "agent", entiteId: agent._id, action: "rh.agent.mouvement.promotion", libelle: "Promotion", detail: `Échelon ${agent.echelon} → ${agent.echelon + 1}`, at: midi(date) })
  }
  // Deux sorties récentes et une suspension en cours.
  const debutMoisPrecedent = `${ajouterMois(aujourdhui, -1).slice(0, 7)}-01`
  const sorties: [Doc<"rhAgents"> | undefined, string, "retraite" | "demission"][] = [
    [anciens.find((a) => a.metier === "technicien_atelier" && a.dateNaissance < ajouterJours(aujourdhui, -55 * 365)) ?? anciens.find((a) => a.metier === "technicien_atelier"), ajouterJours(debutMoisPrecedent, 14), "retraite"],
    [anciens.find((a) => a.metier === "vendeur"), ajouterJours(debutMoisPrecedent, -1), "demission"],
  ]
  for (const [agent, date, motif] of sorties) {
    if (!agent) continue
    await ctx.db.patch(agent._id, { statut: "sorti", dateSortie: date, motifSortie: motif })
    await ctx.db.insert("rhMouvements", { agentId: agent._id, type: "sortie", dateEffet: date, avant: { statut: "actif" }, apres: { statut: "sorti" }, motif: motif === "retraite" ? "Départ à la retraite — 33 ans de service" : "Démission reçue par lettre recommandée", acteurNom: c.operateur.nom, createdAt: midi(date) })
    await journal(c, { agentId: agent._id, entite: "agent", entiteId: agent._id, action: "rh.agent.mouvement.sortie", libelle: "Sortie des effectifs", detail: motif === "retraite" ? "Départ à la retraite" : "Démission", at: midi(date) })
  }
  const suspendu = agents.find((a) => a.metier === "agent_voie" && a.gareCode === "IVI")
  if (suspendu) {
    const date = ajouterJours(aujourdhui, -10)
    await ctx.db.patch(suspendu._id, { statut: "suspendu" })
    await ctx.db.insert("rhMouvements", { agentId: suspendu._id, type: "suspension", dateEffet: date, avant: { statut: "actif" }, apres: { statut: "suspendu" }, motif: "Mise à pied conservatoire dans l'attente du conseil de discipline", acteurNom: c.operateur.nom, createdAt: midi(date) })
    await journal(c, { agentId: suspendu._id, entite: "agent", entiteId: suspendu._id, action: "rh.agent.mouvement.suspension", libelle: "Suspension", detail: "Mise à pied conservatoire", at: midi(date) })
  }
}

async function creerHabilitations(c: Contexte, agents: Doc<"rhAgents">[]) {
  const { ctx, alea, aujourdhui } = c
  const profilDe = (agent: Doc<"rhAgents">) => PROFILS.find((p) => p.metier === agent.metier && p.poste === agent.poste)
  let rang = 0
  const piege: { expiree?: Id<"rhAgents"> } = {}
  for (const agent of agents) {
    for (const type of profilDe(agent)?.habilitations ?? []) {
      rang += 1
      const duree = TYPES_HABILITATION[type].dureeMois
      // La plupart valides ; quelques-unes à renouveler, une expirée (chef de train).
      let expireLe = ajouterJours(aujourdhui, alea.entier(90, duree * 28))
      if (rang % 23 === 0) expireLe = ajouterJours(aujourdhui, alea.entier(5, 55))
      if (!piege.expiree && type === "chef_train" && agent.gareCode === "OWE" && rang > 40) {
        expireLe = ajouterJours(aujourdhui, -6)
        piege.expiree = agent._id
      }
      const delivreeLe = ajouterMois(expireLe, -duree)
      await ctx.db.insert("rhHabilitations", {
        agentId: agent._id,
        type,
        numero: `HAB-${type.slice(0, 3).toUpperCase()}-${String(rang).padStart(4, "0")}`,
        delivreeLe: delivreeLe < agent.dateEmbauche ? agent.dateEmbauche : delivreeLe,
        expireLe,
        organisme: type === "secourisme" ? "Croix-Rouge gabonaise" : "Centre de formation SETRAG — Owendo",
        statut: "valide",
        createdAt: midi(delivreeLe),
        updatedAt: c.now,
      })
    }
  }
  return piege
}

const OBSERVATIONS = [
  "Examen clinique sans particularité.",
  "Port de verres correcteurs obligatoire en conduite.",
  "Surveillance tensionnelle conseillée à six mois.",
  "Bon état général. Vaccinations à jour.",
] as const

async function creerVisites(c: Contexte, agents: Doc<"rhAgents">[]) {
  const { ctx, alea, aujourdhui } = c
  const pieges: { inapte?: Id<"rhAgents">; expiree?: Id<"rhAgents"> } = {}
  let rang = 0
  for (const agent of agents.filter((a) => a.statut !== "sorti")) {
    rang += 1
    const periodicite = periodiciteVisiteMois(agent.metier)
    let resultat: ResultatAptitude = "apte"
    let realisee = ajouterJours(aujourdhui, -alea.entier(20, periodicite * 30 - 75))
    let valideJusquau: string | undefined
    let restriction: string | undefined
    if (agent.metier === "conducteur_ligne" && agent.gareCode === "OWE" && !pieges.expiree && rang > 3) {
      realisee = ajouterJours(aujourdhui, -(periodicite * 30 + 12))
      pieges.expiree = agent._id
    } else if (agent.metier === "conducteur_ligne" && agent.gareCode === "BOO" && !pieges.inapte) {
      resultat = "inapte_temporaire"
      realisee = ajouterJours(aujourdhui, -9)
      valideJusquau = ajouterJours(aujourdhui, 19)
      pieges.inapte = agent._id
    } else if (rang % 17 === 0) {
      resultat = "apte_restriction"
      restriction = alea.choix(["Pas de conduite de nuit", "Pas de port de charges lourdes", "Travail en hauteur exclu"] as const)
    } else if (rang % 11 === 0) {
      realisee = ajouterJours(aujourdhui, -(periodicite * 30 - alea.entier(5, 50)))
    }
    if (agent.dateEmbauche > realisee) realisee = agent.dateEmbauche
    if (!valideJusquau) valideJusquau = ajouterMois(realisee, periodicite)
    const numero = await prochainNumero(ctx, `VM-${realisee.slice(0, 4)}`)
    const visiteId = await ctx.db.insert("rhVisitesMedicales", {
      agentId: agent._id,
      numero,
      type: agent.dateEmbauche === realisee ? "embauche" : resultat === "inapte_temporaire" ? "demande" : "periodique",
      statut: "realisee",
      dateProgrammee: realisee,
      heureProgrammee: `0${alea.entier(7, 9)}:${alea.choix(["00", "30"])}`,
      lieu: agent.gareCode === "FCV" || agent.gareCode === "MOA" ? "Antenne médicale — Franceville" : agent.gareCode === "BOO" || agent.gareCode === "LOP" ? "Antenne médicale — Booué" : "Centre médical SETRAG — Owendo",
      realiseeLe: debutJournee(realisee) + 10 * 3_600_000,
      resultat,
      restrictionFonctionnelle: restriction,
      valideJusquau,
      prononceeParNom: "Dr Annick MOUSSAVOU",
      origine: "demo",
      createdAt: midi(realisee),
      updatedAt: midi(realisee),
    })
    await ctx.db.insert("rhExamensMedicaux", {
      visiteId,
      agentId: agent._id,
      acuiteVisuelle: `${alea.entier(8, 10)}/10 — ${alea.entier(8, 10)}/10`,
      visionCouleurs: alea.vrai(0.97) ? "normale" : "anomalie",
      audition: alea.vrai(0.9) ? "normale" : "deficit_leger",
      tensionArterielle: `${alea.entier(110, 145)}/${alea.entier(65, 92)}`,
      frequenceCardiaque: alea.entier(58, 88),
      glycemie: `${(alea.entier(78, 115) / 100).toFixed(2).replace(".", ",")} g/l`,
      depistageAlcool: "negatif",
      depistageStupefiants: METIERS_SURVEILLES.includes(agent.metier) ? "negatif" : "non_realise",
      observations: resultat === "inapte_temporaire" ? "Arrêt de trois semaines après intervention chirurgicale. Réexamen avant reprise de la conduite." : alea.choix(OBSERVATIONS),
      saisiParNom: "Inf. Prisca NZIENGUI",
      saisiLe: debutJournee(realisee) + 9 * 3_600_000,
    })
    await journal(c, { agentId: agent._id, entite: "visite", entiteId: visiteId, action: "rh.medical.prononcer", libelle: `Aptitude prononcée : ${resultat === "apte" ? "apte" : resultat === "apte_restriction" ? "apte avec restriction" : "inapte temporaire"}`, detail: valideJusquau ? `Échéance ${valideJusquau}` : undefined, acteurNom: "Dr Annick MOUSSAVOU", at: debutJournee(realisee) + 11 * 3_600_000 })

    // Visites à venir pour les aptitudes proches de l'échéance.
    if (valideJusquau && valideJusquau <= ajouterJours(aujourdhui, 45) && resultat !== "inapte_temporaire") {
      const date = ajouterJours(aujourdhui, alea.entier(1, 20))
      const numeroProg = await prochainNumero(ctx, `VM-${date.slice(0, 4)}`)
      const idProg = await ctx.db.insert("rhVisitesMedicales", {
        agentId: agent._id,
        numero: numeroProg,
        type: "periodique",
        statut: "programmee",
        dateProgrammee: date,
        heureProgrammee: "08:30",
        lieu: "Centre médical SETRAG — Owendo",
        origine: "demo",
        createdAt: c.now,
        updatedAt: c.now,
      })
      await journal(c, { agentId: agent._id, entite: "visite", entiteId: idProg, action: "rh.medical.programmer", libelle: `Visite périodique programmée le ${date}`, acteurNom: "Inf. Prisca NZIENGUI", at: c.now - 86_400_000 })
    }
  }
  // Une visite passée, examens saisis, en attente de la décision du médecin.
  const enAttente = agents.find((a) => a.metier === "agent_manoeuvre" && a.statut === "actif")
  if (enAttente) {
    const date = ajouterJours(aujourdhui, -1)
    const numero = await prochainNumero(ctx, `VM-${date.slice(0, 4)}`)
    const visiteId = await ctx.db.insert("rhVisitesMedicales", { agentId: enAttente._id, numero, type: "reprise", statut: "programmee", dateProgrammee: date, heureProgrammee: "09:00", lieu: "Centre médical SETRAG — Owendo", origine: "demo", createdAt: c.now - 5 * 86_400_000, updatedAt: c.now })
    await ctx.db.insert("rhExamensMedicaux", { visiteId, agentId: enAttente._id, acuiteVisuelle: "10/10 — 9/10", visionCouleurs: "normale", audition: "normale", tensionArterielle: "128/82", frequenceCardiaque: 72, depistageAlcool: "negatif", depistageStupefiants: "negatif", observations: "Reprise après entorse de la cheville gauche ; consolidation satisfaisante.", saisiParNom: "Inf. Prisca NZIENGUI", saisiLe: debutJournee(date) + 9.5 * 3_600_000 })
    await journal(c, { agentId: enAttente._id, entite: "visite", entiteId: visiteId, action: "rh.medical.examens", libelle: "Examens saisis", confidentiel: true, acteurNom: "Inf. Prisca NZIENGUI", at: debutJournee(date) + 9.5 * 3_600_000 })
  }
  return pieges
}

const METIERS_SURVEILLES: readonly Metier[] = ["conducteur_ligne", "chef_train", "regulateur", "agent_manoeuvre"]

async function creerConges(c: Contexte, agents: Doc<"rhAgents">[], debutMoisPrecedent: string) {
  const { ctx, alea, aujourdhui } = c
  const actifs = agents.filter((a) => a.statut === "actif")
  const pieges: { congeOwe?: Id<"rhAgents"> } = {}
  const plan: { agent: Doc<"rhAgents">; type: Doc<"rhConges">["type"]; du: string; au: string; statut: Doc<"rhConges">["statut"]; motif?: string; note?: string }[] = []
  const pioche = (filtre: (a: Doc<"rhAgents">) => boolean) => {
    const candidats = actifs.filter((a) => filtre(a) && !plan.some((p) => p.agent._id === a._id))
    return candidats.length > 0 ? alea.choix(candidats) : undefined
  }
  // Congés annuels passés et validés.
  for (let i = 0; i < 10; i += 1) {
    const agent = pioche(() => true)
    if (!agent) break
    const du = ajouterJours(aujourdhui, -alea.entier(40, 200))
    plan.push({ agent, type: "annuel", du, au: ajouterJours(du, alea.entier(6, 17)), statut: "valide" })
  }
  // Congé validé à venir d'un conducteur d'Owendo : il sera planifié par erreur (conflit).
  const conducteur = pioche((a) => a.metier === "conducteur_ligne" && a.gareCode === "OWE")
  if (conducteur) {
    pieges.congeOwe = conducteur._id
    plan.push({ agent: conducteur, type: "annuel", du: ajouterJours(aujourdhui, 9), au: ajouterJours(aujourdhui, 22), statut: "valide" })
  }
  // Demandes en attente.
  for (let i = 0; i < 6; i += 1) {
    const agent = pioche((a) => a.metier !== "medical")
    if (!agent) break
    const du = ajouterJours(aujourdhui, alea.entier(15, 60))
    plan.push({ agent, type: i === 4 ? "evenement_familial" : "annuel", du, au: ajouterJours(du, i === 4 ? 2 : alea.entier(5, 12)), statut: "demande", motif: i === 4 ? "Mariage de l'agent" : undefined })
  }
  // Refus motivé, maladie, sans solde (impacte la paie du mois précédent).
  const refuse = pioche((a) => a.metier === "chef_train")
  if (refuse) {
    const du = ajouterJours(aujourdhui, 5)
    plan.push({ agent: refuse, type: "annuel", du, au: ajouterJours(du, 10), statut: "refuse", note: "Effectif de chefs de train insuffisant sur la période ; reporter après le 15." })
  }
  const malade = pioche((a) => a.metier === "agent_voie")
  if (malade) {
    const du = ajouterJours(aujourdhui, -12)
    plan.push({ agent: malade, type: "maladie", du, au: ajouterJours(du, 7), statut: "valide", motif: "Certificat médical du CHU d'Owendo" })
  }
  const sansSolde = pioche((a) => a.metier === "vendeur" || a.metier === "agent_gare")
  if (sansSolde) {
    const du = ajouterJours(debutMoisPrecedent, 9)
    plan.push({ agent: sansSolde, type: "sans_solde", du, au: ajouterJours(du, 4), statut: "valide", motif: "Convenance personnelle" })
  }
  for (const entree of plan) {
    const jours = entree.type === "annuel" ? joursOuvrables(entree.du, entree.au) : joursCalendaires(entree.du, entree.au)
    const demandeLe = Math.min(c.now - 86_400_000, midi(entree.du) - 10 * 86_400_000)
    const numero = await prochainNumero(ctx, `CG-${entree.du.slice(0, 4)}`)
    const congeId = await ctx.db.insert("rhConges", {
      agentId: entree.agent._id,
      numero,
      type: entree.type,
      du: entree.du,
      au: entree.au,
      jours,
      motif: entree.motif,
      statut: entree.statut,
      demandeLe,
      demandeParNom: "Assistant RH — saisie guichet",
      decisionLe: entree.statut === "demande" ? undefined : demandeLe + 2 * 86_400_000,
      decisionParNom: entree.statut === "demande" ? undefined : "Chef du service des roulements",
      decisionNote: entree.note,
      origine: "demo",
    })
    await journal(c, { agentId: entree.agent._id, entite: "conge", entiteId: congeId, action: "rh.conge.demander", libelle: "Demande de congé", detail: `${numero} · du ${entree.du} au ${entree.au}`, acteurNom: "Assistant RH — saisie guichet", at: demandeLe })
    if (entree.statut !== "demande") {
      await journal(c, { agentId: entree.agent._id, entite: "conge", entiteId: congeId, action: `rh.conge.${entree.statut === "valide" ? "valider" : "refuser"}`, libelle: entree.statut === "valide" ? "Congé validé" : "Congé refusé", detail: entree.note, acteurNom: "Chef du service des roulements", at: demandeLe + 2 * 86_400_000 })
    }
  }
  return pieges
}

async function creerPaie(c: Contexte, operateurPaie: { id?: Id<"users">; nom: string }) {
  const { ctx, alea, aujourdhui } = c
  const codes = [-3, -2, -1].map((decalage) => ajouterMois(`${aujourdhui.slice(0, 7)}-01`, decalage).slice(0, 7))
  for (const [index, code] of codes.entries()) {
    const { libelle, debut, fin } = bornesPeriode(code)
    const ouverteLe = midi(debut) + 2 * 86_400_000
    const periodeId = await ctx.db.insert("rhPeriodesPaie", { code, libelle, debut, fin, statut: "ouverte", parametres: "GA-PAIE-2026.1", ouverteLe, ouverteParNom: operateurPaie.nom, origine: "demo" })
    const agents = (await ctx.db.query("rhAgents").collect()).filter((a) => a.dateEmbauche <= fin && (a.dateSortie === undefined || a.dateSortie >= debut))
    for (const agent of agents) {
      const roulant = agent.metier === "conducteur_ligne" || agent.metier === "chef_train" || agent.metier === "controleur_train"
      const voie = agent.metier === "agent_voie" || agent.metier === "technicien_signalisation"
      if (!roulant && !voie && !alea.vrai(0.08)) continue
      await ctx.db.insert("rhVariablesPaie", {
        periodeId,
        agentId: agent._id,
        heuresSup125: roulant || voie ? alea.entier(0, 12) : alea.entier(0, 6),
        heuresSup150: roulant ? alea.entier(0, 8) : 0,
        heuresSup200: roulant && alea.vrai(0.3) ? alea.entier(2, 8) : 0,
        kmTraction: agent.metier === "conducteur_ligne" ? alea.entier(2_400, 4_600) : 0,
        nuitsDecouche: roulant ? alea.entier(3, 10) : voie ? alea.entier(0, 4) : 0,
        primeExceptionnelleFcfa: alea.vrai(0.05) ? 50_000 : 0,
        joursAbsence: 0,
        avanceSalaireFcfa: alea.vrai(0.06) ? alea.entier(2, 8) * 25_000 : 0,
        updatedAt: ouverteLe + 20 * 86_400_000,
        updatedByNom: operateurPaie.nom,
      })
    }
    const periode = (await ctx.db.get(periodeId))!
    const { totaux } = await genererBulletins(ctx, periode)
    const calculeeLe = midi(fin) - 3 * 86_400_000
    await ctx.db.patch(periodeId, { statut: "calculee", calculeeLe, calculeePar: operateurPaie.id, calculeeParNom: operateurPaie.nom, totaux })
    await journal(c, { entite: "periode", entiteId: periodeId, action: "rh.paie.ouvrir", libelle: `Ouverture de la période ${libelle}`, acteurNom: operateurPaie.nom, at: ouverteLe })
    await journal(c, { entite: "periode", entiteId: periodeId, action: "rh.paie.calculer", libelle: `Calcul de la paie : ${totaux.effectif} bulletins`, detail: `Masse brute ${totaux.brut.toLocaleString("fr-FR")} XAF`, acteurNom: operateurPaie.nom, at: calculeeLe })
    if (index < 2) {
      const valideeLe = calculeeLe + 86_400_000
      const clotureeLe = valideeLe + 86_400_000
      const bulletins = await ctx.db.query("rhBulletins").withIndex("by_periode", (q) => q.eq("periodeId", periodeId)).collect()
      for (const bulletin of bulletins) await ctx.db.patch(bulletin._id, { statut: "valide" })
      await ctx.db.patch(periodeId, { statut: "cloturee", valideeLe, valideeParNom: "Directrice des ressources humaines", clotureeLe, clotureeParNom: operateurPaie.nom })
      await journal(c, { entite: "periode", entiteId: periodeId, action: "rh.paie.valider", libelle: `Validation de la paie ${libelle}`, acteurNom: "Directrice des ressources humaines", at: valideeLe })
      await journal(c, { entite: "periode", entiteId: periodeId, action: "rh.paie.cloturer", libelle: `Clôture de la période ${libelle}`, acteurNom: operateurPaie.nom, at: clotureeLe })
      for (const organisme of ["CNSS", "CNAMGS"] as const) {
        const transmiseLe = clotureeLe + 2 * 86_400_000
        const { declarationId } = await creerDeclaration(ctx, null, (await ctx.db.get(periodeId))!, organisme, false, transmiseLe)
        await ctx.db.patch(declarationId, { statut: "accusee", accuseLe: transmiseLe + 3_600_000, referenceAccuse: `AR-${organisme}-${code.replace("-", "")}` })
        await journal(c, { entite: "periode", entiteId: periodeId, action: "rh.declaration.transmettre", libelle: `Déclaration ${organisme} transmise (simulation)`, acteurNom: operateurPaie.nom, at: transmiseLe })
        await journal(c, { entite: "periode", entiteId: periodeId, action: "rh.declaration.accuser", libelle: `Accusé de réception ${organisme} (simulation)`, acteurNom: `${organisme} — guichet simulé`, at: transmiseLe + 3_600_000 })
      }
    }
  }
}

/* ══════════════════════════════ Roulement ══════════════════════════════ */

interface Etape {
  train: string
  desserte: string
  de: string
  a: string
  depart: string
  arrivee: string
  pause: number
  equipe: readonly TypeService[]
}

/** Circulations quotidiennes et relèves à Booué. */
const ETAPES: readonly Etape[] = [
  { train: "MIN-704", desserte: "Minéralier Moanda → Owendo (relève à Booué)", de: "MOA", a: "BOO", depart: "00:30", arrivee: "06:45", pause: 30, equipe: ["conduite"] },
  { train: "MIN-704", desserte: "Minéralier Moanda → Owendo", de: "BOO", a: "OWE", depart: "07:15", arrivee: "13:30", pause: 30, equipe: ["conduite"] },
  { train: "TR-201", desserte: "Express Owendo → Franceville (relève à Booué)", de: "OWE", a: "BOO", depart: "07:40", arrivee: "13:10", pause: 0, equipe: ["conduite", "accompagnement", "controle"] },
  { train: "TR-202", desserte: "Express Franceville → Owendo (relève à Booué)", de: "FCV", a: "BOO", depart: "07:00", arrivee: "12:40", pause: 0, equipe: ["conduite", "accompagnement", "controle"] },
  { train: "TR-201", desserte: "Express Owendo → Franceville", de: "BOO", a: "FCV", depart: "13:40", arrivee: "19:10", pause: 0, equipe: ["conduite", "accompagnement", "controle"] },
  { train: "TR-202", desserte: "Express Franceville → Owendo", de: "BOO", a: "OWE", depart: "13:10", arrivee: "18:40", pause: 0, equipe: ["conduite", "accompagnement", "controle"] },
  { train: "MIN-705", desserte: "Minéralier vide Owendo → Moanda (relève à Booué)", de: "OWE", a: "BOO", depart: "15:00", arrivee: "21:15", pause: 30, equipe: ["conduite"] },
  { train: "MIN-705", desserte: "Minéralier vide Owendo → Moanda", de: "BOO", a: "MOA", depart: "21:45", arrivee: "04:00", pause: 30, equipe: ["conduite"] },
]

const METIER_DU_SERVICE: Record<TypeService, Metier> = {
  conduite: "conducteur_ligne",
  accompagnement: "chef_train",
  controle: "controleur_train",
  manoeuvre: "agent_manoeuvre",
  reserve: "conducteur_ligne",
  formation: "conducteur_ligne",
}

async function creerRoulement(c: Contexte, agents: Doc<"rhAgents">[], pieges: { aptitude?: Id<"rhAgents">; habilitation?: Id<"rhAgents">; conge?: Id<"rhAgents"> }) {
  const { ctx, aujourdhui } = c
  const roulants = agents.filter((a) => a.statut === "actif" && (a.metier === "conducteur_ligne" || a.metier === "chef_train" || a.metier === "controleur_train"))
  const contextes = new Map<Id<"rhAgents">, ContexteAgentRoulement>()
  for (const agent of roulants) {
    const [habilitations, conges, visites] = await Promise.all([
      ctx.db.query("rhHabilitations").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).collect(),
      ctx.db.query("rhConges").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).collect(),
      ctx.db.query("rhVisitesMedicales").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).collect(),
    ])
    const derniere = visites.filter((v) => v.statut === "realisee" && v.resultat).sort((a, b) => (b.realiseeLe ?? 0) - (a.realiseeLe ?? 0))[0]
    contextes.set(agent._id, {
      statut: agent.statut,
      aptitude: derniere?.resultat && derniere.realiseeLe !== undefined ? { resultat: derniere.resultat, valideJusquau: derniere.valideJusquau, realiseeLe: derniere.realiseeLe } : null,
      habilitations: habilitations.map((h) => ({ type: h.type, statut: h.statut, expireLe: h.expireLe })),
      conges: conges.filter((cg) => cg.statut === "valide").map((cg) => ({ du: cg.du, au: cg.au })),
    })
  }
  const position = new Map(roulants.map((a) => [a._id, a.gareCode]))
  const charge = new Map<Id<"rhAgents">, number>()
  const planifies: (ServicePlanifie & { etape: Etape; date: string; force?: boolean })[] = []
  let compteur = 0

  const heureVers = (date: string, hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number) as [number, number]
    return debutJournee(date) + (h * 60 + m) * 60_000
  }

  for (let jour = -3; jour <= 13; jour += 1) {
    const date = ajouterJours(aujourdhui, jour)
    for (const etape of ETAPES) {
      const debut = heureVers(date, etape.depart)
      let fin = heureVers(date, etape.arrivee)
      if (fin <= debut) fin += 86_400_000
      for (const type of etape.equipe) {
        const candidats = roulants
          .filter((a) => a.metier === METIER_DU_SERVICE[type] && position.get(a._id) === etape.de)
          .sort((a, b) => (charge.get(a._id) ?? 0) - (charge.get(b._id) ?? 0) || a.matricule.localeCompare(b.matricule))
        const service = { id: `s${compteur}`, debut, fin, type, pauseMinutes: etape.pause }
        const retenu = candidats.find((agent) => conflitsService({ ...service, agentId: agent._id }, planifies, contextes.get(agent._id)!).length === 0)
        if (!retenu) continue
        compteur += 1
        planifies.push({ ...service, agentId: retenu._id, etape, date })
        position.set(retenu._id, etape.a)
        charge.set(retenu._id, (charge.get(retenu._id) ?? 0) + (fin - debut))
      }
    }
  }

  // Conflits à résoudre en fin de quinzaine : planifications antérieures à
  // un congé validé, à une aptitude expirée et à une habilitation échue.
  const forcer = (agentId: Id<"rhAgents"> | undefined, jour: number, etapeIndex: number, type: TypeService) => {
    if (!agentId) return
    const etape = ETAPES[etapeIndex]!
    const date = ajouterJours(aujourdhui, jour)
    const debut = heureVers(date, etape.depart)
    let fin = heureVers(date, etape.arrivee)
    if (fin <= debut) fin += 86_400_000
    compteur += 1
    planifies.push({ id: `s${compteur}`, agentId, debut, fin, type, pauseMinutes: etape.pause, etape, date, force: true })
  }
  forcer(pieges.conge, 10, 2, "conduite")
  forcer(pieges.aptitude, 11, 6, "conduite")
  forcer(pieges.habilitation, 12, 2, "accompagnement")
  // Une réserve posée après une relève trop courte (alerte de repos), que le
  // planificateur a justifiée par écrit.
  const reserveDate = ajouterJours(aujourdhui, 5)
  const reserveDebut = heureVers(reserveDate, "05:30")
  const fatigue = planifies.find((p) => {
    if (p.type !== "conduite" || p.etape.train !== "TR-202" || p.etape.a !== "OWE" || p.date !== ajouterJours(aujourdhui, 4)) return false
    const conflits = conflitsService(
      { id: "reserve", agentId: p.agentId, debut: reserveDebut, fin: reserveDebut + 5.5 * 3_600_000, type: "reserve", pauseMinutes: 0 },
      planifies,
      contextes.get(p.agentId as Id<"rhAgents">)!
    )
    return conflits.length > 0 && conflits.every((conflit) => !conflit.bloquant)
  })

  for (const p of planifies) {
    const enAvance = p.date > ajouterJours(aujourdhui, 6)
    const serviceId = await ctx.db.insert("rhServices", {
      agentId: p.agentId as Id<"rhAgents">,
      date: dateLibreville(p.debut),
      debut: p.debut,
      fin: p.fin,
      type: p.type,
      pauseMinutes: p.pauseMinutes,
      trainNumber: p.etape.train,
      desserte: p.etape.desserte,
      gareDebutCode: p.etape.de,
      gareFinCode: p.etape.a,
      decouche: p.etape.a !== agents.find((a) => a._id === p.agentId)?.gareCode,
      statut: enAvance || p.force ? "planifie" : "publie",
      creeParNom: "Chef du service des roulements",
      origine: "demo",
      createdAt: c.now - 5 * 86_400_000,
      updatedAt: c.now - 5 * 86_400_000,
    })
    await journal(c, { agentId: p.agentId as Id<"rhAgents">, entite: "service", entiteId: serviceId, action: "rh.roulement.planifier", libelle: `Service ${p.etape.train} du ${p.date} planifié`, acteurNom: "Chef du service des roulements", at: c.now - 5 * 86_400_000 })
  }
  if (fatigue) {
    const date = reserveDate
    const etape = ETAPES[2]!
    const debut = reserveDebut
    const serviceId = await ctx.db.insert("rhServices", {
      agentId: fatigue.agentId as Id<"rhAgents">,
      date,
      debut,
      fin: debut + 5.5 * 3_600_000,
      type: "reserve",
      pauseMinutes: 0,
      trainNumber: etape.train,
      desserte: "Réserve en gare d'Owendo",
      gareDebutCode: "OWE",
      gareFinCode: "OWE",
      decouche: false,
      statut: "planifie",
      derogation: "Remplacement imprévu d'un conducteur malade ; aucun autre agent disponible à Owendo.",
      creeParNom: "Chef du service des roulements",
      origine: "demo",
      createdAt: c.now - 86_400_000,
      updatedAt: c.now - 86_400_000,
    })
    await journal(c, { agentId: fatigue.agentId as Id<"rhAgents">, entite: "service", entiteId: serviceId, action: "rh.roulement.planifier", libelle: `Réserve du ${date} planifiée`, detail: "Dérogation : remplacement imprévu d'un conducteur malade", acteurNom: "Chef du service des roulements", at: c.now - 86_400_000 })
  }
  return planifies.length + (fatigue ? 1 : 0)
}

/* ════════════════════════════ Point d'entrée ════════════════════════════ */

async function viderModule(ctx: MutationCtx) {
  let supprimes = 0
  for (const table of TABLES_RH) {
    for (const ligne of await ctx.db.query(table).collect()) {
      await ctx.db.delete(ligne._id)
      supprimes += 1
    }
  }
  return supprimes
}

async function compter(ctx: MutationCtx) {
  return {
    agents: (await ctx.db.query("rhAgents").collect()).length,
    habilitations: (await ctx.db.query("rhHabilitations").collect()).length,
    visites: (await ctx.db.query("rhVisitesMedicales").collect()).length,
    conges: (await ctx.db.query("rhConges").collect()).length,
    periodes: (await ctx.db.query("rhPeriodesPaie").collect()).length,
    bulletins: (await ctx.db.query("rhBulletins").collect()).length,
    services: (await ctx.db.query("rhServices").collect()).length,
  }
}

export const peupler = internalMutation({
  args: { reset: v.optional(v.boolean()) },
  handler: async (ctx, { reset }) => {
    if (process.env.DEMO_ACCOUNTS_ENABLED !== "true") {
      throw new Error("Peuplement refusé : DEMO_ACCOUNTS_ENABLED doit valoir true.")
    }
    let supprimes = 0
    if (reset) {
      supprimes = await viderModule(ctx)
    } else {
      const marqueur = await ctx.db.query("rhSequences").withIndex("by_cle", (q) => q.eq("cle", MARQUEUR)).unique()
      if (marqueur) return { cree: false, supprimes, ...(await compter(ctx)) }
    }

    const now = Date.now()
    const aujourdhui = dateLibreville(now)
    const paie = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "gestionnaire_paie")).first()
    const c: Contexte = { ctx, aujourdhui, now, alea: generateur(20_261_001), operateur: { nom: "Service du personnel" } }
    const { agents } = await creerAgents(c)
    await mouvementsDeCarriere(c, agents)
    const aJour = (await ctx.db.query("rhAgents").collect()).sort((a, b) => a.matricule.localeCompare(b.matricule))
    const habilitations = await creerHabilitations(c, aJour)
    const visites = await creerVisites(c, aJour)
    const debutMoisPrecedent = `${ajouterMois(aujourdhui, -1).slice(0, 7)}-01`
    const conges = await creerConges(c, aJour, debutMoisPrecedent)
    await creerPaie(c, {
      id: paie?._id,
      nom: paie ? [paie.firstName, paie.lastName].filter(Boolean).join(" ") || "Gestionnaire de paie" : "Gestionnaire de paie",
    })
    const services = await creerRoulement(c, aJour, {
      conge: conges.congeOwe,
      aptitude: visites.expiree,
      habilitation: habilitations.expiree,
    })
    await ctx.db.insert("rhSequences", { cle: MARQUEUR, valeur: now })
    const compteurs = await compter(ctx)
    return { cree: true, supprimes, ...compteurs, servicesPlanifies: services, agentsRelies: aJour.filter((a) => a.userId).length, exemple: aJour[0] ? nomComplet(aJour[0]) : null }
  },
})
