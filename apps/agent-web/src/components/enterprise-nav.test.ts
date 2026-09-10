import { describe, expect, it } from "vitest"

import { MODULE_MANIFEST } from "@workspace/backend/modules"

import { officialModulesForCodes } from "./enterprise-nav"

describe("navigation des modules d’entreprise", () => {
  it("ne révèle aucun module avant le retour des codes autorisés", () => {
    expect(officialModulesForCodes([])).toEqual([])
  })

  it("conserve uniquement les codes renvoyés comme autorisés", () => {
    const modules = officialModulesForCodes(["fret"])

    expect(modules.map(({ code }) => code)).toEqual(["fret"])
  })

  it("ne fabrique aucune destination hors du manifeste", () => {
    const modules = officialModulesForCodes(
      MODULE_MANIFEST.map(({ code }) => code)
    )

    expect(modules.every((module) => MODULE_MANIFEST.includes(module))).toBe(
      true
    )
  })
})
