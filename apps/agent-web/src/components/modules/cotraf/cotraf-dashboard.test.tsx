import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  CotrafDashboardScreen,
  type CotrafDashboardDto,
} from "./cotraf-dashboard"

const START = Date.parse("2026-09-10T08:00:00+01:00")

const EMPTY_DASHBOARD = {
  moduleCode: "cotraf",
  dataState: "empty",
  accessibleSiteIds: [],
  generatedAt: START,
  dataset: null,
  kpis: [],
  stations: [],
  movements: [],
  segments: [],
  events: [],
  conflicts: [],
} satisfies CotrafDashboardDto

const SYNTHETIC_DASHBOARD = {
  moduleCode: "cotraf",
  dataState: "synthetic_demo",
  accessibleSiteIds: ["site-owendo", "site-booue"],
  generatedAt: START + 15 * 60 * 1000,
  dataset: {
    key: "cotraf-demo-v1",
    label: "Scénario COTRAF Transgabonais",
    notice: "Circulations fictives sans lien avec l’exploitation réelle.",
    dataOrigin: "synthetic_demo",
    referenceAt: START,
    pkConvention:
      "Convention du référentiel de test, à valider avant usage opérationnel",
    referenceSources: [
      {
        label: "SETRAG · réseau ferroviaire",
        url: "https://setrag.ga",
      },
    ],
  },
  kpis: [
    {
      code: "trains",
      label: "Circulations suivies",
      value: 2,
      unit: "trains",
      tone: "neutral",
      description: "Deux trajectoires dans le scénario.",
    },
  ],
  stations: [
    { code: "OWE", name: "Owendo", kilometerPoint: 0 },
    { code: "BOO", name: "Booué", kilometerPoint: 338 },
    { code: "FCV", name: "Franceville", kilometerPoint: 669 },
  ],
  movements: [
    {
      id: "movement-1",
      movementCode: "MVT-DEMO-001",
      trainNumber: "TM-DEMO-804",
      serviceType: "minerai",
      direction: "decroissant",
      status: "en_ligne",
      originLabel: "Franceville",
      destinationLabel: "Owendo",
      currentPk: 338,
      delayMinutes: 12,
      priority: 1,
      lastEventAt: START,
      trajectory: [
        {
          stationCode: "FCV",
          stationName: "Franceville",
          kilometerPoint: 669,
          plannedAt: START,
        },
        {
          stationCode: "BOO",
          stationName: "Booué",
          kilometerPoint: 338,
          plannedAt: START + 3 * 60 * 60 * 1000,
          forecastAt: START + 3 * 60 * 60 * 1000 + 12 * 60 * 1000,
        },
      ],
    },
    {
      id: "movement-2",
      movementCode: "MVT-DEMO-002",
      trainNumber: "TV-DEMO-211",
      serviceType: "voyageurs",
      direction: "croissant",
      status: "retenu",
      originLabel: "Owendo",
      destinationLabel: "Franceville",
      delayMinutes: 0,
      priority: 2,
      lastEventAt: START,
      trajectory: [
        {
          stationCode: "OWE",
          stationName: "Owendo",
          kilometerPoint: 0,
          plannedAt: START + 60 * 60 * 1000,
        },
        {
          stationCode: "BOO",
          stationName: "Booué",
          kilometerPoint: 338,
          plannedAt: START + 3 * 60 * 60 * 1000,
        },
      ],
    },
  ],
  segments: [
    {
      id: "segment-1",
      segmentCode: "CANTON-BOO-FCV",
      fromStationCode: "BOO",
      fromStationName: "Booué",
      fromKm: 338,
      toStationCode: "FCV",
      toStationName: "Franceville",
      toKm: 669,
      status: "occupe",
      movementCode: "MVT-DEMO-001",
      enteredAt: START,
      expectedReleaseAt: START + 4 * 60 * 60 * 1000,
      speedLimitKph: 45,
      note: "Occupation fictive pour test d’arbitrage.",
    },
  ],
  events: [
    {
      id: "event-1",
      eventCode: "EVT-DEMO-001",
      category: "croisement",
      severity: "warning",
      title: "Croisement à confirmer",
      message: "Arbitrage simulé au poste central de Booué.",
      siteLabel: "Booué",
      status: "ouverte",
      occurredAt: START,
      dueAt: START + 30 * 60 * 1000,
      primaryTrainNumber: "TM-DEMO-804",
      secondaryTrainNumber: "TV-DEMO-211",
      estimatedGainMinutes: 18,
    },
  ],
  conflicts: [
    {
      key: "conflict-1",
      fromStationCode: "NDO",
      fromStationName: "Ndjolé",
      toStationCode: "BOO",
      toStationName: "Booué",
      trainNumbers: ["TM-DEMO-804", "TV-DEMO-211"],
      startsAt: START + 2 * 60 * 60 * 1000,
      endsAt: START + 3 * 60 * 60 * 1000,
      severity: "critical",
    },
  ],
} satisfies CotrafDashboardDto

