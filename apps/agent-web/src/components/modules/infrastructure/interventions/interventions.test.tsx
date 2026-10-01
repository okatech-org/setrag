import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { InterventionDossier } from "./intervention-dossier"
import { InterventionsEcran } from "./interventions"

const etat = vi.hoisted(() => ({
  reponses: new Map<string, unknown>(),
  mutation: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/infrastructures/interventions",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@workspace/api/hooks", async () => {
  const { getFunctionName } = await import("convex/server")
  return {
    useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => (args === "skip" ? undefined : etat.reponses.get(getFunctionName(reference))),
    useMutation: () => etat.mutation,
  }
})

vi.mock("@/components/enterprise-layout", () => ({
  EnterpriseShell: ({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <div data-testid="actions">{actions}</div>
      {children}
    </main>
  ),
}))

vi.mock("@/components/portal-guard", () => ({ usePortalSession: () => null }))

const Q = "modules/infrastructure/queries"
const HEURE = 3_600_000

function droits(capacites: string[]) {
  etat.reponses.set(`${Q}:droits`, { peutEcrire: capacites.length > 0, capacites, partenaire: false, role: "chef_district_voie" })
}

function intervention(surcharge: Record<string, unknown> = {}) {
  const debut = Date.now() + 24 * HEURE
  return {
    id: "int-1",
    numero: "INT-2026-0042",
    libelle: "Remplacement de traverses à Alembé",
    type: "prn",
    typeLibelle: "Travaux PRN",
    pkDebut: 201,
    pkFin: 204.5,
    debutLe: debut,
    finLe: debut + 8 * HEURE,
    dureeHeures: 8,
    interruption: true,
    equipe: "Brigade voie de Ndjolé",
    statut: "accordee",
    statutLibelle: "Accordée",
    chantierId: null,
    chantierCode: "PRN-03",
    anomalieId: null,
    anomalieNumero: null,
    demandeurId: "agent-demandeur",
    demandeurNom: "Marc Ella",
    demandeLe: debut - 72 * HEURE,
    accordeParNom: "Awa Moussavou",
    accordeLe: debut - 48 * HEURE,
    motifRefus: null,
    compteRendu: null,
    aujourdHui: false,
    majLe: debut - 48 * HEURE,
    ...surcharge,
  }
}

const gares = [
  { id: "g1", code: "OWE", nom: "Owendo", km: 0, majeure: true },
  { id: "g2", code: "NDJ", nom: "Ndjolé", km: 182, majeure: true },
  { id: "g3", code: "FCV", nom: "Franceville", km: 669, majeure: true },
]

beforeEach(() => {
  etat.reponses.clear()
  etat.mutation.mockReset()
})

describe("plages travaux", () => {
  it("écrit la coupure de voie dans le tableau et sous le schéma de ligne", () => {
    droits([])
    etat.reponses.set(`${Q}:interventions`, [intervention(), intervention({ id: "int-2", numero: "INT-2026-0043", interruption: false, statut: "demandee", statutLibelle: "Demandée" })])
    etat.reponses.set(`${Q}:accueil`, { ligne: { gares } })
    render(<InterventionsEcran />)

    const tableau = screen.getByRole("table", { name: "Plages travaux" })
    const coupure = within(tableau).getByText("INT-2026-0042").closest("tr")!
    expect(within(coupure).getByText("Coupure de voie")).toBeInTheDocument()
    const circulation = within(tableau).getByText("INT-2026-0043").closest("tr")!
    expect(within(circulation).getByText("Sous circulation")).toBeInTheDocument()

    const zone = screen.getByRole("link", { name: /INT-2026-0042.*Coupure de voie/ })
    expect(zone).toHaveAttribute("href", "/infrastructures/interventions/int-1")
    expect(screen.queryByRole("link", { name: /INT-2026-0043/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Demander une plage travaux/ })).not.toBeInTheDocument()
  })

  it("affiche le refus d'accord du serveur en cas de conflit", async () => {
    droits(["intervention_accorder", "intervention_demander"])
    const conflit = intervention({ id: "int-9", numero: "INT-2026-0039", statut: "en_cours", statutLibelle: "En cours" })
    etat.reponses.set(`${Q}:intervention`, {
      intervention: intervention({ statut: "demandee", statutLibelle: "Demandée", accordeParNom: null, accordeLe: null }),
      trainsImpactes: [
        { id: "trip-1", trainNumber: "E 201", trainType: "EXPRESS", serviceDate: "2026-10-02", departureAt: Date.now() + 25 * HEURE, arrivalAt: Date.now() + 36 * HEURE, origine: "Owendo", destination: "Franceville", statut: "planifie" },
      ],
      conflits: [conflit],
      chantier: null,
      anomalie: null,
      chronologie: [],
    })
    etat.mutation.mockRejectedValue(new Error("Uncaught Error: Conflit : la plage recoupe INT-2026-0039 sur le même créneau, avec coupure de voie.\n    at handler"))
    render(<InterventionDossier interventionId="int-1" />)

    expect(screen.getByText("Conflit avec 1 plage active")).toBeInTheDocument()
    expect(within(screen.getByRole("table", { name: "Trains impactés par INT-2026-0042" })).getByText("E 201")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /^Accorder$/ }))
    const fenetre = await screen.findByRole("dialog")
    fireEvent.click(within(fenetre).getByRole("button", { name: "Accorder la plage" }))
    await waitFor(() => expect(etat.mutation).toHaveBeenCalledWith({ interventionId: "int-1" }))
    expect((await screen.findAllByText("Conflit : la plage recoupe INT-2026-0039 sur le même créneau, avec coupure de voie.")).length).toBeGreaterThan(0)
  })
})
