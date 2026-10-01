import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const shellState = vi.hoisted(() => ({
  role: "direction_generale",
  accessLevel: "lecture",
  pathname: "/cotraf",
}))

vi.mock("next/navigation", () => ({
  usePathname: () => shellState.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@workspace/api/hooks", () => ({
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
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
  useModuleNavigationAccesses: () => ({
    accesses: [
      {
        code: "cotraf",
        label: "COTRAF",
        route: "/cotraf",
        enabled: true,
        canAccess: true,
        accessLevel: shellState.accessLevel,
        accessSource: "role",
      },
    ],
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

  it("rend le cadre du portail, le menu et l’en-tête de page", () => {
    render(
      <EnterpriseShell title="COTRAF" subtitle="Régulation du trafic">
        Contenu
      </EnterpriseShell>
    )

    expect(screen.getByRole("heading", { level: 1, name: "COTRAF" })).toBeInTheDocument()
    expect(screen.getByText("Régulation du trafic")).toBeInTheDocument()
    // Le module courant porte le ruban du menu et apparaît au fil d'Ariane.
    const menu = screen.getByRole("navigation", { name: "Menu du portail" })
    // Le libellé, suivi de la touche de son raccourci (2 par défaut).
    const lien = Array.from(menu.querySelectorAll("a")).find((a) => a.textContent?.startsWith("COTRAF"))
    expect(lien).toHaveAttribute("aria-current", "page")
    expect(lien?.querySelector("kbd")).toHaveTextContent("2")
    expect(lien?.querySelector("svg")).not.toBeNull()
    expect(screen.getByRole("navigation", { name: "Fil d'Ariane" })).toHaveTextContent("COTRAF")
    // Le compte reste lisible.
    expect(screen.getByText("Démo Direction")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Aller au contenu" })).toHaveAttribute("href", "#contenu")
  })

  it("masque les actions et désactive les contrôles au niveau lecture", () => {
    render(
      <EnterpriseShell title="COTRAF" actions={<button type="button">Créer un bulletin</button>}>
        <button type="button">Modifier la circulation</button>
      </EnterpriseShell>
    )

    expect(screen.queryByText("Créer un bulletin")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Modifier la circulation" })).toBeDisabled()
    expect(screen.getByText(/Mode lecture/)).toBeInTheDocument()
  })

  it("conserve l’Admin système en gouvernance sans actions métier", () => {
    shellState.role = "admin_it"
    shellState.accessLevel = "admin"

    render(
      <EnterpriseShell title="COTRAF" actions={<button type="button">Créer un bulletin</button>}>
        <button type="button">Modifier la circulation</button>
      </EnterpriseShell>
    )

    expect(screen.queryByText("Créer un bulletin")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Modifier la circulation" })).toBeDisabled()
    expect(screen.getByText(/Administration système/)).toBeInTheDocument()
  })

  it("rend les rubriques d’un espace transverse avant le menu, avec son périmètre", () => {
    shellState.pathname = "/direction/risques"

    render(
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

    expect(screen.getByText("Réseau entier · Owendo–Franceville")).toBeInTheDocument()
    const rubriques = screen.getByRole("navigation", { name: "Direction générale" })
    const menu = screen.getByRole("navigation", { name: "Menu du portail" })
    expect(rubriques.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole("link", { name: "Vue d’ensemble" })).toBeInTheDocument()
    // Hors module, pas de mode lecture.
    expect(screen.queryByText(/Mode lecture/)).not.toBeInTheDocument()
  })

  it("ouvre le menu en tiroir sous lg", () => {
    render(<EnterpriseShell title="COTRAF">Contenu</EnterpriseShell>)

    expect(screen.getByRole("button", { name: "Ouvrir le menu" })).toHaveAttribute("aria-controls", "menu-portail")
  })
})
