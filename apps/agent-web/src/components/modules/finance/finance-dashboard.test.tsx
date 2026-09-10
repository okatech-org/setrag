import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  FinanceDashboardScreen,
  formatBasisPoints,
  type FinanceOverviewDto,
} from "./finance-dashboard"

const GENERATED_AT = new Date("2026-09-10T10:00:00.000Z").getTime()

describe("tableau de bord financier", () => {
  it("rend un état vide honnête et bloque les productions réglementaires", () => {
    const overview = {
      generatedAt: GENERATED_AT,
      configuration: {
        activeRuleSet: null,
        activeAccounts: 0,
        totalAccounts: 0,
      },
      journal: {
        postedBatches: 0,
        totalDebit: 0,
        totalCredit: 0,
        latest: [],
      },
      readiness: {
        canPrepareTaxReturns: false,
        blockers: [
          "Aucun jeu de règles actif",
          "Aucune écriture comptable validée",
        ],
      },
    } satisfies FinanceOverviewDto

    render(<FinanceDashboardScreen overview={overview} />)

    expect(screen.getByText("Aucun référentiel actif")).toBeInTheDocument()
    expect(
      screen.getByText("Aucune écriture comptable validée")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Préparer la liasse OHADA" })
    ).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: "Préparer la déclaration fiscale",
      })
    ).toBeDisabled()
    expect(screen.getByText(/Aucun jeu de règles actif/)).toBeInTheDocument()
    expect(
      screen.queryByText(/4,82|867,6|99,8|EC-4891/)
    ).not.toBeInTheDocument()
  })

  it("affiche uniquement les comptes, règles et écritures fournis par le serveur", () => {
    const overview = {
      generatedAt: GENERATED_AT,
      configuration: {
        activeRuleSet: {
          _id: "ruleset-1",
          code: "GABON-FISCAL",
          version: 3,
          validFrom: "2026-01-01",
          legalSourceLabel: "Code général des impôts du Gabon",
          legalSourceUrl: "https://example.test/source-legale",
          rules: [
            {
              code: "TVA_STANDARD",
              label: "TVA au taux normal",
              rateBasisPoints: 1800,
              basis: "Chiffre d’affaires taxable",
            },
          ],
        },
        activeAccounts: 142,
        totalAccounts: 150,
      },
      journal: {
        postedBatches: 7,
        totalDebit: 123_450_000,
        totalCredit: 123_450_000,
        latest: [
          {
            _id: "batch-1",
            reference: "OD-2026-0007",
            entryDate: "2026-09-09",
            label: "Centralisation comptable validée",
            totalDebit: 12_500_000,
            totalCredit: 12_500_000,
            status: "comptabilise",
          },
        ],
      },
      readiness: {
        canPrepareTaxReturns: true,
        blockers: [],
      },
    } satisfies FinanceOverviewDto

    render(<FinanceDashboardScreen overview={overview} />)

    expect(screen.getByText("142 / 150")).toBeInTheDocument()
    expect(screen.getByText("GABON-FISCAL · v3")).toBeInTheDocument()
    expect(screen.getByText("TVA au taux normal")).toBeInTheDocument()
    expect(screen.getByText(formatBasisPoints(1800))).toBeInTheDocument()
    expect(screen.getAllByText(/123.450.000.FCFA/)).toHaveLength(2)
    expect(screen.getByText("OD-2026-0007")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Code général des impôts du Gabon" })
    ).toHaveAttribute("href", "https://example.test/source-legale")
    expect(
      screen.getByRole("button", { name: "Préparer la liasse OHADA" })
    ).toBeEnabled()
    expect(screen.getByText("Préparation autorisée.")).toBeInTheDocument()
  })

  it("n’invente aucune donnée lorsque le serveur ne fournit pas de vue", () => {
    render(<FinanceDashboardScreen overview={undefined} />)

    expect(
      screen.getByText("Données financières indisponibles.")
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/TVA au taux normal|OD-2026/)
    ).not.toBeInTheDocument()
  })
})