describe("tableau de bord COTRAF", () => {
  it("signale le scénario synthétique et sa convention kilométrique", () => {
    render(<CotrafDashboardScreen dashboard={SYNTHETIC_DASHBOARD} />)

    expect(
      screen.getByText("Données synthétiques de démonstration")
    ).toBeInTheDocument()
    expect(
      screen.getByText("Scénario COTRAF Transgabonais")
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Convention du référentiel de test, à valider/)
    ).toBeInTheDocument()
    expect(screen.getByText("SYNTHÉTIQUE · NON OFFICIEL")).toBeInTheDocument()
  })

  it("rend le graphique espace-temps et son alternative textuelle", () => {
    render(<CotrafDashboardScreen dashboard={SYNTHETIC_DASHBOARD} />)

    expect(
      screen.getByRole("img", {
        name: "Graphique espace-temps des circulations COTRAF",
      })
    ).toBeInTheDocument()

    const fallback = screen.getByRole("table", {
      name: "Alternative textuelle du graphique espace-temps",
    })
    expect(within(fallback).getAllByText(/TM-DEMO-804/).length).toBeGreaterThan(
      0
    )
    expect(within(fallback).getAllByText(/TV-DEMO-211/).length).toBeGreaterThan(
      0
    )
    expect(
      within(fallback).getAllByText(/Booué · PK 338/).length
    ).toBeGreaterThan(0)
  })

  it("met en évidence les conflits et les événements associés", () => {
    render(<CotrafDashboardScreen dashboard={SYNTHETIC_DASHBOARD} />)

    const conflict = screen.getByRole("alert")
    expect(within(conflict).getByText("Ndjolé → Booué")).toBeInTheDocument()
    expect(
      within(conflict).getByText("TM-DEMO-804 × TV-DEMO-211")
    ).toBeInTheDocument()
    expect(screen.getByText("Croisement à confirmer")).toBeInTheDocument()
    expect(screen.getByText("Gain estimé : 18 min")).toBeInTheDocument()
  })

  it("conserve un état vide honnête sans circulation inventée", () => {
    render(<CotrafDashboardScreen dashboard={EMPTY_DASHBOARD} />)

    expect(
      screen.getByText("Aucune donnée COTRAF disponible")
    ).toBeInTheDocument()
    expect(
      screen.queryByText("Données synthétiques de démonstration")
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("ne marque pas les données opérationnelles comme démonstration", () => {
    const operational = {
      ...SYNTHETIC_DASHBOARD,
      dataState: "operational",
      dataset: null,
    } satisfies CotrafDashboardDto

    render(<CotrafDashboardScreen dashboard={operational} />)

    expect(
      screen.queryByText("Données synthétiques de démonstration")
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("img", {
        name: "Graphique espace-temps des circulations COTRAF",
      })
    ).toBeInTheDocument()
  })
})
