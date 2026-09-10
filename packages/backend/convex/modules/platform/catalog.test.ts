import { describe, expect, it } from "vitest"

import { derivePlatformEnvironment } from "./environment"
import {
  hasModuleAccessLevel,
  moduleAccessLevelLabel,
  moduleCodeForResource,
  MODULE_ACCESS_LEVELS,
  MODULE_CODES,
  MODULE_MANIFEST,
} from "./catalog"

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

  it("expose les trois niveaux métier ordonnés et leurs libellés français", () => {
    expect(MODULE_ACCESS_LEVELS).toEqual(["lecture", "utilisation", "admin"])
    expect(MODULE_ACCESS_LEVELS.map(moduleAccessLevelLabel)).toEqual([
      "Lecture",
      "Utilisation",
      "Admin",
    ])
    expect(hasModuleAccessLevel("admin", "utilisation")).toBe(true)
    expect(hasModuleAccessLevel("lecture", "utilisation")).toBe(false)
    expect(hasModuleAccessLevel(null, "lecture")).toBe(false)
  })

  it("rattache les ressources voyageurs à leur grand module", () => {
    expect(moduleCodeForResource("ventes")).toBe("voyageurs")
    expect(moduleCodeForResource("tarifs")).toBe("voyageurs")
    expect(moduleCodeForResource("donnees_voyageurs")).toBe("voyageurs")
    expect(moduleCodeForResource("utilisateurs")).toBe("voyageurs")
    expect(moduleCodeForResource("parametrage")).toBe("voyageurs")
    expect(moduleCodeForResource("integrations")).toBe("voyageurs")
    expect(moduleCodeForResource("rapports")).toBe("voyageurs")
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
