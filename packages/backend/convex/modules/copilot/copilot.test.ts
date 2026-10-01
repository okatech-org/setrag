/// <reference types="vite/client" />

import rateLimiterTest from "@convex-dev/rate-limiter/test"
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { corpsEnvoyes, reponseOpenAI } from "../../ai/fournisseurs.test-utils"
import type { AppRole } from "../../model/permissions"
import schema from "../../schema"
import { modules } from "../../test.setup"
import { consignes, OUTILS_COPILOT } from "./model"

type Test = ReturnType<typeof convexTest>

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function compte(t: Test, authId: string, role: AppRole) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { authId, role, firstName: authId, lastName: "Test", identitySource: "local", isActive: true })
  )
  return { userId, client: t.withIdentity({ subject: authId }) }
}

async function scene() {
  const t = convexTest(schema, modules)
  rateLimiterTest.register(t)
  const juriste = await compte(t, "juriste", "juriste")
  const audit = await compte(t, "audit", "audit_risques")
  const admin = await compte(t, "admin", "admin_fonctionnel")
  const comilog = await compte(t, "comilog", "representant_comilog")
  for (const moduleCode of ["copilot", "ged"] as const) {
    await t.run((ctx) =>
      ctx.db.insert("moduleActivations", {
        moduleCode,
        environment: "test",
        isEnabled: true,
        reason: "Tests Copilot",
        correlationId: `ACT-${moduleCode}`,
        changedBy: admin.userId,
        updatedAt: Date.now(),
      })
    )
  }
  return { t, juriste, audit, admin, comilog }
}

type CorpsRequete = { tools?: Array<{ name?: string }>; instructions?: string }

function appelOutil(name: string, args: unknown, callId = "call_1") {
  return reponseOpenAI({
    output: [{ type: "function_call", call_id: callId, name, arguments: JSON.stringify(args) }],
    usage: { input_tokens: 40, output_tokens: 10 },
  })
}

function texte(output_text: string) {
  return reponseOpenAI({ output_text, output: [], usage: { input_tokens: 60, output_tokens: 20 } })
}

async function messages(client: Test, conversationId: Id<"copilotConversations">) {
  const vue = await client.query(api.modules.copilot.conversations.conversation, { conversationId })
  return vue!
}

