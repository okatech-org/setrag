import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const shellState = vi.hoisted(() => ({
  role: "direction_generale",
  accessLevel: "lecture",
}))

vi.mock("next/navigation", () => ({ usePathname: () => "/cotraf" }))
vi.mock("./enterprise-nav", () => ({
  EnterpriseTopNav: () => <div>Navigation principale</div>,
}))
vi.mock("./portal-guard", () => ({
  usePortalSession: () => ({
    profile: {
      user: {
        role: shellState.role,
        firstName: "Démo",
        lastName: "Direction",
      },
    },
    signingOut: false,
    signOut: vi.fn(),
  }),
}))
vi.mock("./module-access-navigation", () => ({
  canPerformModuleActions: (level: string | null, role?: string) =>
    role !== "admin_it" && (level === "utilisation" || level === "admin"),
  ModuleAccessBadge: ({
    level,
    systemAdmin,
  }: {
    level: string
    systemAdmin?: boolean
  }) => <span>{systemAdmin ? "Admin système" : level}</span>,
  ModuleSidebarNavigation: () => <nav>Mes modules</nav>,
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

  it("conserve l’Admin système en gouvernance sans actions métier", () => {
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

    expect(screen.getByText("Admin système")).toBeInTheDocument()
    expect(screen.queryByText("Créer un bulletin")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Modifier la circulation" })
    ).toBeDisabled()
    expect(screen.getByRole("status")).toHaveTextContent(
      "Administration système"
    )
  })
})
