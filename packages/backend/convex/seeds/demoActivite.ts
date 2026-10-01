import { v } from "convex/values"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
} from "../_generated/server"
import { expiryFromArrival, PAYLOAD_VERSION } from "../model/barcode"
import { addDays, fromServiceDate, toServiceDate, weekdayOf } from "../model/calendar"
import { CURRENT_CGV_VERSION } from "../model/cgv"
import {
  computeBaggageFare,
  computeParcelFare,
  computeTonnageFare,
  resolveBaggageTerms,
  type AncillaryFareRow,
} from "../model/ancillary"
import {
  buildJournalEntries,
  serializeJournal,
  validateJournal,
  type AccountableSale,
  type AccountingProduct,
} from "../model/accounting"
import { buildAmounts, negateAmounts, refundAmount, sumAmounts } from "../model/sales"
import { segmentMask } from "../model/inventory"
import { CURRENT_KEY_VERSION, signTicket } from "../lib/signature"
import {
  AGENCES,
  CODE_SANS_POINT_DE_VENTE,
  FLUX_LIGNE,
  GARES_GUICHET,
  MARQUEUR,
  PERSONNEL,
  PREFIXE,
  PREFIXE_AUTH,
  PREFIXE_FIN,
  billetage,
  choisir,
  codePointDeVenteGare,
  datesFenetre,
  ecartSession,
  emailAgent,
  entier,
  fondsDeCaisse,
  multipleDeCinq,
  planifierColis,
  planifierDesserte,
  planifierFuneraire,
  telephone,
  tirage,
  type ColisPlanifie,
  type DessertePlan,
  type FunerairePlanifie,
  type Moyen,
  type Rng,
  type VentePlanifiee,
} from "./demoActivitePlan"
import {
  Inventaire,
  RETARD_DU_JOUR_MINUTES,
  Sequences,
  administrateur,
  cadreDuPlan,
  chargerDessertes,
  chargerPersonnel,
  chargerTarification,
  chefDeGare,
  chefDeVente,
  cleClient,
  comptable,
  compteEnCaisse,
  controleurDeDesserte,
  instantDeraillement,
  instantSuppression,
  journaliser,
  journee,
  prixBillet,
  recettes,
  retardDesserte,
  sessionCouvrant,
  statutJour,
  vendeursDuJour,
  venteExistante,
  type Personnel,
  type Tarification,
} from "./demoActiviteEcriture"

/**
 * Activité de démonstration du portail agent (guichet et gestion).
 *
 * CE QUE PRODUIT LE SEED
 *
 * Sur les 30 derniers jours glissants (fuseau Africa/Libreville) et le jour
 * même, à partir du référentiel et du livret de démonstration en place :
 *
 *  — le personnel commercial : guichetiers d'Owendo, Ndjolé, Booué,
 *    Lastourville, Moanda et Franceville, trois agences accréditées, quatre
 *    contrôleurs, trois chefs de gare, contrôle des recettes, comptabilité,
 *    administration fonctionnelle. Les personas de connexion
 *    (`model/demoPersonas.ts`) s'y ajoutent s'ils sont provisionnés ;
 *  — les ventes : billets de toutes classes (barème, réductions ENFANT,
 *    MILITAIRE et GROUPE, contingents et règles de yield actives à l'instant
 *    de la vente), bagages, colis express, transport auto accompagné,
 *    transport funéraire, sur tous les canaux et tous les moyens de
 *    paiement — 450 à 550 ventes et 650 à 800 billets par jour, pointes le
 *    vendredi et le dimanche, avec les ventes anticipées des trois semaines
 *    à venir ;
 *  — l'après-vente : annulations, remboursements avec pénalité, duplicatas ;
 *  — la caisse : une session par vendeur et par jour travaillé, fonds et
 *    billetage, attendu par moyen, quelques écarts justifiés, deux caisses
 *    de la veille pas encore visées ;
 *  — la comptabilité : journées clôturées (sauf la veille et le jour même),
 *    journal V65 équilibré, déversements SAGE — intégrés, un rejeté (compte
 *    analytique inconnu), un en attente ;
 *  — l'exploitation : livrets dans tous les états, grille tarifaire soumise,
 *    règles de yield (actives, en test, programmée, suspendue), blocages de
 *    places, quotas d'agences, un retard et une suppression le jour même ;
 *  — le terrain : contrôles à bord des dessertes passées, procès-verbaux,
 *    conflits de contrôle, incidents ouverts, en cours et clos ;
 *  — les rapports programmés et leurs exécutions passées, produites par la
 *    chaîne réelle (`pilotage.produireRapport`) : fichiers CSV et aperçus ;
 *  — le journal d'audit de tout ce qui précède, scellé jour par jour ;
 *  — les cumuls `dailyMetrics` et `tripMetrics`, recalculés par `rollup.ts`.
 *
 * LANCEMENT (depuis `packages/backend`, après `seeds/referential:run`,
 * `seeds/demo:run` et, si possible, `seeds/demoAccounts:provisionPersonas`) :
 *
 *   bunx convex run seeds/demoActivite:run
 *   bunx convex run seeds/demoActivite:run '{"jours": 30, "echelle": 1}'
 *
 * Lancer APRÈS `seeds/demoAccounts:provisionPersonas` pour que les comptes
 * de connexion (guichetier, agence, recettes, comptable…) portent leur part
 * de l'activité. Ne pas cumuler avec `seeds/history` (ventes « H- » sans
 * taxes ni caisse) : le purger d'abord (`seeds/history:purge`).
 *
 * Compter cinq à dix minutes pour 30 jours. L'action se relance d'elle-même
 * (planificateur) avant la limite de dix minutes et reprend à l'étape en
 * cours : suivre l'avancement dans les journaux du déploiement.
 *
 * RÉINITIALISATION :
 *
 *   bunx convex run seeds/demoActivite:reset
 *
 * Le reset ne retire que ce que ce seed a écrit, repéré par ses clés
 * (`clientSaleId`, `clientScanId`, `clientId` préfixés « demo-activite| »),
 * par le préfixe des comptes (`demo-activite-…`) et par les entrées d'audit
 * portant le contexte `{"source":"demo-activite"}` — dont celles qui
 * recensent chaque création et chaque modification à défaire.
 *
 * REJEU : le seed est idempotent. Chaque vente planifiée porte une clé
 * stable ; un second passage le même jour n'ajoute que ce qui s'est
 * « passé » depuis le premier. Un passage le lendemain complète la journée
 * écoulée, clôture l'avant-veille et fait avancer les déversements.
 *
 * EFFET SUR LES AGRÉGATS : `dailyMetrics` est recalculé pour chaque journée
 * de la fenêtre, `tripMetrics` pour chaque desserte de la fenêtre et des
 * trois semaines suivantes ; le recalcul REMPLACE les lignes existantes
 * (voir `functions/rollup.ts`). Le seed écrit des entrées d'audit datées du
 * passé : les scellements (`auditSeals`) postérieurs au début de ces entrées
 * (115 jours avant la fenêtre) sont retirés puis recalculés, fenêtre par
 * fenêtre, par `modules/platform/audit.sealWindow`.
 *
 * LIMITES CONNUES : les ventes anticipées antérieures à la fenêtre ne sont
 * pas reconstituées — les dessertes des tout premiers jours paraissent donc
 * moins remplies que les suivantes. Les montants des bagages, colis et
 * transports au tonnage sont tirés des barèmes PROVISOIRES du référentiel.
 *
 * Réservé aux déploiements où `DEMO_ACCOUNTS_ENABLED=true`.
 */

const TAILLE_LOT = 40
/**
 * Ancienneté maximale des entrées d'audit écrites par le seed (création du
 * livret échu), en jours avant la fenêtre : borne du rescellement.
 */
const JOURS_AVANT_FENETRE = 115
/** Au-delà, l'action se relance pour rester sous la limite de dix minutes. */
const BUDGET_ACTION_MS = 7.5 * 60_000

const DESCRIPTION_LIVRET_ECHU =
  "Horaires de la période précédente, remplacés par le livret en vigueur."
const DESCRIPTION_LIVRET_A_VALIDER =
  "Service suivant : départ de l'Express avancé à 07 h 30 pour la correspondance routière de Franceville."
const DESCRIPTION_LIVRET_BROUILLON =
  "Projet : renfort Omnibus du vendredi et du dimanche, en attente de la disponibilité du matériel."
const LIBELLE_GRILLE_A_VALIDER = "Barème voyageurs — indexation de 4 %"

function assertDemo(): void {
  if (process.env.DEMO_ACCOUNTS_ENABLED !== "true") {
    throw new Error("Peuplement refusé : DEMO_ACCOUNTS_ENABLED doit valoir true.")
  }
}

const argsCommuns = {
  maintenant: v.number(),
  debut: v.string(),
  echelle: v.number(),
  joursAvance: v.number(),
}

/* ════════════════════════════════ Orchestration ════════════════════════════════ */

interface Rapport {
  [cle: string]: number | string | string[] | undefined
}

