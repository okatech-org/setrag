import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { RUBRIQUES_GED, rubriqueActive } from "./cadre"
import { verifierFichier } from "./fichiers"
import { TagCourrier, TagDemo, taille } from "./statuts"

describe("GED — utilitaires d'écran", () => {
  it("rend active la seule rubrique qui couvre le chemin", () => {
    const actives = (chemin: string) =>
      RUBRIQUES_GED.filter((rubrique) => rubriqueActive(rubrique, chemin)).map((rubrique) => rubrique.libelle)
    expect(actives("/bureautique")).toEqual(["Accueil"])
    expect(actives("/bureautique/documents/abc")).toEqual(["Documents"])
    expect(actives("/bureautique/courrier/xyz")).toEqual(["Courrier"])
  })

  it("refuse les fichiers vides, trop lourds ou d'un type non admis", () => {
    expect(verifierFichier(new File(["%PDF"], "a.pdf", { type: "application/pdf" }))).toBeNull()
    expect(verifierFichier(new File([""], "vide.pdf", { type: "application/pdf" }))).toMatch("vide")
    expect(verifierFichier(new File(["x"], "a.exe", { type: "application/x-msdownload" }))).toMatch("refusé")
    const lourd = new File(["x"], "lourd.pdf", { type: "application/pdf" })
    Object.defineProperty(lourd, "size", { value: 26 * 1024 * 1024 })
    expect(verifierFichier(lourd)).toMatch("25 Mo")
  })

  it("dit un retard en toutes lettres, jamais par la seule couleur", () => {
    render(<TagCourrier statut="enregistre" enRetard />)
    expect(screen.getByText("En retard")).toBeInTheDocument()
  })

  it("signale les lignes de démonstration et elles seules", () => {
    const { container, rerender } = render(<TagDemo origine="reel" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<TagDemo origine="demo" />)
    expect(screen.getByText("Démo")).toBeInTheDocument()
  })

  it("formate les tailles de fichier", () => {
    expect(taille(512)).toBe("512 o")
    expect(taille(42 * 1024)).toBe("42 Ko")
    expect(taille(1.3 * 1024 * 1024)).toBe("1,3 Mo")
  })
})
