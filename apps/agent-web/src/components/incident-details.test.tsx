import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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

vi.mock("./portal-guard", () => ({
  usePortalSession: () => ({
    profile: { user: { role: "admin_fonctionnel" } },
  }),
}))

vi.mock("./management-detail-shell", () => ({
  ManagementDetailShell: ({
    title,
    children,
  }: {
    title: string
    children: React.ReactNode
  }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}))

describe("fiches incidents et procès-verbaux", () => {
  beforeEach(() => mutation.mockClear())

  it("affiche l'incident et exige une note pour changer son état", async () => {
    queryState.value = {
      incident: {
        _id: "incident-1",
        clientId: "INC-2026-001",
        category: "technique",
        severity: "important",
        description: "Porte bloquée",
        photoStorageIds: [],
        status: "ouvert",
        reportedAt: Date.UTC(2026, 6, 28, 8),
        offline: false,
      },
      reporter: { firstName: "Jean", lastName: "Obame" },
      trip: { trainNumber: "TR-201" },
      station: { code: "OWD", name: "Owendo" },
      resolver: null,
      photoUrls: [],
    }

    render(<IncidentDetail incidentId="incident-1" />)
    expect(
      screen.getByRole("heading", { name: "Incident INC-2026-001" })
    ).toBeInTheDocument()
    expect(screen.getByText("Porte bloquée")).toBeInTheDocument()
    expect(
      [...screen.getByLabelText("Nouvel état").querySelectorAll("option")].map(
        (option) => option.value
      )
    ).toEqual(["", "en_cours", "resolu"])

    fireEvent.change(screen.getByLabelText("Nouvel état"), {
      target: { value: "en_cours" },
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Enregistrer le changement" })
    )
    expect(screen.getByLabelText("Note obligatoire")).toBeRequired()
    expect(mutation).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText("Note obligatoire"), {
      target: { value: "Intervention de la maintenance demandée." },
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Enregistrer le changement" })
    )
    await waitFor(() =>
      expect(mutation).toHaveBeenCalledWith({
        incidentId: "incident-1",
        status: "en_cours",
        resolutionNote: "Intervention de la maintenance demandée.",
      })
    )
  })

  it("affiche le procès-verbal et trace son traitement", async () => {
    queryState.value = {
      penalty: {
        _id: "penalty-1",
        number: "PV-000142",
        status: "emis",
        amountXaf: 25_000,
        reason: "sans_titre",
        issuedAt: Date.UTC(2026, 6, 28, 8),
        offender: {
          firstName: "Paul",
          lastName: "Moussavou",
          declined: false,
        },
        offline: true,
      },
      agent: { firstName: "Jean", lastName: "Obame" },
      trip: { trainNumber: "TR-201" },
      ticket: null,
      payment: null,
      resolver: null,
    }

    render(<PenaltyDetail penaltyId="penalty-1" />)
    expect(
      screen.getByRole("heading", { name: "PV-000142" })
    ).toBeInTheDocument()
    expect(screen.getByText("Absence de titre")).toBeInTheDocument()
    expect(
      [...screen.getByLabelText("Nouvel état").querySelectorAll("option")].map(
        (option) => option.value
      )
    ).toEqual(["", "paye", "conteste", "annule"])

    fireEvent.change(screen.getByLabelText("Nouvel état"), {
      target: { value: "conteste" },
    })
    fireEvent.change(screen.getByLabelText("Motif ou note obligatoire"), {
      target: { value: "Le voyageur conteste les faits." },
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Enregistrer le changement" })
    )

    await waitFor(() =>
      expect(mutation).toHaveBeenCalledWith({
        penaltyId: "penalty-1",
        status: "conteste",
        resolutionNote: "Le voyageur conteste les faits.",
      })
    )
  })
})