export const run = internalAction({
  args: {
    /** Jours d'historique avant aujourd'hui. 30 par défaut. */
    jours: v.optional(v.number()),
    /** Horizon des ventes anticipées, en jours. 21 par défaut. */
    joursAvance: v.optional(v.number()),
    /** Horizon de l'offre (dessertes engendrées), en jours. 60 par défaut. */
    joursOffre: v.optional(v.number()),
    /** Coefficient de volume, 1 par défaut. */
    echelle: v.optional(v.number()),
    /** Reprise après relance : étape et instant de référence. */
    etape: v.optional(v.number()),
    maintenant: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Rapport> => {
    assertDemo()
    const lancement = Date.now()
    const maintenant = args.maintenant ?? Date.now()
    const jours = Math.min(Math.max(Math.trunc(args.jours ?? 30), 1), 60)
    const joursAvance = Math.min(Math.max(Math.trunc(args.joursAvance ?? 21), 0), 30)
    const joursOffre = Math.min(Math.max(Math.trunc(args.joursOffre ?? 60), joursAvance), 120)
    const echelle = Math.min(Math.max(args.echelle ?? 1, 0.05), 1.5)

    const contexte = await ctx.runMutation(internal.seeds.demoActivite.preparer, {
      maintenant,
      jours,
      joursOffre,
    })
    const commun = { maintenant, debut: contexte.debut, echelle, joursAvance }
    const rapport: Rapport = { debut: contexte.debut, fin: contexte.aujourdhui }
    const ajouter = (valeurs: Record<string, number>) => {
      for (const [cle, n] of Object.entries(valeurs)) {
        rapport[cle] = ((rapport[cle] as number | undefined) ?? 0) + n
      }
    }

    type Tache = () => Promise<void>
    const taches: Tache[] = []

    // 1. Offre : dessertes de la fenêtre et de l'horizon.
    taches.push(async () => {
      const manquantes = await ctx.runQuery(internal.seeds.demoActivite.datesSansDesserte, {
        du: contexte.debut,
        au: addDays(contexte.aujourdhui, joursOffre),
      })
      for (const date of manquantes) {
        ajouter(
          await ctx.runMutation(internal.seeds.demoActivite.assurerDessertes, {
            date,
            maintenant,
          })
        )
      }
    })
    // 2. Exploitation préalable aux ventes : blocages, quotas, règle pilote.
    taches.push(async () => {
      ajouter(await ctx.runMutation(internal.seeds.demoActivite.exploitation, commun))
    })
    // 3. Journées comptables et caisses.
    for (const date of contexte.dates) {
      taches.push(async () => {
        ajouter(await ctx.runMutation(internal.seeds.demoActivite.ouvrirJournee, { ...commun, date }))
      })
    }
    // 4. Ventes et après-vente, journée par journée, flux par flux.
    for (const date of contexte.dates) {
      for (const flux of contexte.flux) {
        taches.push(async () => {
          for (let lot = 0; ; lot += 1) {
            const r = await ctx.runMutation(internal.seeds.demoActivite.vendreLot, {
              ...commun,
              date,
              flux,
              lot,
            })
            ajouter(r.compte)
            if (r.termine) break
          }
        })
      }
    }
    // 5. Exploitation du jour et terrain.
    taches.push(async () => {
      ajouter(await ctx.runMutation(internal.seeds.demoActivite.terrain, commun))
    })
    taches.push(async () => {
      const dessertes = await ctx.runQuery(internal.seeds.demoActivite.dessertesAControler, {
        du: contexte.debut,
        maintenant,
      })
      for (const [rang, tripId] of dessertes.entries()) {
        ajouter(
          await ctx.runMutation(internal.seeds.demoActivite.controlerDesserte, {
            ...commun,
            tripId,
            // Deux conflits de contrôle sur la période, dont un arbitré.
            conflit: rang === dessertes.length - 6 ? "ouvert" : rang === Math.floor(dessertes.length / 3) ? "arbitre" : undefined,
          })
        )
      }
    })
    // 6. Clôtures, journal comptable et déversements.
    for (const date of contexte.dates) {
      taches.push(async () => {
        ajouter(await ctx.runMutation(internal.seeds.demoActivite.cloturerJournee, { ...commun, date }))
      })
    }
    // 7. Cumuls d'indicateurs.
    taches.push(async () => {
      const cibles = await ctx.runQuery(internal.seeds.demoActivite.ciblesCumuls, {
        du: contexte.debut,
        au: addDays(contexte.aujourdhui, joursAvance),
      })
      for (const accountingDayId of cibles.journees) {
        await ctx.runMutation(internal.functions.rollup.rollupAccountingDay, { accountingDayId })
      }
      for (const tripId of cibles.dessertes) {
        await ctx.runMutation(internal.functions.rollup.rollupTrip, { tripId })
      }
      ajouter({ cumulsJournees: cibles.journees.length, cumulsDessertes: cibles.dessertes.length })
    })
    // 8. Rapports programmés : exécutions passées, produites par la chaîne réelle.
    taches.push(async () => {
      const executions = await ctx.runMutation(internal.seeds.demoActivite.rapports, commun)
      for (const { runId } of executions) {
        await ctx.runAction(internal.functions.pilotage.produireRapport, { runId })
      }
      ajouter(await ctx.runMutation(internal.seeds.demoActivite.daterExecutions, { executions }))
    })
    // 9. Scellement du journal d'audit.
    taches.push(async () => {
      ajouter(await resceller(ctx, fromServiceDate(contexte.debut, "00:00") - JOURS_AVANT_FENETRE * 86_400_000))
    })

    const depart = args.etape ?? 0
    for (let i = depart; i < taches.length; i += 1) {
      if (Date.now() - lancement > BUDGET_ACTION_MS) {
        await ctx.scheduler.runAfter(0, internal.seeds.demoActivite.run, {
          jours,
          joursAvance,
          joursOffre,
          echelle,
          etape: i,
          maintenant,
        })
        return { ...rapport, relance: `reprise planifiée à l'étape ${i}/${taches.length}` }
      }
      await taches[i]!()
    }

    await ctx.runMutation(internal.seeds.demoActivite.consigner, {
      maintenant,
      rapport: JSON.stringify(rapport),
    })
    return rapport
  },
})

/* ════════════════════════════════ Préparation ═════════════════════════════════ */

export const preparer = internalMutation({
  args: { maintenant: v.number(), jours: v.number(), joursOffre: v.number() },
  handler: async (ctx, args) => {
    assertDemo()
    const aujourdhui = toServiceDate(args.maintenant)
    const dates = datesFenetre(aujourdhui, args.jours)
    const debut = dates[0]!

    if (!(await ctx.db.query("stations").first())) {
      throw new Error("Référentiel absent : lancer d'abord « bunx convex run seeds/referential:run ».")
    }
    const actif = (await ctx.db.query("timetableBooklets").withIndex("by_status", (q) => q.eq("status", "actif")).collect())
      .sort((a, b) => b.validFrom - a.validFrom)[0]
    if (!actif) {
      throw new Error("Aucun livret actif : lancer d'abord « bunx convex run seeds/demo:run ».")
    }
    const horaires = await ctx.db
      .query("bookletSchedules")
      .withIndex("by_booklet", (q) => q.eq("bookletId", actif._id))
      .collect()
    if (horaires.length === 0) throw new Error("Le livret actif ne porte aucun horaire.")
    const grille = await ctx.db
      .query("fareSchedules")
      .withIndex("by_status", (q) => q.eq("status", "actif"))
      .first()
    if (!grille) throw new Error("Aucune grille tarifaire active : lancer seeds/referential:run.")

    const creations: Record<string, number> = {}
    const compter = (cle: string) => (creations[cle] = (creations[cle] ?? 0) + 1)
    const ilYa = (jours: number, heure = "09:15") => fromServiceDate(addDays(aujourdhui, -jours), heure)

    /* ── Agences accréditées ──────────────────────────────────────────── */
    const stationsParCode = new Map((await ctx.db.query("stations").collect()).map((s) => [s.code, s]))
    for (const agence of AGENCES) {
      const existante = await ctx.db
        .query("pointsOfSale")
        .withIndex("by_code", (q) => q.eq("code", agence.code))
        .unique()
      if (existante) continue
      const id = await ctx.db.insert("pointsOfSale", {
        code: agence.code,
        name: agence.name,
        type: agence.type,
        stationId: stationsParCode.get(agence.gare)?._id,
        counters: { passengers: 1, baggage: 0, parcels: 0 },
        royaltyPct: agence.royaltyPct,
        isActive: true,
      })
      await journaliser(ctx, {
        action: "referentiel.point_de_vente.creer",
        table: "pointsOfSale",
        id,
        a: ilYa(args.jours + 45),
        apres: { code: agence.code, name: agence.name, royaltyPct: agence.royaltyPct },
        manifeste: true,
      })
      compter("agences")
    }

    /* ── Personnel ────────────────────────────────────────────────────── */
    const pointsDeVente = new Map((await ctx.db.query("pointsOfSale").collect()).map((p) => [p.code, p]))
    for (const agent of PERSONNEL) {
      const authId = PREFIXE_AUTH + agent.cle
      const existant = await ctx.db
        .query("users")
        .withIndex("by_authId", (q) => q.eq("authId", authId))
        .unique()
      if (existant) continue
      const id = await ctx.db.insert("users", {
        authId,
        email: emailAgent(agent),
        firstName: agent.prenom,
        lastName: agent.nom,
        role: agent.role,
        matricule: agent.matricule,
        pointOfSaleId: agent.pointDeVente ? pointsDeVente.get(agent.pointDeVente)?._id : undefined,
        identitySource: "annuaire",
        isActive: true,
        lastSeenAt: args.maintenant - entier(tirage(MARQUEUR, "vu", agent.cle), 5, 900) * 60_000,
      })
      await journaliser(ctx, {
        action: "utilisateur.habiliter",
        table: "users",
        id,
        a: ilYa(args.jours + 40, "10:00"),
        apres: { role: agent.role, matricule: agent.matricule, source: "annuaire" },
        manifeste: true,
      })
      compter("personnel")
    }

    const personnel = await chargerPersonnel(ctx)
    const admin = administrateur(personnel)

    // Le persona « agence » vend pour Mont-Bouët s'il n'a pas de rattachement.
    const personaAgence = personnel.personas.get("agence")
    const monBouet = pointsDeVente.get("AG-LBV-MBT")
    if (personaAgence && !personaAgence.pointOfSaleId && monBouet) {
      await ctx.db.patch(personaAgence._id, { pointOfSaleId: monBouet._id })
      await journaliser(ctx, {
        acteur: admin._id,
        action: "utilisateur.modifier",
        table: "users",
        id: personaAgence._id,
        a: ilYa(args.jours + 30),
        avant: { pointOfSaleId: null },
        apres: { pointOfSaleId: monBouet._id },
        manifeste: true,
      })
    }

    /* ── Client conventionné ──────────────────────────────────────────── */
    if (
      !(await ctx.db
        .query("corporateAccounts")
        .withIndex("by_code", (q) => q.eq("code", "CC-COMILOG"))
        .unique())
    ) {
      const id = await ctx.db.insert("corporateAccounts", {
        code: "CC-COMILOG",
        name: "COMILOG — déplacements du personnel",
        contactEmail: "voyages@comilog.ga",
        contactPhone: "+241 01 66 10 00",
        creditLimitXaf: 6_000_000,
        outstandingXaf: 0,
        isActive: true,
      })
      await journaliser(ctx, {
        acteur: admin._id,
        action: "client_conventionne.creer",
        table: "corporateAccounts",
        id,
        a: ilYa(args.jours + 50),
        apres: { code: "CC-COMILOG", creditLimitXaf: 6_000_000 },
        manifeste: true,
      })
      compter("clientsConventionnes")
    }

    /* ── Paramétrage commercial ───────────────────────────────────────── */
    if (!(await ctx.db.query("systemSettings").withIndex("by_key", (q) => q.eq("key", "commercial")).unique())) {
      const id = await ctx.db.insert("systemSettings", {
        key: "commercial",
        vatPct: grille.vatPct,
        cssPct: grille.cssPct,
        seatHoldMinutes: 15,
        mobilePaymentAttempts: 3,
        degradedSalesEnabled: true,
        cashVarianceNotificationsEnabled: true,
        updatedBy: admin._id,
        updatedAt: ilYa(args.jours + 20),
      })
      await journaliser(ctx, {
        acteur: admin._id,
        action: "parametrage.enregistrer",
        table: "systemSettings",
        id,
        a: ilYa(args.jours + 20),
        apres: { vatPct: grille.vatPct, cssPct: grille.cssPct, seatHoldMinutes: 15 },
        manifeste: true,
      })
    }

    /*
     * Historique de paramétrage : deux réglages modifiés pendant la période.
     * L'état « après » est celui en vigueur aujourd'hui, l'entrée ne fait que
     * retracer d'où il vient.
     */
    const reglages = await ctx.db.query("systemSettings").withIndex("by_key", (q) => q.eq("key", "commercial")).unique()
    const remplissage90 = (await ctx.db.query("pricingRules").collect()).find((r) => r.code === "remplissage-90")
    const historique = await ctx.db
      .query("auditLogs")
      .withIndex("by_action", (q) => q.eq("action", "parametrage.enregistrer"))
      .collect()
    if (reglages && !historique.some((l) => l.context?.includes(MARQUEUR) && l.reason)) {
      await journaliser(ctx, {
        acteur: admin._id,
        action: "parametrage.enregistrer",
        table: "systemSettings",
        id: reglages._id,
        a: ilYa(9, "16:40"),
        raison: "Harmonisation du délai de réservation avec les opérateurs de paiement mobile",
        avant: { seatHoldMinutes: 10 },
        apres: { seatHoldMinutes: reglages.seatHoldMinutes },
      })
    }
    if (remplissage90 && !(await ctx.db.query("auditLogs").withIndex("by_entity", (q) => q.eq("entityTable", "pricingRules").eq("entityId", remplissage90._id)).collect()).some((l) => l.context?.includes(MARQUEUR))) {
      await journaliser(ctx, {
        acteur: admin._id,
        action: "yield.regle.modifier",
        table: "pricingRules",
        id: remplissage90._id,
        a: ilYa(15, "11:25"),
        raison: "Trains complets les week-ends de septembre",
        avant: { modifierPct: 10 },
        apres: { modifierPct: remplissage90.modifierPct },
      })
    }

    /* ── Règles de yield ──────────────────────────────────────────────── */
    const regles = await ctx.db.query("pricingRules").collect()
    const debutFenetre = fromServiceDate(debut, "00:00")
    for (const regle of [
      {
        code: "canal-ligne",
        label: "Remise vente en ligne",
        type: "canal" as const,
        modifierPct: -5,
        priority: 60,
        validFrom: debutFenetre - 60 * 86_400_000,
        isActive: true,
        creee: args.jours + 60,
      },
      {
        code: "retours-dimanche",
        label: "Retours du dimanche : +15 %",
        type: "periode" as const,
        threshold: 0,
        modifierPct: 15,
        priority: 55,
        validFrom: ilYa(12, "08:00"),
        isActive: true,
        creee: 12,
      },
      {
        code: "haute-saison",
        label: "Haute saison : +10 % dès 50 % de remplissage",
        type: "remplissage" as const,
        threshold: 0.5,
        modifierPct: 10,
        priority: 35,
        validFrom: fromServiceDate(addDays(aujourdhui, 30), "00:00"),
        validUntil: fromServiceDate(addDays(aujourdhui, 60), "23:59"),
        isActive: true,
        creee: 3,
      },
      {
        code: "rentree-scolaire",
        label: "Rentrée scolaire : −10 % pour les élèves (suspendue)",
        type: "promotion" as const,
        modifierPct: -10,
        priority: 70,
        validFrom: debutFenetre,
        isActive: false,
        creee: args.jours + 5,
      },
    ]) {
      if (regles.some((r) => r.code === regle.code)) continue
      const { creee, ...champs } = regle
      const id = await ctx.db.insert("pricingRules", {
        scope: "reseau",
        ...champs,
        // Mêmes bornes de sécurité que les règles créées au portail.
        floorXaf: 2_000,
        capXaf: 150_000,
        createdBy: admin._id,
      })
      await journaliser(ctx, {
        acteur: admin._id,
        action: "yield.regle.creer",
        table: "pricingRules",
        id,
        a: ilYa(creee, "10:40"),
        apres: { code: regle.code, type: regle.type, modifierPct: regle.modifierPct },
        manifeste: true,
      })
      compter("reglesYield")
    }

    /* ── Livrets horaires : échu, à valider, brouillon ────────────────── */
    const livrets = await ctx.db.query("timetableBooklets").collect()
    const fmt = (t: number) => {
      const [a, m, j] = toServiceDate(t).split("-")
      return `${j}/${m}/${a}`
    }
    const copierHoraires = async (
      bookletId: Id<"timetableBooklets">,
      decalage: (h: Doc<"bookletSchedules">) => string
    ) => {
      for (const h of horaires) {
        await ctx.db.insert("bookletSchedules", {
          bookletId,
          trainId: h.trainId,
          trainNumber: h.trainNumber,
          trainType: h.trainType,
          departureTime: decalage(h),
          daysOfWeek: [...h.daysOfWeek],
          stops: h.stops.map((s) => ({ ...s })),
        })
      }
    }

    let echu = livrets.find((l) => l.description === DESCRIPTION_LIVRET_ECHU)
    if (!echu) {
      const validFrom = fromServiceDate(addDays(debut, -90), "00:00")
      const validUntil = Math.max(validFrom + 86_400_000, actif.validFrom - 1)
      const id = await ctx.db.insert("timetableBooklets", {
        label: `Livret horaire du ${fmt(validFrom)} au ${fmt(validUntil)}`,
        description: DESCRIPTION_LIVRET_ECHU,
        validFrom,
        validUntil,
        status: "expire",
        createdBy: admin._id,
        approvedBy: chefDeVente(personnel)._id,
        approvedAt: validFrom - 12 * 86_400_000,
      })
      await copierHoraires(id, (h) => h.departureTime)
      await journaliser(ctx, {
        acteur: admin._id,
        action: "livret.creer",
        table: "timetableBooklets",
        id,
        a: validFrom - 20 * 86_400_000,
        apres: { validFrom, validUntil },
        manifeste: true,
      })
      await journaliser(ctx, {
        acteur: chefDeVente(personnel)._id,
        action: "livret.activer",
        table: "timetableBooklets",
        id,
        a: validFrom - 12 * 86_400_000,
        avant: { status: "a_valider" },
        apres: { status: "actif" },
      })
      echu = (await ctx.db.get(id))!
      compter("livrets")
    }

    if (!livrets.some((l) => l.description === DESCRIPTION_LIVRET_A_VALIDER)) {
      const validFrom = actif.validUntil + 1
      const validUntil = validFrom + 182 * 86_400_000
      const id = await ctx.db.insert("timetableBooklets", {
        label: `Livret horaire à compter du ${fmt(validFrom)}`,
        description: DESCRIPTION_LIVRET_A_VALIDER,
        validFrom,
        validUntil,
        status: "a_valider",
        createdBy: admin._id,
        submittedBy: admin._id,
        submittedAt: ilYa(1, "16:20"),
      })
      // L'Express part une demi-heure plus tôt ; l'Omnibus ne change pas.
      await copierHoraires(id, (h) => (h.trainType === "EXPRESS" ? avancer(h.departureTime, 30) : h.departureTime))
      await journaliser(ctx, {
        acteur: admin._id,
        action: "livret.creer",
        table: "timetableBooklets",
        id,
        a: ilYa(6, "11:05"),
        apres: { validFrom, validUntil },
        manifeste: true,
      })
      for (const h of horaires) {
        await journaliser(ctx, {
          acteur: admin._id,
          action: "livret.horaire.ajouter",
          table: "timetableBooklets",
          id,
          a: ilYa(6, "11:20"),
          apres: { trainNumber: h.trainNumber, arrets: h.stops.length },
        })
      }
      await journaliser(ctx, {
        acteur: admin._id,
        action: "livret.soumettre",
        table: "timetableBooklets",
        id,
        a: ilYa(1, "16:20"),
        avant: { status: "brouillon" },
        apres: { status: "a_valider" },
      })
      compter("livrets")
    }

    if (!livrets.some((l) => l.description === DESCRIPTION_LIVRET_BROUILLON)) {
      const validFrom = fromServiceDate(addDays(aujourdhui, 45), "00:00")
      const id = await ctx.db.insert("timetableBooklets", {
        label: "Renfort du week-end — projet",
        description: DESCRIPTION_LIVRET_BROUILLON,
        validFrom,
        validUntil: validFrom + 42 * 86_400_000,
        status: "brouillon",
        createdBy: admin._id,
      })
      const omnibus = horaires.find((h) => h.trainType === "OMNIBUS") ?? horaires[0]!
      await ctx.db.insert("bookletSchedules", {
        bookletId: id,
        trainId: omnibus.trainId,
        trainNumber: omnibus.trainNumber,
        trainType: omnibus.trainType,
        departureTime: "06:15",
        daysOfWeek: [5, 0],
        stops: omnibus.stops.map((s) => ({ ...s })),
      })
      await journaliser(ctx, {
        acteur: admin._id,
        action: "livret.creer",
        table: "timetableBooklets",
        id,
        a: ilYa(2, "14:45"),
        apres: { validFrom },
        manifeste: true,
      })
      compter("livrets")
    }

    /* ── Grille tarifaire soumise ─────────────────────────────────────── */
    const grilles = await ctx.db.query("fareSchedules").collect()
    if (!grilles.some((g) => g.label.startsWith(LIBELLE_GRILLE_A_VALIDER))) {
      const validFrom = grille.validUntil + 1
      const id = await ctx.db.insert("fareSchedules", {
        label: `${LIBELLE_GRILLE_A_VALIDER} au ${fmt(validFrom)}`,
        status: "a_valider",
        validFrom,
        validUntil: validFrom + 365 * 86_400_000,
        roundingBasis: grille.roundingBasis,
        vatPct: grille.vatPct,
        cssPct: grille.cssPct,
        createdBy: admin._id,
        submittedBy: admin._id,
        submittedAt: ilYa(2, "17:10"),
      })
      for (const base of await ctx.db
        .query("fareBases")
        .withIndex("by_schedule", (q) => q.eq("scheduleId", grille._id))
        .collect()) {
        await ctx.db.insert("fareBases", {
          scheduleId: id,
          trainType: base.trainType,
          serviceClass: base.serviceClass,
          shortDistanceRate: Math.round(base.shortDistanceRate * 104) / 100,
          longDistanceRate: Math.round(base.longDistanceRate * 104) / 100,
        })
      }
      for (const remise of await ctx.db
        .query("discounts")
        .withIndex("by_schedule", (q) => q.eq("scheduleId", grille._id))
        .collect()) {
        const { _id, _creationTime, scheduleId, ...champs } = remise
        void _id
        void _creationTime
        void scheduleId
        await ctx.db.insert("discounts", { ...champs, scheduleId: id })
      }
      await journaliser(ctx, {
        acteur: admin._id,
        action: "tarif.grille.creer",
        table: "fareSchedules",
        id,
        a: ilYa(4, "09:30"),
        apres: { indexationPct: 4, validFrom },
        manifeste: true,
      })
      await journaliser(ctx, {
        acteur: admin._id,
        action: "tarif.grille.soumettre",
        table: "fareSchedules",
        id,
        a: ilYa(2, "17:10"),
        avant: { status: "brouillon" },
        apres: { status: "a_valider" },
      })
      compter("grilles")
    }

    /* ── Rapports programmés ──────────────────────────────────────────── */
    const programmes = await ctx.db.query("reportSchedules").collect()
    for (const r of RAPPORTS) {
      if (programmes.some((p) => p.label === r.label)) continue
      const id = await ctx.db.insert("reportSchedules", {
        label: r.label,
        reportType: r.type,
        frequency: r.frequence,
        format: r.format,
        recipients: [...r.destinataires],
        nextRunAt: prochaineExecution(r.frequence, aujourdhui),
        isActive: true,
        createdBy: chefDeVente(personnel)._id,
        createdAt: ilYa(args.jours + 10, "15:00"),
        updatedAt: ilYa(args.jours + 10, "15:00"),
      })
      // Comme `reportSchedules.create` : la prochaine exécution est planifiée.
      await ctx.scheduler.runAt(prochaineExecution(r.frequence, aujourdhui), internal.functions.reportSchedules.run, {
        scheduleId: id,
      })
      await journaliser(ctx, {
        acteur: chefDeVente(personnel)._id,
        action: "rapport.programmer",
        table: "reportSchedules",
        id,
        a: ilYa(args.jours + 10, "15:00"),
        apres: { label: r.label, frequency: r.frequence, format: r.format },
        manifeste: true,
      })
      compter("rapportsProgrammes")
    }

    const flux = [
      ...GARES_GUICHET.map(codePointDeVenteGare).filter((c) => personnel.pointsDeVente.get(c)?.isActive),
      ...AGENCES.map((a) => a.code),
      FLUX_LIGNE,
    ]

    return {
      aujourdhui,
      debut,
      dates,
      flux,
      creations: JSON.stringify(creations),
      livretEchu: echu._id,
    }
  },
})

function avancer(heure: string, minutes: number): string {
  const [h, m] = heure.split(":").map(Number) as [number, number]
  const total = (h * 60 + m - minutes + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

/* ════════════════════════════════ Offre ═══════════════════════════════════════ */

export const datesSansDesserte = internalQuery({
  args: { du: v.string(), au: v.string() },
  handler: async (ctx, args) => {
    const trips = await ctx.db
      .query("trips")
      .withIndex("by_service_date", (q) => q.gte("serviceDate", args.du).lte("serviceDate", args.au))
      .collect()
    const actif = (await ctx.db.query("timetableBooklets").withIndex("by_status", (q) => q.eq("status", "actif")).collect())
      .sort((a, b) => b.validFrom - a.validFrom)[0]
    if (!actif) return []
    const horaires = await ctx.db
      .query("bookletSchedules")
      .withIndex("by_booklet", (q) => q.eq("bookletId", actif._id))
      .collect()
    const manquantes: string[] = []
    for (let date = args.du; date <= args.au; date = addDays(date, 1)) {
      const jour = new Date(fromServiceDate(date, "12:00")).getUTCDay()
      const attendus = horaires.filter((h) => h.daysOfWeek.length === 0 || h.daysOfWeek.includes(jour))
      const presents = trips.filter((t) => t.serviceDate === date)
      if (attendus.some((h) => !presents.some((t) => t.trainId === h.trainId))) manquantes.push(date)
    }
    return manquantes
  },
})

/**
 * Engendre les dessertes manquantes d'une journée par `trips.generateOne`.
 *
 * Avant l'entrée en vigueur du livret actif, les dessertes relèvent du livret
 * échu : on le rouvre le temps de la génération, dans la même transaction —
 * `generateOne` refuse un livret qui n'est pas actif, et personne ne voit
 * l'état intermédiaire.
 */
export const assurerDessertes = internalMutation({
  args: { date: v.string(), maintenant: v.number() },
  handler: async (ctx, args) => {
    const actif = (await ctx.db.query("timetableBooklets").withIndex("by_status", (q) => q.eq("status", "actif")).collect())
      .sort((a, b) => b.validFrom - a.validFrom)[0]
    if (!actif) return { dessertesCreees: 0 }
    const echu = (await ctx.db.query("timetableBooklets").collect()).find(
      (l) => l.description === DESCRIPTION_LIVRET_ECHU
    )
    const avantLivret = fromServiceDate(args.date, "23:59") < actif.validFrom
    const livret = avantLivret && echu ? echu : actif
    const horaires = await ctx.db
      .query("bookletSchedules")
      .withIndex("by_booklet", (q) => q.eq("bookletId", livret._id))
      .collect()
    const jour = new Date(fromServiceDate(args.date, "12:00")).getUTCDay()

    let creees = 0
    for (const h of horaires) {
      if (h.daysOfWeek.length > 0 && !h.daysOfWeek.includes(jour)) continue
      const existantes = await ctx.db
        .query("trips")
        .withIndex("by_train_date", (q) => q.eq("trainId", h.trainId).eq("serviceDate", args.date))
        .collect()
      if (existantes.length > 0) continue

      if (livret._id !== actif._id) await ctx.db.patch(livret._id, { status: "actif" })
      const r = await ctx.runMutation(internal.functions.trips.generateOne, {
        scheduleId: h._id,
        serviceDate: args.date,
      })
      if (livret._id !== actif._id) await ctx.db.patch(livret._id, { status: "expire" })
      await assurerContingents(ctx, r.tripId as Id<"trips">)
      creees += 1
    }
    return { dessertesCreees: creees }
  },
})

/** Contingents de yield d'une desserte, comme `seeds/demo`. */
async function assurerContingents(ctx: MutationCtx, tripId: Id<"trips">) {
  const counters = await ctx.db
    .query("segmentCounters")
    .withIndex("by_trip_class", (q) => q.eq("tripId", tripId))
    .collect()
  for (const serviceClass of new Set(counters.map((c) => c.serviceClass))) {
    const existants = await ctx.db
      .query("fareClassQuotas")
      .withIndex("by_trip_class", (q) => q.eq("tripId", tripId).eq("serviceClass", serviceClass))
      .first()
    if (existants) continue
    const capacite = counters.find((c) => c.serviceClass === serviceClass)?.capacity ?? 0
    for (const [label, part, coefficient, priority] of [
      ["Bas prix", 0.2, 0.8, 1],
      ["Standard", 0.55, 1, 2],
      ["Flexible", 0.25, 1.35, 3],
    ] as const) {
      await ctx.db.insert("fareClassQuotas", {
        tripId,
        serviceClass,
        label,
        priority,
        seatCount: Math.max(1, Math.round(capacite * part)),
        soldCount: 0,
        coefficient,
        isActive: true,
      })
    }
  }
}

/* ═════════════════════════ Exploitation avant les ventes ══════════════════════ */

/**
 * Blocages de places, quotas d'agences et règle de yield à l'essai sur les
 * dessertes des jours à venir. Posés avant les ventes, comme en exploitation :
 * un blocage retire la place avant qu'elle ne soit vendue.
 */
export const exploitation = internalMutation({
  args: argsCommuns,
  handler: async (ctx, args) => {
    const aujourdhui = toServiceDate(args.maintenant)
    const personnel = await chargerPersonnel(ctx)
    const { plans, parCle } = await chargerDessertes(ctx, addDays(aujourdhui, 1), addDays(aujourdhui, 10), args.maintenant)
    const inventaire = new Inventaire(ctx)
    const compte = { blocages: 0, quotasAgences: 0, reglesPilotes: 0 }
    const descendant = (jour: number) => plans.find((p) => p.serviceDate === addDays(aujourdhui, jour) && p.arrets[0]?.code === "OWE")
    const montant = (jour: number) => plans.find((p) => p.serviceDate === addDays(aujourdhui, jour) && p.arrets[0]?.code === "FCV")

    /* ── Blocages ─────────────────────────────────────────────────────── */
    const blocages: Array<{
      desserte?: DessertePlan
      classe: "DEUXIEME" | "PREMIERE" | "VIP"
      places: number
      de?: string
      a?: string
      reason: Doc<"seatBlocks">["reason"]
      comment: string
      auteur: Doc<"users">
      ilYa: number
      liberation?: { ilYa: number; note: string }
    }> = [
      {
        desserte: descendant(3),
        classe: "VIP",
        places: 4,
        reason: "protocole",
        comment: "Délégation du ministère des Transports — visite des chantiers du PRN",
        auteur: chefDeGare(personnel, "OWE-PV"),
        ilYa: 4,
      },
      {
        desserte: montant(1),
        classe: "DEUXIEME",
        places: 1,
        reason: "maintenance",
        comment: "Siège déchiré, housse à remplacer à l'atelier d'Owendo",
        auteur: chefDeGare(personnel, "FCV-PV"),
        ilYa: 2,
      },
      {
        desserte: montant(2),
        classe: "PREMIERE",
        places: 2,
        reason: "exploitation",
        comment: "Escorte de gendarmerie d'un convoi de fonds — places réservées",
        auteur: chefDeGare(personnel, "FCV-PV"),
        ilYa: 1,
      },
      {
        desserte: descendant(5),
        classe: "DEUXIEME",
        places: 1,
        reason: "autre",
        comment: "Voyageuse à mobilité réduite : place proche de la porte, à la demande de l'association",
        auteur: chefDeGare(personnel, "OWE-PV"),
        ilYa: 1,
      },
      {
        desserte: descendant(4),
        classe: "PREMIERE",
        places: 2,
        de: "MOA",
        a: "FCV",
        reason: "exploitation",
        comment: "Mission du contrôle des recettes Moanda–Franceville",
        auteur: recettes(personnel),
        ilYa: 3,
      },
      {
        desserte: descendant(1),
        classe: "DEUXIEME",
        places: 1,
        reason: "maintenance",
        comment: "Accoudoir cassé, réparation prévue avant le départ",
        auteur: chefDeGare(personnel, "OWE-PV"),
        ilYa: 5,
        liberation: { ilYa: 1, note: "Accoudoir réparé par l'atelier d'Owendo" },
      },
    ]

    for (const b of blocages) {
      if (!b.desserte) continue
      const trip = parCle.get(b.desserte.cle)!
      const existants = await ctx.db.query("seatBlocks").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect()
      if (existants.some((x) => x.comment === b.comment)) continue
      const de = b.de ? b.desserte.arrets.findIndex((a) => a.code === b.de) : 0
      const a = b.a ? b.desserte.arrets.findIndex((x) => x.code === b.a) : b.desserte.arrets.length - 1
      if (de < 0 || a <= de) continue
      const masque = segmentMask({ fromIndex: de, toIndex: a }, trip.segmentCount)
      const inv = await inventaire.classe(trip._id, b.classe)
      // Les places protocolaires se prennent en fin de voiture, loin des
      // premières attribuées par la vente.
      const libres = [...inv.occupations]
        .reverse()
        .filter((o) => ((o.soldMask | o.heldMask | o.blockedMask) & masque) === 0)
        .slice(0, b.places)
      const a0 = fromServiceDate(addDays(aujourdhui, -b.ilYa), "10:30")
      for (const o of libres) {
        const troncons = inv.counters.filter((c) => c.segmentIndex >= de && c.segmentIndex < a)
        if (troncons.some((c) => c.available <= 0)) break
        o.blockedMask |= masque
        inventaire.modifier(o)
        for (const c of troncons) {
          c.reserved += 1
          c.available -= 1
          inventaire.modifier(c)
        }
        const id = await ctx.db.insert("seatBlocks", {
          tripId: trip._id,
          seatId: o.seatId,
          mask: masque,
          reason: b.reason,
          comment: b.comment,
          createdBy: b.auteur._id,
          isActive: true,
        })
        await journaliser(ctx, {
          acteur: b.auteur._id,
          action: "place.bloquer",
          table: "seatBlocks",
          id,
          a: a0,
          apres: { tripId: trip._id, seatId: o.seatId, fromStopIndex: de, toStopIndex: a, reason: b.reason, comment: b.comment },
          manifeste: true,
        })
        compte.blocages += 1
        if (b.liberation) {
          o.blockedMask &= ~masque
          for (const c of troncons) {
            c.reserved -= 1
            c.available += 1
          }
          const libereA = fromServiceDate(addDays(aujourdhui, -b.liberation.ilYa), "15:10")
          await ctx.db.patch(id, { isActive: false, releasedBy: b.auteur._id, releasedAt: libereA })
          await journaliser(ctx, {
            acteur: b.auteur._id,
            action: "place.liberer",
            table: "seatBlocks",
            id,
            a: libereA,
            apres: { note: b.liberation.note },
          })
        }
      }
    }

    /* ── Quotas d'agences ─────────────────────────────────────────────── */
    for (const plan of plans) {
      const trip = parCle.get(plan.cle)!
      const gare = plan.arrets[0]?.code
      for (const agence of AGENCES.filter((x) => x.gare === gare)) {
        const pos = personnel.pointsDeVente.get(agence.code)
        if (!pos) continue
        const existants = await ctx.db
          .query("agencyQuotas")
          .withIndex("by_pos_trip", (q) => q.eq("pointOfSaleId", pos._id).eq("tripId", trip._id))
          .collect()
        if (existants.length > 0) continue
        const allocations: Array<["DEUXIEME" | "PREMIERE" | "VIP", number]> =
          agence.type === "agence_premium" ? [["PREMIERE", 6], ["VIP", 2]] : [["DEUXIEME", 10], ["PREMIERE", 4]]
        for (const [serviceClass, allocated] of allocations) {
          if (!plan.capacites[serviceClass]) continue
          const id = await ctx.db.insert("agencyQuotas", {
            pointOfSaleId: pos._id,
            tripId: trip._id,
            serviceClass,
            allocated,
            sold: 0,
            isActive: true,
            createdBy: chefDeVente(personnel)._id,
            releaseAt: trip.departureAt - 48 * 3_600_000,
          })
          await journaliser(ctx, {
            acteur: chefDeVente(personnel)._id,
            action: "quota_agence.attribuer",
            table: "agencyQuotas",
            id,
            a: Math.min(args.maintenant, trip.departureAt - 12 * 86_400_000),
            apres: { pointOfSale: agence.code, tripId: trip._id, serviceClass, allocated },
            manifeste: true,
          })
          compte.quotasAgences += 1
        }
      }
    }

    /* ── Règle de yield à l'essai sur une desserte ────────────────────── */
    const pilote = descendant(7) ?? descendant(6)
    if (pilote && pilote.capacites.VIP) {
      const trip = parCle.get(pilote.cle)!
      const existante = await ctx.db.query("pricingRules").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).first()
      if (!existante) {
        const admin = administrateur(personnel)
        const [a, m, j] = trip.serviceDate.split("-")
        const id = await ctx.db.insert("pricingRules", {
          scope: "desserte",
          tripId: trip._id,
          serviceClass: "VIP",
          type: "promotion",
          modifierPct: -20,
          priority: 45,
          validFrom: fromServiceDate(addDays(aujourdhui, -1), "08:00"),
          validUntil: trip.departureAt,
          floorXaf: 2_000,
          capXaf: 150_000,
          code: "essai-vip",
          label: `Essai : VIP à −20 % sur l'Express du ${j}/${m}/${a}`,
          isActive: true,
          createdBy: admin._id,
        })
        await journaliser(ctx, {
          acteur: admin._id,
          action: "yield.regle.creer",
          table: "pricingRules",
          id,
          a: fromServiceDate(addDays(aujourdhui, -1), "08:00"),
          apres: { scope: "desserte", tripId: trip._id, modifierPct: -20, essai: true },
          manifeste: true,
        })
        compte.reglesPilotes += 1
      }
    }

    await inventaire.enregistrer()
    return compte
  },
})

/* ═══════════════════════════ Journées et caisses ═════════════════════════════ */

export const ouvrirJournee = internalMutation({
  args: { ...argsCommuns, date: v.string() },
  handler: async (ctx, args) => {
    const personnel = await chargerPersonnel(ctx)
    const compte = { journees: 0, sessions: 0, connexions: 0, caissesArretees: 0 }
    const rec = recettes(personnel)

    let jour = await journee(ctx, args.date)
    if (!jour) {
      const openedAt = fromServiceDate(args.date, "05:30")
      const id = await ctx.db.insert("accountingDays", {
        date: args.date,
        status: "ouverte",
        openedAt,
        totalTtc: 0,
        totalReceived: 0,
      })
      await journaliser(ctx, {
        acteur: rec._id,
        action: "journee.ouvrir",
        table: "accountingDays",
        id,
        a: openedAt,
        apres: { date: args.date },
        manifeste: true,
      })
      jour = (await ctx.db.get(id))!
      compte.journees += 1
    }

    /**
     * Caisse restée ouverte un jour antérieur à la veille : abandonnée (un
     * essai, une démonstration interrompue). Elle est arrêtée à l'attendu à
     * 19 h 30 le jour de son ouverture — sans quoi la vente au guichet
     * continuerait de s'y rattacher. Le reset la rouvre.
     */
    const veille = addDays(toServiceDate(args.maintenant), -1)
    const arreterCaissesAbandonnees = async (vendeur: Doc<"users">) => {
      const ouvertes = await ctx.db
        .query("cashSessions")
        .withIndex("by_seller", (q) => q.eq("sellerId", vendeur._id))
        .filter((q) => q.eq(q.field("status"), "ouverte"))
        .collect()
      for (const session of ouvertes) {
        const jourSession = toServiceDate(session.openedAt)
        if (jourSession >= veille || jourSession >= args.date) continue
        const ventes = await ctx.db.query("sales").withIndex("by_cash_session", (q) => q.eq("cashSessionId", session._id)).collect()
        const attendu = attenduParMoyen(ventes)
        const closedAt = Math.max(session.openedAt + 60_000, fromServiceDate(jourSession, "19:30"))
        await ctx.db.patch(session._id, {
          closedAt,
          expectedByMethod: attendu.length > 0 ? attendu : [{ method: "especes", amountXaf: 0 }],
          countedByMethod: attendu,
          varianceXaf: 0,
          status: "cloturee",
        })
        await journaliser(ctx, {
          acteur: rec._id,
          action: "caisse.cloturer",
          table: "cashSessions",
          id: session._id,
          a: closedAt,
          avant: { status: "ouverte", closedAt: null, expectedByMethod: session.expectedByMethod },
          apres: { varianceXaf: 0, note: "Caisse abandonnée, arrêtée à l'attendu par le contrôle des recettes" },
          manifeste: true,
        })
        compte.caissesArretees += 1
      }
    }

    const ouvrir = async (input: {
      vendeur: Doc<"users">
      pos: Doc<"pointsOfSale">
      role: "vendeur" | "controleur"
      ouverture: number
      cloture: number
      appareil: string
    }) => {
      if (input.ouverture > args.maintenant) return
      await arreterCaissesAbandonnees(input.vendeur)
      const existantes = await ctx.db
        .query("cashSessions")
        .withIndex("by_seller", (q) => q.eq("sellerId", input.vendeur._id))
        .collect()
      if (existantes.some((s) => s.accountingDayId === jour!._id && s.openedAt === input.ouverture)) return
      if (existantes.some((s) => s.accountingDayId === jour!._id && s.pointOfSaleId === input.pos._id && input.role === "vendeur")) return
      // Un vendeur n'a jamais deux caisses ouvertes en même temps : une caisse
      // déjà ouverte (par la démonstration en cours, par exemple) tient lieu
      // de caisse pour la période qu'elle couvre.
      const fin = input.cloture <= args.maintenant ? input.cloture : Number.POSITIVE_INFINITY
      if (existantes.some((s) => s.openedAt < fin && (s.closedAt ?? Number.POSITIVE_INFINITY) > input.ouverture)) return

      const rng = tirage(MARQUEUR, "session", args.date, input.vendeur.matricule ?? input.vendeur._id, input.ouverture)
      const fonds = fondsDeCaisse(input.pos.code, input.role === "controleur" ? "controleur_train" : "vendeur_guichet")
      const id = await ctx.db.insert("cashSessions", {
        sellerId: input.vendeur._id,
        pointOfSaleId: input.pos._id,
        accountingDayId: jour!._id,
        openedAt: input.ouverture,
        // Une caisse ouverte n'a pas encore d'heure de clôture.
        closedAt: input.cloture <= args.maintenant ? input.cloture : undefined,
        openingFloatXaf: fonds,
        openingBreakdown: billetage(fonds, rng),
        expectedByMethod: [],
        status: input.cloture <= args.maintenant ? "cloturee" : "ouverte",
      })
      if (rng() < 0.03) {
        await journaliser(ctx, {
          acteur: input.vendeur._id,
          action: "auth.connexion",
          table: "users",
          id: input.vendeur._id,
          a: input.ouverture - 7 * 60_000,
          resultat: "refus",
          raison: "Mot de passe erroné",
          appareil: input.appareil,
        })
      }
      await journaliser(ctx, {
        acteur: input.vendeur._id,
        action: "auth.connexion",
        table: "users",
        id: input.vendeur._id,
        a: input.ouverture - 4 * 60_000,
        appareil: input.appareil,
      })
      await journaliser(ctx, {
        acteur: input.vendeur._id,
        action: "caisse.ouvrir",
        table: "cashSessions",
        id,
        a: input.ouverture,
        apres: { openingFloatXaf: fonds },
        appareil: input.appareil,
        manifeste: true,
      })
      compte.sessions += 1
      compte.connexions += 1
    }

    for (const code of [...GARES_GUICHET.map(codePointDeVenteGare), ...AGENCES.map((a) => a.code)]) {
      const pos = personnel.pointsDeVente.get(code)
      if (!pos?.isActive) continue
      const agence = code.startsWith("AG")
      for (const [rang, vendeur] of vendeursDuJour(personnel, code, args.date).entries()) {
        await ouvrir({
          vendeur,
          pos,
          role: "vendeur",
          ...horairesVendeur(args.date, vendeur, agence),
          appareil: agence ? `AGC-${code}-01` : `GUI-${code.slice(0, 3)}-${String(rang + 1).padStart(2, "0")}`,
        })
      }
    }

    // Contrôleurs : une caisse embarquée par desserte assurée.
    const trips = await ctx.db
      .query("trips")
      .withIndex("by_service_date", (q) => q.eq("serviceDate", args.date))
      .collect()
    for (const trip of trips) {
      const origine = await ctx.db.get(trip.originStationId)
      if (!origine) continue
      const supprimee =
        origine.code === "FCV" &&
        args.date === toServiceDate(args.maintenant) &&
        args.maintenant >= instantSuppression(args.date)
      if (supprimee) continue
      const controleur = controleurDeDesserte(personnel, origine.code, args.date)
      const pos = personnel.pointsDeVente.get(codePointDeVenteGare(origine.code))
      if (!controleur || !pos) continue
      const retard = retardEffectif(trip, origine.code, args.maintenant)
      await ouvrir({
        vendeur: controleur,
        pos,
        role: "controleur",
        ...horairesControleur(trip, retard),
        appareil: `TPC-${controleur.matricule}`,
      })
    }
    return compte
  },
})

/** Heures de prise et de fin de service d'un vendeur, stables d'un rejeu à l'autre. */
function horairesVendeur(date: string, vendeur: Doc<"users">, agence: boolean) {
  const rng = tirage(MARQUEUR, "horaires", date, vendeur.matricule ?? vendeur._id)
  return {
    ouverture: fromServiceDate(date, agence ? "07:48" : "05:40") + entier(rng, 0, agence ? 10 : 20) * 60_000,
    cloture: fromServiceDate(date, agence ? "18:05" : "19:00") + entier(rng, 0, 25) * 60_000,
  }
}

/** Caisse embarquée : du départ moins 40 minutes à l'arrivée plus 25 minutes. */
function horairesControleur(trip: Doc<"trips">, retard: number) {
  return {
    ouverture: trip.departureAt - 40 * 60_000,
    cloture: trip.arrivalAt + (retard + 25) * 60_000,
  }
}

/** Retard retenu pour une desserte : constaté si elle est passée, annoncé le jour même. */
function retardEffectif(trip: Doc<"trips">, origine: string, maintenant: number): number {
  const aujourdhui = toServiceDate(maintenant)
  if (trip.serviceDate === aujourdhui && origine === "OWE" && maintenant >= instantDeraillement(aujourdhui)) {
    return RETARD_DU_JOUR_MINUTES
  }
  if (trip.serviceDate < aujourdhui) return retardDesserte(`${trip.serviceDate}|${trip.trainNumber}`)
  return 0
}

/* ═════════════════════════════════ Ventes ═════════════════════════════════════ */

type Evenement =
  | { type: "vente"; t: number; cle: string; vente: VentePlanifiee }
  | { type: "annulation"; t: number; cle: string; vente: VentePlanifiee }
  | { type: "remboursement"; t: number; cle: string; vente: VentePlanifiee }
  | { type: "duplicata"; t: number; cle: string; vente: VentePlanifiee }
  | { type: "colis"; t: number; cle: string; colis: ColisPlanifie }
  | { type: "funeraire"; t: number; cle: string; funeraire: FunerairePlanifie }

/**
 * Événements d'un flux de numérotation pour une journée, dans l'ordre
 * chronologique : la numérotation continue suit ainsi l'heure de l'opération,
 * comme au guichet.
 */
function evenementsDuFlux(
  plans: readonly DessertePlan[],
  cadre: ReturnType<typeof cadreDuPlan>,
  date: string,
  flux: string,
  maintenant: number
): Evenement[] {
  const evenements: Evenement[] = []
  const garde = (t: number) => t <= maintenant && toServiceDate(t) === date
  for (const plan of plans) {
    for (const vente of planifierDesserte(plan, cadre)) {
      if (vente.flux !== flux) continue
      if (vente.jour === date && vente.venteA <= maintenant) {
        evenements.push({ type: "vente", t: vente.venteA, cle: vente.cle, vente })
      }
      if (vente.annulation && garde(vente.annulation.a)) {
        evenements.push({ type: "annulation", t: vente.annulation.a, cle: `${vente.cle}|X`, vente })
      }
      if (vente.remboursement && garde(vente.remboursement.a)) {
        evenements.push({ type: "remboursement", t: vente.remboursement.a, cle: `${vente.cle}|R`, vente })
      }
      if (vente.duplicata && garde(vente.duplicata.a)) {
        evenements.push({ type: "duplicata", t: vente.duplicata.a, cle: `${vente.cle}|D`, vente })
      }
    }
  }
  const gare = flux.endsWith("-PV") ? flux.slice(0, 3) : undefined
  if (gare && (GARES_GUICHET as readonly string[]).includes(gare)) {
    for (const colis of planifierColis(gare, date, cadre.echelle)) {
      if (colis.venteA <= maintenant) evenements.push({ type: "colis", t: colis.venteA, cle: colis.cle, colis })
    }
    if (gare === "OWE") {
      const funeraire = planifierFuneraire(date)
      if (funeraire && funeraire.venteA <= maintenant) {
        evenements.push({ type: "funeraire", t: funeraire.venteA, cle: funeraire.cle, funeraire })
      }
    }
  }
  return evenements.sort((a, b) => a.t - b.t || a.cle.localeCompare(b.cle))
}

interface ContexteLot {
  ctx: MutationCtx
  date: string
  maintenant: number
  personnel: Personnel
  tarif: Tarification
  jour: Doc<"accountingDays">
  sessions: Doc<"cashSessions">[]
  plans: Map<string, DessertePlan>
  trips: Map<string, Doc<"trips">>
  stations: Map<string, Doc<"stations">>
  inventaire: Inventaire
  sequences: Sequences
  compteClient: Doc<"corporateAccounts"> | null
  voyageursDemo: Array<Doc<"users"> | null>
  grilleAnnexe: AncillaryFareRow[]
  compte: Record<string, number>
}

export const vendreLot = internalMutation({
  args: { ...argsCommuns, date: v.string(), flux: v.string(), lot: v.number() },
  handler: async (ctx, args) => {
    const personnel = await chargerPersonnel(ctx)
    const tarif = await chargerTarification(ctx)
    const compteClient = await ctx.db
      .query("corporateAccounts")
      .withIndex("by_code", (q) => q.eq("code", "CC-COMILOG"))
      .unique()
    const cadre = cadreDuPlan(args.debut, args.echelle, personnel, compteClient?.isActive === true)
    const { plans, parCle } = await chargerDessertes(ctx, args.date, addDays(args.date, args.joursAvance), args.maintenant)
    const evenements = evenementsDuFlux(plans, cadre, args.date, args.flux, args.maintenant)
    const tranche = evenements.slice(args.lot * TAILLE_LOT, (args.lot + 1) * TAILLE_LOT)
    const compte: Record<string, number> = {}
    const termine = (args.lot + 1) * TAILLE_LOT >= evenements.length
    if (tranche.length === 0) return { termine: true, compte }

    const jour = await journee(ctx, args.date)
    if (!jour) throw new Error(`Journée comptable du ${args.date} absente : ouvrirJournee d'abord.`)

    const l: ContexteLot = {
      ctx,
      date: args.date,
      maintenant: args.maintenant,
      personnel,
      tarif,
      jour,
      sessions: await sessionsUtilisables(ctx, jour._id),
      plans: new Map(plans.map((p) => [p.cle, p])),
      trips: parCle,
      stations: new Map((await ctx.db.query("stations").collect()).map((s) => [s.code, s])),
      inventaire: new Inventaire(ctx),
      sequences: new Sequences(ctx),
      compteClient,
      voyageursDemo: await Promise.all(
        ["demo-voyageur", "demo-voyageur-2"].map((authId) =>
          ctx.db.query("users").withIndex("by_authId", (q) => q.eq("authId", authId)).unique()
        )
      ),
      grilleAnnexe: tarif.ancillary.map((r) => ({
        product: r.product as AncillaryFareRow["product"],
        zone: r.zone,
        weightTier: r.weightTier,
        amountHt: r.amountHt,
        franchiseKg: r.franchiseKg,
        label: r.label,
        isProvisional: r.isProvisional,
      })),
      compte,
    }
    const ajouter = (cle: string, n = 1) => (compte[cle] = (compte[cle] ?? 0) + n)

    for (const e of tranche) {
      const deja = await venteExistante(ctx, e.cle)
      if (deja && e.type !== "duplicata") continue
      switch (e.type) {
        case "vente":
          ajouter((await vendreBillets(l, e.vente)) ? "ventesBillets" : "ventesIgnorees")
          break
        case "annulation":
          if (await annuler(l, e.vente, e.t)) ajouter("annulations")
          break
        case "remboursement":
          if (await rembourser(l, e.vente, e.t)) ajouter("remboursements")
          break
        case "duplicata":
          if (await dupliquer(l, e.vente, e.t)) ajouter("duplicatas")
          break
        case "colis":
          if (await vendreColis(l, e.colis)) ajouter("colis")
          break
        case "funeraire":
          if (await vendreFuneraire(l, e.funeraire)) ajouter("transportsFuneraires")
          break
      }
    }

    await l.inventaire.enregistrer()
    await l.sequences.enregistrer()
    return { termine, compte }
  },
})

/**
 * Caisses où peut tomber une opération du jour : celles de la journée, et
 * celles encore ouvertes depuis la veille (une caisse ouverte en fin de
 * journée sert encore le lendemain matin, comme au guichet).
 */
async function sessionsUtilisables(ctx: MutationCtx, accountingDayId: Id<"accountingDays">) {
  const duJour = await ctx.db.query("cashSessions").withIndex("by_day", (q) => q.eq("accountingDayId", accountingDayId)).collect()
  const ouvertes = await ctx.db.query("cashSessions").withIndex("by_status", (q) => q.eq("status", "ouverte")).collect()
  const ids = new Set(duJour.map((s) => s._id))
  return [...duJour, ...ouvertes.filter((s) => !ids.has(s._id))]
}

/* ─────────────────────────── Vendeurs et règlements ─────────────────────────── */

function vendeurPour(
  l: ContexteLot,
  flux: string,
  a: number,
  rang: number
): { vendeur: Doc<"users">; session: Doc<"cashSessions">; appareil: string } | null {
  const pos = l.personnel.pointsDeVente.get(flux)
  if (!pos) return null
  const equipe = vendeursDuJour(l.personnel, flux, l.date)
  const candidats = equipe.flatMap((vendeur, i) => {
    const session = sessionCouvrant(
      l.sessions.filter((s) => s.sellerId === vendeur._id && s.pointOfSaleId === pos._id),
      a
    )
    const appareil = flux.startsWith("AG") ? `AGC-${flux}-01` : `GUI-${flux.slice(0, 3)}-${String(i + 1).padStart(2, "0")}`
    return session ? [{ vendeur, session, appareil }] : []
  })
  return candidats.length > 0 ? candidats[rang % candidats.length]! : null
}

function controleurPour(
  l: ContexteLot,
  plan: DessertePlan,
  a: number
): { vendeur: Doc<"users">; session: Doc<"cashSessions">; appareil: string } | null {
  const controleur = controleurDeDesserte(l.personnel, plan.arrets[0]!.code, plan.serviceDate)
  if (!controleur) return null
  const session = sessionCouvrant(l.sessions.filter((s) => s.sellerId === controleur._id), a)
  return session ? { vendeur: controleur, session, appareil: `TPC-${controleur.matricule}` } : null
}

/**
 * Ligne de paiement au format de `lib/reglement.enregistrerReglement`, ou de
 * la confirmation d'une réservation en ligne (`bookings`).
 */
async function payer(
  l: ContexteLot,
  input: {
    saleId: Id<"sales">
    moyen: Moyen
    ttc: number
    a: number
    rng: Rng
    enLigne: boolean
    agent?: Id<"users">
    telephone?: string
  }
): Promise<void> {
  const { rng, moyen, ttc, a } = input
  const date = toServiceDate(a).replaceAll("-", "").slice(2)
  const base = {
    saleId: input.saleId,
    method: moyen,
    status: "confirme" as const,
    amountXaf: ttc,
    requestedBy: input.agent,
    settledAt: a,
  }
  if (moyen === "especes") {
    const coupures = [500, 1_000, 2_000, 5_000, 10_000]
    const pas = choisir(rng, coupures.filter((c) => c <= Math.max(ttc, 500)))
    const remis = rng() < 0.3 ? ttc : Math.ceil(ttc / pas) * pas
    await l.ctx.db.insert("payments", {
      ...base,
      provider: "guichet",
      tenderedXaf: remis,
      changeXaf: remis - ttc,
    })
    return
  }
  if (moyen === "airtel_money" || moyen === "moov_money") {
    const reference = `${moyen === "airtel_money" ? "MP" : "MV"}${date}.${String(entier(rng, 0, 2359)).padStart(4, "0")}.${String.fromCharCode(65 + entier(rng, 0, 25))}${entier(rng, 10_000, 99_999)}`
    await l.ctx.db.insert("payments", {
      ...base,
      provider: input.enLigne ? "simule" : "simulation",
      payerPhone: input.telephone ?? telephone(rng, moyen === "airtel_money" ? "airtel" : "moov"),
      providerReference: reference,
      reference,
    })
    return
  }
  if (moyen === "en_compte") {
    await l.ctx.db.insert("payments", {
      ...base,
      provider: "compte_client",
      reference: `BC-COMILOG-${toServiceDate(a).slice(0, 4)}-${entier(rng, 1000, 9999)}`,
    })
    return
  }
  await l.ctx.db.insert("payments", {
    ...base,
    provider: input.enLigne ? "simule" : "tpe",
    reference: input.enLigne
      ? `WEB-${date}-${entier(rng, 100_000, 999_999)}`
      : `TPE ${entier(rng, 100_000, 999_999)} · autorisation ${entier(rng, 0x100000, 0xffffff).toString(16).toUpperCase()}`,
  })
}

/* ─────────────────────────────────── Billets ─────────────────────────────────── */

async function vendreBillets(l: ContexteLot, vente: VentePlanifiee): Promise<boolean> {
  const { ctx } = l
  const plan = l.plans.get(vente.desserte)
  const trip = l.trips.get(vente.desserte)
  if (!plan || !trip) return false
  const rng = tirage(MARQUEUR, "ecriture", vente.cle)

  // Qui vend.
  let vendeur: ReturnType<typeof vendeurPour> = null
  if (vente.canal === "bord") vendeur = controleurPour(l, plan, vente.venteA)
  else if (vente.canal !== "ligne") vendeur = vendeurPour(l, vente.flux, vente.venteA, vente.vendeur)
  if (vente.canal !== "ligne" && !vendeur) return false
  const pos = vendeur ? l.personnel.pointsDeVenteParId.get(vendeur.session.pointOfSaleId) : undefined

  // Places.
  const n = vente.voyageurs.length
  const inv = await l.inventaire.classe(trip._id, vente.classe)
  const places = l.inventaire.attribuer(inv, trip, vente.de, vente.a, n)
  if (!places) return false

  // Prix.
  const distanceKm = Math.abs(plan.arrets[vente.a]!.km - plan.arrets[vente.de]!.km)
  const charge = l.inventaire.charge(inv, vente.de, vente.a)
  const prix = vente.voyageurs.map((voyageur) =>
    prixBillet({
      tarif: l.tarif,
      trip,
      classe: vente.classe,
      distanceKm,
      reduction: voyageur.discountCode,
      quotas: inv.quotas,
      effectif: n,
      capacite: charge.capacite,
      vendus: charge.vendus,
      canal: vente.canal,
      a: vente.venteA,
    })
  )
  const { vatPct, cssPct } = l.tarif.schedule
  const montants = prix.map((p) => buildAmounts(p.unitaire, vatPct, cssPct, p.unitaire))
  const total = sumAmounts(montants)
  const moyen: Moyen = vente.moyen === "en_compte" && !l.compteClient ? "especes" : vente.moyen

  const code = pos?.code ?? FLUX_LIGNE
  const numero = await l.sequences.numero("vente", code, l.date)
  const client = vente.client !== undefined ? l.voyageursDemo[vente.client] ?? undefined : undefined
  const saleId = await ctx.db.insert("sales", {
    number: numero,
    kind: "vente",
    product: "billet",
    channel: vente.canal,
    status: "confirmee",
    pointOfSaleId: pos?._id,
    sellerId: vendeur?.vendeur._id,
    deviceId: vendeur?.appareil,
    customerId: client?._id,
    corporateAccountId: moyen === "en_compte" ? l.compteClient?._id : undefined,
    contactPhone: vente.contact?.phone,
    contactEmail: vente.contact?.email,
    amounts: total,
    paymentMethod: moyen,
    accountingDayId: l.jour._id,
    cashSessionId: vendeur?.session._id,
    cgvVersion: vente.canal === "ligne" ? CURRENT_CGV_VERSION : undefined,
    cgvAcceptedAt: vente.canal === "ligne" ? vente.venteA : undefined,
    clientSaleId: cleClient(vente.cle),
    soldAt: vente.venteA,
  })

  const origine = l.stations.get(plan.arrets[vente.de]!.code)!
  const destination = l.stations.get(plan.arrets[vente.a]!.code)!
  const ticketIds: Id<"tickets">[] = []
  for (const [i, voyageur] of vente.voyageurs.entries()) {
    const number = await l.sequences.numero("billet", code, l.date)
    const { seat, coach } = await l.inventaire.siege(trip.trainId, places[i]!.seatId)
    const signe = signTicket({
      v: PAYLOAD_VERSION,
      k: CURRENT_KEY_VERSION,
      kind: "billet",
      ref: number,
      trip: trip._id,
      date: trip.serviceDate,
      cls: vente.classe,
      from: vente.de,
      to: vente.a,
      seat: seat?.label,
      exp: expiryFromArrival(trip.arrivalAt),
    })
    const { discountCode, ...identite } = voyageur
    void discountCode
    ticketIds.push(
      await ctx.db.insert("tickets", {
        saleId,
        number,
        tripId: trip._id,
        passenger: identite,
        originStationId: origine._id,
        destinationStationId: destination._id,
        fromStopIndex: vente.de,
        toStopIndex: vente.a,
        serviceClass: vente.classe,
        seatId: places[i]!.seatId,
        seatLabel: seat?.label,
        coachLabel: coach?.label,
        isStanding: false,
        fare: prix[i]!.fare,
        unitPriceTtc: prix[i]!.unitaire,
        status: "valide",
        barcodePayload: signe.barcode,
        barcodeSignature: signe.signatureHex,
        keyVersion: signe.keyVersion,
        duplicateCount: 0,
      })
    )
  }
  l.inventaire.occuper(inv, trip, places, vente.de, vente.a)

  await payer(l, {
    saleId,
    moyen,
    ttc: total.ttc,
    a: vente.venteA,
    rng,
    enLigne: vente.canal === "ligne",
    agent: vendeur?.vendeur._id,
    telephone: vente.contact?.phone ?? vente.voyageurs[0]?.phone,
  })
  if (moyen === "en_compte" && l.compteClient) {
    l.compteClient.outstandingXaf += total.ttc
    await ctx.db.patch(l.compteClient._id, { outstandingXaf: l.compteClient.outstandingXaf })
  }

  if (vente.canal === "ligne") {
    await journaliser(ctx, {
      acteur: client?._id,
      action: "reservation.creer",
      table: "sales",
      id: saleId,
      a: vente.venteA - entier(rng, 2, 9) * 60_000,
      apres: { number: numero, tickets: n, ttc: total.ttc, tripId: trip._id },
    })
    await journaliser(ctx, {
      acteur: client?._id,
      action: "reservation.confirmer",
      table: "sales",
      id: saleId,
      a: vente.venteA,
      apres: { reference: numero, method: moyen, ttc: total.ttc },
    })
  } else {
    await journaliser(ctx, {
      acteur: vendeur!.vendeur._id,
      action: "vente.guichet",
      table: "sales",
      id: saleId,
      a: vente.venteA,
      appareil: vendeur!.appareil,
      apres: { number: numero, tickets: n, ttc: total.ttc, tripId: trip._id },
    })
  }

  // Quota d'agence : la vente vient en déduction de l'allocation.
  if (vente.canal === "agence" && pos) {
    const quota = await ctx.db
      .query("agencyQuotas")
      .withIndex("by_pos_trip", (q) => q.eq("pointOfSaleId", pos._id).eq("tripId", trip._id))
      .collect()
    const q = quota.find((x) => x.serviceClass === vente.classe && x.isActive)
    if (q) await ctx.db.patch(q._id, { sold: Math.min(q.allocated, q.sold + n) })
  }

  if (vente.bagage && vendeur && pos) {
    await vendreBagage(l, { vente, trip, plan, ticketId: ticketIds[0]!, vendeur, pos, distanceKm, rng })
  }
  if (vente.taa && vendeur && pos) {
    await vendreTaa(l, { vente, trip, ticketId: ticketIds[0]!, vendeur, pos, distanceKm, rng, origine, destination })
  }
  l.compte.billets = (l.compte.billets ?? 0) + n
  return true
}

/** TTC réglable en coupures BEAC : le guichet encaisse des multiples de 5 XAF. */
function ttcDepuisHt(ht: number, tarif: Tarification): number {
  return Math.round(ht * (1 + tarif.schedule.vatPct / 100 + tarif.schedule.cssPct / 100))
}

async function vendreBagage(
  l: ContexteLot,
  input: {
    vente: VentePlanifiee
    trip: Doc<"trips">
    plan: DessertePlan
    ticketId: Id<"tickets">
    vendeur: { vendeur: Doc<"users">; session: Doc<"cashSessions">; appareil: string }
    pos: Doc<"pointsOfSale">
    distanceKm: number
    rng: Rng
  }
): Promise<void> {
  const bagage = input.vente.bagage!
  const termes = resolveBaggageTerms(l.grilleAnnexe, input.distanceKm)
  // On retient le poids le plus proche dont le prix se règle en coupures.
  let retenu: { poids: number; ttc: number } | null = null
  for (let ecart = 0; ecart <= 8 && !retenu; ecart += 1) {
    for (const poids of [bagage.poids - ecart, bagage.poids + ecart]) {
      if (poids < 5 || poids > 30) continue
      const fare = computeBaggageFare({
        distanceKm: input.distanceKm,
        weightKg: poids,
        franchiseKg: termes.franchiseKg,
        excessRatePerKgHt: termes.excessRatePerKgHt,
      })
      const ttc = ttcDepuisHt(fare.totalHt, l.tarif)
      if (multipleDeCinq(ttc)) {
        retenu = { poids, ttc }
        break
      }
    }
  }
  if (!retenu) return
  const a = input.vente.venteA + entier(input.rng, 2, 5) * 60_000
  const { vatPct, cssPct } = l.tarif.schedule
  const amounts = buildAmounts(retenu.ttc, vatPct, cssPct, retenu.ttc)
  const numero = await l.sequences.numero("vente", input.pos.code, l.date)
  const tag = await l.sequences.numero("bagage", input.pos.code, l.date)
  const saleId = await l.ctx.db.insert("sales", {
    number: numero,
    kind: "vente",
    product: "bagage",
    channel: "guichet",
    status: "confirmee",
    pointOfSaleId: input.pos._id,
    sellerId: input.vendeur.vendeur._id,
    deviceId: input.vendeur.appareil,
    amounts,
    paymentMethod: "especes",
    accountingDayId: l.jour._id,
    cashSessionId: input.vendeur.session._id,
    clientSaleId: cleClient(`${input.vente.cle}|G`),
    soldAt: a,
  })
  const voyageur = input.vente.voyageurs[0]!
  const origine = l.stations.get(input.plan.arrets[input.vente.de]!.code)!
  const destination = l.stations.get(input.plan.arrets[input.vente.a]!.code)!
  const baggageId = await l.ctx.db.insert("baggages", {
    saleId,
    tagNumber: tag,
    ticketId: input.ticketId,
    tripId: input.trip._id,
    originStationId: origine._id,
    destinationStationId: destination._id,
    distanceKm: input.distanceKm,
    weightKg: retenu.poids,
    senderName: `${voyageur.firstName} ${voyageur.lastName}`,
    pieceCount: bagage.pieces,
    description: bagage.description,
    amounts,
  })
  await payer(l, {
    saleId,
    moyen: "especes",
    ttc: retenu.ttc,
    a,
    rng: input.rng,
    enLigne: false,
    agent: input.vendeur.vendeur._id,
  })
  await journaliser(l.ctx, {
    acteur: input.vendeur.vendeur._id,
    action: "vente.bagage",
    table: "baggages",
    id: baggageId,
    a,
    appareil: input.vendeur.appareil,
    apres: { tagNumber: tag, weightKg: retenu.poids, ttc: retenu.ttc },
  })
  l.compte.bagages = (l.compte.bagages ?? 0) + 1
}

async function vendreTaa(
  l: ContexteLot,
  input: {
    vente: VentePlanifiee
    trip: Doc<"trips">
    ticketId: Id<"tickets">
    vendeur: { vendeur: Doc<"users">; session: Doc<"cashSessions">; appareil: string }
    pos: Doc<"pointsOfSale">
    distanceKm: number
    rng: Rng
    origine: Doc<"stations">
    destination: Doc<"stations">
  }
): Promise<void> {
  const taa = input.vente.taa!
  let retenu: { tonnage: number; ttc: number } | null = null
  for (let pas = 0; pas <= 10 && !retenu; pas += 1) {
    const tonnage = Math.round((taa.tonnage + pas * 0.05) * 100) / 100
    try {
      const fare = computeTonnageFare({ product: "taa", distanceKm: input.distanceKm, tonnage, grid: l.grilleAnnexe })
      const ttc = ttcDepuisHt(fare.totalHt, l.tarif)
      if (multipleDeCinq(ttc)) retenu = { tonnage, ttc }
    } catch {
      return
    }
  }
  if (!retenu) return
  const a = input.vente.venteA + entier(input.rng, 6, 12) * 60_000
  const { vatPct, cssPct } = l.tarif.schedule
  const amounts = buildAmounts(retenu.ttc, vatPct, cssPct, retenu.ttc)
  const numero = await l.sequences.numero("vente", input.pos.code, l.date)
  const expedition = await l.sequences.numero("taa", input.pos.code, l.date)
  const moyen: Moyen = input.vente.moyen === "en_compte" ? "especes" : input.vente.moyen
  const saleId = await l.ctx.db.insert("sales", {
    number: numero,
    kind: "vente",
    product: "taa",
    channel: "guichet",
    status: "confirmee",
    pointOfSaleId: input.pos._id,
    sellerId: input.vendeur.vendeur._id,
    deviceId: input.vendeur.appareil,
    amounts,
    paymentMethod: moyen,
    accountingDayId: l.jour._id,
    cashSessionId: input.vendeur.session._id,
    clientSaleId: cleClient(`${input.vente.cle}|A`),
    soldAt: a,
  })
  const voyageur = input.vente.voyageurs[0]!
  const id = await l.ctx.db.insert("vehicleTransports", {
    saleId,
    shipmentNumber: expedition,
    ticketId: input.ticketId,
    tripId: input.trip._id,
    originStationId: input.origine._id,
    destinationStationId: input.destination._id,
    distanceKm: input.distanceKm,
    tonnage: retenu.tonnage,
    senderName: `${voyageur.firstName} ${voyageur.lastName} — ${taa.vehicule}`,
    validFrom: a,
    validUntil: input.trip.arrivalAt + 2 * 86_400_000,
    amounts,
  })
  await payer(l, { saleId, moyen, ttc: retenu.ttc, a, rng: input.rng, enLigne: false, agent: input.vendeur.vendeur._id })
  await journaliser(l.ctx, {
    acteur: input.vendeur.vendeur._id,
    action: "vente.taa",
    table: "vehicleTransports",
    id,
    a,
    appareil: input.vendeur.appareil,
    apres: { shipmentNumber: expedition, tonnage: retenu.tonnage, ttc: retenu.ttc },
  })
  l.compte.transportsAuto = (l.compte.transportsAuto ?? 0) + 1
}

/* ──────────────────────────────── Après-vente ──────────────────────────────── */

/** Session d'origine si elle était encore ouverte : `sales.refundCashSession`. */
async function sessionDeRestitution(
  l: ContexteLot,
  sale: Doc<"sales">,
  a: number
): Promise<Id<"cashSessions"> | undefined> {
  if (!sale.cashSessionId) return undefined
  const session = await l.ctx.db.get(sale.cashSessionId)
  if (!session) return undefined
  // L'argent ressort du tiroir qui l'a encaissé, tant que la caisse est ouverte.
  const ouverte = session.openedAt <= a && (session.closedAt === undefined || a <= session.closedAt)
  return ouverte && session.accountingDayId === l.jour._id ? session._id : undefined
}

async function annuler(l: ContexteLot, vente: VentePlanifiee, a: number): Promise<boolean> {
  const { ctx } = l
  const sale = await venteExistante(ctx, vente.cle)
  if (!sale || sale.status !== "confirmee" || sale.kind !== "vente") return false
  const trip = l.trips.get(vente.desserte)
  if (!trip) return false
  const tickets = (await ctx.db.query("tickets").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).collect()).filter(
    (t) => t.status === "valide"
  )
  if (tickets.length === 0) return false

  await l.inventaire.liberer(tickets, trip)
  for (const t of tickets) await ctx.db.patch(t._id, { status: "annule" })
  const ttc = tickets.reduce((s, t) => s + t.unitPriceTtc, 0)
  const positif = buildAmounts(ttc, l.tarif.schedule.vatPct, l.tarif.schedule.cssPct, ttc)
  const pos = sale.pointOfSaleId ? l.personnel.pointsDeVenteParId.get(sale.pointOfSaleId) : undefined
  const numero = await l.sequences.numero("annulation", pos?.code ?? CODE_SANS_POINT_DE_VENTE, l.date)
  const cancellationId = await ctx.db.insert("sales", {
    number: numero,
    kind: "annulation",
    product: sale.product,
    channel: sale.channel,
    status: "confirmee",
    pointOfSaleId: sale.pointOfSaleId,
    sellerId: sale.sellerId,
    customerId: sale.customerId,
    corporateAccountId: sale.corporateAccountId,
    amounts: negateAmounts(positif),
    paymentMethod: sale.paymentMethod === "en_compte" ? "en_compte" : "especes",
    accountingDayId: l.jour._id,
    cashSessionId: await sessionDeRestitution(l, sale, a),
    originSaleId: sale._id,
    refundReason: vente.annulation!.motif,
    clientSaleId: cleClient(`${vente.cle}|X`),
    soldAt: a,
    cancelledAt: a,
  })
  await ctx.db.patch(sale._id, { status: "annulee", cancelledAt: a })
  await crediterCompte(l, sale, positif.ttc)
  await rendreQuotaAgence(l, sale, trip, tickets)
  await journaliser(ctx, {
    acteur: sale.sellerId,
    action: "vente.annuler",
    table: "sales",
    id: sale._id,
    a,
    appareil: sale.deviceId,
    avant: { status: sale.status, ttc: sale.amounts.ttc },
    apres: { cancellationId, number: numero, tickets: tickets.length, reason: vente.annulation!.motif, partial: false },
  })
  return true
}

async function rembourser(l: ContexteLot, vente: VentePlanifiee, a: number): Promise<boolean> {
  const { ctx } = l
  const sale = await venteExistante(ctx, vente.cle)
  if (!sale || sale.kind !== "vente" || sale.status !== "confirmee") return false
  const trip = l.trips.get(vente.desserte)
  if (!trip) return false
  const tickets = (await ctx.db.query("tickets").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).collect()).filter(
    (t) => t.status === "valide"
  )
  if (tickets.length === 0) return false

  // Pénalité selon la politique du guichet (`guichet.penaliteRemboursement`).
  const suppression = vente.remboursement!.penalite === "suppression"
  const heuresAvant = (trip.departureAt - a) / 3_600_000
  if (!suppression && heuresAvant <= 0) return false
  const penaltyPct = suppression
    ? 0
    : heuresAvant >= l.tarif.remboursement.seuilHeures
      ? l.tarif.remboursement.avantSeuilPct
      : l.tarif.remboursement.apresSeuilPct

  await l.inventaire.liberer(tickets, trip)
  for (const t of tickets) await ctx.db.patch(t._id, { status: "rembourse" })
  const paye = tickets.reduce((s, t) => s + t.unitPriceTtc, 0)
  const rendu = refundAmount(paye, penaltyPct)
  const positif = buildAmounts(rendu, l.tarif.schedule.vatPct, l.tarif.schedule.cssPct, rendu)
  const pos = sale.pointOfSaleId ? l.personnel.pointsDeVenteParId.get(sale.pointOfSaleId) : undefined
  const numero = await l.sequences.numero("remboursement", pos?.code ?? CODE_SANS_POINT_DE_VENTE, l.date)
  const chef = chefDeGare(l.personnel, pos?.code)
  const refundId = await ctx.db.insert("sales", {
    number: numero,
    kind: "remboursement",
    product: sale.product,
    channel: sale.channel,
    status: "confirmee",
    pointOfSaleId: sale.pointOfSaleId,
    sellerId: chef._id,
    customerId: sale.customerId,
    corporateAccountId: sale.corporateAccountId,
    amounts: negateAmounts(positif),
    paymentMethod: sale.paymentMethod === "en_compte" ? "en_compte" : "especes",
    accountingDayId: l.jour._id,
    cashSessionId: await sessionDeRestitution(l, sale, a),
    originSaleId: sale._id,
    refundReason: vente.remboursement!.motif,
    penaltyPct,
    clientSaleId: cleClient(`${vente.cle}|R`),
    soldAt: a,
  })
  await ctx.db.patch(sale._id, { status: "remboursee" })
  await crediterCompte(l, sale, positif.ttc)
  await rendreQuotaAgence(l, sale, trip, tickets)
  await journaliser(ctx, {
    acteur: chef._id,
    action: "vente.rembourser",
    table: "sales",
    id: sale._id,
    a,
    avant: { paidTtc: paye },
    apres: { refundId, number: numero, tickets: tickets.length, penaltyPct, refundedTtc: rendu, reason: vente.remboursement!.motif },
  })
  return true
}

