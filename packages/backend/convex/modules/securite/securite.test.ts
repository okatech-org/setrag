import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import type { AppRole } from "../../model/permissions"
import schema from "../../schema"
import { modules } from "../../test.setup"
import { capacitesSecurite } from "./acces"
import { ajouterJours, bornesTrimestre, dansZoneLope, dateLibreville, manquesRapport, obligationNotification } from "./model"

type T = ReturnType<typeof convexTest>

async function activerModule(t: T) {
  await t.run(async (ctx) => {
    const admin = await ctx.db.insert("users", { authId: "activateur-securite", role: "admin_it", identitySource: "local", isActive: true })
    await ctx.db.insert("moduleActivations", {
      moduleCode: "securite",
      environment: "test",
      isEnabled: true,
      reason: "Tests du module Sécurité",
      correlationId: "securite-activation",
      changedBy: admin,
      updatedAt: Date.now(),
    })
  })
}

async function utilisateur(t: T, role: AppRole, authId: string = role) {
  const id = await t.run((ctx) => ctx.db.insert("users", { authId, role, identitySource: "local", isActive: true, firstName: "Test", lastName: authId }))
  return { id, client: t.withIdentity({ subject: authId }) }
}

const evenementGrave = {
  type: "franchissement_signal" as const,
  gravite: "grave" as const,
  gareCode: "NDJ",
  description: "Franchissement du carré d'entrée fermé de Ndjolé par le MIN-704.",
  blesses: 0,
  deces: 0,
}

describe("règles de sécurité", () => {
  it("fixe l'obligation et le délai de notification ARTF", () => {
    const base = { type: "heurt_animal" as const, gravite: "mineur" as const, blesses: 0, deces: 0, zoneLope: false }
    expect(obligationNotification(base).requise).toBe(false)
    expect(obligationNotification({ ...base, deces: 1 }).delaiHeures).toBe(24)
    expect(obligationNotification({ ...base, gravite: "grave" }).delaiHeures).toBe(72)
    expect(obligationNotification({ ...base, type: "deraillement" }).requise).toBe(true)
    expect(obligationNotification({ ...base, type: "feu_brousse", gravite: "significatif", zoneLope: true }).delaiHeures).toBe(168)
    expect(obligationNotification({ ...base, type: "feu_brousse", gravite: "significatif", zoneLope: false }).requise).toBe(false)
    expect(dansZoneLope(290)).toBe(true)
    expect(dansZoneLope(338)).toBe(false)
    expect(bornesTrimestre("2026-T3").libelle).toBe("3e trimestre 2026")
    expect(manquesRapport({ causes: [], recommandations: [] })).toHaveLength(4)
  })

  it("répartit les capacités selon le profil", () => {
    expect(capacitesSecurite(["controleur_train"]).has("evenement.declarer")).toBe(true)
    expect(capacitesSecurite(["controleur_train"]).has("evenement.qualifier")).toBe(false)
    expect(capacitesSecurite(["chef_gare"]).has("evenement.declarer")).toBe(false)
    expect(capacitesSecurite(["chef_gare"]).has("registre.lire")).toBe(true)
    expect(capacitesSecurite(["auditeur_artf"]).has("artf.gerer")).toBe(false)
    expect(capacitesSecurite(["controleur_eaux_forets"]).has("registre.lire")).toBe(false)
    expect(capacitesSecurite(["controleur_eaux_forets"]).has("environnement.lire")).toBe(true)
    expect(capacitesSecurite(["bailleur_fonds"])).toEqual(new Set(["indicateurs"]))
  })
})

