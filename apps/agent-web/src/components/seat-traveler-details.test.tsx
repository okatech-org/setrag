import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { getFunctionName } from "convex/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PlacesQuotas } from "./gestion/referentiels/places"
import { SeatBlockDetail } from "./seat-block-detail"
import { TravelerTicketDetail } from "./traveler-ticket-detail"

const { action, mutation, reponses, replace } = vi.hoisted(() => ({
  action: vi.fn().mockResolvedValue({ url: "https://example.test/billet.pdf" }),
  mutation: vi.fn().mockResolvedValue(undefined),
  reponses: { parFonction: {} as Record<string, unknown> },
  replace: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/gestion/places",
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@workspace/api/hooks", () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) =>
    args === "skip" ? undefined : reponses.parFonction[getFunctionName(reference)],
  useMutation: () => mutation,
  useAction: () => action,
}))

vi.mock("./gestion/referentiels/droits", () => ({
  useDroitsGestion: () => ({ role: "chef_gare", may: () => true, chargement: false, lectureModule: false, utilisateur: null }),
}))

vi.mock("./portal-guard", () => ({
  usePortalSession: () => ({ profile: { user: { _id: "u1", firstName: "Serge", lastName: "Ndong", role: "chef_gare" } } }),
}))

vi.mock("./seller-shell", () => ({
  SellerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

const serge = { id: "u1", nom: "Serge Ndong", court: "S. Ndong", matricule: "G-044", role: "chef_gare" }

describe("places, quotas et voyageurs", () => {
  beforeEach(() => {
    mutation.mockReset()
    mutation.mockResolvedValue(undefined)
    reponses.parFonction = {}
  })

  it("débloque une place avec une note, et montre qui l'a bloquée", async () => {
    reponses.parFonction["functions/management:getSeatBlock"] = {
      block: { _id: "block-1", _creationTime: Date.UTC(2026, 9, 1, 9, 51), reason: "protocole", comment: "Délégation ministérielle", isActive: true },
      trip: { _id: "trip-1", trainNumber: "E201", serviceDate: "2026-10-02" },
      seat: { label: "3A" },
      coach: { label: "V1" },
      creator: { firstName: "Serge", lastName: "Ndong", matricule: "G-044" },
      releaser: null,
      occupancy: { serviceClass: "VIP" },
      blockedSegments: [0, 1],
      stops: [
        { stop: { sequence: 0 }, station: { name: "Owendo" } },
        { stop: { sequence: 1 }, station: { name: "Booué" } },
        { stop: { sequence: 2 }, station: { name: "Franceville" } },
      ],
    }
    render(<SeatBlockDetail blockId="block-1" />)
    expect(screen.getByText("Owendo → Franceville")).toBeInTheDocument()
    expect(screen.getAllByText("Serge Ndong · G-044").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: "Débloquer la place" }))
    const dialogue = await screen.findByRole("dialog")
    fireEvent.change(within(dialogue).getByLabelText("Note de déblocage"), { target: { value: "Délégation partie" } })
    fireEvent.click(screen.getByRole("button", { name: "Débloquer" }))
    await waitFor(() => expect(mutation).toHaveBeenCalledWith({ blockId: "block-1", note: "Délégation partie" }))
  })

  it("figure l'occupation sans la couleur seule et bloque plusieurs places d'un coup", async () => {
    const desserte = {
      id: "trip-1",
      trainNumber: "E201",
      trainName: "Express 201",
      serviceDate: "2026-10-02",
      heureDepart: "07:40",
      origine: { name: "Owendo" },
      destination: { name: "Franceville" },
      isOpenForSale: true,
      status: "planifie",
      delayMinutes: 0,
    }
    reponses.parFonction["functions/referentiels:dessertes"] = [desserte]
    reponses.parFonction["functions/referentiels:occupation"] = {
      desserte,
      arrets: [
        { sequence: 0, station: { name: "Owendo" } },
        { sequence: 1, station: { name: "Franceville" } },
      ],
      voitures: [
        {
          id: "c1",
          label: "V1",
          serviceClass: "DEUXIEME",
          places: [
            { id: "s1", label: "1A", etat: "vendue" },
            { id: "s2", label: "1B", etat: "libre" },
            { id: "s3", label: "1C", etat: "libre" },
            { id: "s4", label: "1D", etat: "bloquee" },
          ],
        },
      ],
      totaux: { vendue: 1, libre: 2, bloquee: 1, quota: 0, tenue: 0 },
      capacite: 4,
      reserveParClasse: { VIP: 0, PREMIERE: 0, DEUXIEME: 0 },
      disponiblesParClasse: { VIP: null, PREMIERE: null, DEUXIEME: 2 },
      blocages: [
        { id: "b1", place: "V1 · 1D", serviceClass: "DEUXIEME", reason: "maintenance", comment: "Tablette", portion: "Tout le parcours", isActive: true, creePar: serge, creeLe: Date.UTC(2026, 9, 1, 9), liberePar: null, libereLe: null },
      ],
      quotas: [],
      agences: [],
    }
    render(<PlacesQuotas ouvrirBlocage />)
    expect(screen.getByText(/1 vendues, 2 libres, 1 bloquées/)).toBeInTheDocument()
    expect(screen.getAllByText("Bloquée (hachures)").length).toBeGreaterThan(0)

    const dialogue = await screen.findByRole("dialog")
    fireEvent.change(within(dialogue).getByLabelText("Motif détaillé"), { target: { value: "Réservation protocole" } })
    fireEvent.click(within(dialogue).getByRole("button", { name: "1B" }))
    fireEvent.click(within(dialogue).getByRole("button", { name: "1C" }))
    expect(within(dialogue).getByRole("button", { name: "1B" })).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(screen.getByRole("button", { name: "Bloquer 2 places" }))
    await waitFor(() =>
      expect(mutation).toHaveBeenCalledWith({
        tripId: "trip-1",
        seatIds: ["s2", "s3"],
        fromStopIndex: 0,
        toStopIndex: 1,
        reason: "exploitation",
        comment: "Réservation protocole",
      })
    )
  })

  it("masque les téléphones du billet et n'en affiche un qu'avec un motif tracé", async () => {
    reponses.parFonction["functions/referentiels:billetVoyageur"] = {
      ticket: {
        _id: "ticket-1",
        number: "B-4801-1",
        status: "valide",
        serviceClass: "DEUXIEME",
        coachLabel: "V2",
        seatLabel: "7C",
        isStanding: false,
        unitPriceTtc: 28_100,
        duplicateCount: 0,
        usedAt: null,
        fare: { distanceKm: 648, chargeableKm: 648, ratePerKm: 43.42, discountPct: 0, appliedRules: [], roundingStep: 100 },
        passager: { lastName: "Ella Nguema", firstName: "Paul", gender: "M", nationality: "Gabonaise" },
        telephone: "+241 77 •• •• 21",
        urgence: null,
      },
      vente: { number: "V-OWE-0001", channel: "guichet", soldAt: Date.UTC(2026, 9, 1, 8), status: "confirmee", contactTelephone: null, contactEmail: null, vendeur: serge, pointOfSale: null },
      desserte: null,
      origine: { name: "Owendo" },
      destination: { name: "Franceville" },
      paiements: [],
      controles: [],
      bagages: [],
      historique: [],
    }
    mutation.mockResolvedValue({ telephone: "+241 77 12 34 21", urgence: null, contact: null })
    render(<TravelerTicketDetail ticketId="ticket-1" />)
    expect(screen.getByRole("heading", { name: "ELLA NGUEMA Paul" })).toBeInTheDocument()
    expect(screen.getByText("+241 77 •• •• 21")).toBeInTheDocument()
    expect(screen.queryByText("+241 77 12 34 21")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /supprimer/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Afficher le téléphone en entier" }))
    const dialogue = await screen.findByRole("dialog")
    fireEvent.change(within(dialogue).getByLabelText("Motif de l'affichage"), { target: { value: "Retard de 2 h, prévenir le voyageur" } })
    fireEvent.click(screen.getByRole("button", { name: "Afficher" }))
    await waitFor(() => expect(mutation).toHaveBeenCalledWith({ ticketId: "ticket-1", motif: "Retard de 2 h, prévenir le voyageur" }))
    expect(await screen.findByText(/\+241 77 12 34 21/)).toBeInTheDocument()
  })
})
