import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AccueilPage from "../app/page"
import {
  AccountScreen,
  ConfirmationScreen,
  OtpScreen,
  PaymentWaiting,
  ReservationsScreen,
  TrackingScreen,
} from "./after-sale-screens"
import { BookingForm } from "./booking-form"
import { applyTravelerDefaults } from "../features/reservation/use-booking-draft"
import type { BookingDraft } from "../lib/ticketing"
import { HomeMobile } from "./home/home-mobile"
import { JourneyStepper } from "./journey-stepper"
import { PaymentForm } from "./payment-form"
import { NotificationsBell } from "./shell/notifications-bell"
import { PageIntro, SiteShell } from "./site-shell"
import { TripResults } from "./trip-results"
import { TripSearchForm } from "./trip-search-form"
import { UpcomingDepartures } from "./upcoming-departures"

const { authState, push, queryState, replace, signOutMock } = vi.hoisted(
  () => ({
    authState: {
      value: {
        isAuthenticated: false,
        isLoading: false,
        user: null as null | { id: string; name: string; email: string },
      },
    },
    push: vi.fn(),
    queryState: { value: undefined as unknown },
    replace: vi.fn(),
    signOutMock: vi.fn().mockResolvedValue({}),
  })
)

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@workspace/api/hooks", () => ({
  useQuery: () => queryState.value,
  useMutation: () => vi.fn().mockResolvedValue({}),
  useAction: () =>
    vi.fn().mockResolvedValue({ url: "https://example.test/ticket.pdf" }),
  useAuth: () => authState.value,
}))

vi.mock("@workspace/api/auth-client", () => ({
  authClient: {
    phoneNumber: { sendOtp: vi.fn(), verify: vi.fn() },
    emailOtp: { sendVerificationOtp: vi.fn() },
    signIn: { emailOtp: vi.fn() },
    signOut: signOutMock,
  },
}))

