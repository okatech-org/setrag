import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../_generated/api"
import { DEMO_PERSONAS } from "../model/demoPersonas"
import { EXTERNAL_STAKEHOLDER_ROLES } from "../model/permissions"
import { MODULE_CODES, MODULE_MANIFEST } from "../modules/platform/catalog"
import schema from "../schema"
import { modules } from "../test.setup"

const INTERNAL_PERSONA_INVENTORY = [
  ["gestion", "Direction générale", "direction_generale"],
  ["audit", "Audit & risques", "audit_risques"],
  ["juridique", "Affaires juridiques", "juriste"],
  [
    "dsi",
    "Administrateur système — Direction des Systèmes d’Information & Projets Métiers",
    "admin_it",
  ],
  ["cotraf", "Régulateur COTRAF", "regulateur_cotraf"],
  ["chef-gare", "Chef de gare", "chef_gare"],
  ["conducteur", "Conducteur de ligne", "conducteur_ligne"],
  ["controle", "Contrôleur", "controleur_train"],
  ["chef-train", "Chef de train", "chef_train"],
  ["visite-rames", "Visiteur de rames", "visiteur_rames"],
  ["atelier", "Ingénieur d’atelier", "ingenieur_atelier"],
  ["contremaitre-atelier", "Contremaître d’atelier", "contremaitre_atelier"],
  ["magasin", "Magasinier pièces", "magasinier"],
  ["stocks", "Gestionnaire de stocks", "gestionnaire_stocks"],
  ["voie", "Brigade de voie", "agent_voie"],
  ["cantonnier", "Cantonnier", "cantonnier"],
  ["prn", "Responsable PRN", "responsable_prn"],
  [
    "ouvrages-ponts",
    "Responsable ouvrages d’art & ponts",
    "agent_ouvrages_ponts",
  ],
  ["signalisation", "Technicien signalisation", "technicien_signalisation"],
  ["telecoms", "Technicien télécoms", "technicien_telecoms"],
  ["agent", "Guichetier", "vendeur_guichet"],
  ["chef-vente", "Chef de vente", "chef_vente"],
  ["fret", "Gestionnaire grands comptes fret", "gestionnaire_fret"],
  [
    "litiges-fret",
    "Gestionnaire des litiges fret",
    "gestionnaire_litiges_fret",
  ],
  ["comptable", "Comptable général", "comptable"],
  ["comptable-auxiliaire", "Comptable auxiliaire", "comptable_auxiliaire"],
  ["fiscalite", "Fiscaliste", "fiscaliste"],
  ["tresorerie", "Trésorier", "tresorier"],
  ["paie", "Gestionnaire de paie", "gestionnaire_paie"],
  ["roulements", "Planificateur des roulements", "planificateur_roulements"],
  ["medecine", "Médecin du travail", "medecin_travail"],
  ["infirmerie", "Infirmier du travail", "infirmier_travail"],
  ["securite", "Responsable sécurité des circulations", "inspecteur_securite"],
  [
    "enquetes-accidents",
    "Enquêteur accidents ferroviaires",
    "enqueteur_accidents",
  ],
  [
    "environnement-lope",
    "Responsable environnement & Lopé",
    "responsable_environnement",
  ],
] as const

