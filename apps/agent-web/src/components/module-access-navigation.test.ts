import { describe, expect, it } from "vitest"

import {
  canAdministerModules,
  canPerformModuleActions,
  canShowDecisionResources,
  fallbackModuleAccesses,
  visibleModuleAccesses,
  type ModuleNavigationAccess,
} from "./module-access-navigation"

describe("navigation latérale des modules", () => {
  it("ne révèle dans le repli que les modules activés et autorisés", () => {
    expect(
      fallbackModuleAccesses("direction_generale").map(
        ({ code, accessLevel }) => [code, accessLevel]
      )
    ).toEqual([
      ["voyageurs", "lecture"],
      ["fret", "lecture"],
    ])
    expect(fallbackModuleAccesses("juriste")).toEqual([])
    expect(fallbackModuleAccesses(undefined)).toEqual([])
  })

  it("identifie le DSI comme administrateur dans le repli sûr", () => {
    expect(
      fallbackModuleAccesses("admin_it").every(
        ({ accessLevel }) => accessLevel === "admin"
      )
    ).toBe(true)
  })

  it("écarte les modules désactivés, refusés ou sans niveau", () => {
    const base = {
      label: "Fret",
      route: "/fret",
      accessSource: "role",
    } as const
    const accesses: ModuleNavigationAccess[] = [
      {
        ...base,
        code: "fret",
        enabled: true,
        canAccess: true,
        accessLevel: "lecture",
      },
      {
        ...base,
        code: "cotraf",
        enabled: false,
        canAccess: false,
        accessLevel: "utilisation",
      },
      {
        ...base,
        code: "finance",
        enabled: true,
        canAccess: false,
        accessLevel: null,
      },
    ]

    expect(visibleModuleAccesses(accesses).map(({ code }) => code)).toEqual([
      "fret",
    ])
  })

  it("réserve les actions aux niveaux Utilisation et Admin", () => {
    expect(canPerformModuleActions("lecture")).toBe(false)
    expect(canPerformModuleActions("utilisation")).toBe(true)
    expect(canPerformModuleActions("admin")).toBe(true)
    expect(canPerformModuleActions("admin", "admin_it")).toBe(false)
    expect(canPerformModuleActions(null)).toBe(false)
  })

  it("ouvre l’administration au DSI ou à un admin délégué", () => {
    expect(canAdministerModules("admin_it", [])).toBe(true)
    expect(
      canAdministerModules("direction_generale", [{ accessLevel: "admin" }])
    ).toBe(true)
    expect(
      canAdministerModules("direction_generale", [
        { accessLevel: "utilisation" },
      ])
    ).toBe(false)
  })

  it("réserve les ressources de décision aux rôles internes", () => {
    expect(canShowDecisionResources("direction_generale")).toBe(true)
    expect(canShowDecisionResources("admin_it")).toBe(true)
    expect(canShowDecisionResources("representant_comilog")).toBe(false)
    expect(canShowDecisionResources(undefined)).toBe(false)
  })
})
