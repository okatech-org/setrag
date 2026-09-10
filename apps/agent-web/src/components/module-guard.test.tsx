import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ModuleAccessBoundary, type ModuleAccess } from "./module-guard"

const ACCESS_BASE = {
  code: "fret",
  label: "Fret & Marchandises",
  route: "/fret",
  resource: "fret",
  activationSource: "default",
  permissionSource: null,
} as const

describe("garde de module", () => {
  it("n’affiche aucun enfant pendant la vérification", () => {
    render(
      <ModuleAccessBoundary access={undefined}>
        <p>Données sensibles</p>
      </ModuleAccessBoundary>
    )

    expect(screen.getByRole("status")).toHaveTextContent(
      "Vérification de l’accès au module"
    )
    expect(screen.queryByText("Données sensibles")).not.toBeInTheDocument()
  })

  it("explique la désactivation sans rendre les enfants", () => {
    const access = {
      ...ACCESS_BASE,
      enabled: false,
      permissionGranted: true,
      canAccess: false,
    } as ModuleAccess

    render(
      <ModuleAccessBoundary access={access}>
        <p>Données sensibles</p>
      </ModuleAccessBoundary>
    )

    expect(screen.getByRole("status")).toHaveTextContent(
      "n’est pas activé pour votre périmètre"
    )
    expect(screen.queryByText("Données sensibles")).not.toBeInTheDocument()
  })

  it("explique le refus d’habilitation sans rendre les enfants", () => {
    const access = {
      ...ACCESS_BASE,
      enabled: true,
      permissionGranted: false,
      canAccess: false,
    } as ModuleAccess

    render(
      <ModuleAccessBoundary access={access}>
        <p>Données sensibles</p>
      </ModuleAccessBoundary>
    )

    expect(screen.getByRole("status")).toHaveTextContent(
      "ne dispose pas de l’habilitation requise"
    )
    expect(screen.queryByText("Données sensibles")).not.toBeInTheDocument()
  })

  it("rend les enfants après autorisation", () => {
    const access = {
      ...ACCESS_BASE,
      enabled: true,
      permissionGranted: true,
      canAccess: true,
    } as ModuleAccess

    render(
      <ModuleAccessBoundary access={access}>
        <p>Données autorisées</p>
      </ModuleAccessBoundary>
    )

    expect(screen.getByText("Données autorisées")).toBeInTheDocument()
  })
})
