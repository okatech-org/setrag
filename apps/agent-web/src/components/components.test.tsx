import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  DEMO_DASHBOARD,
  DEMO_SEATS,
  DEMO_STATIONS,
  DEMO_TRIPS,
  type SaleConfirmationData,
  type TicketSaleDraft,
} from "@/lib/agent-data"
import { LoginScreen } from "./login-screen"
import {
  BaggageSaleScreen,
  ParcelSaleScreen,
  SpecialTransportScreen,
} from "./ancillary-sale-screens"
import { PaymentScreen } from "./payment-screen"
import { SaleConfirmationScreen } from "./sale-confirmation-screen"
import { SeatMapDialog } from "./seat-map-dialog"
import {
  OpenCashForm,
  ProductShortcut,
  SellerDashboardScreen,
} from "./seller-dashboard"
import { SellerShell } from "./seller-shell"
import {
  TicketSaleScreen,
  TicketSearchForm,
  TripSearchResults,
} from "./ticket-sale-screen"
import { ManagementScreen } from "./management-screens"
import {
  JournalExportDialog,
  PenaltyDialog,
  ReportScheduleDialog,
  RevenueControlDialog,
} from "./management-action-dialogs"
import {
  CashScreen,
  ManualSalesScreen,
  OperationsScreen,
  type OperationRow,
} from "./seller-operations"

const push = vi.fn()
const replace = vi.fn()
const passenger = {
  firstName: "Ariane",
  lastName: "MBADINGA",
  gender: "F" as const,
  seatId: "seat-1A",
  seatLabel: "1A",
}
const draft: TicketSaleDraft = {
  tripId: "trip-201",
  trainNumber: "TR-201",
  trainType: "omnibus",
  serviceDate: "2026-07-27",
  departureAt: DEMO_TRIPS[0]!.departureAt,
  arrivalAt: DEMO_TRIPS[0]!.arrivalAt,
  originStationId: DEMO_STATIONS[0]!.id,
  originName: DEMO_STATIONS[0]!.name,
  originCode: DEMO_STATIONS[0]!.code,
  destinationStationId: DEMO_STATIONS.at(-1)!.id,
  destinationName: DEMO_STATIONS.at(-1)!.name,
  destinationCode: DEMO_STATIONS.at(-1)!.code,
  fromIndex: 0,
  toIndex: 5,
  serviceClass: "DEUXIEME",
  passengers: [passenger],
  distanceKm: 648,
  totalTtc: 23_417,
}
const confirmation: SaleConfirmationData = {
  saleId: "sale-1",
  number: "V-4822",
  amounts: {
    ht: 19_845,
    vat: 3_572,
    css: 0,
    ttc: 23_417,
    received: 23_417,
  },
  tickets: [
    {
      id: "ticket-1",
      number: "B-4822-1",
      passengerName: "Ariane MBADINGA",
      seatLabel: "1A",
      unitPriceTtc: 23_417,
    },
  ],
  changeDue: 6_583,
  draft,
}

vi.mock("next/navigation", () => ({
  usePathname: () => "/vente",
  useRouter: () => ({ push, replace }),
}))

vi.mock("@workspace/api/hooks", () => ({
  useQuery: () => undefined,
  useMutation: () => vi.fn().mockResolvedValue({}),
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    user: null,
  }),
}))

vi.mock("@workspace/api/auth-client", () => ({
  authClient: {
    signIn: { email: vi.fn() },
    signOut: vi.fn(),
  },
}))

describe("AW-00 · connexion", () => {
  it("soumet le compte de repli", async () => {
    const signIn = vi.fn().mockResolvedValue(undefined)
    render(<LoginScreen onPasswordSignIn={signIn} onSsoSignIn={vi.fn()} />)

    fireEvent.change(screen.getByLabelText("Adresse e-mail professionnelle"), {
      target: { value: "agent@setrag.ga" },
    })
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "secret-solide" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Connexion" }))

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith({
        email: "agent@setrag.ga",
        password: "secret-solide",
      })
    )
  })

  it("explique honnêtement un SSO non raccordé", async () => {
    render(
      <LoginScreen
        onPasswordSignIn={vi.fn()}
        onSsoSignIn={vi.fn().mockRejectedValue(new Error("OIDC"))}
      />
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "Se connecter avec mon compte SETRAG",
      })
    )
    expect(
      await screen.findByText(/raccordement Entra ID/i)
    ).toBeInTheDocument()
  })

  it("autorise le libellé SSO à se replier sur petit écran", () => {
    render(<LoginScreen onPasswordSignIn={vi.fn()} onSsoSignIn={vi.fn()} />)
    expect(
      screen.getByRole("button", {
        name: "Se connecter avec mon compte SETRAG",
      })
    ).toHaveClass("whitespace-normal", "min-w-0")
  })
})

