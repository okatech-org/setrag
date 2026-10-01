import { render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { accueil, dossierSection, droits, ligneSection } from "../accueil/essais"
import { DossierSectionVue, zonesSection } from "./dossier-section"
import { ListeSections } from "./liste-sections"

const etat = vi.hoisted(() => ({ reponses: {} as Record<string, unknown> }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/infrastructures/voie",
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

describe("voie et sections", () => {
  it("liste les sections avec leur état écrit et la vitesse limitée", () => {
    etat.reponses = { accueil: accueil(), sections: [ligneSection(), ligneSection({ id: "s1", code: "S01", libelle: "Owendo – Ntoum", etat: "bon", etatLibelle: "Bon", vitesseLimiteKmh: 60, ltvActives: 0 })] }
    render(<ListeSections />)
    const tableau = screen.getByRole("table", { name: "Sections de voie" })
    const ligne = within(tableau).getByText("S03").closest("tr")!
    expect(within(ligne).getByText("Dégradé")).toBeInTheDocument()
    expect(within(ligne).getByText(/limitée à 30 km\/h/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Exporter \(2\)/ })).toBeInTheDocument()
  })

  it("rend un état vide quand le découpage n'est pas chargé", () => {
    etat.reponses = { accueil: accueil(), sections: [] }
    render(<ListeSections />)
    expect(screen.getByText("Aucune section de voie renseignée")).toBeInTheDocument()
  })

  it("réserve la mise à jour de l'état à la capacité voie_gerer", () => {
    etat.reponses = { accueil: accueil(), droits: droits(["anomalie_signaler"]) }
    const { unmount } = render(<DossierSectionVue dossier={dossierSection()} />)
    expect(screen.queryByRole("button", { name: "Mettre à jour l'état" })).not.toBeInTheDocument()
    unmount()
    etat.reponses = { accueil: accueil(), droits: droits(["voie_gerer"]) }
    render(<DossierSectionVue dossier={dossierSection()} />)
    expect(within(screen.getByTestId("actions")).getByRole("button", { name: "Mettre à jour l'état" })).toBeInTheDocument()
    expect(screen.getByRole("table", { name: "Anomalies de la section S03" })).toBeInTheDocument()
  })

  it("écrit les zones de la section en clair", () => {
    const zones = zonesSection(dossierSection())
    expect(zones.map((z) => [z.nature, z.libelle])).toEqual([
      ["ltv", "LTV-2026-0007"],
      ["anomalie", "AN-2026-0042"],
    ])
  })
})
