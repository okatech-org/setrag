import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { accueil, dossierLtv, droits, ligneLtv } from "../accueil/essais"
import { DossierLtvVue } from "./dossier-ltv"
import { ListeLtv } from "./liste-ltv"
import { perteEstimee } from "./poser-ltv"

const etat = vi.hoisted(() => ({ reponses: {} as Record<string, unknown>, mutation: vi.fn() }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/infrastructures/ltv",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@workspace/api/hooks", async () => {
  const { getFunctionName } = await import("convex/server")
  return {
    useQuery: (ref: never, args: unknown) => (args === "skip" ? undefined : etat.reponses[getFunctionName(ref).split(":")[1]!]),
    useMutation: () => etat.mutation,
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

describe("limitations temporaires de vitesse", () => {
  it("liste les LTV actives, écrit l'échéance dépassée et propose la pose", () => {
    etat.reponses = {
      droits: droits(["ltv_gerer"]),
      accueil: accueil(),
      ltvs: [ligneLtv(), ligneLtv({ id: "ltv2", numero: "LTV-2026-0003", statut: "levee", statutLibelle: "Levée", echeanceDepassee: false, leveeLe: Date.now() })],
    }
    render(<ListeLtv />)
    const tableau = screen.getByRole("table", { name: "Limitations temporaires de vitesse" })
    expect(within(tableau).getByText("LTV-2026-0007")).toBeInTheDocument()
    expect(within(tableau).queryByText("LTV-2026-0003")).not.toBeInTheDocument()
    expect(within(tableau).getByText("Échéance dépassée")).toBeInTheDocument()
    expect(within(screen.getByTestId("actions")).getByRole("button", { name: "Poser une LTV" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("tab", { name: /Levées/ }))
    expect(within(screen.getByRole("table", { name: "Limitations temporaires de vitesse" })).getByText("LTV-2026-0003")).toBeInTheDocument()
  })

  it("masque la pose sans la capacité ltv_gerer", () => {
    etat.reponses = { droits: droits(["anomalie_signaler"]), accueil: accueil(), ltvs: [] }
    render(<ListeLtv />)
    expect(screen.queryByRole("button", { name: "Poser une LTV" })).not.toBeInTheDocument()
    expect(screen.getByText("Aucune LTV active")).toBeInTheDocument()
  })

  it("montre les trains impactés et lève la LTV après confirmation", async () => {
    etat.reponses = { droits: droits(["ltv_gerer"]), accueil: accueil() }
    etat.mutation.mockResolvedValue({ statut: "levee" })
    render(<DossierLtvVue dossier={dossierLtv()} />)
    expect(screen.getByRole("table", { name: /Trains impactés/ })).toBeInTheDocument()
    expect(screen.getByText("T401")).toBeInTheDocument()
    fireEvent.click(within(screen.getByTestId("actions")).getByRole("button", { name: "Lever la LTV" }))
    fireEvent.change(await screen.findByLabelText("Motif de la levée"), { target: { value: "Voie contrôlée après bourrage." } })
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la levée" }))
    await waitFor(() => expect(etat.mutation).toHaveBeenCalledWith({ ltvId: "ltv1", motif: "Voie contrôlée après bourrage." }))
  })

  it("n'offre ni modification ni levée sur une LTV levée", () => {
    etat.reponses = { droits: droits(["ltv_gerer"]), accueil: accueil() }
    render(<DossierLtvVue dossier={dossierLtv({ statut: "levee", statutLibelle: "Levée", echeanceDepassee: false })} />)
    expect(within(screen.getByTestId("actions")).queryAllByRole("button")).toHaveLength(0)
    expect(screen.getByText(/ne ralentit plus aucun train/)).toBeInTheDocument()
  })

  it("estime la perte de temps comme le serveur", () => {
    expect(perteEstimee(0.6, 30, 60)).toBe(1.6)
    expect(perteEstimee(1, 60, 60)).toBeNull()
  })
})