describe("Comptes de démonstration", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("ne divulgue aucun identifiant lorsque le mode démo est désactivé", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "false")
    const t = convexTest(schema, modules)

    expect(await t.query(api.functions.demoAccounts.list, {})).toEqual([])
  })

  it("retourne uniquement les comptes entièrement configurés", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    vi.stubEnv("DEMO_PERSONAS_PASSWORD", "")
    vi.stubEnv("DEMO_AGENT_EMAIL", "agent@setrag.ga")
    vi.stubEnv("DEMO_AGENT_PASSWORD", "agent-secret")
    vi.stubEnv("DEMO_MANAGEMENT_EMAIL", "gestion@setrag.ga")
    vi.stubEnv("DEMO_MANAGEMENT_PASSWORD", "")
    const t = convexTest(schema, modules)

    const accounts = await t.query(api.functions.demoAccounts.list, {})
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toMatchObject({
      key: "agent",
      label: "Guichetier",
      actorType: "interne",
      group: "dcfv",
      groupLabel: "DCFV · Commercial fret & voyageurs",
      role: "vendeur_guichet",
      landingPath: "/vente",
      moduleCodes: ["voyageurs"],
      firstName: "Démo",
      lastName: "Vente",
      email: "agent@setrag.ga",
      password: "agent-secret",
    })
  })

  it("expose le compte contrôleur lorsqu'il est configuré", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    vi.stubEnv("DEMO_PERSONAS_PASSWORD", "")
    vi.stubEnv("DEMO_AGENT_EMAIL", "")
    vi.stubEnv("DEMO_MANAGEMENT_EMAIL", "")
    vi.stubEnv("DEMO_CONTROL_EMAIL", "controle@setrag.ga")
    vi.stubEnv("DEMO_CONTROL_PASSWORD", "controle-secret")
    const t = convexTest(schema, modules)

    expect(await t.query(api.functions.demoAccounts.list, {})).toEqual([
      expect.objectContaining({
        key: "controle",
        label: "Contrôleur",
        role: "controleur_train",
        email: "controle@setrag.ga",
        password: "controle-secret",
      }),
    ])
  })

  it("ne rend que les comptes demandés par l'application appelante", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    vi.stubEnv("DEMO_PERSONAS_PASSWORD", "")
    vi.stubEnv("DEMO_AGENT_EMAIL", "agent@setrag.ga")
    vi.stubEnv("DEMO_AGENT_PASSWORD", "agent-secret")
    vi.stubEnv("DEMO_CONTROL_EMAIL", "controle@setrag.ga")
    vi.stubEnv("DEMO_CONTROL_PASSWORD", "controle-secret")
    const t = convexTest(schema, modules)

    // Le terminal du contrôleur ne doit recevoir aucun identifiant de guichet.
    const rendus = await t.query(api.functions.demoAccounts.list, {
      only: ["controle"],
    })
    expect(rendus.map((c) => c.key)).toEqual(["controle"])
  })

  it("dérive les 45 comptes du mot de passe partagé et du domaine par défaut", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    vi.stubEnv("DEMO_PERSONAS_PASSWORD", "shared-secret")
    vi.stubEnv("DEMO_PERSONAS_EMAIL_DOMAIN", "")
    vi.stubEnv("DEMO_AGENT_EMAIL", "")
    vi.stubEnv("DEMO_MANAGEMENT_EMAIL", "")
    vi.stubEnv("DEMO_CONTROL_EMAIL", "")
    const t = convexTest(schema, modules)

    const accounts = await t.query(api.functions.demoAccounts.list, {})
    expect(accounts).toHaveLength(45)
    expect(accounts.every(({ password }) => password === "shared-secret")).toBe(
      true
    )
    expect(accounts.find(({ key }) => key === "eaux-forets")?.email).toBe(
      "eaux-forets@demo.setrag.ga"
    )
  })

  it("donne priorité aux credentials historiques lorsqu'ils sont complets", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    vi.stubEnv("DEMO_PERSONAS_PASSWORD", "shared-secret")
    vi.stubEnv("DEMO_PERSONAS_EMAIL_DOMAIN", "showcase.setrag.ga")
    vi.stubEnv("DEMO_AGENT_EMAIL", "Guichet.Historique@setrag.ga")
    vi.stubEnv("DEMO_AGENT_PASSWORD", "legacy-secret")
    vi.stubEnv("DEMO_MANAGEMENT_EMAIL", "")
    vi.stubEnv("DEMO_MANAGEMENT_PASSWORD", "")
    const t = convexTest(schema, modules)

    const accounts = await t.query(api.functions.demoAccounts.list, {
      only: ["agent", "gestion"],
    })
    expect(
      accounts.map(({ key, email, password }) => ({ key, email, password }))
    ).toEqual([
      {
        key: "gestion",
        email: "gestion@showcase.setrag.ga",
        password: "shared-secret",
      },
      {
        key: "agent",
        email: "guichet.historique@setrag.ga",
        password: "legacy-secret",
      },
    ])
  })
})

