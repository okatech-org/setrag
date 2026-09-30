import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  usePathname: () => "/direction/risques",
}))

import {
  emptyExecutiveOverview,
  type ExecutiveOverviewDto,
  type SafetySummary,
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

function safetySummary(
  overrides: Partial<{ criticalOpen: number; truncated: boolean }> = {}
): SafetySummary {
  return {
    generatedAt: Date.parse("2026-09-10T06:00:00Z"),
    period: { from: "2026-08-12", to: "2026-09-10" },
    scope: "reseau",
    dataState: "operational",
    truncated: overrides.truncated ?? false,
    incidents: {
      total: 5,
      open: 3,
      criticalOpen: overrides.criticalOpen ?? 1,
      bySeverity: { information: 2, important: 2, critique: 1 },
      byCategory: {
        securite: 2,
        technique: 1,
        comportement: 1,
        medical: 1,
        autre: 0,
      },
      byStatus: { ouvert: 2, en_cours: 1, resolu: 2 },
    },
    penalties: {
      total: 4,
      amountXaf: 27_000,
      byStatus: {
        emis: { count: 1, amountXaf: 7_000 },
        paye: { count: 2, amountXaf: 15_000 },
        conteste: { count: 1, amountXaf: 5_000 },
        annule: { count: 0, amountXaf: 0 },
      },
      byReason: {
        sans_titre: 3,
        titre_invalide: 1,
        classe_superieure: 0,
        autre: 0,
      },
    },
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

    const continuity = screen.getByRole("region", {
      name: "Continuité PCA/PRA",
    })
    expect(
      within(continuity).getByText("Non accessible à ce compte")
    ).toBeInTheDocument()
  })

  it("présente la synthèse agrégée des incidents et procès-verbaux", () => {
    const data: ExecutiveOverviewDto = {
      ...baseOverview(),
      safety: { state: "operational", summary: safetySummary() },
    }

    renderRisks(data)

    const section = screen.getByRole("region", {
      name: "Incidents et procès-verbaux",
    })
    expect(
      within(section).getByText("Synthèse agrégée et anonyme", { exact: false })
    ).toBeInTheDocument()
    expect(
      within(section).getByText("Critiques non résolus")
    ).toBeInTheDocument()
    expect(within(section).getByText("27 000")).toBeInTheDocument()
    expect(
      within(section).getByRole("table", { name: "Incidents par catégorie" })
    ).toBeInTheDocument()
    expect(
      within(section).getByRole("table", { name: "Procès-verbaux par statut" })
    ).toBeInTheDocument()
    expect(
      within(section).queryByText(/Non accessible/)
    ).not.toBeInTheDocument()
  })

  it("explique qu’une affectation limitée à un site n’ouvre pas la vue réseau", () => {
    const data: ExecutiveOverviewDto = {
      ...baseOverview(),
      safety: {
        state: "unavailable",
        summary: {
          ...safetySummary(),
          scope: "restreint",
          dataState: "restricted",
        },
      },
    }

    renderRisks(data)

    expect(
      screen.getByText(/Votre affectation est limitée à un site/)
    ).toBeInTheDocument()
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