/** Une place d'agence annulée ou remboursée revient à l'allocation. */
async function rendreQuotaAgence(
  l: ContexteLot,
  sale: Doc<"sales">,
  trip: Doc<"trips">,
  tickets: readonly Doc<"tickets">[]
) {
  if (sale.channel !== "agence" || !sale.pointOfSaleId || tickets.length === 0) return
  const quotas = await l.ctx.db
    .query("agencyQuotas")
    .withIndex("by_pos_trip", (q) => q.eq("pointOfSaleId", sale.pointOfSaleId!).eq("tripId", trip._id))
    .collect()
  const quota = quotas.find((q) => q.serviceClass === tickets[0]!.serviceClass && q.isActive)
  if (quota) await l.ctx.db.patch(quota._id, { sold: Math.max(0, quota.sold - tickets.length) })
}

async function crediterCompte(l: ContexteLot, sale: Doc<"sales">, ttc: number) {
  if (sale.paymentMethod !== "en_compte" || !l.compteClient) return
  l.compteClient.outstandingXaf = Math.max(0, l.compteClient.outstandingXaf - ttc)
  await l.ctx.db.patch(l.compteClient._id, { outstandingXaf: l.compteClient.outstandingXaf })
}

async function dupliquer(l: ContexteLot, vente: VentePlanifiee, a: number): Promise<boolean> {
  const { ctx } = l
  const sale = await venteExistante(ctx, vente.cle)
  if (!sale) return false
  const ticket = (await ctx.db.query("tickets").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).collect())[0]
  if (!ticket || ticket.status !== "valide" || ticket.duplicateCount > 0) return false
  const vendeur = vendeurPour(l, vente.flux, a, vente.vendeur + 1)
  if (!vendeur) return false
  await ctx.db.patch(ticket._id, { duplicateCount: 1 })
  await journaliser(ctx, {
    acteur: vendeur.vendeur._id,
    action: "billet.duplicata",
    table: "tickets",
    id: ticket._id,
    a,
    appareil: vendeur.appareil,
    raison: vente.duplicata!.motif,
    avant: { duplicateCount: 0 },
    apres: { duplicateCount: 1, number: ticket.number },
  })
  return true
}

