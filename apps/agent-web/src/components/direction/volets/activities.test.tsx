import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  usePathname: () => "/direction/activites",
}))

import {
  emptyExecutiveOverview,
  type CotrafDashboard,
  type ExecutiveOverviewDto,
} from "../executive-dto"
import { ActivitiesVolet } from "./activities"

const baseOverview: ExecutiveOverviewDto = emptyExecutiveOverview({
  preset: "30j",
  serviceDate: "2026-09-10",
  from: "2026-08-12",
  to: "2026-09-10",
})

function renderActivities(data: ExecutiveOverviewDto) {
  return render(
    <ActivitiesVolet data={data} preset="30j" onPresetChange={vi.fn()} />
  )
}

describe("Volet Activité et exploitation", () => {
  it("affiche un squelette honnête quand les sources sont vides ou inaccessibles", () => {
    renderActivities(baseOverview)

    expect(
      screen.getByRole("heading", { name: "DEF · Exploitation ferroviaire" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "DCFV · Commercial fret & voyageurs",
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("figure", { name: "La ligne — Owendo → Franceville" })
    ).toBeInTheDocument()
    expect(screen.getAllByText(/Non accessible/).length).toBeGreaterThan(0)
    expect(
      screen.getAllByText("Aucune donnée consolidée").length
    ).toBeGreaterThan(0)
  })

  it("affiche les circulations et indicateurs d’un scénario COTRAF synthétique", () => {
    const dashboard = {
      moduleCode: "cotraf",
      dataState: "synthetic_demo",
      accessibleSiteIds: [],
      generatedAt: 0,
      dataset: null,
      kpis: [
        {
          code: "ponctualite",
          label: "Ponctualité",
          value: 87,
          unit: "%",
          tone: "positive",
          description: "Part des circulations à l’heure.",
        },
      ],
      stations: [],
      movements: [
        {
          id: "m1",
          movementCode: "MV-1",
          trainNumber: "T-501",
          serviceType: "voyageurs",
          direction: "croissant",
          status: "en_ligne",
          originLabel: "Owendo",
          destinationLabel: "Franceville",
          currentPk: 290,
          delayMinutes: 15,
          priority: 1,
          lastEventAt: 0,
          trajectory: [],
        },
      ],
      segments: [],
      events: [],
      conflicts: [],
    } as CotrafDashboard

    renderActivities({
      ...baseOverview,
      cotraf: { state: "synthetic_demo", generatedAt: 0, dashboard },
    })

    expect(screen.getByText("87")).toBeInTheDocument()
    expect(screen.getAllByText("T-501").length).toBeGreaterThan(0)
    expect(screen.getAllByText("+15 min").length).toBeGreaterThan(0)
    expect(
      screen.getAllByText("Synthétique · non officiel").length
    ).toBeGreaterThan(0)
  })
})
