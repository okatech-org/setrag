import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  FreightDashboardScreen,
  type FreightDashboard,
} from "./freight-dashboard"

const EMPTY_DASHBOARD = {
  moduleCode: "fret",
  dataState: "empty",
  accessibleSiteIds: [],
  dataset: null,
  kpis: [],
  operations: [],
  alerts: [],
} satisfies FreightDashboard

const SYNTHETIC_DASHBOARD = {
  moduleCode: "fret",
  dataState: "synthetic_demo",
  accessibleSiteIds: [],
  dataset: {
    key: "setrag-owendo-franceville-v1",
    label: "Scénario Transgabonais",
    description: "Jeu fictif sans donnée de circulation réelle.",
    dataOrigin: "synthetic_demo",
    scenarioDate: "2026-09-10",
    referencePeriod: "Semaine illustrative",
    routeLabel: "Owendo — Franceville",
    routeLengthKm: 648,
    referenceSources: [
      { label: "SETRAG · Le chemin de fer", url: "https://setrag.ga" },
    ],
  },
  kpis: [
    {
      code: "tonnage",
      label: "Tonnage programmé",
      value: 9_240,
      unit: "t",
      description: "Volume massique actif dans le scénario.",
      tone: "neutral",
    },
  ],
  operations: [
    {
      id: "operation-1" as FreightDashboard["operations"][number]["id"],
      operationCode: "OP-DEMO-01",
      trainNumber: "FRET-DEMO-01",
      cargoType: "manganese",
      cargoLabel: "Manganèse",
      clientSegment: "Client minier fictif",
      origin: "Moanda",
      destination: "Owendo",
      currentLocation: "Booué",
      status: "en_ligne",
      routeProgressPct: 62,
      quantity: 9_240,
      quantityUnit: "t",
      wagonCount: 96,
      locomotiveCount: 2,
      scheduledDepartureAt: Date.UTC(2026, 8, 10, 6),
      scheduledArrivalAt: Date.UTC(2026, 8, 10, 20),
      priority: 1,
      safetyStatus: "controle_requis",
      documentStatus: "complet",
      operationalNote: "Croisement prioritaire simulé à Booué.",
      lastEventAt: Date.UTC(2026, 8, 10, 11),
    },
  ],
  alerts: [
    {
      id: "alert-1" as FreightDashboard["alerts"][number]["id"],
      alertCode: "AL-DEMO-01",
      operationCode: "OP-DEMO-01",
      severity: "warning",
      category: "securite",
      title: "Contrôle thermique",
      message: "Contrôle de température à renouveler.",
      siteLabel: "Booué",
      status: "ouverte",
      detectedAt: Date.UTC(2026, 8, 10, 11),
      dueAt: Date.UTC(2026, 8, 10, 12),
    },
  ],
} satisfies FreightDashboard

describe("tableau de bord Fret", () => {
  it("identifie clairement le scénario synthétique et détaille les convois", () => {
    render(<FreightDashboardScreen dashboard={SYNTHETIC_DASHBOARD} />)

    expect(
      screen.getByText("Données synthétiques de démonstration")
    ).toBeInTheDocument()
    expect(screen.getByText("Scénario Transgabonais")).toBeInTheDocument()
    expect(screen.getByText("Tonnage programmé")).toBeInTheDocument()

    const table = screen.getByRole("table")
    expect(within(table).getByText(/FRET-DEMO-01/)).toBeInTheDocument()
    expect(within(table).getByText("Manganèse")).toBeInTheDocument()
    expect(within(table).getByText("Moanda → Owendo")).toBeInTheDocument()
    expect(
      within(table).getByRole("progressbar", {
        name: "Progression du convoi FRET-DEMO-01",
      })
    ).toHaveAttribute("aria-valuenow", "62")
    expect(
      screen.getByText("Contrôle de température à renouveler.")
    ).toBeInTheDocument()
  })

  it("conserve un état vide honnête sans bandeau de démonstration", () => {
    render(<FreightDashboardScreen dashboard={EMPTY_DASHBOARD} />)

    expect(
      screen.getByText("Aucune donnée Fret disponible")
    ).toBeInTheDocument()
    expect(
      screen.queryByText("Données synthétiques de démonstration")
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })
})
