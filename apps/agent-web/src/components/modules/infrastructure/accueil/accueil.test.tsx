import { render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { accueil, droits } from "./essais"
import { lienPriorite, TableauDeBordInfra, TableauDeBordVue } from "./tableau-de-bord"

const etat = vi.hoisted(() => ({ reponses: {} as Record<string, unknown> }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/infrastructures",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@workspace/api/hooks", async () => {
  const { getFunctionName } = await import("convex/server")
  return {
    useQuery: (ref: never, args: unknown) => (args === "skip" ? undefined : etat.reponses[getFunctionName(ref).split(":")[1]!]),
    useMutation: () => vi.fn().mockResolvedValue({}),
  }
})
vi.mock("@/components/enterprise-layout", () => ({
  EnterpriseShell: ({ title, actions, eyebrow, children }: { title: string; actions?: ReactNode; eyebrow?: ReactNode; children: ReactNode }) => (
    <main>
      {eyebrow}
      <h1>{title}</h1>
      <div data-testid="actions">{actions}</div>
      {children}
    </main>
  ),
}))

const PRIORITES = [
  { type: "anomalie", id: "an1", titre: "AN-2026-0042 — anomalie critique", detail: "Rail cassé", niveau: "critique", pk: 201.4, echeance: 1 },
  { type: "jalon", id: "j9", titre: "PRN-03 — jalon en retard", detail: "Réception du lot 2", niveau: "haute", pk: 300, echeance: 2 },
  { type: "inspection", id: "ouv7", titre: "OA-112 — inspection en retard", detail: "Pont de l'Okano", niveau: "normale", pk: 250, echeance: 3 },
] as never

describe("tableau de bord Infrastructures", () => {
  it("affiche les indicateurs et des priorités qui mènent chacune à son dossier", () => {
    render(<TableauDeBordVue accueil={accueil({}, PRIORITES)} chantiers={[{ id: "ch3", code: "PRN-03" }]} peutSignaler />)

    expect(screen.getByText("Priorités")).toBeInTheDocument()
    expect(screen.getByText("Anomalies ouvertes")).toBeInTheDocument()
    expect(screen.getByText(/1 critique · 3 élevée/)).toBeInTheDocument()
    expect(screen.getByText("2 jalons en retard")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /AN-2026-0042 — anomalie critique/ })).toHaveAttribute("href", "/infrastructures/anomalies/an1")
    expect(screen.getByRole("link", { name: /PRN-03 — jalon en retard/ })).toHaveAttribute("href", "/infrastructures/prn/ch3")
    expect(screen.getByRole("link", { name: /OA-112 — inspection en retard/ })).toHaveAttribute("href", "/infrastructures/ouvrages/ouv7")
    // Le niveau est écrit, pas seulement teinté.
    expect(screen.getByText("Critique")).toBeInTheDocument()
    // Les LTV de la ligne sont écrites sous le schéma.
    expect(screen.getByText("LTV-2026-0007")).toBeInTheDocument()
    expect(within(screen.getByTestId("actions")).getByRole("button", { name: "Signaler une anomalie" })).toBeInTheDocument()
  })

  it("rend un état vide quand aucune section n'est renseignée", () => {
    render(<TableauDeBordVue accueil={accueil({ nbSections: 0 })} peutSignaler={false} />)
    expect(screen.getByText("Aucune section de voie n'est renseignée")).toBeInTheDocument()
    expect(screen.queryByText("Priorités")).not.toBeInTheDocument()
  })

  it("masque le signalement sans la capacité anomalie_signaler", () => {
    etat.reponses = { accueil: accueil(), droits: droits(["ltv_gerer"]) }
    render(<TableauDeBordInfra />)
    expect(screen.getByText("Priorités")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Signaler une anomalie" })).not.toBeInTheDocument()
  })

  it("propose le signalement avec la capacité", () => {
    etat.reponses = { accueil: accueil(), droits: droits(["anomalie_signaler"]) }
    render(<TableauDeBordInfra />)
    expect(screen.getByRole("button", { name: "Signaler une anomalie" })).toBeInTheDocument()
  })

  it("se rabat sur la liste PRN quand le chantier d'un jalon est inconnu", () => {
    const jalon = { type: "jalon", id: "j1", titre: "PRN-99 — jalon en retard", detail: "", niveau: "normale" } as never
    expect(lienPriorite(jalon, [])).toBe("/infrastructures/prn")
  })
})
