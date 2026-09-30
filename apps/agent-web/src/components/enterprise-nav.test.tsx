import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const navigationState = vi.hoisted(() => ({ pathname: "/gestion" }))

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}))

import { EnterpriseHeader, spaceLabelForPathname } from "./enterprise-nav"

describe("en-tête unique du portail", () => {
  beforeEach(() => {
    navigationState.pathname = "/gestion"
  })

  it("porte la marque une seule fois, sans barre institutionnelle ni sélecteur", () => {
    render(
      <EnterpriseHeader
        scope="Direction générale · réseau entier"
        user={{
          firstName: "Démo",
          lastName: "Direction",
          matricule: "DEMO-G-001",
          role: "direction_generale",
        }}
        onSignOut={vi.fn()}
      />
    )

    expect(screen.getAllByRole("img", { name: "SETRAG" })).toHaveLength(1)
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument()
    expect(screen.queryByText(/Heure de Libreville/)).not.toBeInTheDocument()
    expect(screen.getByLabelText("Espace actif")).toHaveTextContent("Gestion")
    expect(
      screen.getByText("Direction générale · réseau entier")
    ).toBeInTheDocument()
    expect(screen.getByText("D. Direction · DEMO-G-001")).toBeInTheDocument()
    expect(screen.getByText("Portail interne")).toBeInTheDocument()
    expect(screen.getByText("Libreville")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Se déconnecter" })).toBeEnabled()
  })

  it("replie le rôle sur l’identité quand aucun périmètre n’est fourni", () => {
    render(
      <EnterpriseHeader
        user={{ firstName: "Ange", lastName: "Mboumba", role: "admin_it" }}
      />
    )

    expect(
      screen.getByText(
        "Administrateur système — Direction des Systèmes d’Information & Projets Métiers"
      )
    ).toBeInTheDocument()
    expect(screen.getByText("A. Mboumba")).toBeInTheDocument()
    expect(screen.queryByText(/Admin système/)).not.toBeInTheDocument()
  })

  it("réserve le raccourci Guichet Direct aux vendeurs", () => {
    const { rerender } = render(
      <EnterpriseHeader user={{ role: "vendeur_guichet" }} />
    )

    expect(
      screen.getByRole("link", { name: "Guichet Direct" })
    ).toHaveAttribute("href", "/vente")

    rerender(<EnterpriseHeader user={{ role: "direction_generale" }} />)

    expect(
      screen.queryByRole("link", { name: "Guichet Direct" })
    ).not.toBeInTheDocument()
  })

  it("signale le portail partenaire sans afficher de niveau d’accès", () => {
    render(<EnterpriseHeader user={{ role: "representant_comilog" }} />)

    expect(screen.getByText("Portail partenaire")).toBeInTheDocument()
    expect(screen.queryByText(/Lecture/)).not.toBeInTheDocument()
  })

  it("relie le bouton de menu au tiroir et le bascule", () => {
    const onToggle = vi.fn()
    const { rerender } = render(
      <EnterpriseHeader
        menu={{ open: false, controls: "seller-navigation-sidebar", onToggle }}
      />
    )

    const button = screen.getByRole("button", { name: "Ouvrir le menu" })
    expect(button).toHaveAttribute("aria-controls", "seller-navigation-sidebar")
    expect(button).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledOnce()

    rerender(
      <EnterpriseHeader
        menu={{ open: true, controls: "seller-navigation-sidebar", onToggle }}
      />
    )
    expect(
      screen.getByRole("button", { name: "Fermer le menu" })
    ).toHaveAttribute("aria-expanded", "true")
  })

  it("dérive l’espace actif de l’URL", () => {
    expect(spaceLabelForPathname("/gestion")).toBe("Gestion")
    expect(spaceLabelForPathname("/gestion/tarifs")).toBe("Gestion")
    expect(spaceLabelForPathname("/vente/caisse")).toBe("Vente")
    expect(spaceLabelForPathname("/fret")).toBe("Fret")
    expect(spaceLabelForPathname("/rh/paie")).toBe("Ressources humaines")
    expect(spaceLabelForPathname("/etudes")).toBe("Audit & documents")
    expect(spaceLabelForPathname("/administration")).toBe("Administration")
    expect(spaceLabelForPathname("/direction")).toBe("Direction générale")
    expect(spaceLabelForPathname("/direction/finances")).toBe(
      "Direction générale"
    )
  })
})
