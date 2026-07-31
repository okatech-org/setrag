import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BandeauHorsLigne } from "./bandeau-hors-ligne"

const RECU_LE = Date.UTC(2026, 7, 1, 6, 30)

afterEach(() => {
  vi.useRealTimers()
})

describe("bandeau de données locales", () => {
  it("prévient tout de suite quand l'appareil est hors réseau", () => {
    render(<BandeauHorsLigne recuLe={RECU_LE} enLigne={false} />)

    expect(screen.getByText("Vous êtes hors réseau.")).toBeInTheDocument()
    // La date, en clair : c'est elle qui manque à la lecture des données.
    expect(screen.getByText(/1 août à 07:30/)).toBeInTheDocument()
  })

  it("se tait le temps que le serveur réponde", () => {
    vi.useFakeTimers()
    render(<BandeauHorsLigne recuLe={RECU_LE} enLigne />)

    expect(screen.queryByRole("paragraph")).not.toBeInTheDocument()
    expect(screen.queryByText(/hors réseau/i)).not.toBeInTheDocument()
  })

  it("alerte si le serveur reste muet alors que la connexion est déclarée", async () => {
    vi.useFakeTimers()
    render(<BandeauHorsLigne recuLe={RECU_LE} enLigne />)

    await vi.advanceTimersByTimeAsync(3_000)

    expect(
      screen.getByText("Affichage depuis cet appareil, le serveur n’a pas encore répondu.")
    ).toBeInTheDocument()
  })
})