describe("structure du portail vendeur", () => {
  it("SellerShell expose la navigation et l’état central", () => {
    render(
      <SellerShell
        seller={DEMO_DASHBOARD.seller}
        pointOfSale={DEMO_DASHBOARD.pointOfSale}
        session={DEMO_DASHBOARD.session}
        online
      >
        <p>Contenu vendeur</p>
      </SellerShell>
    )
    expect(
      screen.getByRole("navigation", {
        name: "Navigation du portail de vente",
      })
    ).toBeInTheDocument()
    expect(screen.getByText("Connecté au système central")).toBeInTheDocument()
    expect(screen.getByText("Contenu vendeur")).toBeInTheDocument()
  })

  it("ProductShortcut déclenche l’action disponible", () => {
    const select = vi.fn()
    render(
      <ProductShortcut
        icon={<span>Icône</span>}
        title="Billet voyageur"
        description="Créer un billet"
        shortcut="F1"
        onSelect={select}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /Billet voyageur/ }))
    expect(select).toHaveBeenCalledOnce()
  })
})

describe("AW-V-01 · accueil vendeur", () => {
  beforeEach(() => {
    push.mockReset()
    replace.mockReset()
  })

  it("affiche les compteurs et ouvre la vente billet avec F1", () => {
    const navigate = vi.fn()
    render(
      <SellerDashboardScreen
        data={DEMO_DASHBOARD}
        online
        onOpenCash={vi.fn()}
        onNavigate={navigate}
      />
    )
    expect(screen.getByText("42")).toBeInTheDocument()
    expect(screen.getByText(/1.*246.*500 FCFA/)).toBeInTheDocument()
    fireEvent.keyDown(window, { key: "F1" })
    expect(navigate).toHaveBeenCalledWith("/vente/billet")
  })

  it("OpenCashForm valide puis transmet le fond de caisse", async () => {
    const open = vi.fn().mockResolvedValue(undefined)
    render(<OpenCashForm onOpen={open} />)
    fireEvent.change(screen.getByLabelText("Fond de caisse (FCFA)"), {
      target: { value: "50000" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir ma caisse" }))
    await waitFor(() => expect(open).toHaveBeenCalledWith(50000))
  })

  it("bloque les ventes électroniques hors ligne", () => {
    render(
      <SellerDashboardScreen
        data={DEMO_DASHBOARD}
        online={false}
        onOpenCash={vi.fn()}
        onNavigate={vi.fn()}
      />
    )
    expect(
      screen.getByText(/Aucune vente électronique ne peut être émise/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Billet voyageur/ })
    ).toBeDisabled()
  })
})

describe("AW-V-02 · billet voyageur", () => {
  it("TicketSearchForm refuse un trajet sans déplacement", () => {
    const search = vi.fn()
    render(<TicketSearchForm stations={DEMO_STATIONS} onSearch={search} />)
    fireEvent.change(screen.getByLabelText("Gare d’arrivée"), {
      target: { value: DEMO_STATIONS[0]!.id },
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Rechercher les dessertes" })
    )
    expect(screen.getByText(/doivent être différentes/)).toBeInTheDocument()
    expect(search).not.toHaveBeenCalled()
  })

  it("TripSearchResults sélectionne une desserte disponible", () => {
    const select = vi.fn()
    render(
      <TripSearchResults
        results={DEMO_TRIPS}
        loading={false}
        searched
        onSelect={select}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Choisir TR-201" }))
    expect(select).toHaveBeenCalledWith(DEMO_TRIPS[0])
  })

  it("TicketSaleScreen assemble recherche et résultats", () => {
    render(
      <TicketSaleScreen
        dashboard={DEMO_DASHBOARD}
        stations={DEMO_STATIONS}
        results={DEMO_TRIPS}
        loading={false}
        searched
        online
        serviceClass="DEUXIEME"
        passengers={[]}
        seats={[]}
        seatDialogOpen={false}
        onSearch={vi.fn()}
        onSelectTrip={vi.fn()}
        onServiceClassChange={vi.fn()}
        onPassengerChange={vi.fn()}
        onSeatDialogOpenChange={vi.fn()}
        onSeatsConfirm={vi.fn()}
        onContinue={vi.fn()}
      />
    )
    expect(
      screen.getByRole("heading", { name: "Billet voyageur" })
    ).toBeInTheDocument()
    expect(screen.getByText("2 desserte(s) disponible(s)")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Accueil vendeur" }).closest("header")
    ).toHaveClass("flex-col", "min-w-0")
  })
})

describe("AW-V-03 · plan de voiture", () => {
  it("sélectionne exactement la place libre demandée", () => {
    const confirm = vi.fn()
    render(
      <SeatMapDialog
        open
        seats={DEMO_SEATS}
        requiredCount={1}
        initialSelection={[]}
        onOpenChange={vi.fn()}
        onConfirm={confirm}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Place 1A · libre" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirmer 1/1" }))
    expect(confirm).toHaveBeenCalledWith(["seat-1A"])
  })
})

describe("AW-V-07 · encaissement", () => {
  it("calcule la monnaie et transmet le montant remis", async () => {
    const submit = vi.fn().mockResolvedValue(undefined)
    render(
      <PaymentScreen
        dashboard={DEMO_DASHBOARD}
        draft={draft}
        online
        pending={false}
        onSubmit={submit}
      />
    )
    fireEvent.change(screen.getByLabelText("Montant remis (FCFA)"), {
      target: { value: "30000" },
    })
    expect(screen.getByText(/6.*583.*FCFA/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Valider et émettre" }))
    await waitFor(() => expect(submit).toHaveBeenCalledWith(30_000))
  })

  it("replie l'en-tête avant les colonnes d'encaissement", () => {
    render(
      <PaymentScreen
        dashboard={DEMO_DASHBOARD}
        draft={draft}
        online
        pending={false}
        onSubmit={vi.fn()}
      />
    )
    expect(
      screen.getByRole("link", { name: "Modifier la vente" }).closest("header")
    ).toHaveClass("flex-col", "min-w-0")
  })
})

describe("AW-V-08 · confirmation", () => {
  it("rend chaque billet et déclenche son PDF", () => {
    const print = vi.fn()
    render(
      <SaleConfirmationScreen
        dashboard={DEMO_DASHBOARD}
        confirmation={confirmation}
        online
        onPrintTicket={print}
        onPrintAll={vi.fn()}
        onNewSale={vi.fn()}
      />
    )
    expect(
      screen.getByRole("heading", { name: "Billets émis avec succès" })
    ).toBeInTheDocument()
    expect(screen.getByText("Ariane MBADINGA")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "PDF du billet" }))
    expect(print).toHaveBeenCalledWith("ticket-1")
  })
})

describe("AW-V-04 · vente bagage", () => {
  it("recherche le billet puis transmet le poids à vendre", async () => {
    const lookup = vi.fn()
    const sell = vi.fn().mockResolvedValue(undefined)
    render(
      <BaggageSaleScreen
        dashboard={DEMO_DASHBOARD}
        online
        ticket={{
          id: "ticket-1",
          number: "B-4821",
          passengerName: "Paul MBADINGA",
          originCode: "OWE",
          destinationCode: "FCV",
          trainNumber: "TR-201",
          distanceKm: 648,
          status: "valide",
        }}
        quote={{ distanceKm: 648, totalTtc: 833 }}
        pending={false}
        onLookup={lookup}
        onSell={sell}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Rechercher" }))
    expect(lookup).toHaveBeenCalledWith("B-4821")
    fireEvent.click(
      screen.getByRole("button", { name: "Enregistrer et encaisser" })
    )
    await waitFor(() =>
      expect(sell).toHaveBeenCalledWith(
        expect.objectContaining({ weightKg: 12 })
      )
    )
  })
})

describe("AW-V-05 · colis express", () => {
  it("ajoute une ligne article sans perdre la première", () => {
    render(
      <ParcelSaleScreen
        dashboard={DEMO_DASHBOARD}
        stations={DEMO_STATIONS}
        online
        quote={{ zone: 7, distanceKm: 648, totalTtc: 4_500 }}
        pending={false}
        onQuoteInput={vi.fn()}
        onSell={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un article" }))
    expect(screen.getByLabelText("Description article 1")).toHaveValue(
      "Carton scellé"
    )
    expect(screen.getByLabelText("Description article 2")).toBeInTheDocument()
  })
})

describe("AW-V-06 · prestation spéciale", () => {
  it("retire le billet obligatoire en basculant au funéraire", () => {
    render(
      <SpecialTransportScreen
        dashboard={DEMO_DASHBOARD}
        stations={DEMO_STATIONS}
        online
        initialType="auto"
        pending={false}
        onSell={vi.fn()}
      />
    )
    expect(
      screen.getByLabelText("Billet voyageur de rattachement")
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Transport funéraire" }))
    expect(
      screen.getByRole("button", { name: "Transport funéraire" })
    ).toHaveClass("whitespace-normal", "min-w-0")
    expect(
      screen.queryByLabelText("Billet voyageur de rattachement")
    ).not.toBeInTheDocument()
    expect(screen.getByText(/certificat de décès/)).toBeInTheDocument()
  })
})

describe("AW-V-09 · opérations", () => {
  const operations: OperationRow[] = [
    {
      id: "sale-1",
      number: "V-OWE-4821",
      product: "Billet",
      kind: "Vente",
      status: "Confirmée",
      amountXaf: 18_500,
      soldAt: Date.parse("2026-07-27T09:42:00+01:00"),
    },
  ]

  it("recherche puis exige un motif avant l’annulation", async () => {
    const searchOperation = vi.fn()
    const cancel = vi.fn().mockResolvedValue(undefined)
    render(
      <OperationsScreen
        dashboard={DEMO_DASHBOARD}
        operations={operations}
        online
        onSearch={searchOperation}
        onCancel={cancel}
        onRefund={vi.fn()}
        onReprint={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText("Numéro de vente ou de billet"), {
      target: { value: "V-OWE-4821" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Rechercher" }))
    expect(searchOperation).toHaveBeenCalledWith("V-OWE-4821")
    fireEvent.click(screen.getByRole("button", { name: "Annuler la vente" }))
    expect(cancel).not.toHaveBeenCalled()
    expect(
      screen.getByText("Saisissez le motif obligatoire avant de poursuivre.")
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Motif obligatoire"), {
      target: { value: "Erreur de trajet" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Annuler la vente" }))
    await waitFor(() =>
      expect(cancel).toHaveBeenCalledWith("sale-1", "Erreur de trajet")
    )
  })
})

describe("AW-V-10 · caisse", () => {
  it("clôture une caisse équilibrée avec le comptage par moyen", async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    render(
      <CashScreen
        dashboard={DEMO_DASHBOARD}
        summary={{
          salesCount: 4,
          totalTtc: 100_000,
          totalReceived: 100_000,
          cancellations: 0,
          refunds: 0,
        }}
        online
        onClose={close}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Clôturer ma caisse" }))
    await waitFor(() =>
      expect(close).toHaveBeenCalledWith(100_000, 0, undefined)
    )
    expect(await screen.findByText(/Caisse clôturée/)).toBeInTheDocument()
  })
})

describe("AW-V-11 · ventes manuelles", () => {
  it("régularise un billet pré-imprimé sans émission électronique", async () => {
    const record = vi.fn().mockResolvedValue(undefined)
    render(
      <ManualSalesScreen
        dashboard={DEMO_DASHBOARD}
        stations={DEMO_STATIONS}
        rows={[]}
        online
        onRecord={record}
      />
    )
    fireEvent.change(screen.getByLabelText("Nom du voyageur"), {
      target: { value: "Mireille OBAME" },
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Enregistrer la vente manuelle" })
    )
    await waitFor(() => expect(record).toHaveBeenCalledOnce())
    expect(screen.getByText(/régularisé sans réémettre/i)).toBeInTheDocument()
  })
})

describe("portail Gestion", () => {
  it("rend le tableau de bord avec ses indicateurs et sa navigation", () => {
    render(
      <ManagementScreen
        section="tableau-de-bord"
        online
        onPrimaryAction={vi.fn()}
      />
    )
    expect(
      screen.getByRole("navigation", {
        name: "Navigation du portail de gestion",
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Vue d’ensemble" })
    ).toBeInTheDocument()
    expect(screen.getByText("Recette nette")).toBeInTheDocument()
  })

  it("filtre les tableaux et ne fabrique plus de faux succès", () => {
    render(
      <ManagementScreen
        section="trains"
        online
        actionUnavailableReason="Composition non raccordée."
      />
    )
    fireEvent.change(screen.getByLabelText("Rechercher"), {
      target: { value: "TR-202" },
    })
    expect(screen.getByText("TR-202")).toBeInTheDocument()
    expect(screen.queryByText("TR-201")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Nouvelle composition" })
    ).toBeDisabled()
    expect(
      screen.queryByText(/action enregistrée et journalisée/i)
    ).not.toBeInTheDocument()
    expect(screen.getByText("Composition non raccordée.")).toBeInTheDocument()
  })

  it("crée un procès-verbal depuis un formulaire métier", async () => {
    const create = vi.fn().mockResolvedValue("PV-000143")
    render(
      <PenaltyDialog
        open
        trips={[
          {
            id: "trip-201",
            trainNumber: "TR-201",
            serviceDate: "2026-07-27",
            origin: "Owendo",
            destination: "Franceville",
          },
        ]}
        onOpenChange={vi.fn()}
        onSubmit={create}
      />
    )
    fireEvent.change(screen.getByLabelText("Desserte contrôlée"), {
      target: { value: "trip-201" },
    })
    fireEvent.change(screen.getByLabelText("Nom du contrevenant"), {
      target: { value: "OBAME" },
    })
    fireEvent.change(screen.getByLabelText("Prénom du contrevenant"), {
      target: { value: "Jean" },
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Créer le procès-verbal" })
    )
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          tripId: "trip-201",
          lastName: "OBAME",
          firstName: "Jean",
          amountXaf: 10_000,
        })
      )
    )
    expect(await screen.findByText(/PV-000143 a été créé/)).toBeInTheDocument()
  })

  it("programme réellement un rapport avec ses destinataires", async () => {
    const schedule = vi.fn().mockResolvedValue(undefined)
    render(
      <ReportScheduleDialog open onOpenChange={vi.fn()} onSubmit={schedule} />
    )
    fireEvent.change(screen.getByLabelText("Destinataires"), {
      target: {
        value: "direction@setrag.ga, controle.recettes@setrag.ga",
      },
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmer la programmation" })
    )
    await waitFor(() =>
      expect(schedule).toHaveBeenCalledWith(
        expect.objectContaining({
          frequency: "quotidien",
          recipients: ["direction@setrag.ga", "controle.recettes@setrag.ga"],
        })
      )
    )
    expect(
      await screen.findByText(/envoi récurrent a été programmé/i)
    ).toBeInTheDocument()
  })

  it("exporte la journée comptable sélectionnée", async () => {
    const exportJournal = vi.fn().mockResolvedValue({
      filename: "journal-2026-07-26.csv",
      rowCount: 184,
    })
    render(
      <JournalExportDialog
        open
        days={[
          {
            id: "day-26",
            date: "2026-07-26",
            status: "cloturee",
          },
        ]}
        onOpenChange={vi.fn()}
        onExport={exportJournal}
      />
    )
    fireEvent.click(
      screen.getByRole("button", { name: "Télécharger le fichier" })
    )
    await waitFor(() =>
      expect(exportJournal).toHaveBeenCalledWith("day-26", "2026-07-26")
    )
    expect(
      await screen.findByText(/journal-2026-07-26.csv téléchargé/)
    ).toBeInTheDocument()
  })

  it("contrôle les recettes avant d’autoriser la clôture", async () => {
    const inspect = vi.fn().mockResolvedValue({
      date: "2026-07-27",
      status: "ouverte",
      sessions: 3,
      openSessions: 0,
      unjustifiedVariances: 0,
      sales: 42,
      cancellations: 2,
      refunds: 1,
      ttc: 3_419_000,
      received: 3_419_000,
    })
    const close = vi.fn().mockResolvedValue(undefined)
    render(
      <RevenueControlDialog
        open
        days={[{ id: "day-27", date: "2026-07-27", status: "ouverte" }]}
        onOpenChange={vi.fn()}
        onInspect={inspect}
        onCloseDay={close}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Lancer le contrôle" }))
    expect(await screen.findByText("Ventes : 42")).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole("button", {
        name: "Clôturer la journée contrôlée",
      })
    )
    await waitFor(() => expect(close).toHaveBeenCalledWith("day-27"))
    expect(
      await screen.findByText(/journée du 2026-07-27 a été clôturée/)
    ).toBeInTheDocument()
  })
})
