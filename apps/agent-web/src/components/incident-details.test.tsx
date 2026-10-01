import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { IncidentDetail } from "./incident-detail"
import { PenaltyDetail } from "./penalty-detail"

const { mutation, queryState } = vi.hoisted(() => ({
  mutation: vi.fn().mockResolvedValue(undefined),
  queryState: { value: undefined as unknown },
}))

vi.mock("@workspace/api/hooks", () => ({
  useQuery: () => queryState.value,
  useMutation: () => mutation,
}))

vi.mock("./gestion/referentiels/droits", () => ({
  useDroitsGestion: () => ({ role: "chef_gare", may: () => true, chargement: false, lectureModule: false, utilisateur: null }),
}))

vi.mock("./management-detail-shell", () => ({
  ManagementDetailShell: ({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <div>{actions}</div>
      {children}
    </main>
  ),
}))

const agent = { id: "u1", nom: "Roger Nzamba", court: "R. Nzamba", matricule: "C-044", role: "controleur_train" }

describe("fiches incidents et procès-verbaux", () => {
  beforeEach(() => {
    mutation.mockReset()
    mutation.mockResolvedValue(undefined)
  })

  it("affiche l'incident, sa chronologie, et exige une cause pour le clore", async () => {
    queryState.value = {
      incident: {
        _id: "incident-1",
        clientId: "terminal-1",
        number: "INC-2026-0081",
        category: "technique",
        severity: "important",
        description: "Lecteur de billets indisponible en V3",
        location: "Entre Ntoum et Andem",
        photoStorageIds: [],
        status: "en_cours",
        reportedAt: Date.UTC(2026, 9, 1, 7, 14),
        offline: false,
      },
      reference: "INC-2026-0081",
      desserte: null,
      station: null,
      declarant: agent,
      resolveur: null,
      photoUrls: [],
      historique: [
        {
          id: "log-1",
          action: "incident.statut",
          createdAt: Date.UTC(2026, 9, 1, 7, 20),
          acteur: agent,
          after: JSON.stringify({ status: "en_cours", note: "Bascule sur saisie manuelle" }),
        },
      ],
    }

    render(<IncidentDetail incidentId="incident-1" />)
    expect(screen.getByRole("heading", { name: "INC-2026-0081" })).toBeInTheDocument()
    expect(screen.getByText("Entre Ntoum et Andem")).toBeInTheDocument()
    expect(screen.getByText(/Bascule sur saisie manuelle/)).toBeInTheDocument()
    expect(screen.getByText("Signalé depuis le terminal")).toBeInTheDocument()

    expect(screen.getByLabelText("Cause")).toBeRequired()
    fireEvent.change(screen.getByLabelText("Cause"), { target: { value: "materiel" } })
    fireEvent.change(screen.getByLabelText("Note de clôture"), { target: { value: "Terminal de relève remis à Ndjolé" } })
    fireEvent.click(screen.getByRole("button", { name: "Clore l’incident" }))
    await waitFor(() =>
      expect(mutation).toHaveBeenCalledWith({
        incidentId: "incident-1",
        cause: "materiel",
        note: "Terminal de relève remis à Ndjolé",
      })
    )
  })

  it("encaisse un procès-verbal au guichet, référence exigée hors espèces", async () => {
    queryState.value = {
      penalty: {
        _id: "penalty-1",
        number: "PV-000142",
        status: "emis",
        amountXaf: 25_000,
        reason: "sans_titre",
        issuedAt: Date.UTC(2026, 9, 1, 7, 31),
        offender: { firstName: "Marc", lastName: "Tchibinda", phone: "+241 65 •• •• 72", declined: false },
        offline: true,
      },
      desserte: null,
      billet: null,
      paiement: null,
      agent,
      resolveur: null,
      historique: [],
    }

    render(<PenaltyDetail penaltyId="penalty-1" />)
    expect(screen.getByRole("heading", { name: "PV-000142" })).toBeInTheDocument()
    expect(screen.getAllByText("Voyageur sans titre").length).toBeGreaterThan(0)
    expect(screen.getByText("+241 65 •• •• 72")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Encaisser 25/ }))
    const dialogue = await screen.findByRole("dialog")
    fireEvent.change(within(dialogue).getByLabelText("Moyen de paiement"), { target: { value: "airtel_money" } })
    expect(within(dialogue).getByLabelText("Référence de la transaction")).toBeRequired()
    fireEvent.change(within(dialogue).getByLabelText("Référence de la transaction"), { target: { value: "AM-77810" } })
    fireEvent.click(screen.getByRole("button", { name: "Encaisser" }))
    await waitFor(() =>
      expect(mutation).toHaveBeenCalledWith({
        penaltyId: "penalty-1",
        method: "airtel_money",
        reference: "AM-77810",
        note: undefined,
      })
    )
  })
})
