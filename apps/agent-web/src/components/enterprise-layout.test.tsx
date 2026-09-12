import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const shellState = vi.hoisted(() => ({
  role: "direction_generale",
  accessLevel: "lecture",
  pathname: "/cotraf",
}))

vi.mock("next/navigation", () => ({
  usePathname: () => shellState.pathname,
}))
vi.mock("./portal-guard", () => ({
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
vi.mock("./module-access-navigation", () => ({
  canPerformModuleActions: (level: string | null, role?: string) =>
    role !== "admin_it" && (level === "utilisation" || level === "admin"),
  canShowDecisionResources: (role?: string) => Boolean(role),
  canShowExecutiveSpace: (role?: string) => role === "direction_generale",
  ModuleSidebarNavigation: ({
    activeModuleCode,
    leading,
  }: {
    activeModuleCode?: string
    leading?: React.ReactNode
  }) => (
    <>
      {leading}
      <nav
        aria-label="Mes modules"
        data-active-module={activeModuleCode ?? "aucun"}
      >
        Mes modules
      </nav>
    </>
  ),
  useModuleNavigationAccesses: () => ({
    accesses: [{ code: "cotraf", accessLevel: shellState.accessLevel }],
    loading: false,
  }),
}))

import { EnterpriseShell } from "./enterprise-layout"

describe("shell des modules d’entreprise", () => {
  beforeEach(() => {
    shellState.role = "direction_generale"
    shellState.accessLevel = "lecture"
    shellState.pathname = "/cotraf"
  })

  it("rend un seul en-tête, sans sélecteur horizontal ni niveau d’accès", () => {
    render(
      <EnterpriseShell title="COTRAF" subtitle="Régulation du trafic">
        Contenu
      </EnterpriseShell>
    )

    expect(
      document.querySelectorAll('[data-slot="enterprise-header"]')
    ).toHaveLength(1)
    expect(screen.getAllByRole("img", { name: "SETRAG" })).toHaveLength(1)
    expect(
      screen.queryByRole("navigation", { name: "Sélecteur des modules métier" })
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/Heure de Libreville/)).not.toBeInTheDocument()
    expect(screen.queryByText("Lecture")).not.toBeInTheDocument()

    // L'espace actif, le compte et le titre de page restent lisibles.
    expect(screen.getByLabelText("Espace actif")).toHaveTextContent("COTRAF")
    expect(screen.getByText("Direction générale")).toBeInTheDocument()
    expect(screen.getByText("D. Direction · DEMO-G-001")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { level: 1, name: "COTRAF" })
    ).toBeInTheDocument()
    expect(screen.getByText("Régulation du trafic")).toBeInTheDocument()
  })

  it("masque les actions et désactive les contrôles au niveau Lecture", () => {
    render(
      <EnterpriseShell
        title="COTRAF"
        actions={<button type="button">Créer un bulletin</button>}
      >
        <button type="button">Modifier la circulation</button>
      </EnterpriseShell>
    )

    expect(screen.queryByText("Créer un bulletin")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Modifier la circulation" })
    ).toBeDisabled()
    expect(screen.getByRole("status")).toHaveTextContent("Mode Lecture")
  })

  it("conserve l’Admin système en gouvernance sans actions métier ni badge", () => {
    shellState.role = "admin_it"
    shellState.accessLevel = "admin"

    render(
      <EnterpriseShell
        title="COTRAF"
        actions={<button type="button">Créer un bulletin</button>}
      >
        <button type="button">Modifier la circulation</button>
      </EnterpriseShell>
    )

    expect(screen.queryByText("Admin système")).not.toBeInTheDocument()
    expect(screen.queryByText("Créer un bulletin")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Modifier la circulation" })
    ).toBeDisabled()
    expect(screen.getByRole("status")).toHaveTextContent(
      "Administration système"
    )
  })

  it("conserve la navigation latérale sur la ressource de décision", () => {
    shellState.pathname = "/etudes"

    render(<EnterpriseShell title="Études">Documents</EnterpriseShell>)

    expect(
      screen.getByRole("navigation", { name: "Mes modules" })
    ).toHaveAttribute("data-active-module", "aucun")
    expect(screen.getByLabelText("Espace actif")).toHaveTextContent(
      "Audit & documents"
    )
    expect(
      screen.getByRole("button", { name: "Ouvrir le menu" })
    ).toHaveAttribute("aria-controls", "enterprise-module-sidebar")
  })

  it("ouvre la navigation latérale et l’espace sur /direction pour la DG seulement", () => {
    shellState.pathname = "/direction/risques"

    const { unmount } = render(
      <EnterpriseShell
        title="Risques et continuité"
        space="Direction générale"
        scope="Réseau entier · Owendo–Franceville"
        navigation={() => <nav aria-label="Direction générale">Rubriques</nav>}
        eyebrow={<a href="/direction">Vue d’ensemble</a>}
      >
        Contenu
      </EnterpriseShell>
    )

    expect(screen.getByLabelText("Espace actif")).toHaveTextContent(
      "Direction générale"
    )
    expect(
      screen.getByText("Réseau entier · Owendo–Franceville")
    ).toBeInTheDocument()
    const rubrics = screen.getByRole("navigation", {
      name: "Direction générale",
    })
    const modules = screen.getByRole("navigation", { name: "Mes modules" })
    expect(
      rubrics.compareDocumentPosition(modules) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      screen.getByRole("link", { name: "Vue d’ensemble" })
    ).toBeInTheDocument()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Ouvrir le menu" })
    ).toHaveAttribute("aria-controls", "enterprise-module-sidebar")
    unmount()

    shellState.role = "chef_vente"
    render(
      <EnterpriseShell title="Risques et continuité">Contenu</EnterpriseShell>
    )
    expect(
      screen.queryByRole("button", { name: "Ouvrir le menu" })
    ).not.toBeInTheDocument()
  })

  it("n’offre aucun tiroir hors des modules", () => {
    shellState.pathname = "/administration"

    render(<EnterpriseShell title="Administration">Matrice</EnterpriseShell>)

    expect(
      screen.queryByRole("button", { name: "Ouvrir le menu" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("navigation", { name: "Mes modules" })
    ).not.toBeInTheDocument()
  })
})
