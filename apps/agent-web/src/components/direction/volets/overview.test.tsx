import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  usePathname: () => "/direction",
}))

import {
  deriveExecutiveArbitrations,
  emptyExecutiveOverview,
  type ExecutiveOverviewDto,
} from "../executive-dto"
import { OverviewVolet } from "./overview"

const emptyOverview: ExecutiveOverviewDto = {
  ...emptyExecutiveOverview({
    preset: "30j",
    serviceDate: "2026-09-10",
    from: "2026-08-12",
    to: "2026-09-10",
  }),
  finance: { state: "empty", blockers: [] },
  health: { state: "operational", severity: "info", findings: [] },
}

function renderOverview(data: ExecutiveOverviewDto) {
  return render(
    <OverviewVolet
      data={data}
      preset={data.period.preset}
      onPresetChange={vi.fn()}
    />
  )
}

describe("Vue d’ensemble de la Direction générale", () => {
  it("n’affiche aucune ancienne valeur fictive quand les sources sont vides", () => {
    renderOverview(emptyOverview)

    expect(screen.queryByText(/184[\s ]*650[\s ]*000/)).not.toBeInTheDocument()
    expect(screen.queryByText(/12[\s ]*486/)).not.toBeInTheDocument()
    expect(screen.queryByText(/71,4/)).not.toBeInTheDocument()
    expect(
      screen.getAllByText("Aucune donnée consolidée").length
    ).toBeGreaterThan(0)
    expect(
      screen.getByText(/Voyageurs : aucune journée clôturée sur la période/)
    ).toBeInTheDocument()
  })

  it("signale explicitement une activité Fret synthétique", () => {
    renderOverview({
      ...emptyOverview,
      freight: {
        state: "synthetic_demo",
        tonnes: 9240,
        activity: { label: "Opérations actives", value: 4, unit: "trains" },
        criticalAlerts: 1,
      },
    })

    expect(screen.getByText("9 240")).toBeInTheDocument()
    expect(
      screen.getAllByText("Synthétique · non officiel").length
    ).toBeGreaterThan(0)
    expect(
      screen.getByText(/Fret : chiffres de démonstration, non raccordés/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Scénario de démonstration, sans valeur opérationnelle/)
    ).toBeInTheDocument()
  })

  it("dérive les arbitrages uniquement des signaux fournis", () => {
    const data: ExecutiveOverviewDto = {
      ...emptyOverview,
      passenger: {
        state: "operational",
        revenueNet: 9_000_000,
        revenueVariationPct: -8.2,
        tickets: 620,
        ticketVariationPct: null,
        occupancyPct: 62,
        series: [],
      },
      finance: {
        state: "operational",
        blockers: ["Aucun plan comptable actif"],
        postedBatches: 0,
      },
    }

    expect(deriveExecutiveArbitrations(data).map(({ id }) => id)).toEqual([
      "passenger-reference",
      "passenger-revenue",
      "finance-blockers",
    ])
    renderOverview(data)
    expect(
      screen.getByText("Recul du chiffre d’affaires voyageurs")
    ).toBeInTheDocument()
    expect(
      screen.getByText("1 prérequis Finance non établi")
    ).toBeInTheDocument()
    expect(screen.getByText("À arbitrer (3)")).toBeInTheDocument()
  })

  it("ajoute les signaux COTRAF et dessertes après les signaux historiques", () => {
    const data: ExecutiveOverviewDto = {
      ...emptyOverview,
      passenger: { state: "unavailable", series: [] },
      cotraf: {
        state: "operational",
        circulations: 3,
        delayed: 1,
        maxDelayMinutes: 20,
        conflicts: 0,
      },
      service: {
        state: "operational",
        trips: [
          {
            id: "t1",
            trainNumber: "TR-201",
            trainType: "EXPRESS",
            status: "retarde",
            delayMinutes: 35,
            departureAt: 0,
            arrivalAt: 0,
            originStationId: "a",
            destinationStationId: "b",
          },
        ],
      },
    }

    expect(deriveExecutiveArbitrations(data).map(({ id }) => id)).toEqual([
      "cotraf-delays",
      "trips-delays",
    ])
    renderOverview(data)
    expect(
      screen.getByText(
        /Aujourd’hui : 1 desserte voyageurs, 1 retardée \(\+35 min\), 0 annulée/
      )
    ).toBeInTheDocument()
  })

  it("ajoute le signal des incidents critiques et la saturation des dessertes en fin de liste", () => {
    const data: ExecutiveOverviewDto = {
      ...emptyOverview,
      passenger: { state: "unavailable", series: [] },
      safety: {
        state: "operational",
        summary: {
          generatedAt: 0,
          period: { from: "2026-08-12", to: "2026-09-10" },
          scope: "reseau",
          dataState: "operational",
          truncated: false,
          incidents: {
            total: 2,
            open: 2,
            criticalOpen: 2,
            bySeverity: { information: 0, important: 0, critique: 2 },
            byCategory: {
              securite: 2,
              technique: 0,
              comportement: 0,
              medical: 0,
              autre: 0,
            },
            byStatus: { ouvert: 2, en_cours: 0, resolu: 0 },
          },
          penalties: {
            total: 0,
            amountXaf: 0,
            byStatus: {
              emis: { count: 0, amountXaf: 0 },
              paye: { count: 0, amountXaf: 0 },
              conteste: { count: 0, amountXaf: 0 },
              annule: { count: 0, amountXaf: 0 },
            },
            byReason: {
              sans_titre: 0,
              titre_invalide: 0,
              classe_superieure: 0,
              autre: 0,
            },
          },
        },
      },
      occupancy: {
        state: "operational",
        trips: [
          {
            tripId: "trip-1",
            serviceDate: "2026-09-09",
            trainNumber: "TR-201",
            trainType: "EXPRESS",
            serviceClass: "DEUXIEME",
            loadFactorPct: 62,
            peakPct: 100,
            constrainedByPeak: true,
            ticketCount: 180,
            revenueTtc: 4_200_000,
          },
        ],
      },
    }

    expect(deriveExecutiveArbitrations(data).map(({ id }) => id)).toEqual([
      "safety-critical-incidents",
      "occupancy-peak",
    ])
    renderOverview(data)
    expect(
      screen.getByText("2 incidents critiques non résolus à bord")
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Sécurité à bord, 30 derniers jours/)
    ).toBeInTheDocument()
  })

  it("fournit une table comme alternative textuelle à la série", () => {
    renderOverview({
      ...emptyOverview,
      passenger: {
        state: "operational",
        revenueNet: 2_500_000,
        revenueVariationPct: 2.5,
        tickets: 120,
        ticketVariationPct: 1,
        occupancyPct: 68,
        series: [
          { date: "2026-09-09", netTtc: 1_000_000, tickets: 50 },
          { date: "2026-09-10", netTtc: 1_500_000, tickets: 70 },
        ],
      },
    })

    expect(
      screen.getByText(
        /Voir le tableau : chiffre d’affaires net et billets par jour/
      )
    ).toBeInTheDocument()
    expect(
      screen.getByRole("table", {
        name: "Chiffre d’affaires net et billets par jour",
      })
    ).toBeInTheDocument()
    expect(screen.getByText("10 sept. 2026")).toBeInTheDocument()
    expect(screen.getByText("70")).toBeInTheDocument()
  })

  it("trace la ligne depuis le référentiel même sans COTRAF accessible", () => {
    renderOverview({
      ...emptyOverview,
      network: {
        state: "operational",
        stations: [
          {
            id: "s1",
            code: "OWE",
            name: "Owendo",
            province: "Estuaire",
            kilometerPoint: 0,
            isActive: true,
          },
          {
            id: "s2",
            code: "BOO",
            name: "Booué",
            province: "Ogooué-Ivindo",
            kilometerPoint: 338,
            isActive: true,
          },
          {
            id: "s3",
            code: "FCV",
            name: "Franceville",
            province: "Haut-Ogooué",
            kilometerPoint: 669,
            isActive: true,
          },
        ],
      },
    })

    expect(
      screen.getByRole("figure", { name: "La ligne — Owendo → Franceville" })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Circulations non accessibles à ce compte/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/3 gares du référentiel · 669 km/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole("table", {
        name: "Gares du référentiel et points kilométriques",
      })
    ).toBeInTheDocument()
  })
})
