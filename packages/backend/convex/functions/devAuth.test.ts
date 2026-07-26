import { convexTest } from "convex-test"
import { afterEach, describe, expect, it } from "vitest"
import { api, internal } from "../_generated/api"
import schema from "../schema"
import { modules } from "../test.setup"

/**
 * Récupération des codes de connexion en développement.
 *
 * Ces tests portent moins sur ce que la porte fait que sur le fait qu'elle
 * reste FERMÉE par défaut. Une porte dérobée qui s'ouvrirait par oubli de
 * configuration serait pire que pas de porte du tout.
 */

function armer(valeur: string | undefined) {
  if (valeur === undefined) delete process.env.DEV_SIGNIN_ENABLED
  else process.env.DEV_SIGNIN_ENABLED = valeur
}

afterEach(() => armer(undefined))

describe("interrupteur fermé — comportement par défaut", () => {
  it("refuse de rendre un code", async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.mutation(api.functions.devAuth.consumeCode, { identifier: "a@b.ga" }),
    ).rejects.toThrow(/DEV_SIGNIN_ENABLED/)
  })

  it("n'écrit rien, même si on le lui demande", async () => {
    const t = convexTest(schema, modules)
    const r = await t.mutation(internal.functions.devAuth.record, {
      identifier: "a@b.ga",
      code: "123456",
      channel: "email",
    })
    expect(r.stored).toBe(false)
    const stockés = await t.run(async (c) => c.db.query("devOtpCodes").collect())
    expect(stockés).toHaveLength(0)
  })

  it("l'annonce à l'interface", async () => {
    const t = convexTest(schema, modules)
    expect(await t.query(api.functions.devAuth.status, {})).toEqual({
      enabled: false,
    })
  })

  it("reste fermé sur une valeur approchante", async () => {
    // Seul « true » exact ouvre : « 1 », « yes » ou « TRUE » ne suffisent pas.
    for (const valeur of ["1", "yes", "TRUE", "True", ""]) {
      armer(valeur)
      const t = convexTest(schema, modules)
      expect(await t.query(api.functions.devAuth.status, {})).toEqual({
        enabled: false,
      })
    }
  })
})

describe("interrupteur armé", () => {
  it("retient puis rend le code émis", async () => {
    armer("true")
    const t = convexTest(schema, modules)
    await t.mutation(internal.functions.devAuth.record, {
      identifier: "paul@example.ga",
      code: "482913",
      channel: "email",
    })

    const r = await t.mutation(api.functions.devAuth.consumeCode, {
      identifier: "paul@example.ga",
    })
    expect(r?.code).toBe("482913")
    expect(r?.channel).toBe("email")
  })

  it("consomme le code : il ne sert qu'une fois", async () => {
    armer("true")
    const t = convexTest(schema, modules)
    await t.mutation(internal.functions.devAuth.record, {
      identifier: "+241 06 11 22 33",
      code: "111222",
      channel: "sms",
    })

    await t.mutation(api.functions.devAuth.consumeCode, {
      identifier: "+241 06 11 22 33",
    })
    const second = await t.mutation(api.functions.devAuth.consumeCode, {
      identifier: "+241 06 11 22 33",
    })
    expect(second).toBeNull()
  })

  it("ne garde qu'un code vivant par destinataire", async () => {
    armer("true")
    const t = convexTest(schema, modules)
    for (const code of ["111111", "222222", "333333"]) {
      await t.mutation(internal.functions.devAuth.record, {
        identifier: "paul@example.ga",
        code,
        channel: "email",
      })
    }
    const stockés = await t.run(async (c) => c.db.query("devOtpCodes").collect())
    expect(stockés).toHaveLength(1)

    const r = await t.mutation(api.functions.devAuth.consumeCode, {
      identifier: "paul@example.ga",
    })
    expect(r?.code).toBe("333333")
  })

  it("ne rend pas le code d'un autre destinataire", async () => {
    armer("true")
    const t = convexTest(schema, modules)
    await t.mutation(internal.functions.devAuth.record, {
      identifier: "paul@example.ga",
      code: "999999",
      channel: "email",
    })
    expect(
      await t.mutation(api.functions.devAuth.consumeCode, {
        identifier: "marie@example.ga",
      }),
    ).toBeNull()
  })

  it("ignore et purge un code périmé", async () => {
    armer("true")
    const t = convexTest(schema, modules)
    await t.run(async (c) =>
      c.db.insert("devOtpCodes", {
        identifier: "paul@example.ga",
        code: "000000",
        channel: "email",
        createdAt: Date.now() - 3_600_000,
        expiresAt: Date.now() - 1_000,
      }),
    )

    expect(
      await t.mutation(api.functions.devAuth.consumeCode, {
        identifier: "paul@example.ga",
      }),
    ).toBeNull()
    // Sans purge, les codes morts s'accumuleraient sans que rien ne les ramasse.
    const restants = await t.run(async (c) =>
      c.db.query("devOtpCodes").collect(),
    )
    expect(restants).toHaveLength(0)
  })
})

describe("visibilité en supervision", () => {
  it("remonte un constat critique tant que la porte est ouverte", async () => {
    armer("true")
    const t = convexTest(schema, modules)
    await t.run(async (ctx) =>
      ctx.db.insert("users", {
        authId: "kpi-dev",
        role: "responsable_kpi",
        identitySource: "annuaire",
        isActive: true,
      }),
    )
    const ctx = t.withIdentity({ subject: "kpi-dev" })

    const bilan = await ctx.query(api.functions.monitoring.health, {})
    expect(bilan.severity).toBe("critique")
    expect(bilan.findings[0]!.code).toBe("connexion_developpement_ouverte")
    expect(bilan.findings[0]!.action).toMatch(/DEV_SIGNIN_ENABLED/)
  })

  it("ne dit rien quand la porte est fermée", async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) =>
      ctx.db.insert("users", {
        authId: "kpi-prod",
        role: "responsable_kpi",
        identitySource: "annuaire",
        isActive: true,
      }),
    )
    const ctx = t.withIdentity({ subject: "kpi-prod" })

    const bilan = await ctx.query(api.functions.monitoring.health, {})
    expect(bilan.findings.map((f) => f.code)).not.toContain(
      "connexion_developpement_ouverte",
    )
  })
})
