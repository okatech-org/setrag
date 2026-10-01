import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import type { AppRole } from "../../model/permissions"
import schema from "../../schema"
import { modules } from "../../test.setup"
import { ajouterJours, dateLibreville, debutJournee } from "./model"

type T = ReturnType<typeof convexTest>

async function activerModule(t: T) {
  await t.run(async (ctx) => {
    const admin = await ctx.db.insert("users", { authId: "activateur", role: "admin_it", identitySource: "local", isActive: true })
    await ctx.db.insert("moduleActivations", {
      moduleCode: "rh",
      environment: "test",
      isEnabled: true,
      reason: "Tests du module RH",
      correlationId: "rh-activation",
      changedBy: admin,
      updatedAt: Date.now(),
    })
  })
}

async function utilisateur(t: T, role: AppRole, authId: string = role) {
  await t.run((ctx) => ctx.db.insert("users", { authId, role, identitySource: "local", isActive: true, firstName: "Test", lastName: role }))
  return t.withIdentity({ subject: authId })
}

const aujourdhui = () => dateLibreville(Date.now())

async function agentDeBase(t: T, metier: "conducteur_ligne" | "administratif" = "conducteur_ligne") {
  const paie = t.withIdentity({ subject: "gestionnaire_paie" })
  const { agentId } = await paie.mutation(api.modules.rh.agents.embaucher, {
    nom: "Obame",
    prenom: "Guy-Roger",
    sexe: "M",
    dateNaissance: "1984-05-12",
    situationFamiliale: "marie",
    enfantsACharge: 2,
    direction: "DEF",
    metier,
    poste: "Conducteur de ligne",
    gareCode: "OWE",
    categorie: "maitrise",
    echelon: 4,
    contrat: "cdi",
    dateEmbauche: "2015-02-01",
    salaireBaseFcfa: 520_000,
    primeFonctionFcfa: 40_000,
    primeSujetionFcfa: 55_000,
    modePaiement: "virement",
  })
  return agentId
}