describe("Copilot — garde-fous", () => {
  it("dit clairement qu'il n'est pas configuré, sans fabriquer de réponse", async () => {
    vi.stubEnv("OPENAI_API_KEY", "")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { juriste } = await scene()
    const { conversationId } = await juriste.client.mutation(api.modules.copilot.conversations.creerConversation, {})
    const resultat = await juriste.client.action(api.modules.copilot.chat.envoyerMessage, {
      conversationId,
      requestId: "q1",
      contenu: "Quelles notes de service dois-je lire ?",
    })
    expect(resultat.etat).toBe("non_configure")
    expect(fetchMock).not.toHaveBeenCalled()
    const vue = await messages(juriste.client as unknown as Test, conversationId)
    expect(vue.messages.map((message) => message.statut)).toEqual(["termine", "non_configure"])
    expect(vue.messages[1]!.contenu).toContain("OPENAI_API_KEY")
    expect(vue.conversation.titre).toBe("Quelles notes de service dois-je lire ?")
  })

  it("refuse Copilot aux comptes sans le module", async () => {
    const { comilog } = await scene()
    await expect(comilog.client.mutation(api.modules.copilot.conversations.creerConversation, {})).rejects.toThrow(
      "Accès refusé"
    )
  })

  it("ne propose au modèle que les outils ouverts et refuse un outil fermé", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(appelOutil("ventes_du_jour", { date: null }))
      .mockResolvedValueOnce(texte("Ce compte n'a pas accès aux ventes."))
    vi.stubGlobal("fetch", fetchMock)
    const { t, juriste } = await scene()
    const { conversationId } = await juriste.client.mutation(api.modules.copilot.conversations.creerConversation, {})
    const resultat = await juriste.client.action(api.modules.copilot.chat.envoyerMessage, {
      conversationId,
      requestId: "q1",
      contenu: "Combien de billets vendus aujourd'hui ?",
    })
    expect(resultat.etat).toBe("termine")
    const [premier] = corpsEnvoyes<CorpsRequete>(fetchMock.mock.calls)
    const noms = (premier!.tools ?? []).map((outil) => outil.name)
    expect(noms).toContain("rechercher_documents")
    expect(noms).toContain("hors_perimetre")
    expect(noms).not.toContain("ventes_du_jour")
    expect(noms).not.toContain("proposer_action_audit")
    expect(premier!.instructions).toContain("Ventes du jour — consultation des ventes")

    const vue = await messages(juriste.client as unknown as Test, conversationId)
    const reponse = vue.messages[1]!
    expect(reponse.statut).toBe("termine")
    expect(reponse.outils).toEqual([{ nom: "ventes_du_jour", libelle: "Ventes du jour", statut: "refuse" }])
    expect(reponse.sources).toEqual([])
    const journal = await t.run((ctx) => ctx.db.query("copilotJournal").collect())
    expect(journal.map((ligne) => ligne.evenement)).toEqual(
      expect.arrayContaining(["question", "outil_refuse", "reponse"])
    )
  })

  it("lit le SI avec les droits de l'agent et cite ses sources", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(appelOutil("ventes_du_jour", { date: "2026-09-30" }))
      .mockResolvedValueOnce(texte("Aucune vente le 30 septembre (source : Ventes du jour)."))
    vi.stubGlobal("fetch", fetchMock)
    const { admin } = await scene()
    const { conversationId } = await admin.client.mutation(api.modules.copilot.conversations.creerConversation, {})
    await admin.client.action(api.modules.copilot.chat.envoyerMessage, {
      conversationId,
      requestId: "q1",
      contenu: "Ventes du 30 septembre ?",
    })
    const vue = await messages(admin.client as unknown as Test, conversationId)
    const reponse = vue.messages[1]!
    expect(reponse.contenu).toContain("source : Ventes du jour")
    expect(reponse.sources).toEqual([
      expect.objectContaining({ outil: "ventes_du_jour", libelle: "Ventes du 2026-09-30", lien: "/gestion/recettes" }),
    ])
    expect(reponse.outils[0]).toMatchObject({ nom: "ventes_du_jour", statut: "ok" })
    // Le second appel au modèle porte le résultat de l'outil.
    const [, second] = corpsEnvoyes<{ input: Array<{ type?: string; output?: string }> }>(fetchMock.mock.calls)
    const sortie = second!.input.find((item) => item.type === "function_call_output")
    expect(sortie?.output).toContain("journeeComptable")

    await admin.client.mutation(api.modules.copilot.conversations.donnerRetour, {
      messageId: reponse._id,
      retour: "utile",
    })
    const journal = await admin.client.query(api.modules.copilot.conversations.journal, {})
    expect(journal.indicateurs).toMatchObject({ questions: 1, reponses: 1, utiles: 1 })
  })

  it("journalise un refus hors périmètre", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test")
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(appelOutil("hors_perimetre", { motif: "Sport" }))
        .mockResolvedValueOnce(texte("Je ne réponds qu'aux questions de travail à la SETRAG."))
    )
    const { t, juriste } = await scene()
    const { conversationId } = await juriste.client.mutation(api.modules.copilot.conversations.creerConversation, {})
    await juriste.client.action(api.modules.copilot.chat.envoyerMessage, {
      conversationId,
      requestId: "q1",
      contenu: "Qui a gagné le match ?",
    })
    const journal = await t.run((ctx) => ctx.db.query("copilotJournal").collect())
    expect(journal.find((ligne) => ligne.evenement === "hors_perimetre")?.detail).toBe("Sport")
    // Le journal d'usage reste fermé à un simple utilisateur.
    await expect(juriste.client.query(api.modules.copilot.conversations.journal, {})).rejects.toThrow(
      "réservé"
    )
  })
})