describe("composants de structure", () => {
  it("SiteShell conserve le chrome web public sans session", () => {
    render(
      <SiteShell>
        <p>Contenu</p>
      </SiteShell>
    )
    expect(
      screen.queryByRole("navigation", { name: "Navigation principale" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Voir les notifications" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("textbox", {
        name: "Rechercher une gare, un dossier ou un train",
      })
    ).not.toBeInTheDocument()
    expect(document.querySelector('[data-slot="site-shell"]')).toHaveClass(
      "flex",
      "min-h-dvh",
      "flex-col"
    )
    expect(
      document.querySelector('[data-slot="desktop-footer-container"]')
    ).toHaveClass("mt-auto")
    expect(screen.getByText("Contenu")).toBeInTheDocument()
  })

  it("SiteShell réserve les liens personnels aux voyageurs connectés", () => {
    render(
      <SiteShell>
        <p>Contenu invité</p>
      </SiteShell>
    )

    const header = document.querySelector(
      '[data-slot="desktop-header"]'
    ) as HTMLElement
    expect(
      within(header).queryByRole("link", { name: "Mes réservations" })
    ).not.toBeInTheDocument()
    expect(
      within(header).queryByRole("link", { name: "Mon compte" })
    ).not.toBeInTheDocument()
    expect(
      within(header).queryByRole("link", { name: "Rechercher" })
    ).not.toBeInTheDocument()
    expect(
      within(header).queryByRole("link", { name: "Suivre un train" })
    ).not.toBeInTheDocument()
    expect(
      within(header).getByRole("link", { name: "Se connecter" })
    ).toHaveAttribute("href", "/connexion?intention=connexion&retour=%2F")
    expect(
      within(header).getByRole("link", { name: "S’inscrire" })
    ).toHaveAttribute("href", "/connexion?intention=inscription&retour=%2F")
    expect(
      screen.queryByRole("link", { name: "Billets" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: "Compte" })
    ).not.toBeInTheDocument()
  })

  it("SiteShell propose le compte sans dupliquer la déconnexion", () => {
    authState.value = {
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: "voyageur-1",
        name: "Paul",
        email: "paul@example.ga",
      },
    }
    render(
      <SiteShell>
        <p>Contenu connecté</p>
      </SiteShell>
    )
    expect(screen.getByRole("link", { name: "Mon compte" })).toHaveAttribute(
      "href",
      "/compte"
    )
    expect(
      screen.queryByRole("button", { name: "Se déconnecter" })
    ).not.toBeInTheDocument()
    expect(
      screen.getAllByRole("navigation", { name: "Navigation principale" })
    ).toHaveLength(2)
    expect(
      screen.getByRole("button", { name: "Voir les notifications" })
    ).toBeInTheDocument()
    const header = document.querySelector(
      '[data-slot="desktop-header"]'
    ) as HTMLElement
    const navigation = within(header).getByRole("navigation", {
      name: "Navigation principale",
    })
    expect(
      within(navigation).getByRole("link", { name: "Rechercher" })
    ).toBeInTheDocument()
    expect(
      within(navigation).getByRole("link", { name: "Mes réservations" })
    ).toBeInTheDocument()
    expect(
      within(navigation).getByRole("link", { name: "Suivre un train" })
    ).toBeInTheDocument()
    expect(
      within(navigation).queryByRole("link", { name: "Mon compte" })
    ).not.toBeInTheDocument()
  })

  it("l'accueil public conserve la recherche compacte sur mobile", () => {
    authState.value = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
    }

    const { container } = render(<AccueilPage />)

    expect(
      container.querySelector('[data-experience="mobile-app"]')
    ).not.toHaveClass("hidden")
    expect(
      container.querySelector('[data-experience="public-web"]')
    ).not.toHaveClass("block")

    const mobile = container.querySelector(
      '[data-experience="mobile-app"]'
    ) as HTMLElement
    expect(
      within(mobile).getByRole("button", { name: "1 voyageur" })
    ).toHaveAttribute("data-slot", "chip")
  })

  it("l'accueil mobile connecté active l'expérience applicative", () => {
    authState.value = {
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: "voyageur-1",
        name: "Paul",
        email: "paul@example.ga",
      },
    }

    const { container } = render(<AccueilPage />)

    expect(
      container.querySelector('[data-experience="mobile-app"]')
    ).not.toHaveClass("hidden")
    expect(
      container.querySelector('[data-experience="public-web"]')
    ).not.toHaveClass("block")
  })

  it("PageIntro restitue le titre et la description", () => {
    render(<PageIntro title="Titre de page" description="Description utile" />)
    expect(
      screen.getByRole("heading", { name: "Titre de page" })
    ).toBeInTheDocument()
    expect(screen.getByText("Description utile")).toBeInTheDocument()
  })

  it("la cloche ouvre les notifications sans changer de page", () => {
    render(<NotificationsBell />)

    const trigger = screen.getByRole("button", {
      name: "Voir les notifications",
    })
    expect(screen.queryByRole("link", { name: "Voir les notifications" })).toBe(
      null
    )

    fireEvent.click(trigger)

    expect(
      screen.getByRole("dialog", { name: "Notifications" })
    ).toBeInTheDocument()
  })

  it("JourneyStepper annonce l'étape active", () => {
    render(<JourneyStepper current={2} />)
    const steps = screen.getByLabelText("Étape 3 sur 4")
    expect(steps).toBeInTheDocument()
    expect(steps.parentElement).toHaveClass("min-w-0")
  })
})

