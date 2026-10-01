import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { EcranApresVente } from "./apres-vente"

const { params } = vi.hoisted(() => ({ params: { value: new URLSearchParams() } }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/gestion/apres-vente",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => params.value,
}))

vi.mock("@workspace/api/hooks", () => ({
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}))

/*
 * `src/test/setup.ts` active le mode E2E : les écrans lisent les jeux de
 * données de `fixtures-e2e.ts`, comme les parcours Playwright.
 */

describe("Après-vente du réseau", () => {
  it("liste les opérations du réseau avec leur point de vente et un filtre par guichet", () => {
    render(<EcranApresVente mode="reseau" parametres={{ mentionDuplicata: "DUPLICATA", piedBillet: "" }} enLigne enTete={false} />)
    expect(screen.getByText(/Périmètre : réseau entier/)).toBeInTheDocument()
    expect(screen.getByLabelText("Point de vente")).toHaveTextContent("Gare de Franceville")
    const tableau = screen.getByRole("table", { name: "Opérations du guichet" })
    expect(within(tableau).getAllByText("Gare d'Owendo · guichet 2")).toHaveLength(2)
  })

  it("garde un billet contrôlé à bord intouchable, même pour un encadrant", () => {
    params.value = new URLSearchParams("op=vente-4812")
    render(<EcranApresVente mode="reseau" parametres={{ mentionDuplicata: "DUPLICATA", piedBillet: "" }} enLigne enTete={false} />)
    expect(screen.getByText(/Contrôlé à bord : ni annulation ni remboursement/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Rembourser" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Annuler la vente" })).toBeDisabled()
    params.value = new URLSearchParams()
  })
})