/* ─────────────────────────── Colis et transport funéraire ──────────────────── */

async function vendreColis(l: ContexteLot, colis: ColisPlanifie): Promise<boolean> {
  const { ctx } = l
  const vendeur = vendeurPour(l, colis.flux, colis.venteA, colis.vendeur)
  const pos = l.personnel.pointsDeVente.get(colis.flux)
  const origine = l.stations.get(colis.origine)
  const destination = l.stations.get(colis.destination)
  if (!vendeur || !pos || !origine || !destination) return false
  const distanceKm = Math.abs(destination.kilometerPoint - origine.kilometerPoint)

  // Le poids du dernier article est ajusté au kilo près pour un TTC réglable.
  let articles = [...colis.articles]
  let tarif: ReturnType<typeof computeParcelFare> | null = null
  let ttc = 0
  for (let ecart = 0; ecart <= 25 && !tarif; ecart += 1) {
    for (const delta of [-ecart, ecart]) {
      const dernier = articles[articles.length - 1]!
      const poids = colis.articles[colis.articles.length - 1]!.poids + delta
      if (poids < 1 || poids > 100) continue
      const essai = [...articles.slice(0, -1), { ...dernier, poids }]
      try {
        const fare = computeParcelFare(essai.map((x) => ({ weightKg: x.poids })), distanceKm, l.grilleAnnexe)
        const t = ttcDepuisHt(fare.totalHt, l.tarif)
        if (multipleDeCinq(t)) {
          tarif = fare
          ttc = t
          articles = essai
          break
        }
      } catch {
        return false
      }
    }
  }
  if (!tarif) return false

  const trajet = [...l.plans.values()]
    .map((p) => {
      const de = p.arrets.findIndex((x) => x.code === colis.origine)
      const a = p.arrets.findIndex((x) => x.code === colis.destination)
      return { p, de, a }
    })
    .filter(({ p, de, a }) => de >= 0 && a > de && (p.arrets[de]!.departAt ?? p.departureAt) > colis.venteA + 30 * 60_000)
    .sort((x, y) => (x.p.arrets[x.de]!.departAt ?? 0) - (y.p.arrets[y.de]!.departAt ?? 0))[0]
  const trip = trajet ? l.trips.get(trajet.p.cle) : undefined
  const depart = trajet ? trajet.p.arrets[trajet.de]!.departAt ?? trajet.p.departureAt : undefined
  const arrivee = trajet ? trajet.p.arrets[trajet.a]!.arriveeAt ?? trajet.p.arrivalAt : undefined
  const rng = tirage(MARQUEUR, "colis-suivi", colis.cle)
  const retrait = arrivee !== undefined ? arrivee + entier(rng, 3, 60) * 3_600_000 : undefined
  const status: Doc<"parcels">["status"] =
    retrait !== undefined && retrait <= l.maintenant
      ? "retire"
      : arrivee !== undefined && arrivee <= l.maintenant
        ? "arrive"
        : depart !== undefined && depart <= l.maintenant
          ? "en_transport"
          : "enregistre"

  const { vatPct, cssPct } = l.tarif.schedule
  const amounts = buildAmounts(ttc, vatPct, cssPct, ttc)
  const numero = await l.sequences.numero("vente", pos.code, l.date)
  const expedition = await l.sequences.numero("colis", pos.code, l.date)
  const saleId = await ctx.db.insert("sales", {
    number: numero,
    kind: "vente",
    product: "colis",
    channel: "guichet",
    status: "confirmee",
    pointOfSaleId: pos._id,
    sellerId: vendeur.vendeur._id,
    deviceId: vendeur.appareil,
    contactPhone: colis.expediteur.telephone,
    amounts,
    paymentMethod: colis.moyen,
    accountingDayId: l.jour._id,
    cashSessionId: vendeur.session._id,
    clientSaleId: cleClient(colis.cle),
    soldAt: colis.venteA,
  })
  const parcelId = await ctx.db.insert("parcels", {
    saleId,
    shipmentNumber: expedition,
    tripId: trip?._id,
    originStationId: origine._id,
    destinationStationId: destination._id,
    distanceKm,
    zone: tarif.items[0]!.zone,
    senderName: colis.expediteur.nom,
    senderPhone: colis.expediteur.telephone,
    senderIdDocument: colis.expediteur.piece,
    declaredValueXaf: colis.valeurDeclaree,
    handling: colis.consignes ? [...colis.consignes] : undefined,
    recipientName: colis.destinataire.nom,
    recipientPhone: colis.destinataire.telephone,
    totalWeightKg: tarif.totalWeightKg,
    status,
    amounts,
  })
  for (const [i, article] of articles.entries()) {
    await ctx.db.insert("parcelItems", {
      parcelId,
      stickerNumber: await l.sequences.numero("vignette", pos.code, l.date),
      description: article.description,
      weightKg: article.poids,
      weightTier: tarif.items[i]!.weightTier,
      amountTtc: ttcDepuisHt(tarif.items[i]!.totalHt, l.tarif),
    })
  }
  await payer(l, {
    saleId,
    moyen: colis.moyen,
    ttc,
    a: colis.venteA,
    rng,
    enLigne: false,
    agent: vendeur.vendeur._id,
    telephone: colis.expediteur.telephone,
  })
  await journaliser(ctx, {
    acteur: vendeur.vendeur._id,
    action: "vente.colis",
    table: "parcels",
    id: parcelId,
    a: colis.venteA,
    appareil: vendeur.appareil,
    apres: { shipmentNumber: expedition, items: articles.length, totalWeightKg: tarif.totalWeightKg, ttc },
  })
  return true
}

