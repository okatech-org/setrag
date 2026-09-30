import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeAll, describe, expect, it, vi } from "vitest"

import type { Entree } from "./types"

/**
 * Le fil pendant le flux : le texte affiché est celui que le serveur a reçu,
 * sans effet de frappe, et la réponse garde la même entrée du début à la fin
 * (en cours, terminée, interrompue) — rien ne se démonte quand elle grandit.
 */

const etat = vi.hoisted(() => ({
  entrees: [] as Entree[],
  reflechit: false,
  renvoyer: vi.fn(),
}))

vi.mock("./contexte-ruban", () => ({ useRuban: () => etat }))
// Les cartes lisent Convex : ici, seule leur présence compte.
vi.mock("./cartes", () => ({
  CarteDuFil: ({ carte }: { carte: { type: string } }) => <p>carte : {carte.type}</p>,
  CarteApprobation: ({ approbation }: { approbation: { label: string } }) => <p>confirmation : {approbation.label}</p>,
}))

const { Fil } = await import("./fil")

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  Element.prototype.scrollTo ??= function scrollTo() {}
})

const QUESTION: Entree = { id: "q1", role: "moi", texte: "Un train demain ?", envoi: "ok" }

function reponse(partiel: Partial<Extract<Entree, { role: "ruban" }>>): Entree {
  return { id: "ruban-q1", role: "ruban", texte: "", cartes: [], approbations: [], question: "q1", direct: true, ...partiel }
}

function afficher(entrees: Entree[]) {
  etat.entrees = entrees
}

describe("réponse de Ruban au fil du flux", () => {
  it("montre le texte reçu tel quel et garde la même entrée jusqu'aux cartes", () => {
    afficher([QUESTION, reponse({ etat: "en-cours", texte: "L'Express 201" })])
    const { rerender } = render(<Fil />)
    // Aucun effet de frappe : tout le texte reçu est là tout de suite.
    const region = screen.getByText("L'Express 201").closest("[aria-live]")!
    expect(region).toHaveAttribute("aria-busy", "true")
    expect(screen.queryByText(/carte :/)).not.toBeInTheDocument()

    afficher([QUESTION, reponse({ etat: "en-cours", texte: "L'Express 201 part à 08:00." })])
    rerender(<Fil />)
    expect(screen.getByText("L'Express 201 part à 08:00.").closest("[aria-live]")).toBe(region)

    afficher([QUESTION, reponse({ texte: "L'Express 201 part à 08:00.", cartes: [{ type: "show_trip_results", payload: {} }] })])
    rerender(<Fil />)
    // Même nœud : la réponse terminée n'a pas été remontée.
    expect(screen.getByText("L'Express 201 part à 08:00.").closest("[aria-live]")).toBe(region)
    expect(region).toHaveAttribute("aria-busy", "false")
    expect(screen.getByText("carte : show_trip_results")).toBeInTheDocument()
  })

  it("dit que Ruban cherche quand la réponse tarde, jamais avant 400 ms", () => {
    vi.useFakeTimers()
    try {
      afficher([QUESTION, reponse({ etat: "en-cours" })])
      render(<Fil />)
      expect(screen.queryByText("Ruban cherche…")).not.toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(450)
      })
      expect(screen.getByRole("status")).toHaveTextContent("Ruban cherche…")
    } finally {
      vi.useRealTimers()
    }
  })

  it("garde le texte d'une réponse interrompue et propose de la relancer", () => {
    afficher([QUESTION, reponse({ etat: "erreur", texte: "L'Express 201 part", erreur: "La réponse de Ruban a été interrompue. Relancez votre question." })])
    render(<Fil />)
    expect(screen.getByText("L'Express 201 part")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("La réponse de Ruban a été interrompue.")
    fireEvent.click(screen.getByRole("button", { name: "Relancer la question" }))
    expect(etat.renvoyer).toHaveBeenCalledWith("q1")
  })
})
