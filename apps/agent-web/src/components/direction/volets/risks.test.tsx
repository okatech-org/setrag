import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  usePathname: () => "/direction/risques",
}))

import {
  emptyExecutiveOverview,
  type ExecutiveOverviewDto,
} from "../executive-dto"
import { RisksVolet } from "./risks"

function baseOverview(): ExecutiveOverviewDto {
  return {
    ...emptyExecutiveOverview({
      preset: "30j",
      serviceDate: "2026-09-10",
      from: "2026-08-12",
      to: "2026-09-10",
    }),
    health: { state: "operational", severity: "info", findings: [] },
  }
}

function renderRisks(data: ExecutiveOverviewDto) {
  return render(
    <RisksVolet
      data={data}
      preset={data.period.preset}
      onPresetChange={vi.fn()}
    />
  )
}

describe("Volet Risques et continuité de la Direction générale", () => {
  it("indique que la continuité PCA/PRA n’est pas accessible à ce compte", () => {
    const data: ExecutiveOverviewDto = {
      ...baseOverview(),
      continuity: { state: "unavailable" },
    }

    renderRisks(data)

    expect(screen.getByText("Non accessible à ce compte")).toBeInTheDocument()
  })

  it("signale une sévérité critique et le constat de supervision associé", () => {
    const data: ExecutiveOverviewDto = {
      ...baseOverview(),
      health: {
        state: "operational",
        severity: "critique",
        checkedAt: Date.parse("2026-09-10T06:00:00Z"),
        findings: [
          {
            code: "occ-conflict",
            label: "Conflits OCC détectés sur le journal des places",
            severity: "avertissement",
            count: 2,
          },
        ],
      },
    }

    renderRisks(data)

    expect(screen.getByText("Critique")).toBeInTheDocument()
    expect(
      screen.getByText("Conflits OCC détectés sur le journal des places")
    ).toBeInTheDocument()
  })

  it("liste les habilitations de modules avec leur niveau d’accès", () => {
    const data: ExecutiveOverviewDto = {
      ...baseOverview(),
      modules: [
        {
          code: "voyageurs",
          label: "Voyageurs",
          route: "/gestion",
          accessLevel: "utilisation",
        },
        {
          code: "securite",
          label: "Sécurité",
          route: "/securite",
          accessLevel: "lecture",
        },
        {
          code: "rh",
          label: "Ressources humaines",
          route: "/rh",
          accessLevel: null,
        },
      ],
    }

    renderRisks(data)

    expect(screen.getByText("Voyageurs · Utilisation")).toBeInTheDocument()
    expect(screen.getByText("Sécurité · Lecture")).toBeInTheDocument()
    expect(screen.getByText("Ressources humaines · Aucun")).toBeInTheDocument()
  })
})
