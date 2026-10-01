/// <reference types="vite/client" />

import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { AppRole } from "../../model/permissions"
import schema from "../../schema"
import { modules } from "../../test.setup"
import { CORPUS_ETUDES } from "./corpus"
import {
  avancementPour,
  decouperSections,
  extrait,
  texteBrut,
  verifierTransition,
} from "./model"

type Test = ReturnType<typeof convexTest>

afterEach(() => {
  vi.unstubAllEnvs()
})

async function compte(t: Test, authId: string, role: AppRole) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { authId, role, firstName: authId, identitySource: "local", isActive: true })
  )
  return { userId, client: t.withIdentity({ subject: authId }) }
}

async function scene() {
  vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
  const t = convexTest(schema, modules)
  const audit = await compte(t, "audit", "audit_risques")
  const audit2 = await compte(t, "audit2", "audit_risques")
  const dg = await compte(t, "dg", "direction_generale")
  const gare = await compte(t, "gare", "chef_gare")
  const comilog = await compte(t, "comilog", "representant_comilog")
  await t.mutation(internal.modules.etudes.seed.run, {})
  return { t, audit, audit2, dg, gare, comilog }
}

describe("études — découpage et règles", () => {
  it("découpe une étude en sections ancrées, sans titres de code", () => {
    const sections = decouperSections(
      "Intro\n\n# Titre\n\nTexte **gras**.\n\n```\n# pas un titre\n```\n\n## Titre\n\n| a | b |\n"
    )
    expect(sections.map((section) => section.ancre)).toEqual(["preambule", "titre", "titre-2"])
    expect(sections[1]!.corps).toContain("# pas un titre")
    expect(texteBrut("**Gras** et `code` | cellule |")).toBe("Gras et code cellule")
    expect(extrait("Le fret minier de manganèse traverse Booué.", "manganese")).toContain("manganèse")
  })

  it("découpe tout le corpus avec des ancres uniques", () => {
    for (const etude of CORPUS_ETUDES) {
      const ancres = decouperSections(etude.contenu).map((section) => section.ancre)
      expect(new Set(ancres).size).toBe(ancres.length)
      expect(ancres.length).toBeGreaterThan(2)
    }
  })

  it("encadre le cycle de vie d'une action", () => {
    expect(() => verifierTransition("a_lancer", "en_cours", { auditeur: false, responsable: true })).not.toThrow()
    expect(() => verifierTransition("a_lancer", "en_cours", { auditeur: false, responsable: false })).toThrow()
    expect(() => verifierTransition("realisee", "verifiee", { auditeur: true, responsable: true })).toThrow(
      "Séparation des tâches"
    )
    expect(() => verifierTransition("en_cours", "verifiee", { auditeur: true, responsable: false })).toThrow(
      "réalisée"
    )
    expect(() => verifierTransition("verifiee", "en_cours", { auditeur: true, responsable: false })).toThrow("close")
    expect(avancementPour("realisee", 40, 40)).toBe(100)
    expect(avancementPour("en_cours", 100, 10)).toBe(95)
    expect(() => avancementPour("en_cours", 120, 10)).toThrow()
  })
})