async function vendreFuneraire(l: ContexteLot, f: FunerairePlanifie): Promise<boolean> {
  const { ctx } = l
  const vendeur = vendeurPour(l, f.flux, f.venteA, 0)
  const pos = l.personnel.pointsDeVente.get(f.flux)
  const origine = l.stations.get("OWE")
  const destination = l.stations.get(f.destination)
  const plan = [...l.plans.values()].find((p) => p.serviceDate === f.jour && p.arrets[0]?.code === "OWE")
  const trip = plan ? l.trips.get(plan.cle) : undefined
  if (!vendeur || !pos || !origine || !destination || !trip || trip.departureAt <= f.venteA) return false
  const distanceKm = Math.abs(destination.kilometerPoint - origine.kilometerPoint)
  let retenu: { tonnage: number; ttc: number } | null = null
  for (let pas = 0; pas <= 10 && !retenu; pas += 1) {
    const tonnage = Math.round((f.tonnage + pas * 0.01) * 100) / 100
    try {
      const fare = computeTonnageFare({ product: "funeraire", distanceKm, tonnage, grid: l.grilleAnnexe })
      const ttc = ttcDepuisHt(fare.totalHt, l.tarif)
      if (multipleDeCinq(ttc)) retenu = { tonnage, ttc }
    } catch {
      return false
    }
  }
  if (!retenu) return false
  const { vatPct, cssPct } = l.tarif.schedule
  const amounts = buildAmounts(retenu.ttc, vatPct, cssPct, retenu.ttc)
  const numero = await l.sequences.numero("vente", pos.code, l.date)
  const expedition = await l.sequences.numero("funeraire", pos.code, l.date)
  const saleId = await ctx.db.insert("sales", {
    number: numero,
    kind: "vente",
    product: "funeraire",
    channel: "guichet",
    status: "confirmee",
    pointOfSaleId: pos._id,
    sellerId: vendeur.vendeur._id,
    deviceId: vendeur.appareil,
    amounts,
    paymentMethod: "especes",
    accountingDayId: l.jour._id,
    cashSessionId: vendeur.session._id,
    clientSaleId: cleClient(f.cle),
    soldAt: f.venteA,
  })
  const id = await ctx.db.insert("funeralTransports", {
    saleId,
    shipmentNumber: expedition,
    tripId: trip._id,
    originStationId: origine._id,
    destinationStationId: destination._id,
    distanceKm,
    tonnage: retenu.tonnage,
    senderName: f.famille,
    amounts,
  })
  await payer(l, {
    saleId,
    moyen: "especes",
    ttc: retenu.ttc,
    a: f.venteA,
    rng: tirage(MARQUEUR, "funeraire-paiement", f.cle),
    enLigne: false,
    agent: vendeur.vendeur._id,
  })
  await journaliser(ctx, {
    acteur: vendeur.vendeur._id,
    action: "vente.funeraire",
    table: "funeralTransports",
    id,
    a: f.venteA,
    appareil: vendeur.appareil,
    apres: { shipmentNumber: expedition, tonnage: retenu.tonnage, ttc: retenu.ttc },
  })
  return true
}

