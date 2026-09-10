import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  FreightDashboardScreen,
  type FreightDashboard,
} from "./freight-dashboard"

describe("tableau de bord Fret", () => {
  it("rend l’état vide réel sans indicateur de démonstration", () => {
    const dashboard = {
      moduleCode: "fret",
      dataState: "empty",
      accessibleSiteIds: [],
      kpis: [],
      operations: [],
      alerts: [],
    } satisfies FreightDashboard

    render(<FreightDashboardScreen dashboard={dashboard} />)

    expect(
      screen.getByText("Aucune donnée Fret disponible")
    ).toBeInTheDocument()
    expect(
      screen.getByText("Aucun chiffre de démonstration n’est affiché.")
    ).toBeInTheDocument()
    expect(screen.queryByText(/18 450|7 Mt|TM-804/)).not.toBeInTheDocument()
  })
})
