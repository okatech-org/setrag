import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  usePathname: () => "/direction/finances",
}))

import {
  emptyExecutiveOverview,
  type ExecutiveOverviewDto,
  type FinanceOverview,
} from "../executive-dto"
import { FinancesVolet } from "./finances"

function baseOverview(): ExecutiveOverviewDto {
  return emptyExecutiveOverview({
    preset: "30j",
    serviceDate: "2026-09-10",
    from: "2026-08-12",
    to: "2026-09-10",
  })
}

function renderFinances(data: ExecutiveOverviewDto) {
  return render(
    <FinancesVolet
      data={data}
      preset={data.period.preset}
      onPresetChange={vi.fn()}
    />
  )
}

describe("Volet Finances de la Direction générale", () => {
  it("n’affiche aucun montant quand le journal comptable est inaccessible", () => {
    const data: ExecutiveOverviewDto = {
      ...baseOverview(),
      finance: { state: "unavailable", blockers: [] },
    }

    renderFinances(data)

    expect(screen.getByText("Non accessible à ce compte")).toBeInTheDocument()
    expect(screen.queryByText(/FCFA/)).not.toBeInTheDocument()
  })

  it("signale un journal comptable synthétique et ses prérequis non établis", () => {
    const overview: FinanceOverview = {
      generatedAt: Date.parse("2026-09-10T07:30:00Z"),
      dataState: "synthetic_demo",
      dataset: {
        label: "Scénario financier ferroviaire SETRAG — démonstration",
        notice:
          "Données entièrement synthétiques : elles ne constituent ni des comptes publiés, ni une déclaration fiscale, ni une situation comptable de la SETRAG.",
        referencePeriod: "2026-08",
      },
      configuration: {
        activeRuleSet: {
          _id: "ruleset-1",
          code: "OHADA-2026",
          version: 1,
          validFrom: "2026-01-01",
          legalSourceLabel: "Acte uniforme OHADA — droit comptable",
          legalSourceUrl: "https://example.org/ohada",
          rules: [
            {
              code: "TVA",
              label: "TVA transport de voyageurs",
              rateBasisPoints: 1800,
              basis: "Prix hors taxes",
            },
          ],
        },
        activeAccounts: 42,
        totalAccounts: 60,
      },
      journal: {
        postedBatches: 3,
        totalDebit: 12_000_000,
        totalCredit: 12_000_000,
        latest: [
          {
            _id: "batch-1",
            reference: "LOT-2026-003",
            entryDate: "2026-09-09",
            label: "Clôture journée du 9 septembre",
            totalDebit: 4_000_000,
            totalCredit: 4_000_000,
            status: "comptabilise",
          },
        ],
      },
      readiness: {
        canPrepareTaxReturns: false,
        blockers: [
          "Les mappings SAGE X3 et e-tax ne disposent pas encore d’une homologation probante",
        ],
      },
    } as FinanceOverview

    const data: ExecutiveOverviewDto = {
      ...baseOverview(),
      finance: {
        state: "synthetic_demo",
        blockers: [
          "Les mappings SAGE X3 et e-tax ne disposent pas encore d’une homologation probante",
        ],
        postedBatches: 3,
        generatedAt: Date.parse("2026-09-10T07:30:00Z"),
        overview,
      },
    }

    renderFinances(data)

    expect(
      screen.getAllByText("Synthétique · non officiel").length
    ).toBeGreaterThan(0)
    expect(
      screen.getByText(/Les mappings SAGE X3 et e-tax ne disposent pas encore/)
    ).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
  })
})
