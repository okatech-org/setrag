import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api } from "../_generated/api"
import schema from "../schema"
import { modules } from "../test.setup"

describe("Comptes de démonstration", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("ne divulgue aucun identifiant lorsque le mode démo est désactivé", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "false")
    const t = convexTest(schema, modules)

    expect(await t.query(api.functions.demoAccounts.list, {})).toEqual([])
  })

  it("retourne uniquement les comptes entièrement configurés", async () => {
    vi.stubEnv("DEMO_ACCOUNTS_ENABLED", "true")
    vi.stubEnv("DEMO_AGENT_EMAIL", "agent@setrag.ga")
    vi.stubEnv("DEMO_AGENT_PASSWORD", "agent-secret")
    vi.stubEnv("DEMO_MANAGEMENT_EMAIL", "gestion@setrag.ga")
    vi.stubEnv("DEMO_MANAGEMENT_PASSWORD", "")
    const t = convexTest(schema, modules)

    expect(await t.query(api.functions.demoAccounts.list, {})).toEqual([
      {
        key: "agent",
        label: "Compte agent",
        description: "Vente au guichet · Owendo",
        email: "agent@setrag.ga",
        password: "agent-secret",
      },
    ])
  })
})
