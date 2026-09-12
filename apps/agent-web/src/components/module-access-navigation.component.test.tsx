import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const navigationState = vi.hoisted(() => ({ pathname: "/etudes" }))

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}))

import { DecisionResourcesNavigation } from "./module-access-navigation"

describe("ressources de décision dans la navigation latérale", () => {
  beforeEach(() => {
    navigationState.pathname = "/etudes"
  })

  it("signale la ressource active avec une cible tactile accessible", () => {
    render(<DecisionResourcesNavigation role="direction_generale" />)

    const link = screen.getByRole("link", { name: "Audit & documents" })

    expect(link).toHaveAttribute("href", "/etudes")
    expect(link).toHaveAttribute("aria-current", "page")
    expect(link).toHaveClass("min-h-11", "focus-visible:ring-[3px]")
  })

  it("ne révèle pas la ressource à un acteur externe", () => {
    render(<DecisionResourcesNavigation role="representant_comilog" />)

    expect(
      screen.queryByRole("navigation", { name: "Ressources de décision" })
    ).not.toBeInTheDocument()
  })
})