/* ══════════════════════════════ Terrain ═════════════════════════════════════ */

const INCIDENTS: ReadonlyArray<{
  ilYa: number
  heure: string
  train: "OWE" | "FCV"
  gare?: string
  lieu?: string
  category: Doc<"incidents">["category"]
  severity: Doc<"incidents">["severity"]
  description: string
  statut: Doc<"incidents">["status"]
  cause?: NonNullable<Doc<"incidents">["closureCause"]>
  resolution?: string
}> = [
  { ilYa: 28, heure: "13:40", train: "OWE", gare: "NDJ", category: "comportement", severity: "important", description: "Voyageur en état d'ébriété, altercation en voiture V5. Remis aux forces de l'ordre en gare de Ndjolé.", statut: "resolu", cause: "voyageur", resolution: "Procès-verbal dressé, voyageur débarqué à Ndjolé." },
  { ilYa: 25, heure: "16:05", train: "OWE", lieu: "Entre Otoumbi et Bissouma", category: "technique", severity: "important", description: "Ralentissement à 30 km/h sur la zone de renouvellement de voie du PRN, 22 minutes perdues.", statut: "resolu", cause: "infrastructure", resolution: "Limitation temporaire levée après bourrage de la voie." },
  { ilYa: 22, heure: "20:15", train: "FCV", gare: "BOO", category: "medical", severity: "critique", description: "Malaise d'une voyageuse en voiture V3. Prise en charge par la Croix-Rouge en gare de Booué.", statut: "resolu", cause: "voyageur", resolution: "Voyageuse évacuée vers le centre médical de Booué, famille prévenue." },
  { ilYa: 19, heure: "09:30", train: "OWE", gare: "OWE", category: "technique", severity: "important", description: "Climatisation hors service en voiture V2 (1re classe), plusieurs réclamations.", statut: "resolu", cause: "materiel", resolution: "Compresseur remplacé à l'atelier d'Owendo." },
  { ilYa: 17, heure: "21:50", train: "FCV", lieu: "Sortie de Lopé", category: "securite", severity: "important", description: "Troupeau sur la voie à la sortie de Lopé, arrêt d'urgence sans dommage.", statut: "resolu", cause: "tiers", resolution: "Propriétaire identifié, signalement transmis à la gendarmerie." },
  { ilYa: 14, heure: "15:20", train: "OWE", gare: "BOO", category: "technique", severity: "critique", description: "Panne de la locomotive en gare de Booué, remplacement par la machine de réserve : 1 h 50 de retard.", statut: "resolu", cause: "materiel", resolution: "Machine de réserve engagée ; locomotive rapatriée à Owendo pour expertise." },
  { ilYa: 12, heure: "18:40", train: "FCV", lieu: "Entre Abanga et Ndjolé", category: "securite", severity: "important", description: "Chute d'arbre sur la voie après un orage, dégagement par la brigade de voie.", statut: "resolu", cause: "meteo", resolution: "Voie dégagée en 45 minutes, circulation rétablie." },
  { ilYa: 10, heure: "07:15", train: "OWE", gare: "NTM", category: "securite", severity: "important", description: "Passage à niveau de Ntoum : barrière bloquée en position haute.", statut: "resolu", cause: "infrastructure", resolution: "Automatisme réinitialisé par le technicien signalisation." },
  { ilYa: 8, heure: "12:10", train: "OWE", gare: "OWE", category: "comportement", severity: "information", description: "Revente de billets à la sauvette à l'entrée de la gare d'Owendo.", statut: "resolu", cause: "tiers", resolution: "Rappel affiché aux guichets, présence de la sûreté renforcée." },
  { ilYa: 6, heure: "19:30", train: "FCV", gare: "LTV", category: "technique", severity: "information", description: "Terminal de contrôle déchargé en cours de service, contrôle poursuivi sur le terminal de secours.", statut: "resolu", cause: "materiel", resolution: "Batterie remplacée, synchronisation effectuée à l'arrivée." },
  { ilYa: 4, heure: "10:05", train: "OWE", gare: "NDJ", category: "technique", severity: "important", description: "Toilettes hors service en voiture V4.", statut: "en_cours", cause: undefined },
  { ilYa: 3, heure: "22:40", train: "FCV", gare: "BOO", category: "medical", severity: "important", description: "Voyageur diabétique en hypoglycémie, pris en charge par le chef de train.", statut: "en_cours" },
  { ilYa: 2, heure: "14:15", train: "OWE", lieu: "Entre Ivindo et Mouyabi", category: "technique", severity: "important", description: "Fuite d'huile signalée sur un bogie de la voiture V6, surveillance jusqu'à Franceville.", statut: "en_cours" },
  { ilYa: 1, heure: "17:55", train: "FCV", gare: "FCV", category: "comportement", severity: "information", description: "Réclamation d'un voyageur : place attribuée occupée par un autre titulaire (duplicata présenté).", statut: "ouvert" },
]

/**
 * Statut des dessertes passées et du jour, et incidents du réseau.
 */
export const terrain = internalMutation({
  args: argsCommuns,
  handler: async (ctx, args) => {
    const aujourdhui = toServiceDate(args.maintenant)
    const personnel = await chargerPersonnel(ctx)
    const compte = { dessertesTerminees: 0, incidents: 0 }
    const trips = await ctx.db
      .query("trips")
      .withIndex("by_service_date", (q) => q.gte("serviceDate", args.debut).lte("serviceDate", aujourdhui))
      .collect()
    const stations = new Map((await ctx.db.query("stations").collect()).map((s) => [s._id, s]))

    for (const trip of trips) {
      const origine = stations.get(trip.originStationId)?.code ?? ""
      const cle = `${trip.serviceDate}|${trip.trainNumber}`
      let cible: Pick<Doc<"trips">, "status" | "delayMinutes" | "isOpenForSale"> | null = null
      if (trip.serviceDate < aujourdhui) {
        // Une desserte de la veille peut encore rouler : l'Omnibus de nuit
        // arrive le lendemain matin.
        const retard = retardDesserte(cle)
        const arrivee = trip.arrivalAt + retard * 60_000
        cible = {
          status: arrivee <= args.maintenant ? "termine" : retard >= 15 ? "retarde" : "a_lheure",
          delayMinutes: retard,
          isOpenForSale: false,
        }
      } else if (trip.serviceDate === aujourdhui) {
        if (origine === "FCV" && args.maintenant >= instantSuppression(aujourdhui)) {
          cible = { status: "annule", delayMinutes: 0, isOpenForSale: false }
        } else if (origine === "OWE" && args.maintenant >= instantDeraillement(aujourdhui)) {
          const arrivee = trip.arrivalAt + RETARD_DU_JOUR_MINUTES * 60_000
          cible = {
            status: arrivee <= args.maintenant ? "termine" : "retarde",
            delayMinutes: RETARD_DU_JOUR_MINUTES,
            isOpenForSale: trip.departureAt + RETARD_DU_JOUR_MINUTES * 60_000 > args.maintenant,
          }
        }
      }
      if (!cible) continue
      if (trip.status === cible.status && trip.delayMinutes === cible.delayMinutes && trip.isOpenForSale === cible.isOpenForSale) continue
      await ctx.db.patch(trip._id, cible)
      await journaliser(ctx, {
        acteur: chefDeGare(personnel, `${origine}-PV`)._id,
        action: cible.status === "annule" ? "desserte.supprimer" : "desserte.statut",
        table: "trips",
        id: trip._id,
        a: cible.status === "annule" ? instantSuppression(aujourdhui) : Math.min(args.maintenant, trip.arrivalAt + cible.delayMinutes * 60_000 + 10 * 60_000),
        avant: { status: trip.status, delayMinutes: trip.delayMinutes, isOpenForSale: trip.isOpenForSale },
        apres: cible,
        raison: cible.status === "annule" ? "Déraillement d'un train minéralier entre Lastourville et Moanda (PK 562), voie obstruée" : undefined,
        manifeste: true,
      })
      compte.dessertesTerminees += 1
    }

    // Incidents : ceux de la liste, plus le déraillement du jour.
    const liste = [...INCIDENTS]
    if (args.maintenant >= instantDeraillement(aujourdhui)) {
      liste.push({
        ilYa: 0,
        heure: "05:50",
        train: "FCV",
        lieu: "Entre Lastourville et Moanda (PK 562)",
        category: "securite",
        severity: "critique",
        description:
          "Déraillement d'un train minéralier COMILOG, voie obstruée entre Lastourville et Moanda. Desserte montante du jour supprimée, desserte descendante retardée.",
        statut: args.maintenant >= fromServiceDate(aujourdhui, "09:30") ? "en_cours" : "ouvert",
      })
    }
    for (const [rang, inc] of liste.entries()) {
      const clientId = `${PREFIXE}incident|${addDays(aujourdhui, -inc.ilYa)}|${rang}`
      const existant = await ctx.db.query("incidents").withIndex("by_client_id", (q) => q.eq("clientId", clientId)).unique()
      if (existant) continue
      const date = addDays(aujourdhui, -inc.ilYa)
      const reportedAt = fromServiceDate(date, inc.heure)
      if (reportedAt > args.maintenant) continue
      const trip = trips.find((t) => t.serviceDate === date && stations.get(t.originStationId)?.code === inc.train)
      const controleur = controleurDeDesserte(personnel, inc.train, date) ?? chefDeGare(personnel, `${inc.train}-PV`)
      const gare = inc.gare ? [...stations.values()].find((s) => s.code === inc.gare) : undefined
      const resolu = inc.statut === "resolu"
      const resolvedAt = resolu ? reportedAt + entier(tirage(MARQUEUR, clientId), 2, 30) * 3_600_000 : undefined
      const resolveur = chefDeGare(personnel, inc.gare ? `${inc.gare}-PV` : `${inc.train}-PV`)
      const annee = date.slice(0, 4)
      const seqCle = `reseau:incident:${annee}`
      const seq = await ctx.db.query("sequences").withIndex("by_key", (q) => q.eq("key", seqCle)).unique()
      const valeur = (seq?.value ?? 0) + 1
      if (seq) await ctx.db.patch(seq._id, { value: valeur })
      else await ctx.db.insert("sequences", { key: seqCle, value: valeur })
      const id = await ctx.db.insert("incidents", {
        reporterId: controleur._id,
        tripId: trip?._id,
        stationId: gare?._id,
        category: inc.category,
        severity: inc.severity,
        description: inc.description,
        photoStorageIds: [],
        status: inc.statut,
        reportedAt,
        offline: inc.lieu !== undefined,
        clientId,
        resolvedBy: resolu ? resolveur._id : undefined,
        resolvedAt,
        resolutionNote: inc.resolution,
        number: `INC-${annee}-${String(valeur).padStart(4, "0")}`,
        location: inc.lieu,
        closureCause: resolu ? inc.cause : undefined,
      })
      await journaliser(ctx, {
        acteur: controleur._id,
        action: "incident.synchroniser",
        table: "incidents",
        id,
        a: reportedAt + 4 * 60_000,
        apres: { category: inc.category, severity: inc.severity },
      })
      if (inc.statut !== "ouvert") {
        await journaliser(ctx, {
          acteur: resolveur._id,
          action: "incident.statut",
          table: "incidents",
          id,
          a: resolu ? resolvedAt! : reportedAt + 3 * 3_600_000,
          avant: { status: "ouvert" },
          apres: { status: inc.statut, cause: inc.cause, note: inc.resolution },
        })
      }
      compte.incidents += 1
    }
    return compte
  },
})

export const dessertesAControler = internalQuery({
  args: { du: v.string(), maintenant: v.number() },
  handler: async (ctx, args) => {
    const aujourdhui = toServiceDate(args.maintenant)
    const trips = await ctx.db
      .query("trips")
      .withIndex("by_service_date", (q) => q.gte("serviceDate", args.du).lte("serviceDate", aujourdhui))
      .collect()
    return trips
      .filter((t) => t.status !== "annule" && t.departureAt <= args.maintenant)
      .sort((a, b) => a.departureAt - b.departureAt)
      .map((t) => t._id)
  },
})

/**
 * Contrôles à bord d'une desserte : chaque voyageur présent est contrôlé une
 * fois après sa montée ; quelques titres irréguliers donnent lieu à un
 * procès-verbal. Les absents gardent un billet valide non utilisé.
 */
export const controlerDesserte = internalMutation({
  args: {
    ...argsCommuns,
    tripId: v.id("trips"),
    conflit: v.optional(v.union(v.literal("ouvert"), v.literal("arbitre"))),
  },
  handler: async (ctx, args) => {
    const compte = { controles: 0, procesVerbaux: 0, conflits: 0 }
    const trip = await ctx.db.get(args.tripId)
    if (!trip) return compte
    const personnel = await chargerPersonnel(ctx)
    const origine = (await ctx.db.get(trip.originStationId))?.code ?? "OWE"
    const cle = `${trip.serviceDate}|${trip.trainNumber}`
    const retard = retardEffectif(trip, origine, args.maintenant)
    const controleur = controleurDeDesserte(personnel, origine, trip.serviceDate)
    if (!controleur) return compte
    const second = personnel.personas.get("controle") ?? controleurDeDesserte(personnel, origine, addDays(trip.serviceDate, 1))
    const stops = (await ctx.db.query("tripStops").withIndex("by_trip_sequence", (q) => q.eq("tripId", trip._id)).collect()).sort(
      (a, b) => a.sequence - b.sequence
    )
    const fin = Math.min(args.maintenant, trip.arrivalAt + retard * 60_000)
    const existants = new Set(
      (await ctx.db.query("ticketScans").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect()).map((s) => s.clientScanId)
    )
    const tickets = await ctx.db.query("tickets").withIndex("by_trip", (q) => q.eq("tripId", trip._id)).collect()
    const rng = tirage(MARQUEUR, "controle", cle)
    const synchro = fin + 25 * 60_000
    let premierScan: Id<"ticketScans"> | null = null
    let premierTicket: Doc<"tickets"> | null = null

    for (const ticket of tickets.sort((a, b) => a.number.localeCompare(b.number))) {
      const clientScanId = `${PREFIXE}scan|${ticket.number}`
      if (existants.has(clientScanId)) continue
      const montee = (stops[ticket.fromStopIndex]?.departureAt ?? trip.departureAt) + retard * 60_000
      const r = tirage(MARQUEUR, "scan", ticket.number)
      const scannedAt = montee + entier(r, 5, 70) * 60_000
      if (scannedAt > fin) continue
      if (ticket.status === "annule" || ticket.status === "rembourse") {
        // Un titre annulé présenté à bord : rare, mais c'est la fraude que le
        // manifeste embarqué doit déjouer.
        if (r() > 0.04) continue
        await ctx.db.insert("ticketScans", {
          ticketId: ticket._id,
          tripId: trip._id,
          agentId: controleur._id,
          result: ticket.status === "annule" ? "annule" : "rembourse",
          stopIndex: ticket.fromStopIndex,
          scannedAt,
          offline: true,
          clientScanId,
          syncedAt: synchro,
          conflict: false,
        })
        if (await dresserPv(ctx, { trip, controleur, ticketId: ticket._id, a: scannedAt + 3 * 60_000, reason: "titre_invalide", cle: `${clientScanId}|pv`, maintenant: args.maintenant, personnel })) {
          compte.procesVerbaux += 1
        }
        continue
      }
      if (ticket.status !== "valide") continue
      // Voyageur absent : environ 6 %.
      if (r() < 0.06) continue
      const hors = r() < 0.72
      const scanId = await ctx.db.insert("ticketScans", {
        ticketId: ticket._id,
        tripId: trip._id,
        agentId: controleur._id,
        result: "valide",
        stopIndex: ticket.fromStopIndex,
        scannedAt,
        offline: hors,
        clientScanId,
        syncedAt: hors ? synchro : scannedAt + 2_000,
        conflict: false,
      })
      await ctx.db.patch(ticket._id, { status: "utilise", usedAt: scannedAt })
      compte.controles += 1
      if (!premierScan) {
        premierScan = scanId
        premierTicket = ticket
      }
      // Second passage du contrôleur, ou code froissé relu à la main.
      if (r() < 0.012) {
        await ctx.db.insert("ticketScans", {
          ticketId: ticket._id,
          tripId: trip._id,
          agentId: controleur._id,
          result: "deja_controle",
          stopIndex: ticket.fromStopIndex,
          scannedAt: scannedAt + entier(r, 60, 180) * 60_000 > fin ? fin : scannedAt + entier(r, 60, 180) * 60_000,
          offline: true,
          clientScanId: `${clientScanId}|bis`,
          syncedAt: synchro,
          conflict: false,
        })
      } else if (r() < 0.006) {
        await ctx.db.insert("ticketScans", {
          ticketId: undefined,
          tripId: trip._id,
          agentId: controleur._id,
          result: "illisible",
          stopIndex: ticket.fromStopIndex,
          scannedAt: scannedAt - 60_000,
          offline: true,
          clientScanId: `${clientScanId}|illisible`,
          syncedAt: synchro,
          conflict: false,
        })
      }
    }

    // Conflit : le même billet validé sur deux terminaux.
    if (args.conflit && premierScan && premierTicket && second && second._id !== controleur._id) {
      const clientScanId = `${PREFIXE}scan|${premierTicket.number}|conflit`
      if (!existants.has(clientScanId)) {
        const scan = await ctx.db.get(premierScan)
        const a = Math.min(fin, (scan?.scannedAt ?? trip.departureAt) + 35 * 60_000)
        const id = await ctx.db.insert("ticketScans", {
          ticketId: premierTicket._id,
          tripId: trip._id,
          agentId: second._id,
          result: "valide",
          stopIndex: premierTicket.fromStopIndex,
          scannedAt: a,
          offline: true,
          clientScanId,
          syncedAt: synchro,
          conflict: args.conflit === "ouvert",
        })
        if (args.conflit === "arbitre") {
          const chef = chefDeGare(personnel, `${origine}-PV`)
          await journaliser(ctx, {
            acteur: chef._id,
            action: "controle.arbitrer",
            table: "ticketScans",
            id,
            a: synchro + 18 * 3_600_000,
            apres: { accept: true, note: "Double validation par l'équipe de relève : un seul voyageur à bord, titre régulier." },
          })
        }
        compte.conflits += 1
      }
    }

    // Procès-verbaux des voyageurs sans titre ou en classe supérieure.
    const nombre = Math.round(rng() * rng() * 4 * Math.max(args.echelle, 0.3))
    for (let i = 0; i < nombre; i += 1) {
      const a = trip.departureAt + retard * 60_000 + entier(rng, 30, 600) * 60_000
      if (a > fin) continue
      const reason = (["sans_titre", "sans_titre", "sans_titre", "classe_superieure", "classe_superieure", "autre"] as const)[entier(rng, 0, 5)]!
      if (await dresserPv(ctx, { trip, controleur, a, reason, cle: `${PREFIXE}pv|${cle}|${i}`, maintenant: args.maintenant, personnel })) {
        compte.procesVerbaux += 1
      }
    }

    if (compte.controles + compte.procesVerbaux > 0) {
      await journaliser(ctx, {
        acteur: controleur._id,
        action: "controle.synchroniser",
        table: "trips",
        id: trip._id,
        a: synchro,
        appareil: `TPC-${controleur.matricule}`,
        apres: { scans: compte.controles, penalties: compte.procesVerbaux },
      })
    }
    return compte
  },
})

