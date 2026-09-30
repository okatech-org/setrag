import { describe, expect, it } from "vitest"

import { isPlatformModulesApiEnabled } from "./platform-modules-runtime"

describe("bascule de l’API des modules plateforme", () => {
  it("reste fermée quand le backend n’est pas déclaré compatible", () => {
    expect(isPlatformModulesApiEnabled({ nodeEnv: "development" })).toBe(false)
  })

  it("s’ouvre après activation explicite de l’API", () => {
    expect(
      isPlatformModulesApiEnabled({
        nodeEnv: "production",
        apiEnabled: "1",
      })
    ).toBe(true)
  })

  it("autorise les fixtures E2E uniquement hors production", () => {
    expect(
      isPlatformModulesApiEnabled({
        nodeEnv: "test",
        e2eMode: "1",
      })
    ).toBe(true)
    expect(
      isPlatformModulesApiEnabled({
        nodeEnv: "production",
        e2eMode: "1",
      })
    ).toBe(false)
  })
})