describe("module Sécurité", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it("mène une enquête de la déclaration à la clôture, avec transmission ARTF simulée", async () => {
    vi.useFakeTimers()
    const t = convexTest(schema, modules)
    await activerModule(t)
    const chefTrain = await utilisateur(t, "chef_train")
    const inspecteur = await utilisateur(t, "inspecteur_securite")
    const enqueteur = await utilisateur(t, "enqueteur_accidents")
    const controleur = await utilisateur(t, "controleur_train")
    const artf = await utilisateur(t, "auditeur_artf")

    const { evenementId } = await chefTrain.client.mutation(api.modules.securite.evenements.declarer, {
      ...evenementGrave,
      survenuLe: Date.now() - 2 * 3_600_000,
    })
    await expect(
      controleur.client.mutation(api.modules.securite.evenements.qualifier, { evenementId, type: "franchissement_signal", gravite: "grave", blesses: 0, deces: 0 })
    ).rejects.toThrow("qualifier un événement")

    const dossier = await inspecteur.client.query(api.modules.securite.evenements.dossier, { evenementId })
    expect(dossier?.evenement.notificationRequise).toBe(true)
    expect(dossier?.declarations.map((d) => d.nature)).toEqual(["notification_immediate"])
    // L'ARTF ne voit rien tant que rien n'est transmis.
    expect(await artf.client.query(api.modules.securite.artf.lister, {})).toHaveLength(0)

    await expect(
      inspecteur.client.mutation(api.modules.securite.evenements.classer, { evenementId, motif: "Sans objet" })
    ).rejects.toThrow("ne se classe pas")
    const { enqueteId } = await inspecteur.client.mutation(api.modules.securite.evenements.ouvrirEnquete, {
      evenementId,
      enqueteurId: enqueteur.id,
    })

    await enqueteur.client.mutation(api.modules.securite.enquetes.enregistrer, {
      enqueteId,
      constats: "Signal d'avertissement lu tardivement par brouillard dense.",
      causes: [{ categorie: "organisation", description: "Pas de consigne brouillard", racine: false }],
      recommandations: [],
    })
    await expect(enqueteur.client.mutation(api.modules.securite.enquetes.soumettre, { enqueteId })).rejects.toThrow("cause racine")
    await enqueteur.client.mutation(api.modules.securite.enquetes.enregistrer, {
      enqueteId,
      constats: "Signal d'avertissement lu tardivement par brouillard dense.",
      causes: [{ categorie: "organisation", description: "Pas de consigne brouillard", racine: true }],
      recommandations: [{ texte: "Instaurer la marche à vue par brouillard" }],
      conclusion: "Défaut de consigne d'exploitation.",
    })
    await enqueteur.client.mutation(api.modules.securite.enquetes.soumettre, { enqueteId })
    await expect(enqueteur.client.mutation(api.modules.securite.enquetes.cloturer, { enqueteId })).rejects.toThrow("clôturer une enquête")
    await expect(inspecteur.client.mutation(api.modules.securite.enquetes.cloturer, { enqueteId })).rejects.toThrow("plan d'actions")

    await enqueteur.client.mutation(api.modules.securite.actions.creer, {
      libelle: "Rédiger la consigne de marche à vue par brouillard",
      responsableNom: "Chef du service sécurité des circulations",
      responsableDirection: "DSED",
      echeance: ajouterJours(dateLibreville(Date.now()), 30),
      priorite: "haute",
      enqueteId,
    })
    const cloture = await inspecteur.client.mutation(api.modules.securite.enquetes.cloturer, { enqueteId })
    expect(cloture.rapportArtf).not.toBeNull()

    const apres = await inspecteur.client.query(api.modules.securite.evenements.dossier, { evenementId })
    expect(apres?.evenement.statut).toBe("cloture")
    const rapport = apres!.declarations.find((d) => d.nature === "rapport_enquete")!
    expect(rapport.statut).toBe("prete")
    expect(rapport.contenu).toContain("Défaut de consigne")

    await inspecteur.client.mutation(api.modules.securite.artf.transmettre, { declarationId: rapport._id })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const vueArtf = await artf.client.query(api.modules.securite.artf.lister, {})
    expect(vueArtf).toHaveLength(1)
    expect(vueArtf[0]?.statut).toBe("accusee")
    // La notification restée à préparer reste invisible pour l'ARTF.
    const notification = apres!.declarations.find((d) => d.nature === "notification_immediate")!
    await expect(artf.client.query(api.modules.securite.artf.dossier, { declarationId: notification._id })).rejects.toThrow("pas été transmise")
  })

  it("interdit à l'enquêteur désigné de clôturer sa propre enquête", async () => {
    const t = convexTest(schema, modules)
    await activerModule(t)
    const inspecteur = await utilisateur(t, "inspecteur_securite")
    const second = await utilisateur(t, "inspecteur_securite", "second-inspecteur")
    const { evenementId } = await inspecteur.client.mutation(api.modules.securite.evenements.declarer, {
      ...evenementGrave,
      gravite: "significatif",
      type: "rupture_attelage",
      survenuLe: Date.now() - 3_600_000,
    })
    const { enqueteId } = await inspecteur.client.mutation(api.modules.securite.evenements.ouvrirEnquete, { evenementId, enqueteurId: inspecteur.id })
    await inspecteur.client.mutation(api.modules.securite.enquetes.enregistrer, {
      enqueteId,
      constats: "Usure anormale du crochet de l'attelage 42-43.",
      causes: [{ categorie: "materiel", description: "Crochet usé", racine: true }],
      recommandations: [{ texte: "Contrôler les crochets d'attelage à chaque visite" }],
      conclusion: "Défaut matériel isolé.",
    })
    await inspecteur.client.mutation(api.modules.securite.enquetes.soumettre, { enqueteId })
    await inspecteur.client.mutation(api.modules.securite.actions.creer, {
      libelle: "Ajouter le contrôle des crochets à la visite",
      responsableNom: "Ingénieur matériel",
      responsableDirection: "DMAT",
      echeance: ajouterJours(dateLibreville(Date.now()), 20),
      priorite: "normale",
      enqueteId,
    })
    await expect(inspecteur.client.mutation(api.modules.securite.enquetes.cloturer, { enqueteId })).rejects.toThrow("Séparation des tâches")
    await second.client.mutation(api.modules.securite.enquetes.cloturer, { enqueteId })
  })

  it("qualifie un incident d'exploitation remonté du terrain, une seule fois", async () => {
    const t = convexTest(schema, modules)
    await activerModule(t)
    const chefTrain = await utilisateur(t, "chef_train")
    const incidentId = await t.run((ctx) =>
      ctx.db.insert("incidents", {
        reporterId: chefTrain.id,
        category: "securite",
        severity: "critique",
        description: "Pierre posée sur le rail au PK 84, train arrêté.",
        photoStorageIds: [],
        status: "ouvert",
        reportedAt: Date.now() - 3_600_000,
        offline: false,
        clientId: "terrain-1",
        number: "INC-2026-0042",
      })
    )
    const aQualifier = await chefTrain.client.query(api.modules.securite.evenements.incidentsAQualifier, {})
    expect(aQualifier.map((i) => i._id)).toEqual([incidentId])
    await chefTrain.client.mutation(api.modules.securite.evenements.declarer, {
      type: "malveillance",
      gravite: "significatif",
      pk: 84,
      description: "Pierre posée sur le rail au PK 84.",
      blesses: 0,
      deces: 0,
      survenuLe: Date.now() - 3_600_000,
      incidentId,
    })
    expect(await chefTrain.client.query(api.modules.securite.evenements.incidentsAQualifier, {})).toHaveLength(0)
    await expect(
      chefTrain.client.mutation(api.modules.securite.evenements.declarer, {
        type: "malveillance",
        gravite: "significatif",
        pk: 84,
        description: "Doublon",
        blesses: 0,
        deces: 0,
        survenuLe: Date.now() - 3_600_000,
        incidentId,
      })
    ).rejects.toThrow("déjà qualifié")
  })

  it("peuple un jeu de démonstration idempotent, refusé hors démonstration", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "false")
    const t = convexTest(schema, modules)
    await expect(t.mutation(internal.modules.securite.seed.peupler, {})).rejects.toThrow("DEMO_ACCOUNTS_ENABLED")
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    const premier = await t.mutation(internal.modules.securite.seed.peupler, {})
    expect(premier.cree).toBe(true)
    expect(premier.evenements).toBe(20)
    expect(premier.inspections).toBe(12)
    expect(premier.actions).toBeGreaterThan(20)
    const second = await t.mutation(internal.modules.securite.seed.peupler, {})
    expect(second).toMatchObject({ cree: false, evenements: 20, actions: premier.actions, declarations: premier.declarations })

    await activerModule(t)
    const inspecteur = await utilisateur(t, "inspecteur_securite")
    const tableau = await inspecteur.client.query(api.modules.securite.accueil.tableauDeBord, {})
    expect(tableau.evenements12Mois).toBe(20)
    expect(tableau.actions.enRetard).toBeGreaterThan(0)
    expect(tableau.artf.enRetard).toBeGreaterThan(0)
    expect(tableau.enquetes.aCloturer).toBe(1)
    const statuts = await t.run(async (ctx) => [...new Set((await ctx.db.query("securiteEnquetes").collect()).map((e) => e.statut))].sort())
    expect(statuts).toEqual(["cloturee", "instruction", "ouverte", "rapport_soumis"])

    const reset = await t.mutation(internal.modules.securite.seed.peupler, { reset: true })
    expect(reset).toMatchObject({ cree: true, evenements: 20, actions: premier.actions })
  })
})

export type { Id }