const MONTANTS_PV = { sans_titre: 25_000, titre_invalide: 15_000, classe_superieure: 8_000, autre: 10_000 } as const
const NOTES_PV = {
  sans_titre: ["Voyageur monté sans titre, déclare avoir manqué le guichet.", "Montée en marche à la halte, sans billet.", "Titre présenté pour la veille."],
  titre_invalide: ["Billet annulé au guichet présenté au contrôle."],
  classe_superieure: ["Installé en 1re classe avec un billet de 2e classe.", "Occupation d'une place VIP sans supplément."],
  autre: ["Refus de présenter une pièce d'identité avec un billet nominatif.", "Transport d'un colis encombrant non déclaré."],
} as const

async function dresserPv(
  ctx: MutationCtx,
  input: {
    trip: Doc<"trips">
    controleur: Doc<"users">
    ticketId?: Id<"tickets">
    a: number
    reason: keyof typeof MONTANTS_PV
    cle: string
    maintenant: number
    personnel: Personnel
  }
): Promise<boolean> {
  const existant = await ctx.db.query("procesVerbaux").withIndex("by_client_id", (q) => q.eq("clientId", input.cle)).unique()
  if (existant) return false
  const rng = tirage(MARQUEUR, "pv", input.cle)
  const seq = await ctx.db.query("sequences").withIndex("by_key", (q) => q.eq("key", "reseau:pv")).unique()
  const valeur = (seq?.value ?? 0) + 1
  if (seq) await ctx.db.patch(seq._id, { value: valeur })
  else await ctx.db.insert("sequences", { key: "reseau:pv", value: valeur })
  const refus = rng() < 0.08
  const u = rng()
  const agePv = (input.maintenant - input.a) / 86_400_000
  const statut: Doc<"procesVerbaux">["status"] =
    u < 0.55 ? "paye" : u < 0.63 ? "conteste" : u < 0.67 ? "annule" : agePv > 5 && u < 0.85 ? "paye" : "emis"
  const payeABord = statut === "paye" && u < 0.55
  const montant = MONTANTS_PV[input.reason]
  const nom = choisir(rng, ["MBOUMBA", "NDONG", "OBAME", "MOUSSAVOU", "IVALA", "MAKAYA", "NZENG", "BOUKANDOU"])
  const id = await ctx.db.insert("procesVerbaux", {
    number: `PV-${String(valeur).padStart(6, "0")}`,
    agentId: input.controleur._id,
    tripId: input.trip._id,
    ticketId: input.ticketId,
    offender: refus
      ? { declined: true }
      : {
          lastName: nom,
          firstName: choisir(rng, ["Serge", "Nadège", "Brice", "Sylvie", "Landry", "Prisca"]),
          documentNumber: rng() < 0.7 ? `CNI ${entier(rng, 100, 999)} ${entier(rng, 100, 999)} ${entier(rng, 100, 999)}` : undefined,
          phone: telephone(rng),
          declined: false,
        },
    reason: input.reason,
    notes: choisir(rng, NOTES_PV[input.reason]),
    amountXaf: montant,
    status: statut,
    issuedAt: input.a,
    offline: true,
    clientId: input.cle,
    resolvedBy: statut !== "emis" && !payeABord ? chefDeGare(input.personnel, "OWE-PV")._id : undefined,
    resolutionNote:
      statut === "conteste"
        ? "Le voyageur conteste : billet acheté en ligne non présenté (téléphone déchargé)."
        : statut === "annule"
          ? "Titre retrouvé et présenté en gare dans les 48 heures : procès-verbal annulé."
          : statut === "paye" && !payeABord
            ? "Amende réglée au guichet de la gare d'Owendo."
            : undefined,
  })
  if (statut === "paye") {
    const regleA = payeABord ? input.a + 2 * 60_000 : Math.min(input.maintenant, input.a + entier(rng, 1, 4) * 86_400_000)
    const paymentId = await ctx.db.insert("payments", {
      penaltyId: id,
      method: "especes",
      provider: "guichet",
      status: "confirme",
      amountXaf: montant,
      tenderedXaf: montant,
      changeXaf: 0,
      requestedBy: payeABord ? input.controleur._id : chefDeGare(input.personnel, "OWE-PV")._id,
      settledAt: regleA,
    })
    await ctx.db.patch(id, { paymentId })
    if (!payeABord) {
      await journaliser(ctx, {
        acteur: chefDeGare(input.personnel, "OWE-PV")._id,
        action: "pv.statut",
        table: "procesVerbaux",
        id,
        a: regleA,
        avant: { status: "emis" },
        apres: { status: "paye" },
      })
    }
  } else if (statut === "conteste" || statut === "annule") {
    await journaliser(ctx, {
      acteur: chefDeGare(input.personnel, "OWE-PV")._id,
      action: "pv.statut",
      table: "procesVerbaux",
      id,
      a: Math.min(input.maintenant, input.a + 2 * 86_400_000),
      avant: { status: "emis" },
      apres: { status: statut },
    })
  }
  await journaliser(ctx, {
    acteur: input.controleur._id,
    action: "pv.synchroniser",
    table: "procesVerbaux",
    id,
    a: input.a + 5 * 60_000,
    apres: { reason: input.reason, amountXaf: montant, paidOnBoard: payeABord },
  })
  return true
}

/* ═════════════════════════════ Clôtures ═════════════════════════════════════ */

/** Moyens dans l'ordre d'affichage de la caisse (`model/caisse`). */
const ORDRE_MOYENS: readonly Moyen[] = ["especes", "airtel_money", "moov_money", "visa", "mastercard", "clickpay", "en_compte"]

function attenduParMoyen(sales: readonly Doc<"sales">[]) {
  const parMoyen = new Map<Moyen, number>()
  for (const sale of sales) {
    if (!compteEnCaisse(sale)) continue
    const moyen = sale.paymentMethod ?? "especes"
    parMoyen.set(moyen, Math.round(((parMoyen.get(moyen) ?? 0) + sale.amounts.received) * 100) / 100)
  }
  return ORDRE_MOYENS.flatMap((method) => (parMoyen.has(method) ? [{ method, amountXaf: parMoyen.get(method)! }] : []))
}

/** Journée dont le déversement SAGE a été rejeté (compte analytique inconnu). */
const JOURS_AVANT_REJET = 9

export const cloturerJournee = internalMutation({
  args: { ...argsCommuns, date: v.string() },
  handler: async (ctx, args) => {
    const compte = { sessionsCloturees: 0, sessionsVisees: 0, journeesCloturees: 0, ecrituresJournal: 0, deversements: 0 }
    const jour = await journee(ctx, args.date)
    if (!jour) return compte
    const aujourdhui = toServiceDate(args.maintenant)
    const etat = statutJour(args.date, aujourdhui)
    const personnel = await chargerPersonnel(ctx)
    const rec = recettes(personnel)
    const lendemain = (heure: string, minutes = 0) => fromServiceDate(addDays(args.date, 1), heure) + minutes * 60_000

    /* ── Caisses ──────────────────────────────────────────────────────── */
    const sessions = (await ctx.db.query("cashSessions").withIndex("by_day", (q) => q.eq("accountingDayId", jour._id)).collect()).sort(
      (a, b) => a.openedAt - b.openedAt || a._id.localeCompare(b._id)
    )
    // Fin de service des caisses ouvertes par le seed : l'heure prévue à
    // l'ouverture, une fois passée, devient l'heure de clôture.
    const tripsDuJour = await ctx.db.query("trips").withIndex("by_service_date", (q) => q.eq("serviceDate", args.date)).collect()
    for (const session of sessions) {
      if (session.status !== "ouverte" || session.closedAt !== undefined) continue
      const vendeur = await ctx.db.get(session.sellerId)
      const pos = personnel.pointsDeVenteParId.get(session.pointOfSaleId)
      if (!vendeur || !pos) continue
      let prevue: number | undefined
      if (vendeur.role === "controleur_train") {
        for (const trip of tripsDuJour) {
          const h = horairesControleur(trip, retardEffectif(trip, pos.code.slice(0, 3), args.maintenant))
          if (h.ouverture === session.openedAt) prevue = h.cloture
        }
      } else {
        const h = horairesVendeur(args.date, vendeur, pos.code.startsWith("AG"))
        if (h.ouverture === session.openedAt) prevue = h.cloture
      }
      if (prevue !== undefined && prevue <= args.maintenant) {
        await ctx.db.patch(session._id, { closedAt: prevue, status: "cloturee" })
        session.closedAt = prevue
        session.status = "cloturee"
      }
    }

    // La veille : deux caisses avec un écart restent à viser, dont une sans
    // justification — c'est elle qui retient la clôture de la journée.
    const aViser = etat === "veille"
      ? sessions.filter((s) => s.closedAt !== undefined && s.closedAt <= args.maintenant).filter((s) => {
          const pos = personnel.pointsDeVenteParId.get(s.pointOfSaleId)
          return pos?.code === "LTV-PV" || pos?.code === "OWE-PV"
        }).filter((s, i, liste) => liste.findIndex((x) => x.pointOfSaleId === s.pointOfSaleId) === i)
      : []

    for (const [rang, session] of sessions.entries()) {
      const fermee = session.closedAt !== undefined && session.closedAt <= args.maintenant
      if (!fermee) continue
      const vendeur = await ctx.db.get(session.sellerId)
      const sales = await ctx.db.query("sales").withIndex("by_cash_session", (q) => q.eq("cashSessionId", session._id)).collect()
      const attendu = attenduParMoyen(sales)
      const rng = tirage(MARQUEUR, "cloture", args.date, vendeur?.matricule ?? session.sellerId, session.openedAt)

      if (session.countedByMethod === undefined) {
        const especes = attendu.find((x) => x.method === "especes")?.amountXaf ?? 0
        const controleurTrain = vendeur?.role === "controleur_train"
        let ecart = controleurTrain || especes === 0 ? { montant: 0 } as { montant: number; justification?: string } : ecartSession(`${args.date}|${vendeur?.matricule}|${session.openedAt}`)
        const force = aViser.findIndex((s) => s._id === session._id)
        if (force === 0) ecart = { montant: -2_000 }
        if (force === 1) ecart = { montant: -1_500, justification: "Erreur de rendu de monnaie sur un billet Lastourville–Moanda" }
        let comptees = especes + ecart.montant
        // Un attendu qui ne se règle pas en coupures laisse un écart d'arrondi.
        const reste = (session.openingFloatXaf + comptees) % 5
        if (reste !== 0) {
          comptees -= reste
          ecart = { montant: ecart.montant - reste, justification: ecart.justification ?? "Arrondi au franc inférieur faute de pièces de 1 et 2 XAF" }
        }
        const countedByMethod = attendu.map((x) => (x.method === "especes" ? { method: x.method, amountXaf: comptees } : x))
        if (!countedByMethod.some((x) => x.method === "especes")) countedByMethod.unshift({ method: "especes", amountXaf: comptees })
        const varianceXaf = Math.round(ecart.montant * 100) / 100
        await ctx.db.patch(session._id, {
          expectedByMethod: attendu.length > 0 ? attendu : [{ method: "especes", amountXaf: 0 }],
          countedByMethod,
          varianceXaf,
          varianceReason: varianceXaf !== 0 ? ecart.justification : undefined,
          closingBreakdown: billetage(session.openingFloatXaf + comptees, rng),
          status: "cloturee",
          recountRequestedAt: force === 0 && args.maintenant >= fromServiceDate(aujourdhui, "08:40") ? fromServiceDate(aujourdhui, "08:40") : undefined,
          recountRequestedBy: force === 0 && args.maintenant >= fromServiceDate(aujourdhui, "08:40") ? rec._id : undefined,
          recountReason: force === 0 && args.maintenant >= fromServiceDate(aujourdhui, "08:40") ? "Manque de 2 000 XAF non justifié : recompter le tiroir et joindre le billetage." : undefined,
        })
        const totalAttendu = attendu.reduce((s, x) => s + x.amountXaf, 0)
        await journaliser(ctx, {
          acteur: session.sellerId,
          action: "caisse.cloturer",
          table: "cashSessions",
          id: session._id,
          a: session.closedAt!,
          apres: {
            expectedTotal: totalAttendu,
            countedTotal: totalAttendu + varianceXaf,
            varianceXaf,
            reason: varianceXaf !== 0 ? ecart.justification : undefined,
          },
        })
        compte.sessionsCloturees += 1
      }

      // Visa du contrôle des recettes, le lendemain matin. Un écart resté
      // sans justification est expliqué après recomptage avant tout visa.
      let apres = (await ctx.db.get(session._id))!
      const viseeA = lendemain("09:05", rang * 3)
      if (etat === "close" && apres.status === "cloturee" && (apres.varianceXaf ?? 0) !== 0 && !apres.varianceReason) {
        const justification = "Écart confirmé au recomptage : erreur de rendu sur un billet Owendo–Franceville"
        await ctx.db.patch(session._id, { varianceReason: justification })
        await journaliser(ctx, {
          acteur: session.sellerId,
          action: "caisse.justifier",
          table: "cashSessions",
          id: session._id,
          a: viseeA - 20 * 60_000,
          apres: { varianceXaf: apres.varianceXaf, reason: justification },
        })
        apres = (await ctx.db.get(session._id))!
      }
      const enAttenteDeVisa = etat === "veille" && aViser.some((s) => s._id === session._id)
      const doitViser =
        etat !== "jour" &&
        !enAttenteDeVisa &&
        apres.status === "cloturee" &&
        viseeA <= args.maintenant &&
        ((apres.varianceXaf ?? 0) === 0 || apres.varianceReason !== undefined)
      if (doitViser) {
        await ctx.db.patch(session._id, {
          status: "validee",
          validatedBy: rec._id,
          validatedAt: viseeA,
          visaComment: (apres.varianceXaf ?? 0) === 0 ? "Conforme" : `Écart de ${apres.varianceXaf} XAF justifié et accepté`,
        })
        await journaliser(ctx, {
          acteur: rec._id,
          action: "caisse.viser",
          table: "cashSessions",
          id: session._id,
          a: viseeA,
          avant: { status: "cloturee" },
          apres: { varianceXaf: apres.varianceXaf ?? 0, visa: "accorde" },
          manifeste: true,
        })
        compte.sessionsVisees += 1
      }
    }

    /* ── Totaux et clôture de la journée ──────────────────────────────── */
    const sales = await ctx.db.query("sales").withIndex("by_accounting_day", (q) => q.eq("accountingDayId", jour._id)).collect()
    const retenues = sales.filter(compteEnCaisse)
    const totalTtc = Math.round(retenues.reduce((s, x) => s + x.amounts.ttc, 0) * 100) / 100
    const totalReceived = Math.round(retenues.reduce((s, x) => s + x.amounts.received, 0) * 100) / 100
    if (jour.totalTtc !== totalTtc || jour.totalReceived !== totalReceived) {
      await ctx.db.patch(jour._id, { totalTtc, totalReceived })
    }
    if (etat !== "close" || jour.status === "cloturee") {
      if (jour.status === "cloturee") await deverser(ctx, jour, args, personnel, compte)
      return compte
    }

    // Une caisse restée ouverte (celle d'un persona, par exemple) est
    // arrêtée à l'attendu avant la clôture : la journée ne se clôture pas
    // tant qu'une caisse est ouverte.
    for (const session of await ctx.db.query("cashSessions").withIndex("by_day", (q) => q.eq("accountingDayId", jour._id)).collect()) {
      if (session.status !== "ouverte") continue
      const ventes = await ctx.db.query("sales").withIndex("by_cash_session", (q) => q.eq("cashSessionId", session._id)).collect()
      const attendu = attenduParMoyen(ventes)
      const closedAt = fromServiceDate(args.date, "19:30")
      await ctx.db.patch(session._id, {
        closedAt,
        expectedByMethod: attendu.length > 0 ? attendu : [{ method: "especes", amountXaf: 0 }],
        countedByMethod: attendu,
        varianceXaf: 0,
        status: "cloturee",
      })
      await journaliser(ctx, {
        acteur: rec._id,
        action: "caisse.cloturer",
        table: "cashSessions",
        id: session._id,
        a: closedAt,
        avant: { status: "ouverte", closedAt: null, expectedByMethod: session.expectedByMethod },
        apres: { varianceXaf: 0, note: "Arrêtée à l'attendu par le contrôle des recettes" },
        manifeste: true,
      })
    }

    const closedAt = lendemain("10:30")
    const nbSessions = sessions.length
    await ctx.db.patch(jour._id, { status: "cloturee", closedAt, closedBy: rec._id, exportStatus: "en_attente" })
    await journaliser(ctx, {
      acteur: rec._id,
      action: "journee.cloturer",
      table: "accountingDays",
      id: jour._id,
      a: closedAt,
      avant: { status: "ouverte" },
      apres: { date: args.date, sessions: nbSessions, totalTtc },
      manifeste: true,
    })
    compte.journeesCloturees += 1
    await deverser(ctx, (await ctx.db.get(jour._id))!, args, personnel, compte)
    return compte
  },
})

/**
 * Journal V65 et déversement SAGE d'une journée clôturée, par les fonctions
 * pures de `model/accounting` — les mêmes que `accounting.generateJournal`.
 */
