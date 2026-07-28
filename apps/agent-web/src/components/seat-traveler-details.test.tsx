import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NewSeatBlock } from "./new-seat-block"
import { SeatBlockDetail } from "./seat-block-detail"
import { TravelerTicketDetail } from "./traveler-ticket-detail"

const { action, mutation, push, queryState } = vi.hoisted(() => ({
  action: vi.fn().mockResolvedValue({ url: "https://example.test/billet.pdf" }),
  mutation: vi.fn().mockResolvedValue(undefined),
  push: vi.fn(),
  queryState: { value: undefined as unknown },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}))

vi.mock("@workspace/api/hooks", () => ({
  useQuery: (_reference: unknown, args: unknown) => {
    if (
      queryState.value &&
      typeof queryState.value === "object" &&
      "options" in queryState.value
    ) {
      const state = queryState.value as {
        options: unknown
        selected: unknown
      }
      return args && typeof args === "object" && "tripId" in args
        ? state.selected
        : state.options
    }
    return queryState.value
  },
  useMutation: () => mutation,
  useAction: () => action,
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

describe("gestion des places et voyageurs", () => {
  beforeEach(() => {
    mutation.mockReset()
    mutation.mockResolvedValue(undefined)
    action.mockClear()
    push.mockClear()
  })

  it("libère un blocage avec une note tracée", async () => {
    queryState.value = {
      block: {
        _id: "block-1",
        reason: "maintenance",
        comment: "Sellerie à réparer",
        isActive: true,
      },
      trip: { trainNumber: "TR-201", serviceDate: "2026-08-15" },
      seat: { label: "1A" },
      coach: { label: "B2" },
      creator: { firstName: "Mireille", lastName: "Nzeng" },
      releaser: null,
      occupancy: { serviceClass: "DEUXIEME" },
      blockedSegments: [0, 1],
      stops: [
        { stop: { sequence: 0 }, station: { name: "Owendo" } },
        { stop: { sequence: 1 }, station: { name: "Booué" } },
        { stop: { sequence: 2 }, station: { name: "Franceville" } },
      ],
    }
    render(<SeatBlockDetail blockId="block-1" />)
    expect(screen.getByText("Owendo → Franceville")).toBeInTheDocument()
    expect(
      screen.getByLabelText("Note de libération obligatoire")
    ).toBeRequired()

    fireEvent.change(screen.getByLabelText("Note de libération obligatoire"), {
      target: { value: "Siège réparé et contrôlé" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Lever le blocage" }))
    await waitFor(() =>
      expect(mutation).toHaveBeenCalledWith({
        blockId: "block-1",
        note: "Siège réparé et contrôlé",
      })
    )
  })

  it("crée un vrai blocage depuis le plan d'inventaire", async () => {
    mutation.mockResolvedValue("block-2")
    const trip = {
      _id: "trip-1",
      trainNumber: "TR-201",
      serviceDate: "2026-08-15",
    }
    const selected = {
      trip,
      seats: [
        {
          seat: { _id: "seat-1", label: "1A" },
          coach: { label: "B2" },
          occupancy: { serviceClass: "DEUXIEME" },
        },
      ],
      stops: [
        {
          stop: { _id: "stop-0", sequence: 0 },
          station: { code: "OWE", name: "Owendo" },
        },
        {
          stop: { _id: "stop-1", sequence: 1 },
          station: { code: "FCV", name: "Franceville" },
        },
      ],
    }
    queryState.value = {
      options: { trips: [trip], selected: null },
      selected: { trips: [trip], selected },
    }
    render(<NewSeatBlock />)
    fireEvent.change(screen.getByLabelText("Desserte"), {
      target: { value: "trip-1" },
    })
    fireEvent.change(screen.getByLabelText("Place"), {
      target: { value: "seat-1" },
    })
    fireEvent.change(screen.getByLabelText("Motif détaillé obligatoire"), {
      target: { value: "Maintenance sellerie" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Bloquer la place" }))

    await waitFor(() =>
      expect(mutation).toHaveBeenCalledWith({
        tripId: "trip-1",
        seatId: "seat-1",
        fromStopIndex: 0,
        toStopIndex: 1,
        reason: "maintenance",
        comment: "Maintenance sellerie",
      })
    )
    expect(push).toHaveBeenCalledWith("/gestion/places/block-2")
  })

  it("affiche le billet sans proposer de suppression transactionnelle", async () => {
    queryState.value = {
      ticket: {
        number: "B-001",
        passenger: {
          firstName: "Ariane",
          lastName: "Moussavou",
          gender: "F",
        },
        status: "valide",
        coachLabel: "B2",
        seatLabel: "1A",
        isStanding: false,
        serviceClass: "DEUXIEME",
        unitPriceTtc: 20_000,
        duplicateCount: 0,
      },
      sale: {
        number: "V-001",
        contactPhone: "+24106123456",
        contactEmail: "ariane@example.ga",
      },
      trip: { trainNumber: "TR-201", serviceDate: "2026-08-15" },
      origin: { name: "Owendo" },
      destination: { name: "Franceville" },
      customer: null,
      scans: [],
      baggages: [],
      payments: [],
      seat: { label: "1A" },
    }
    vi.spyOn(window, "confirm").mockReturnValue(true)
    render(<TravelerTicketDetail ticketId="ticket-1" />)

    expect(
      screen.getByRole("heading", { name: "Ariane Moussavou" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /supprimer/i })
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole("button", { name: "Émettre un duplicata tracé" })
    )
    await waitFor(() =>
      expect(mutation).toHaveBeenCalledWith({ ticketId: "ticket-1" })
    )
  })
})