describe("Catalogue des acteurs SETRAG", () => {
  it("couvre explicitement 35 fonctions internes et 10 parties prenantes externes", () => {
    expect(DEMO_PERSONAS).toHaveLength(45)
    const internes = DEMO_PERSONAS.filter(
      ({ actorType }) => actorType === "interne"
    )
    expect(internes).toHaveLength(35)
    expect(internes.map(({ key, label, role }) => [key, label, role])).toEqual(
      INTERNAL_PERSONA_INVENTORY
    )
    expect(new Set(internes.map(({ role }) => role)).size).toBe(35)
    const externes = DEMO_PERSONAS.filter(
      ({ actorType }) => actorType === "externe"
    )
    expect(externes).toHaveLength(10)
    expect(externes.map(({ role }) => role).sort()).toEqual(
      [...EXTERNAL_STAKEHOLDER_ROLES].sort()
    )
  })

  it("utilise des clés uniques, des routes connues et des modules valides", () => {
    expect(new Set(DEMO_PERSONAS.map(({ key }) => key)).size).toBe(45)
    const routes = new Set([
      ...MODULE_MANIFEST.map(({ route }) => route),
      "/vente",
      "/administration",
    ])
    for (const profile of DEMO_PERSONAS) {
      expect(routes.has(profile.landingPath)).toBe(true)
      expect(profile.moduleCodes.length).toBeGreaterThan(0)
      expect(
        profile.moduleCodes.every((code) => MODULE_CODES.includes(code))
      ).toBe(true)
    }
  })

  it("provisionne un profil et ses dix activations de façon idempotente", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)
    const pointOfSaleId = await t.run((ctx) =>
      ctx.db.insert("pointsOfSale", {
        code: "OWE-PV",
        name: "Owendo — point de vente",
        type: "gare",
        counters: { passengers: 4, baggage: 2, parcels: 2 },
        isActive: true,
      })
    )
    const args = {
      key: "agent",
      authId: "better-auth-demo-agent",
      email: "AGENT@demo.setrag.ga",
    }

    const first = await t.mutation(
      internal.seeds.demoAccounts.upsertPersonaProfile,
      args
    )
    const second = await t.mutation(
      internal.seeds.demoAccounts.upsertPersonaProfile,
      args
    )
    expect(first).toMatchObject({
      key: "agent",
      created: true,
      createdActivations: 10,
      updatedActivations: 0,
    })
    expect(second).toMatchObject({
      key: "agent",
      created: false,
      createdActivations: 0,
      updatedActivations: 10,
    })

    const state = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").collect(),
      activations: await ctx.db.query("moduleActivations").collect(),
    }))
    expect(state.users).toHaveLength(1)
    expect(state.users[0]).toMatchObject({
      email: "agent@demo.setrag.ga",
      role: "vendeur_guichet",
      identitySource: "local",
      isActive: true,
      pointOfSaleId,
    })
    expect(state.activations).toHaveLength(10)
    expect(
      state.activations
        .filter(({ isEnabled }) => isEnabled)
        .map(({ moduleCode }) => moduleCode)
    ).toEqual(["voyageurs"])
  })

  it("provisionne le persona DSI avec les dix modules activés", async () => {
    vi.stubEnv("SETRAG_ENV", "test")
    const t = convexTest(schema, modules)

    const result = await t.mutation(
      internal.seeds.demoAccounts.upsertPersonaProfile,
      {
        key: "dsi",
        authId: "better-auth-demo-dsi",
        email: "DSI@demo.setrag.ga",
      }
    )
    expect(result).toMatchObject({
      key: "dsi",
      created: true,
      createdActivations: 10,
    })

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(result.userId),
      activations: await ctx.db
        .query("moduleActivations")
        .withIndex("by_environment_module_user", (query) =>
          query
            .eq("environment", "test")
            .eq("moduleCode", "voyageurs")
            .eq("userId", result.userId)
        )
        .collect(),
      allActivations: await ctx.db.query("moduleActivations").collect(),
    }))
    expect(state.user).toMatchObject({
      firstName: "Démo",
      lastName: "DSI",
      role: "admin_it",
      identitySource: "local",
      isActive: true,
    })
    expect(state.activations).toHaveLength(1)
    expect(state.allActivations).toHaveLength(10)
    expect(state.allActivations.every(({ isEnabled }) => isEnabled)).toBe(true)
  })
})
