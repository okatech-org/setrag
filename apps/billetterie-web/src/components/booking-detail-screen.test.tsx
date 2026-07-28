import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { BookingDetailScreen } from "./booking-detail-screen"

const { actionMock } = vi.hoisted(() => ({
  actionMock: vi.fn(),
}))

vi.mock("@workspace/api/hooks", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: { email: "voyageur@example.ga" },
  }),
  useQuery: () => ({
    sale: {
      number: "V-LIGNE-20260727-000001",
      status: "confirmee",
      contactEmail: "voyageur@example.ga",
    },
    tickets: [
      {
        _id: "ticket-1",
        number: "BT-001",
        status: "valide",
        passenger: { firstName: "Ariane", lastName: "Moussavou" },
        coachLabel: "V1",
        seatLabel: "12A",
        barcodePayload: "SETRAG1:TEST",
      },
    ],
    trip: {
      trainNumber: "TR-201",
      serviceDate: "2026-08-07",
      departureAt: Date.UTC(2026, 7, 7, 7),
      arrivalAt: Date.UTC(2026, 7, 7, 19),
    },
    origin: { name: "Owendo" },
    destination: { name: "Franceville" },
    payments: [],
    adjustments: [],
  }),
  useAction: () => actionMock,
  useMutation: () => vi.fn(),
}))

describe("BookingDetailScreen", () => {
  beforeEach(() => {
    actionMock.mockResolvedValue({
      url: "https://example.test/billets.pdf",
      filename: "billets.pdf",
      ticketCount: 1,
      configured: true,
      sent: true,
      recipient: "voyageur@example.ga",
    })
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(new Blob(["pdf"])),
      })
    )
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:test"),
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
  })

  it("charge le dossier et déclenche le PDF groupé", async () => {
    render(<BookingDetailScreen reference="V-LIGNE-20260727-000001" />)

    expect(screen.getByText("Ariane Moussavou")).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole("button", { name: "Télécharger les 1 billets" })
    )

    await waitFor(() =>
      expect(actionMock).toHaveBeenCalledWith({
        reference: "V-LIGNE-20260727-000001",
        contactPhone: undefined,
      })
    )
  })

  it("propose les deux Wallets sur ordinateur et génère le pass Apple", async () => {
    actionMock.mockResolvedValueOnce({
      provider: "apple",
      filename: "billet-BT-001.pkpass",
      bytes: new ArrayBuffer(8),
    })
    render(<BookingDetailScreen reference="V-LIGNE-20260727-000001" />)

    fireEvent.click(
      screen.getAllByRole("button", { name: "Ajouter à Apple Wallet" })[0]!
    )

    await waitFor(() =>
      expect(actionMock).toHaveBeenCalledWith({
        ticketId: "ticket-1",
        provider: "apple",
        contactPhone: undefined,
      })
    )
  })
})