async function deverser(
  ctx: MutationCtx,
  jour: Doc<"accountingDays">,
  args: { maintenant: number },
  personnel: Personnel,
  compte: { ecrituresJournal: number; deversements: number }
) {
  const aujourdhui = toServiceDate(args.maintenant)
  const cpt = comptable(personnel)
  const genereA = fromServiceDate(addDays(jour.date, 1), "11:00")
  let ecritures = await ctx.db.query("journalEntries").withIndex("by_day", (q) => q.eq("accountingDayId", jour._id)).collect()
  let evenement = (await ctx.db.query("outboxEvents").withIndex("by_type_status", (q) => q.eq("type", "sage_export")).collect()).find(
    (e) => e.entityId === jour._id
  )

  if (ecritures.length === 0) {
    const sales = (await ctx.db.query("sales").withIndex("by_accounting_day", (q) => q.eq("accountingDayId", jour._id)).collect()).filter(compteEnCaisse)
    const codes = new Map<string, string>()
    const lignes: AccountableSale[] = []
    for (const sale of sales) {
      let code = sale.pointOfSaleId ? codes.get(sale.pointOfSaleId) : "INCONNU"
      if (code === undefined && sale.pointOfSaleId) {
        code = (await ctx.db.get(sale.pointOfSaleId))?.code ?? "INCONNU"
        codes.set(sale.pointOfSaleId, code)
      }
      lignes.push({
        number: sale.number,
        product: sale.product as AccountingProduct,
        kind: sale.kind,
        pointOfSaleCode: code ?? "INCONNU",
        saleDate: new Date(sale.soldAt).toISOString().slice(0, 10),
        ht: sale.amounts.ht,
        vat: sale.amounts.vat,
        css: sale.amounts.css,
        ttc: sale.amounts.ttc,
      })
    }
    const entries = buildJournalEntries(lignes, { financialSite: "SETRAG" })
    const validation = validateJournal(entries, jour.totalTtc)
    if (!validation.balanced) {
      throw new Error(`Journal du ${jour.date} déséquilibré : ${validation.anomalies.map((a) => a.reason).join(" ; ")}`)
    }
    for (const entry of entries) {
      await ctx.db.insert("journalEntries", { accountingDayId: jour._id, ...entry })
    }
    const eventId = await ctx.db.insert("outboxEvents", {
      type: "sage_export",
      entityId: jour._id,
      payload: serializeJournal(entries),
      status: "en_attente",
      attempts: 0,
      createdAt: genereA,
    })
    const remboursements = entries.filter((e) => e.ttc < 0).reduce((s, e) => s + e.ttc, 0)
    await ctx.db.patch(jour._id, {
      exportStatus: "en_attente",
      journalEntryCount: entries.length,
      journalTotalTtc: validation.totalTtc,
      journalRefundsTtc: Math.round(Math.abs(remboursements) * 100) / 100,
      journalGeneratedAt: genereA,
    })
    await journaliser(ctx, {
      acteur: cpt._id,
      action: "comptabilite.journal",
      table: "accountingDays",
      id: jour._id,
      a: genereA,
      apres: { date: jour.date, entries: entries.length, totalTtc: validation.totalTtc },
      // Le journal et son déversement sont retirés au reset, même sur une
      // journée que le seed n'a pas créée.
      manifeste: true,
    })
    compte.ecrituresJournal += entries.length
    ecritures = await ctx.db.query("journalEntries").withIndex("by_day", (q) => q.eq("accountingDayId", jour._id)).collect()
    evenement = (await ctx.db.get(eventId))!
  }
  if (!evenement) return

  // Le dernier jour clôturé attend encore son envoi ; le jour du rejet
  // reste en échec jusqu'à la correction du plan analytique.
  const dernier = addDays(aujourdhui, -2)
  const rejet = addDays(aujourdhui, -JOURS_AVANT_REJET)
  const envoiA = fromServiceDate(addDays(jour.date, 1), "11:20")
  if (jour.date === dernier || evenement.status === "envoye") return
  if (envoiA > args.maintenant) return

  if (jour.date === rejet && evenement.status === "en_attente") {
    const rejetees = ecritures.filter((e) => e.analyticAccount === "706300")
    const pieces = (rejetees.length > 0 ? rejetees : ecritures.slice(0, 1)).map((e) => ({
      pieceNumber: e.pieceNumber,
      pointOfSaleCode: e.pointOfSaleCode,
      analyticAccount: e.analyticAccount,
      costCenter: e.costCenter,
      ttc: e.ttc,
      reason: `Compte analytique ${e.analyticAccount} inconnu dans SAGE X3 (section non ouverte sur le site SETRAG)`,
    }))
    const erreur = `Rejet SAGE X3 : compte analytique ${pieces[0]?.analyticAccount ?? "706300"} inconnu — ${pieces.length} pièce(s) rejetée(s)`
    await ctx.db.patch(evenement._id, { status: "echec", attempts: 1, lastError: erreur })
    await ctx.db.patch(jour._id, { exportStatus: "echec", exportError: erreur })
    await ctx.db.insert("sageTransmissions", {
      accountingDayId: jour._id,
      outboxEventId: evenement._id,
      attempt: 1,
      sentAt: envoiA,
      result: "rejete",
      receiptNumber: `SX3-REJ-${jour.date.replaceAll("-", "")}-01`,
      pieceCount: ecritures.length,
      totalTtc: jour.journalTotalTtc ?? jour.totalTtc,
      rejectedPieces: pieces,
      simulated: true,
      sentBy: cpt._id,
    })
    await journaliser(ctx, {
      acteur: cpt._id,
      action: "comptabilite.deversement",
      table: "accountingDays",
      id: jour._id,
      a: envoiA + 4 * 60_000,
      resultat: "echec",
      apres: { integrated: false, error: erreur },
    })
    compte.deversements += 1
    return
  }
  if (jour.date === rejet) return

  const tentative = evenement.attempts + 1
  await ctx.db.patch(evenement._id, { status: "envoye", attempts: tentative, sentAt: envoiA, lastError: undefined })
  await ctx.db.patch(jour._id, { exportStatus: "integre", exportError: undefined })
  await ctx.db.insert("sageTransmissions", {
    accountingDayId: jour._id,
    outboxEventId: evenement._id,
    attempt: tentative,
    sentAt: envoiA,
    result: "integre",
    receiptNumber: `SX3-VT-${jour.date.replaceAll("-", "")}-${String(tentative).padStart(2, "0")}`,
    pieceCount: ecritures.length,
    totalTtc: jour.journalTotalTtc ?? jour.totalTtc,
    rejectedPieces: [],
    simulated: true,
    sentBy: cpt._id,
  })
  await journaliser(ctx, {
    acteur: cpt._id,
    action: "comptabilite.deversement",
    table: "accountingDays",
    id: jour._id,
    a: envoiA + 3 * 60_000,
    apres: { integrated: true },
  })
  compte.deversements += 1
}

/* ═══════════════════════════════ Cumuls ═════════════════════════════════════ */

export const ciblesCumuls = internalQuery({
  args: { du: v.string(), au: v.string() },
  handler: async (ctx, args) => {
    const journees = (await ctx.db.query("accountingDays").collect())
      .filter((d) => d.date >= args.du && d.date <= args.au)
      .map((d) => d._id)
    const dessertes = (
      await ctx.db
        .query("trips")
        .withIndex("by_service_date", (q) => q.gte("serviceDate", args.du).lte("serviceDate", args.au))
        .collect()
    ).map((t) => t._id)
    return { journees, dessertes }
  },
})

/* ═══════════════════════════════ Rapports ═══════════════════════════════════ */

const RAPPORTS = [
  {
    label: "État de caisse quotidien — gares principales",
    type: "etat_caisse" as const,
    frequence: "quotidien" as const,
    format: "pdf" as const,
    destinataires: ["recettes@setrag.ga", "dcfv@setrag.ga"],
  },
  {
    label: "Ventes hebdomadaires par canal",
    type: "ventes" as const,
    frequence: "hebdomadaire" as const,
    format: "xlsx" as const,
    destinataires: ["direction.commerciale@setrag.ga"],
  },
  {
    label: "Remboursements du mois",
    type: "remboursements" as const,
    frequence: "mensuel" as const,
    format: "csv" as const,
    destinataires: ["comptabilite@setrag.ga", "recettes@setrag.ga"],
  },
  {
    label: "Places vendues par desserte",
    type: "places_vendues" as const,
    frequence: "quotidien" as const,
    format: "csv" as const,
    destinataires: ["exploitation@setrag.ga"],
  },
] as const

function prochaineExecution(frequence: "quotidien" | "hebdomadaire" | "mensuel", aujourdhui: string): number {
  if (frequence === "quotidien") return fromServiceDate(addDays(aujourdhui, 1), "06:00")
  if (frequence === "hebdomadaire") {
    let d = addDays(aujourdhui, 1)
    while (new Date(fromServiceDate(d, "12:00")).getUTCDay() !== 1) d = addDays(d, 1)
    return fromServiceDate(d, "06:30")
  }
  const [a, m] = aujourdhui.split("-").map(Number) as [number, number]
  const suivant = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`
  return fromServiceDate(suivant, "07:00")
}

/**
 * Exécutions passées des rapports programmés.
 *
 * Inscrites « en cours » comme le fait `reportSchedules.run`, puis produites
 * par la vraie chaîne de production (`pilotage.produireRapport`) : le fichier
 * téléchargeable et l'aperçu reprennent les chiffres de la base.
 */
export const rapports = internalMutation({
  args: argsCommuns,
  handler: async (ctx, args) => {
    const aujourdhui = toServiceDate(args.maintenant)
    const programmes = await ctx.db.query("reportSchedules").collect()
    const executions: Array<{ runId: Id<"reportRuns">; a: number }> = []
    for (const r of RAPPORTS) {
      const programme = programmes.find((p) => p.label === r.label)
      if (!programme) continue
      const deja = await ctx.db.query("reportRuns").withIndex("by_schedule", (q) => q.eq("scheduleId", programme._id)).collect()
      const faites = new Set(deja.map((x) => x.to))
      let derniere = programme.lastRunAt ?? 0
      for (let d = args.debut; d < aujourdhui; d = addDays(d, 1)) {
        const lendemain = addDays(d, 1)
        const lundi = weekdayOf(lendemain) === 1
        const periode =
          r.frequence === "quotidien"
            ? { du: d, a: fromServiceDate(lendemain, "06:00") }
            : r.frequence === "hebdomadaire" && lundi
              ? { du: addDays(d, -6), a: fromServiceDate(lendemain, "06:30") }
              : r.frequence === "mensuel" && lendemain.endsWith("-01")
                ? { du: `${d.slice(0, 7)}-01`, a: fromServiceDate(lendemain, "07:00") }
                : null
        if (!periode || periode.a > args.maintenant || faites.has(d)) continue
        const runId = await ctx.db.insert("reportRuns", {
          reportType: r.type,
          trigger: "programme",
          scheduleId: programme._id,
          from: periode.du,
          to: d,
          filters: {},
          status: "en_cours",
          requestedAt: periode.a,
          delivery: { recipients: [...r.destinataires], status: "en_file" },
        })
        await journaliser(ctx, {
          action: "rapport.executer",
          table: "reportRuns",
          id: runId,
          a: periode.a,
          apres: { label: r.label, from: periode.du, to: d },
          manifeste: true,
        })
        executions.push({ runId, a: periode.a })
        derniere = Math.max(derniere, periode.a)
      }
      if (derniere > (programme.lastRunAt ?? 0)) {
        await ctx.db.patch(programme._id, { lastRunAt: derniere, updatedAt: derniere })
      }
    }
    return executions
  },
})

/**
 * La production date l'achèvement et l'envoi de l'instant présent : on les
 * ramène à l'heure de l'exécution programmée.
 */
export const daterExecutions = internalMutation({
  args: { executions: v.array(v.object({ runId: v.id("reportRuns"), a: v.number() })) },
  handler: async (ctx, args) => {
    for (const { runId, a } of args.executions) {
      const run = await ctx.db.get(runId)
      if (!run) continue
      const fin = a + 38_000 + (run.rowCount ?? 0) * 40
      await ctx.db.patch(runId, { requestedAt: a, completedAt: run.status === "en_cours" ? undefined : fin })
      if (run.delivery?.outboxEventId) {
        const evenement = await ctx.db.get(run.delivery.outboxEventId)
        if (evenement) await ctx.db.patch(evenement._id, { createdAt: fin, sentAt: fin })
      }
    }
    return { executionsRapports: args.executions.length }
  },
})

/* ═══════════════════════════ Scellement du journal ═══════════════════════════ */

/**
 * Recalcule la chaîne des scellements à partir de la première fenêtre
 * touchée par le seed.
 *
 * Le seed écrit des entrées datées du passé ; un scellement déjà posé sur
 * ces journées ne correspondrait plus à leur contenu. La chaîne est donc
 * tronquée puis reconstruite, fenêtre par fenêtre, par la fonction de
 * scellement du module d'audit.
 */
async function resceller(ctx: ActionCtx, depuis: number): Promise<Record<string, number>> {
  const { fenetres, supprimes } = await ctx.runMutation(internal.seeds.demoActivite.tronquerScellements, { depuis })
  for (const f of fenetres) {
    await ctx.runMutation(internal.modules.platform.audit.sealWindow, f)
  }
  return { scellementsRetires: supprimes, scellements: fenetres.length }
}

export const tronquerScellements = internalMutation({
  args: { depuis: v.number() },
  handler: async (ctx, args) => {
    const debut = Math.floor(args.depuis / 86_400_000) * 86_400_000
    const scelles = await ctx.db.query("auditSeals").withIndex("by_window_end", (q) => q.gt("windowEnd", debut)).collect()
    for (const s of scelles) await ctx.db.delete(s._id)
    const precedent = await ctx.db.query("auditSeals").withIndex("by_window_end").order("desc").first()
    // Première entrée non scellée, pour ne pas sceller des jours vides.
    const premiere = await ctx.db
      .query("auditLogs")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", precedent?.windowEnd ?? debut))
      .first()
    const fin = Math.floor(Date.now() / 86_400_000) * 86_400_000
    const fenetres: Array<{ windowStart: number; windowEnd: number }> = []
    if (!premiere) return { fenetres, supprimes: scelles.length }
    let start = precedent?.windowEnd ?? Math.floor(premiere.createdAt / 86_400_000) * 86_400_000
    while (start + 86_400_000 <= fin) {
      fenetres.push({ windowStart: start, windowEnd: start + 86_400_000 })
      start += 86_400_000
    }
    return { fenetres, supprimes: scelles.length }
  },
})

/* ═══════════════════════════════ Consignation ═══════════════════════════════ */

/**
 * Compte rendu du seed : dans les journaux du serveur, pas dans le journal
 * d'audit métier, que les écrans présentent comme l'activité des agents. Les
 * anciennes versions l'y écrivaient : `retirerConsignations` les enlève.
 */
export const consigner = internalMutation({
  args: { maintenant: v.number(), rapport: v.string() },
  handler: async (_ctx, args) => {
    console.log(`[demoActivite] ${new Date(args.maintenant).toISOString()} ${args.rapport}`)
  },
})

/** Retire les comptes rendus écrits par les anciennes versions du seed. */
export const retirerConsignations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const lignes = (await ctx.db.query("auditLogs").withIndex("by_createdAt").order("desc").take(20000)).filter(
      (ligne) => ligne.action === "seed.activite"
    )
    for (const ligne of lignes) await ctx.db.delete(ligne._id)
    return lignes.length
  },
})

/* ═══════════════════════════════ Réinitialisation ═══════════════════════════ */

/**
 * Retire l'activité de démonstration, et elle seule : voir
 * `seeds/demoActiviteReset.ts` pour le détail de ce qui est défait.
 *
 *   bunx convex run seeds/demoActivite:reset
 */
export const reset = internalAction({
  args: {
    /** Reprise après relance : préfixes de numérotation et dates déjà touchés. */
    numeros: v.optional(v.array(v.string())),
    dates: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<Rapport> => {
    assertDemo()
    const lancement = Date.now()
    const numeros = new Set(args.numeros ?? [])
    const dates = new Set(args.dates ?? [])
    const rapport: Record<string, number> = { ventes: 0, terrain: 0, manifeste: 0, audit: 0 }
    const relancer = async () => {
      await ctx.scheduler.runAfter(0, internal.seeds.demoActivite.reset, {
        numeros: [...numeros],
        dates: [...dates],
      })
      return { ...rapport, relance: "reprise planifiée" }
    }
    const horsBudget = () => Date.now() - lancement > BUDGET_ACTION_MS

    // 1. Ventes et tout ce qui en dépend, inventaire rendu.
    for (;;) {
      const r = await ctx.runMutation(internal.seeds.demoActiviteReset.supprimerVentes, {})
      rapport.ventes! += r.supprimees
      for (const n of r.numeros) numeros.add(n)
      for (const d of r.dates) dates.add(d)
      if (r.termine) break
      if (horsBudget()) return await relancer()
    }
    // 2. Contrôles, procès-verbaux, incidents.
    for (;;) {
      const r = await ctx.runMutation(internal.seeds.demoActiviteReset.supprimerTerrain, {})
      rapport.terrain! += r.supprimes
      if (r.termine) break
    }
    // 3. Créations et modifications recensées, de la plus récente à la plus ancienne.
    const entrees: Array<{ action: string; table: string; id: string; avant?: string; a: number }> = []
    let curseur: string | null = null
    for (;;) {
      const page: {
        page: Array<{ action: string; table: string; id: string; avant?: string; a: number }>
        isDone: boolean
        continueCursor: string
      } = await ctx.runQuery(internal.seeds.demoActiviteReset.manifeste, {
        paginationOpts: { numItems: 500, cursor: curseur, maximumRowsRead: 8_000 },
      })
      entrees.push(...page.page)
      if (page.isDone) break
      curseur = page.continueCursor
    }
    entrees.sort((a, b) => b.a - a.a)
    let reste = entrees
    while (reste.length > 0) {
      const lot = reste.slice(0, 40)
      const r = await ctx.runMutation(internal.seeds.demoActiviteReset.defaireLot, { entrees: lot })
      rapport.manifeste! += lot.length - r.restantes.length
      reste = [...r.restantes, ...reste.slice(40)]
      if (horsBudget()) return await relancer()
    }
    // 4. Numérotation continue.
    const prefixes = [...numeros]
    for (let i = 0; i < prefixes.length; i += 80) {
      await ctx.runMutation(internal.seeds.demoActiviteReset.recalerSequences, { prefixes: prefixes.slice(i, i + 80) })
    }
    // 5. Totaux et cumuls des journées et dessertes conservées.
    const triees = [...dates].sort()
    for (let i = 0; i < triees.length; i += 20) {
      await ctx.runMutation(internal.seeds.demoActiviteReset.recalerJournees, { dates: triees.slice(i, i + 20) })
    }
    if (triees.length > 0) {
      const cibles = await ctx.runQuery(internal.seeds.demoActivite.ciblesCumuls, {
        du: triees[0]!,
        au: addDays(triees[triees.length - 1]!, 30),
      })
      for (const accountingDayId of cibles.journees) {
        await ctx.runMutation(internal.functions.rollup.rollupAccountingDay, { accountingDayId })
      }
      for (const tripId of cibles.dessertes) {
        await ctx.runMutation(internal.functions.rollup.rollupTrip, { tripId })
      }
    }
    // 6. Journal d'audit, puis rescellement.
    let premiere: number | null = null
    let curseurAudit: string | null = null
    for (;;) {
      const r: { supprimees: number; premiere: number | null; curseur: string; termine: boolean } = await ctx.runMutation(
        internal.seeds.demoActiviteReset.supprimerAudit,
        { curseur: curseurAudit }
      )
      rapport.audit! += r.supprimees
      if (r.premiere !== null) premiere = premiere === null ? r.premiere : Math.min(premiere, r.premiere)
      if (r.termine) break
      curseurAudit = r.curseur
    }
    if (premiere !== null) Object.assign(rapport, await resceller(ctx, premiere))
    return rapport
  },
})

/* ═══════════════════════════════ Lecture ════════════════════════════════════ */

/** Synthèse de l'activité fabriquée, pour vérifier un déploiement. */
export const etat = internalQuery({
  args: {},
  handler: async (ctx) => {
    const ventes = await ctx.db
      .query("sales")
      .withIndex("by_client_id", (q) => q.gte("clientSaleId", PREFIXE).lt("clientSaleId", PREFIXE_FIN))
      .collect()
    return {
      ventes: ventes.filter((s) => s.kind === "vente").length,
      annulations: ventes.filter((s) => s.kind === "annulation").length,
      remboursements: ventes.filter((s) => s.kind === "remboursement").length,
      chiffreAffairesTtc: Math.round(ventes.reduce((t, s) => t + s.amounts.ttc, 0)),
    }
  },
})