describe("Copilot — écriture sur confirmation explicite", () => {
  it("prépare une action d'audit qui n'existe qu'après confirmation", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test")
    const proposition = {
      titre: "Revue des accès externes",
      constat: "Les accès externes ne sont pas revus chaque trimestre.",
      recommandation: "Instaurer une revue trimestrielle signée par chaque direction.",
      gravite: "moderee",
      direction: "DSI",
      echeance: "2026-12-31",
    }
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(appelOutil("proposer_action_audit", proposition))
        .mockResolvedValueOnce(texte("Proposition prête : confirmez-la sur la carte."))
    )
    const { t, audit, juriste } = await scene()
    const { conversationId } = await audit.client.mutation(api.modules.copilot.conversations.creerConversation, {})
    await audit.client.action(api.modules.copilot.chat.envoyerMessage, {
      conversationId,
      requestId: "q1",
      contenu: "Inscris un constat sur la revue des accès externes.",
    })
    expect(await t.run((ctx) => ctx.db.query("etudesConstats").collect())).toHaveLength(0)
    const vue = await messages(audit.client as unknown as Test, conversationId)
    expect(vue.actions).toHaveLength(1)
    const action = vue.actions[0]!
    expect(action.statut).toBe("a_confirmer")
    expect(vue.messages[1]!.outils[0]).toMatchObject({ statut: "confirmation" })

    // Personne d'autre ne confirme à la place de l'auteur de la question.
    await expect(
      juriste.client.mutation(api.modules.copilot.conversations.confirmerAction, { actionId: action._id })
    ).rejects.toThrow("introuvable")
    const { reference } = await audit.client.mutation(api.modules.copilot.conversations.confirmerAction, {
      actionId: action._id,
    })
    expect(reference).toMatch(/^AUD-\d{4}-001$/)
    await expect(
      audit.client.mutation(api.modules.copilot.conversations.confirmerAction, { actionId: action._id })
    ).rejects.toThrow("déjà été traitée")
    const constats = await t.run((ctx) => ctx.db.query("etudesConstats").collect())
    expect(constats[0]).toMatchObject({ titre: "Revue des accès externes", responsableId: audit.userId })
  })

  it("ne propose pas d'écriture à un compte sans la fonction audit", () => {
    const fermes = OUTILS_COPILOT.filter((outil) => outil.name === "proposer_action_audit")
    const texteConsignes = consignes({
      nom: "Agent",
      role: "juriste",
      roleLibelle: "Juriste",
      maintenant: new Date("2026-10-01T08:00:00Z"),
      ouverts: [],
      fermes,
    })
    expect(texteConsignes).toContain("Proposer une action d'audit — fonction audit et risques")
    expect(texteConsignes).toContain("XAF")
    expect(texteConsignes).not.toContain("FCFA »,")
  })
})

describe("Copilot — exemples", () => {
  it("crée les exemples une fois, marqués comme tels", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    const { t, audit } = await scene()
    const premier = await t.mutation(internal.modules.copilot.seed.run, {})
    const second = await t.mutation(internal.modules.copilot.seed.run, {})
    expect(premier.creees).toBeGreaterThan(0)
    expect(second.creees).toBe(0)
    const conversations = await audit.client.query(api.modules.copilot.conversations.listerConversations, {})
    expect(conversations.every((conversation) => conversation.exemple && conversation.titre.startsWith("[Exemple]"))).toBe(
      true
    )
    const reset = await t.mutation(internal.modules.copilot.seed.run, { reset: true })
    expect(reset.supprimees).toBe(premier.creees)
    expect(reset.creees).toBe(premier.creees)
  })
})
