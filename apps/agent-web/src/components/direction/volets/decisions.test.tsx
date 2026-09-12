import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  usePathname: () => "/direction/decisions",
}))

import {
  emptyExecutiveOverview,
  type ExecutiveOverviewDto,
} from "../executive-dto"
import { DecisionsVolet } from "./decisions"

const baseOverview: ExecutiveOverviewDto = emptyExecutiveOverview({
  preset: "30j",
  serviceDate: "2026-09-10",
  from: "2026-08-12",
  to: "2026-09-10",
})

function renderDecisions(data: ExecutiveOverviewDto) {
  return render(
    <DecisionsVolet data={data} preset="30j" onPresetChange={vi.fn()} />
  )
}

describe("Volet Décisions attendues", () => {
  it("liste les manques structurels et le raccordement des directions à partir de sources vides", () => {
    const data: ExecutiveOverviewDto = {
      ...baseOverview,
      modules: [
        {
          code: "rh",
          label: "Ressources humaines",
          route: "/rh",
          accessLevel: "lecture",
        },
      ],
    }
    const { container } = renderDecisions(data)

    expect(container.textContent).toContain(
      "Raccorder la paie et les effectifs — DRH"
    )
    expect(
      screen.getByRole("table", {
        name: "Directions, modules et état de raccordement",
      })
    ).toBeInTheDocument()
    expect(screen.getAllByText("Non raccordée").length).toBeGreaterThan(0)
  })

  it("place un recul de chiffre d’affaires voyageurs parmi les signaux à arbitrer", () => {
    const data: ExecutiveOverviewDto = {
      ...baseOverview,
      passenger: {
        state: "operational",
        revenueNet: 1000,
        revenueVariationPct: -3,
        tickets: 10,
        ticketVariationPct: 1,
        series: [],
      },
    }
    renderDecisions(data)

    expect(
      screen.getByText("Recul du chiffre d’affaires voyageurs")
    ).toBeInTheDocument()
  })
})
