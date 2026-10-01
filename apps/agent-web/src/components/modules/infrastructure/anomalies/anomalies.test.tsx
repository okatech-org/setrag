import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { dossierAnomalie, droits, ligneAnomalie } from "../accueil/essais"
import { actionsAnomalie, DossierAnomalieVue } from "./dossier-anomalie"
import { verifierPhotos } from "./photos"
import { RegistreAnomalies } from "./registre-anomalies"

const etat = vi.hoisted(() => ({ reponses: {} as Record<string, unknown>, mutation: vi.fn() }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/infrastructures/anomalies",
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

const TOUT = ["anomalie_signaler", "anomalie_traiter", "anomalie_clore", "ltv_gerer", "intervention_demander"]
const peutTout = () => true

describe("registre des anomalies", () => {
  it("écrit le retard en toutes lettres et ouvre le dossier", () => {
    etat.reponses = {
      droits: droits(TOUT),
      anomalies: [ligneAnomalie(), ligneAnomalie({ id: "an2", numero: "AN-2026-0043", enRetard: false, echeanceLe: Date.now() + 86_400_000 })],
    }
    render(<RegistreAnomalies />)
    const tableau = screen.getByRole("table", { name: "Registre des anomalies" })
    const ligne = within(tableau).getByText("AN-2026-0042").closest("tr")!
    expect(within(ligne).getByText("En retard")).toBeInTheDocument()
    const autre = within(tableau).getByText("AN-2026-0043").closest("tr")!
    expect(within(autre).queryByText("En retard")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Signaler une anomalie" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Exporter \(2\)/ })).toBeInTheDocument()
  })

  it("filtre les anomalies en retard", () => {
    etat.reponses = {
      droits: droits([]),
      anomalies: [ligneAnomalie(), ligneAnomalie({ id: "an2", numero: "AN-2026-0043", enRetard: false })],
    }
    render(<RegistreAnomalies />)
    fireEvent.change(screen.getByDisplayValue("Toutes échéances"), { target: { value: "retard" } })
    expect(screen.getByText("AN-2026-0042")).toBeInTheDocument()
    expect(screen.queryByText("AN-2026-0043")).not.toBeInTheDocument()
    // Lecture seule : pas de signalement.
    expect(screen.queryByRole("button", { name: "Signaler une anomalie" })).not.toBeInTheDocument()
  })
})

describe("cycle d'une anomalie", () => {
  it("ne propose la clôture qu'au statut « traitée »", () => {
    for (const statut of ["signalee", "prise_en_charge", "close", "rejetee"] as const) {
      const { principale, secondaires } = actionsAnomalie({ statut, ouverte: statut !== "close" && statut !== "rejetee", ltvId: null, interventionId: null, nbPhotos: 0 }, peutTout)
      expect(principale).not.toBe("clore")
      expect(secondaires).not.toContain("clore")
    }
    expect(actionsAnomalie({ statut: "traitee", ouverte: true, ltvId: null, interventionId: null, nbPhotos: 0 }, peutTout).principale).toBe("clore")
  })

  it("enchaîne prise en charge puis traitement comme étape principale", () => {
    expect(actionsAnomalie({ statut: "signalee", ouverte: true, ltvId: null, interventionId: null, nbPhotos: 0 }, peutTout).principale).toBe("prendre")
    expect(actionsAnomalie({ statut: "prise_en_charge", ouverte: true, ltvId: null, interventionId: null, nbPhotos: 0 }, peutTout).principale).toBe("traiter")
    const sansDroit = actionsAnomalie({ statut: "traitee", ouverte: true, ltvId: null, interventionId: null, nbPhotos: 0 }, (c) => c !== "anomalie_clore")
    expect(sansDroit.principale).toBeNull()
  })

  it("affiche « Clore » sur une anomalie traitée et le refus du serveur", async () => {
    etat.reponses = { droits: droits(TOUT) }
    etat.mutation.mockRejectedValueOnce(new Error("Uncaught Error: Séparation des tâches : l'agent qui a traité l'anomalie ne peut pas la clore.\n    at handler"))
    render(<DossierAnomalieVue dossier={dossierAnomalie({ statut: "traitee", statutLibelle: "Traitée, à clore", traitement: "Rail remplacé.", traiteParNom: "Paul Mba", traiteLe: Date.now() })} />)
    const actions = screen.getByTestId("actions")
    expect(within(actions).queryByRole("button", { name: "Prendre en charge" })).not.toBeInTheDocument()
    fireEvent.click(within(actions).getByRole("button", { name: "Clore l'anomalie" }))
    const valider = (await screen.findAllByRole("button", { name: "Clore l'anomalie" })).at(-1)!
    fireEvent.click(valider)
    await waitFor(() => expect(etat.mutation).toHaveBeenCalledWith({ anomalieId: "an1" }))
    await waitFor(() => expect(screen.getByText(/Séparation des tâches/)).toBeInTheDocument())
  })

  it("ne propose pas « Clore » avant le traitement", () => {
    etat.reponses = { droits: droits(TOUT) }
    render(<DossierAnomalieVue dossier={dossierAnomalie({ statut: "prise_en_charge", statutLibelle: "Prise en charge" })} />)
    const actions = screen.getByTestId("actions")
    expect(within(actions).getByRole("button", { name: "Déclarer traitée" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Clore l'anomalie" })).not.toBeInTheDocument()
    expect(screen.getByText("En retard sur l'échéance")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: /Photo 1 sur 1 de l'anomalie AN-2026-0042/ })).toBeInTheDocument()
  })

  it("n'offre aucune action sans capacité", () => {
    etat.reponses = { droits: droits([]) }
    render(<DossierAnomalieVue dossier={dossierAnomalie()} />)
    expect(within(screen.getByTestId("actions")).queryAllByRole("button")).toHaveLength(0)
  })
})

describe("photos d'anomalie", () => {
  it("écarte ce qui n'est pas une image ou dépasse 8 Mo", () => {
    const image = new File(["x"], "rail.jpg", { type: "image/jpeg" })
    const pdf = new File(["x"], "rapport.pdf", { type: "application/pdf" })
    const lourde = new File([new Uint8Array(9 * 1024 * 1024)], "lourde.png", { type: "image/png" })
    const { retenus, refus } = verifierPhotos([image, pdf, lourde], 10)
    expect(retenus).toEqual([image])
    expect(refus).toHaveLength(2)
    expect(refus[1]).toMatch(/8 Mo au plus/)
  })
})