describe("composants du parcours d'achat", () => {
  beforeEach(() => {
    push.mockReset()
    replace.mockReset()
    queryState.value = undefined
    authState.value = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
    }
  })

  it("relie un prochain départ à sa recherche exacte", () => {
    queryState.value = [
      {
        tripId: "trip-reel-201",
        trainNumber: "TR-201",
        trainType: "EXPRESS",
        serviceDate: "2026-08-14",
        departureAt: Date.UTC(2026, 7, 14, 7),
        arrivalAt: Date.UTC(2026, 7, 14, 18, 45),
        status: "planifie",
        delayMinutes: 0,
        origin: {
          stationId: "station-owendo-reelle",
          code: "OWE",
          name: "Owendo",
        },
        destination: {
          stationId: "station-franceville-reelle",
          code: "FCV",
          name: "Franceville",
        },
      },
    ]

    render(<UpcomingDepartures />)

    expect(screen.getByText(/TR-201 · Express/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Réserver" })).toHaveAttribute(
      "href",
      "/resultats?origin=station-owendo-reelle&destination=station-franceville-reelle&date=2026-08-14&adults=1&children=0"
    )
  })

  it("n'affiche aucun encart quand aucun voyage n'est prévu", () => {
    render(<HomeMobile />)

    expect(screen.queryByText("Aucun voyage prévu")).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        "Connectez-vous pour retrouver vos billets sur cet appareil."
      )
    ).not.toBeInTheDocument()
  })

  it("TripSearchForm valide des gares différentes avant la navigation", () => {
    render(<TripSearchForm />)
    const selects = screen.getAllByRole("combobox")
    fireEvent.change(selects[1]!, { target: { value: "station-owendo" } })
    fireEvent.click(screen.getByRole("button", { name: "Rechercher un train" }))
    expect(
      screen.getByText("Choisissez deux gares différentes.")
    ).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it("TripSearchForm affiche l'assistant vocal flottant sans ouvrir de modale", async () => {
    render(<TripSearchForm />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "Réserver avec l’assistant vocal",
      })
    )

    expect(
      screen.getByRole("complementary", { name: "Assistant vocal Mbolo" })
    ).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(
      screen.getByText(
        "Parlez naturellement. Le paiement reste entre vos mains."
      )
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        "Ce navigateur ne permet pas encore la conversation vocale."
      )
    ).toBeInTheDocument()
  })

  it("TripResults affiche les dessertes et permet le tri", () => {
    render(<TripResults />)
    expect(screen.getByText("2 dessertes disponibles")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Trier les résultats"), {
      target: { value: "prix" },
    })
    expect(
      screen.getByRole("link", { name: "Choisir TR-201" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Choisir TR-202" })
    ).toBeInTheDocument()
  })

  it("BookingForm rend un formulaire voyageur et le total", () => {
    render(<BookingForm />)
    expect(
      screen.getByRole("heading", { name: "Voyageurs" })
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Prénom")).toHaveValue("Ariane")
    expect(screen.getByText("Total indicatif")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Continuer vers le paiement" })
    ).toHaveClass("whitespace-normal", "w-full")
    expect(
      screen.queryByLabelText("Place souhaitée (facultatif)")
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("Attribution automatique")
    ).not.toBeInTheDocument()
  })

  it("préremplit le titulaire depuis son profil sans écraser le brouillon", () => {
    const booking: BookingDraft = {
      serviceClass: "DEUXIEME",
      contactPhone: "",
      contactEmail: "",
      passengers: [
        {
          firstName: "",
          lastName: "Déjà saisi",
          gender: "F",
          seatId: "siege-12",
        },
      ],
    }

    const result = applyTravelerDefaults(booking, {
      firstName: "Berny",
      lastName: "Itoutou",
      phone: "+241 06 12 34 56",
      email: "berny@example.ga",
    })

    expect(result.passengers[0]).toMatchObject({
      firstName: "Berny",
      lastName: "Déjà saisi",
      seatId: undefined,
    })
    expect(result.contactPhone).toBe("+241 06 12 34 56")
    expect(result.contactEmail).toBe("berny@example.ga")
  })

  it("PaymentForm place la checkbox CGV juste avant le paiement", async () => {
    render(<PaymentForm />)
    const cgvCheckboxes = screen.getAllByRole("checkbox", {
      name: /conditions générales de vente/,
    })
    expect(cgvCheckboxes).toHaveLength(2)

    const mobilePhone = screen.getByRole("textbox", {
      name: "Numéro payeur",
    })
    const mobileAirtel = screen
      .getAllByRole("radio", { name: /Airtel Money/ })
      .find((radio) => radio.closest("li"))
    expect(mobilePhone.closest("li")).toBe(mobileAirtel?.closest("li"))

    const desktopPhone = screen.getByRole("textbox", {
      name: "Téléphone du payeur",
    })
    const desktopSummary = desktopPhone.closest(
      '[data-slot="checkout-summary"]'
    ) as HTMLElement
    const desktopPayButton = within(desktopSummary).getByRole("button", {
      name: /Payer/,
    })
    expect(
      desktopPhone.compareDocumentPosition(desktopPayButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    const desktopCheckbox = within(desktopSummary).getByRole("checkbox", {
      name: /conditions générales de vente/,
    })
    expect(
      desktopCheckbox.compareDocumentPosition(desktopPayButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    const mobileActions = cgvCheckboxes
      .map((checkbox) => checkbox.closest('[data-slot="sticky-actions"]'))
      .find(Boolean) as HTMLElement
    const mobileCheckbox = within(mobileActions).getByRole("checkbox", {
      name: /conditions générales de vente/,
    })
    const mobilePayButton = within(mobileActions).getByRole("button", {
      name: /Payer/,
    })
    expect(
      mobileCheckbox.compareDocumentPosition(mobilePayButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    fireEvent.change(mobilePhone, {
      target: { value: "+241 06 12 34 56" },
    })
    const payButtons = screen.getAllByRole("button", { name: /Payer/ })
    fireEvent.click(payButtons[0]!)
    expect(push).not.toHaveBeenCalled()
    expect(
      screen.getAllByText(
        "Acceptez les conditions générales de vente pour payer."
      )
    ).toHaveLength(2)

    fireEvent.click(cgvCheckboxes[0]!)
    fireEvent.click(payButtons[0]!)
    await waitFor(() => expect(push).toHaveBeenCalledWith("/paiement/attente"))
  })
})

describe("composants d'après-vente et de compte", () => {
  it("PaymentWaiting explique la validation mobile", () => {
    render(<PaymentWaiting />)
    expect(
      screen.getByRole("heading", {
        name: "Validez le paiement sur votre téléphone",
      })
    ).toBeInTheDocument()
  })

  it("ConfirmationScreen affiche la référence et le billet", () => {
    render(<ConfirmationScreen />)
    expect(screen.getByText("RS-2026-084517")).toBeInTheDocument()
    expect(screen.getByText("Owendo → Franceville")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Mes réservations" })).toHaveClass(
      "whitespace-normal"
    )
  })

  it("ReservationsScreen ne présente pas de fausse réservation anonyme", () => {
    render(<ReservationsScreen />)
    expect(
      screen.getByText(
        "Connectez-vous pour retrouver automatiquement votre historique."
      )
    ).toBeInTheDocument()
    expect(screen.queryByText("Owendo → Franceville")).not.toBeInTheDocument()
  })

  it("TrackingScreen affiche la chronologie de desserte", () => {
    render(<TrackingScreen />)
    // La timeline mobile et la liste du bureau nomment les mêmes gares.
    expect(screen.getAllByText(/^Owendo/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^Franceville/).length).toBeGreaterThan(0)
  })

  it("AccountScreen ne présente pas Ariane sans session", () => {
    render(<AccountScreen />)
    expect(
      screen.getByText("Connectez-vous pour gérer votre compte")
    ).toBeInTheDocument()
    expect(screen.queryByDisplayValue("Ariane")).not.toBeInTheDocument()
  })

  it("AccountScreen propose les mêmes réglages sur desktop que sur mobile", () => {
    authState.value = {
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: "voyageur-1",
        name: "Berny Itoutou",
        email: "berny@example.ga",
      },
    }
    queryState.value = {
      user: {
        firstName: "Berny",
        lastName: "Itoutou",
        phone: "+24106000000",
        email: "berny@example.ga",
      },
      consents: [],
    }

    const { container } = render(<AccountScreen />)
    const desktopNavigation = container.querySelector(
      'nav[data-layout="grid"]'
    ) as HTMLElement

    expect(desktopNavigation).toBeInTheDocument()
    expect(
      within(desktopNavigation).getByRole("link", { name: /Profil/ })
    ).toHaveAttribute("href", "/compte/profil")
    expect(
      within(desktopNavigation).getByRole("link", {
        name: /Voyageurs enregistrés/,
      })
    ).toHaveAttribute("href", "/compte/voyageurs")
    expect(
      within(desktopNavigation).getByRole("link", {
        name: /Affichage et langue/,
      })
    ).toHaveAttribute("href", "/compte/affichage")
    expect(
      within(desktopNavigation).getByRole("button", { name: /Notifications/ })
    ).toBeInTheDocument()
  })

  it("OtpScreen passe de l'identifiant au code", async () => {
    authState.value = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
    }
    render(<OtpScreen />)
    expect(
      screen.getByRole("heading", { name: "Se connecter" })
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Adresse e-mail"), {
      target: { value: "ariane@example.ga" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Recevoir mon code" }))
    expect(
      await screen.findByLabelText("Code à 6 chiffres")
    ).toBeInTheDocument()
  })

  it("OtpScreen renvoie immédiatement une session active vers l'accueil", async () => {
    authState.value = {
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: "voyageur-1",
        name: "Paul",
        email: "paul@example.ga",
      },
    }

    render(<OtpScreen />)

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"))
    expect(
      screen.queryByText("Vous êtes déjà connecté")
    ).not.toBeInTheDocument()
  })
})
