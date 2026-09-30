import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const shellState = vi.hoisted(() => ({
  role: "direction_generale",
  pathname: "/direction/finances",
}))

vi.mock("next/navigation", () => ({
  usePathname: () => shellState.pathname,
}))
vi.mock("@/components/portal-guard", () => ({
  usePortalSession: () => ({
    profile: {
      user: {
        role: shellState.role,
        firstName: "Démo",
        lastName: "Direction",
        matricule: "DEMO-G-001",
      },
    },
    signingOut: false,
    signOut: vi.fn(),
  }),
}))
vi.mock("@workspace/api/hooks", () => ({
  useQuery: () => undefined,
}))

import { ExecutiveShell } from "./executive-shell"

describe("chrome de l’espace Direction générale", () => {
  beforeEach(() => {
    shellState.role = "direction_generale"
    shellState.pathname = "/direction/finances"
  })

  it("place les rubriques avant « Mes modules », avec la pastille d’espace", () => {
    render(
      <ExecutiveShell volet="finances" preset="annee">
        Contenu
      </ExecutiveShell>
    )

    expect(screen.getByLabelText("Espace actif")).toHaveTextContent(
      "Direction générale"
    )
    expect(
      screen.getByRole("heading", { level: 1, name: "Finances" })
    ).toBeInTheDocument()

    const rubrics = screen.getByRole("navigation", {
      name: "Direction générale",
    })
    const modules = screen.getByRole("navigation", { name: "Mes modules" })
    expect(
      rubrics.compareDocumentPosition(modules) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(rubrics.querySelectorAll("h2")).toHaveLength(0)

    const active = screen.getByRole("link", { name: "Finances" })
    expect(active).toHaveAttribute("aria-current", "page")
    expect(active).toHaveAttribute("href", "/direction/finances?periode=annee")
    expect(active).toHaveClass("min-h-11")

    // Deux liens « Vue d’ensemble » : la rubrique et le lien de retour,
    // tous deux porteurs de la période choisie.
    const overviewLinks = screen.getAllByRole("link", {
      name: "Vue d’ensemble",
    })
    expect(overviewLinks).toHaveLength(2)
    for (const link of overviewLinks) {
      expect(link).toHaveAttribute("href", "/direction?periode=annee")
    }
    expect(
      screen.getByRole("navigation", { name: "Volets voisins" })
    ).toBeInTheDocument()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("n’a ni lien de retour ni volets voisins sur la vue d’ensemble", () => {
    shellState.pathname = "/direction"

    render(
      <ExecutiveShell volet="overview" preset="30j">
        Contenu
      </ExecutiveShell>
    )

    expect(
      screen.queryByRole("navigation", { name: "Volets voisins" })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Vue d’ensemble" })
    ).toHaveAttribute("aria-current", "page")
    expect(
      screen.getByRole("link", { name: "Aller au contenu" })
    ).toHaveAttribute("href", "#contenu")
  })
})
