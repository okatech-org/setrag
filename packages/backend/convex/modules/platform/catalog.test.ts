import { describe, expect, it } from "vitest"

import { derivePlatformEnvironment } from "./environment"
import { MODULE_CODES, MODULE_MANIFEST } from "./catalog"

describe("Catalogue des modules", () => {
  it("expose les dix codes et routes stables dans le même ordre", () => {
    expect(MODULE_CODES).toEqual([
      "voyageurs",
      "fret",
      "cotraf",
      "gmao",
      "infrastructure",
      "finance",
      "rh",
      "ged",
      "securite",
      "copilot",
    ])
    expect(MODULE_MANIFEST.map(({ route }) => route)).toEqual([
      "/gestion",
      "/fret",
      "/cotraf",
      "/materiel",
      "/infrastructures",
      "/finances",
      "/rh",
      "/bureautique",
      "/securite",
      "/copilot",
    ])
  })

  it("active seulement Voyageurs et Fret par défaut", () => {
    expect(
      MODULE_MANIFEST.filter(({ defaultEnabled }) => defaultEnabled).map(
        ({ code }) => code
      )
    ).toEqual(["voyageurs", "fret"])
  })

  it("protège chaque module par une ressource dédiée portant le même code", () => {
    expect(MODULE_MANIFEST.map(({ resource }) => resource)).toEqual(
      MODULE_CODES
    )
  })

  it("dérive l'environnement côté serveur avec un défaut development", () => {
    expect(derivePlatformEnvironment()).toBe("development")
    expect(derivePlatformEnvironment({ SETRAG_ENV: "staging" })).toBe("staging")
    expect(
      derivePlatformEnvironment({ CONVEX_DEPLOYMENT: "prod:setrag-main" })
    ).toBe("production")
    expect(derivePlatformEnvironment({ SETRAG_ENV: "inconnu" })).toBe(
      "development"
    )
  })
})