describe("module RH", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it("cloisonne les capacités : organisme social, planificateur et administration système", async () => {
    const t = convexTest(schema, modules)
    await activerModule(t)
    await utilisateur(t, "gestionnaire_paie")
    const organisme = await utilisateur(t, "organisme_social")
    const planificateur = await utilisateur(t, "planificateur_roulements")
    const dsi = await utilisateur(t, "admin_it")
    await agentDeBase(t)

    const acces = await organisme.query(api.modules.rh.accueil.monAcces, {})
    expect(acces.lectureSeule).toBe(true)
    expect(acces.capacites).toContain("declarations.lire")
    await expect(organisme.query(api.modules.rh.agents.lister, {})).rejects.toThrow("consulter les dossiers du personnel")
    await expect(planificateur.query(api.modules.rh.paie.listerPeriodes, {})).rejects.toThrow("Accès refusé")

    const dossiers = await planificateur.query(api.modules.rh.agents.lister, {})
    expect(dossiers).toHaveLength(1)
    const dossier = await planificateur.query(api.modules.rh.agents.dossier, { agentId: dossiers[0]!._id })
    // La rémunération ne sort pas du service paie.
    expect(dossier?.agent.remuneration).toBeNull()
    expect(dossier?.bulletins).toBeNull()

    await expect(
      dsi.mutation(api.modules.rh.paie.ouvrirPeriode, { code: "2026-09" })
    ).rejects.toThrow("Accès refusé")
  })

  it("isole le détail médical et trace sa consultation", async () => {
    const t = convexTest(schema, modules)
    await activerModule(t)
    await utilisateur(t, "gestionnaire_paie")
    const infirmier = await utilisateur(t, "infirmier_travail")
    const medecin = await utilisateur(t, "medecin_travail")
    const admin = await utilisateur(t, "admin_fonctionnel")
    const paie = t.withIdentity({ subject: "gestionnaire_paie" })
    const agentId = await agentDeBase(t)

    const { visiteId } = await infirmier.mutation(api.modules.rh.aptitude.programmer, {
      agentId,
      type: "periodique",
      dateProgrammee: aujourdhui(),
      lieu: "Centre médical SETRAG — Owendo",
    })
    await expect(
      medecin.mutation(api.modules.rh.aptitude.prononcer, { visiteId, resultat: "apte" })
    ).rejects.toThrow("saisissez les examens")
    await infirmier.mutation(api.modules.rh.aptitude.saisirExamens, {
      visiteId,
      tensionArterielle: "125/80",
      observations: "Hypertension débutante, surveillance.",
    })
    await expect(
      infirmier.mutation(api.modules.rh.aptitude.prononcer, { visiteId, resultat: "apte" })
    ).rejects.toThrow("prononcer une aptitude")
    const decision = await medecin.mutation(api.modules.rh.aptitude.prononcer, {
      visiteId,
      resultat: "apte_restriction",
      restrictionFonctionnelle: "Pas de conduite de nuit",
    })
    expect(decision.valideJusquau).toBeDefined()

    // Hors service médical : le statut, jamais les examens.
    const vueRh = await paie.query(api.modules.rh.aptitude.visite, { visiteId })
    expect(vueRh?.visite.resultat).toBe("apte_restriction")
    expect(vueRh?.examensSaisis).toBeNull()
    expect(vueRh?.chronologie.some((e) => e.action === "rh.medical.examens")).toBe(false)
    expect(JSON.stringify(vueRh)).not.toContain("Hypertension")
    await expect(paie.mutation(api.modules.rh.aptitude.consulterExamens, { agentId })).rejects.toThrow("dossier médical")
    await expect(admin.mutation(api.modules.rh.aptitude.consulterExamens, { agentId })).rejects.toThrow("dossier médical")

    const examens = await medecin.mutation(api.modules.rh.aptitude.consulterExamens, { agentId })
    expect(examens[0]?.observations).toContain("Hypertension")
    const audits = await t.run((ctx) => ctx.db.query("auditLogs").withIndex("by_action", (q) => q.eq("action", "rh.medical.consulter")).collect())
    expect(audits).toHaveLength(1)
    expect(audits[0]?.classification).toBe("restreint")
    expect(audits[0]?.after).toBeUndefined()
  })

  it("mène une période de paie de l'ouverture à la déclaration simulée", async () => {
    vi.useFakeTimers()
    const t = convexTest(schema, modules)
    await activerModule(t)
    await utilisateur(t, "gestionnaire_paie")
    const admin = await utilisateur(t, "admin_fonctionnel")
    const paie = t.withIdentity({ subject: "gestionnaire_paie" })
    const agentId = await agentDeBase(t)

    const { periodeId } = await paie.mutation(api.modules.rh.paie.ouvrirPeriode, { code: "2026-09" })
    await expect(paie.mutation(api.modules.rh.paie.ouvrirPeriode, { code: "2026-10" })).rejects.toThrow("clôturez-la")
    await paie.mutation(api.modules.rh.paie.enregistrerVariables, {
      periodeId,
      agentId,
      heuresSup125: 6,
      heuresSup150: 0,
      heuresSup200: 0,
      kmTraction: 3_200,
      nuitsDecouche: 5,
      primeExceptionnelleFcfa: 0,
      joursAbsence: 0,
      avanceSalaireFcfa: 0,
    })
    const calcul = await paie.mutation(api.modules.rh.paie.calculerPeriode, { periodeId })
    expect(calcul.totaux.effectif).toBe(1)
    expect(calcul.totaux.net).toBeGreaterThan(0)

    await expect(paie.mutation(api.modules.rh.paie.validerPeriode, { periodeId })).rejects.toThrow("Accès refusé")
    await expect(paie.mutation(api.modules.rh.paie.cloturerPeriode, { periodeId })).rejects.toThrow("validée")
    await admin.mutation(api.modules.rh.paie.validerPeriode, { periodeId })
    await expect(
      paie.mutation(api.modules.rh.paie.enregistrerVariables, {
        periodeId,
        agentId,
        heuresSup125: 0,
        heuresSup150: 0,
        heuresSup200: 0,
        kmTraction: 0,
        nuitsDecouche: 0,
        primeExceptionnelleFcfa: 0,
        joursAbsence: 0,
        avanceSalaireFcfa: 0,
      })
    ).rejects.toThrow("figés")
    await paie.mutation(api.modules.rh.paie.cloturerPeriode, { periodeId })

    const { declarationId } = await paie.mutation(api.modules.rh.paie.transmettreDeclaration, { periodeId, organisme: "CNSS" })
    await expect(paie.mutation(api.modules.rh.paie.transmettreDeclaration, { periodeId, organisme: "CNSS" })).rejects.toThrow("déjà été transmise")
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const declaration = await t.run((ctx) => ctx.db.get(declarationId))
    expect(declaration?.statut).toBe("accusee")
    expect(declaration?.mode).toBe("simulation")

    const bulletins = await paie.query(api.modules.rh.paie.periode, { periodeId })
    const bulletin = await paie.query(api.modules.rh.paie.bulletin, { bulletinId: bulletins!.bulletins[0]!._id })
    expect(bulletin?.bulletin.statut).toBe("valide")
    expect(bulletin?.bulletin.totaux.cnssSalarie).toBe(declaration?.partSalariale)
  })

  it("refuse un service à un agent inapte et exige une dérogation écrite pour un repos court", async () => {
    const t = convexTest(schema, modules)
    await activerModule(t)
    await utilisateur(t, "gestionnaire_paie")
    const planificateur = await utilisateur(t, "planificateur_roulements")
    const agentId = await agentDeBase(t)
    const demain = ajouterJours(aujourdhui(), 1)
    const debut = debutJournee(demain) + 7 * 3_600_000
    const service = {
      agentId,
      debut,
      fin: debut + 5 * 3_600_000,
      type: "conduite" as const,
      pauseMinutes: 0,
      trainNumber: "TR-201",
      gareDebutCode: "OWE",
      gareFinCode: "BOO",
      decouche: true,
    }
    await expect(planificateur.mutation(api.modules.rh.roulements.planifier, service)).rejects.toThrow("Aptitude")

    // Aptitude et habilitation à jour.
    await t.run(async (ctx) => {
      await ctx.db.insert("rhVisitesMedicales", {
        agentId: agentId as Id<"rhAgents">,
        numero: "VM-TEST-1",
        type: "periodique",
        statut: "realisee",
        dateProgrammee: aujourdhui(),
        lieu: "Owendo",
        realiseeLe: Date.now(),
        resultat: "apte",
        valideJusquau: ajouterJours(aujourdhui(), 300),
        origine: "saisie",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      await ctx.db.insert("rhHabilitations", {
        agentId: agentId as Id<"rhAgents">,
        type: "conduite_ligne",
        numero: "HAB-1",
        delivreeLe: "2025-01-01",
        expireLe: ajouterJours(aujourdhui(), 400),
        organisme: "SETRAG",
        statut: "valide",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })
    const premier = await planificateur.mutation(api.modules.rh.roulements.planifier, service)
    expect(premier.alertes).toBe(0)

    const retour = { ...service, debut: debut + 13 * 3_600_000, fin: debut + 18 * 3_600_000, gareDebutCode: "BOO", gareFinCode: "OWE" }
    await expect(planificateur.mutation(api.modules.rh.roulements.planifier, retour)).rejects.toThrow("Dérogation requise")
    const second = await planificateur.mutation(api.modules.rh.roulements.planifier, { ...retour, derogation: "Train de secours, aucun autre conducteur à Booué." })
    expect(second.alertes).toBe(1)

    await expect(
      planificateur.mutation(api.modules.rh.roulements.planifier, { ...service, debut: debut + 3_600_000, fin: debut + 2 * 3_600_000 })
    ).rejects.toThrow("chevauche")

    const planning = await planificateur.query(api.modules.rh.roulements.planning, { du: demain, au: ajouterJours(demain, 1) })
    expect(planning.services).toHaveLength(2)
    expect(planning.totaux.alertes).toBe(2)
  })

  it("sépare la saisie et la validation d'un congé", async () => {
    const t = convexTest(schema, modules)
    await activerModule(t)
    await utilisateur(t, "gestionnaire_paie")
    const planificateur = await utilisateur(t, "planificateur_roulements")
    const paie = t.withIdentity({ subject: "gestionnaire_paie" })
    const agentId = await agentDeBase(t)
    const du = ajouterJours(aujourdhui(), 20)
    const { congeId, jours } = await paie.mutation(api.modules.rh.conges.demander, { agentId, type: "annuel", du, au: ajouterJours(du, 6) })
    expect(jours).toBeGreaterThanOrEqual(6)
    await expect(paie.mutation(api.modules.rh.conges.statuer, { congeId, decision: "valide" })).rejects.toThrow("Séparation des tâches")
    await expect(planificateur.mutation(api.modules.rh.conges.statuer, { congeId, decision: "refuse" })).rejects.toThrow("motivé")
    await planificateur.mutation(api.modules.rh.conges.statuer, { congeId, decision: "valide", note: "Accord du chef de service" })
    await expect(
      paie.mutation(api.modules.rh.conges.demander, { agentId, type: "annuel", du: ajouterJours(du, 2), au: ajouterJours(du, 3) })
    ).rejects.toThrow("chevauche")
  })

  it("peuple un jeu de démonstration idempotent, refusé hors démonstration", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "false")
    const t = convexTest(schema, modules)
    await expect(t.mutation(internal.modules.rh.seed.peupler, {})).rejects.toThrow("DEMO_ACCOUNTS_ENABLED")

    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    await t.run((ctx) => ctx.db.insert("users", { authId: "demo-paie", role: "gestionnaire_paie", identitySource: "local", isActive: true, firstName: "Démo", lastName: "Paie" }))
    const premier = await t.mutation(internal.modules.rh.seed.peupler, {})
    expect(premier.cree).toBe(true)
    expect(premier.agents).toBe(150)
    expect(premier.periodes).toBe(3)
    expect(premier.bulletins).toBeGreaterThan(400)
    expect(premier.services).toBeGreaterThan(150)
    expect("agentsRelies" in premier ? premier.agentsRelies : null).toBe(1)

    const second = await t.mutation(internal.modules.rh.seed.peupler, {})
    expect(second.cree).toBe(false)
    expect(second.agents).toBe(premier.agents)
    expect(second.bulletins).toBe(premier.bulletins)

    const statuts = await t.run(async (ctx) => (await ctx.db.query("rhPeriodesPaie").collect()).map((p) => p.statut).sort())
    expect(statuts).toEqual(["calculee", "cloturee", "cloturee"])

    // Le roulement contient des conflits à résoudre, détectés à la lecture.
    await activerModule(t)
    const planificateur = await utilisateur(t, "planificateur_roulements")
    const tableau = await planificateur.query(api.modules.rh.accueil.tableauDeBord, {})
    expect(tableau.effectif.actifs).toBeGreaterThan(140)
    expect(tableau.roulement.bloquants).toBeGreaterThanOrEqual(2)
    expect(tableau.aptitudes.aRenouveler).toBeGreaterThan(0)

    const reinitialise = await t.mutation(internal.modules.rh.seed.peupler, { reset: true })
    expect(reinitialise.cree).toBe(true)
    expect(reinitialise.agents).toBe(150)
    expect(reinitialise.bulletins).toBe(premier.bulletins)
  })
})