describe("études — bibliothèque et plan d'actions", () => {
  it("charge la bibliothèque une fois, idempotente, consultable et cherchable", async () => {
    const { t, gare } = await scene()
    const second = await t.mutation(internal.modules.etudes.seed.run, {})
    expect(second.etudes.chargees).toBe(0)
    expect(second.constats).toBe(0)
    const compter = () =>
      t.run(async (ctx) => ({
        etudes: (await ctx.db.query("etudesDocuments").collect()).length,
        constats: (await ctx.db.query("etudesConstats").collect()).length,
      }))
    expect(await compter()).toEqual({ etudes: CORPUS_ETUDES.length, constats: 6 })
    await t.mutation(internal.modules.etudes.seed.run, { reset: true })
    expect(await compter()).toEqual({ etudes: CORPUS_ETUDES.length, constats: 6 })

    const bibliotheque = await gare.client.query(api.modules.etudes.queries.bibliotheque, {})
    expect(bibliotheque.etudes).toHaveLength(CORPUS_ETUDES.length)
    expect(bibliotheque.droits.peutGererPlan).toBe(false)
    const etude = await gare.client.query(api.modules.etudes.queries.etude, {
      code: "RECETTE_ESPACE_DIRECTION_GENERALE",
    })
    expect(etude?.sections.length).toBeGreaterThan(3)
    const resultats = await gare.client.query(api.modules.etudes.queries.rechercher, { texte: "manganèse" })
    expect(resultats.length).toBeGreaterThan(0)
  })

  it("refuse l'espace aux parties prenantes externes", async () => {
    const { comilog } = await scene()
    await expect(comilog.client.query(api.modules.etudes.queries.bibliotheque, {})).rejects.toThrow(
      "réservé au personnel"
    )
  })

  it("trace annotations et suivi d'une action, avec séparation des tâches", async () => {
    const { t, audit, audit2, dg, gare } = await scene()
    const { annotationId } = await gare.client.mutation(api.modules.etudes.mutations.annoter, {
      code: "RECETTE_ESPACE_DIRECTION_GENERALE",
      ancre: "1-objet",
      nature: "question",
      texte: "Qui valide la grille de visa ?",
    })
    await expect(
      gare.client.mutation(api.modules.etudes.mutations.traiterAnnotation, { annotationId, reponse: "Moi" })
    ).rejects.toThrow("référents")
    await dg.client.mutation(api.modules.etudes.mutations.traiterAnnotation, {
      annotationId,
      reponse: "La Direction générale.",
    })
    await expect(
      gare.client.mutation(api.modules.etudes.mutations.annoter, {
        code: "RECETTE_ESPACE_DIRECTION_GENERALE",
        ancre: "section-inexistante",
        nature: "commentaire",
        texte: "Texte",
      })
    ).rejects.toThrow("section")

    await expect(
      gare.client.mutation(api.modules.etudes.mutations.creerConstat, {
        titre: "Constat interdit",
        constat: "Un chef de gare ne tient pas le plan.",
        recommandation: "Réserver le plan à l'audit.",
        gravite: "mineure",
        direction: "DEF",
        responsableId: gare.userId,
        echeance: "2026-12-31",
      })
    ).rejects.toThrow("audit et risques")

    const { constatId, reference } = await audit.client.mutation(api.modules.etudes.mutations.creerConstat, {
      titre: "Registre des clés non tenu",
      constat: "Les clés des locaux techniques ne sont pas tracées.",
      recommandation: "Tenir un registre signé des remises de clés.",
      gravite: "moderee",
      direction: "DEF",
      responsableId: gare.userId,
      echeance: "2026-12-31",
      code: "RECETTE_ESPACE_DIRECTION_GENERALE",
    })
    expect(reference).toMatch(/^AUD-\d{4}-001$/)

    await gare.client.mutation(api.modules.etudes.mutations.suivreConstat, {
      constatId,
      statut: "en_cours",
      avancement: 30,
      commentaire: "Registre commandé",
    })
    await expect(
      gare.client.mutation(api.modules.etudes.mutations.suivreConstat, { constatId, statut: "verifiee" })
    ).rejects.toThrow()
    await gare.client.mutation(api.modules.etudes.mutations.suivreConstat, { constatId, statut: "realisee" })
    await audit.client.mutation(api.modules.etudes.mutations.suivreConstat, {
      constatId,
      statut: "verifiee",
      commentaire: "Registre contrôlé sur place",
    })
    const fiche = await audit2.client.query(api.modules.etudes.queries.constat, { constatId })
    expect(fiche?.constat).toMatchObject({ statut: "verifiee", avancement: 100 })
    expect(fiche?.suivis.map((suivi) => suivi.nature)).toEqual(["statut", "statut", "statut", "creation"])

    const journal = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (q) => q.eq("entityTable", "etudesConstats").eq("entityId", constatId))
        .collect()
    )
    expect(journal.length).toBe(4)
  })
})
