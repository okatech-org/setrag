import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ListeNotes, detailNote } from "./ruban"

type Notes = Parameters<typeof ListeNotes>[0]["notes"]

const LE_12_SEPTEMBRE = Date.UTC(2026, 8, 12, 10)

function note(partiel: Omit<Partial<Notes[number]>, "_id"> & { _id: string; content: string }): Notes[number] {
  return {
    category: "preference",
    source: "session",
    createdAt: LE_12_SEPTEMBRE,
    updatedAt: LE_12_SEPTEMBRE,
    ...partiel,
    _id: partiel._id as Notes[number]["_id"],
  }
}

describe("ce que Ruban retient", () => {
  it("montre chaque note en entier, avec sa nature, sa date et son canal", () => {
    render(
      <ListeNotes
        notes={[
          note({ _id: "a", content: "Préfère voyager en 1re classe." }),
          note({ _id: "b", content: "Voyage souvent avec sa fille Maëlle.", category: "compagnon", source: "messaging" }),
        ]}
        onOublier={() => {}}
        onToutOublier={() => {}}
      />
    )
    expect(screen.getByText("2 notes")).toBeInTheDocument()
    expect(screen.getByText("Préfère voyager en 1re classe.")).toBeInTheDocument()
    expect(screen.getByText(/Compagnon de voyage · notée le .* · dans une messagerie/)).toBeInTheDocument()
  })

  it("oublie une note par son propre bouton, ou toutes", () => {
    const onOublier = vi.fn()
    const onToutOublier = vi.fn()
    render(
      <ListeNotes notes={[note({ _id: "a", content: "Préfère voyager en 1re classe." })]} onOublier={onOublier} onToutOublier={onToutOublier} />
    )
    fireEvent.click(screen.getByRole("button", { name: "Oublier : Préfère voyager en 1re classe." }))
    expect(onOublier).toHaveBeenCalledWith(expect.objectContaining({ _id: "a" }))
    fireEvent.click(screen.getByRole("button", { name: "Tout oublier" }))
    expect(onToutOublier).toHaveBeenCalled()
  })

  it("explique comment faire noter quelque chose quand il n'y a rien", () => {
    render(<ListeNotes notes={[]} onOublier={() => {}} onToutOublier={() => {}} />)
    expect(screen.getByText("Ruban n'a encore rien noté")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Tout oublier" })).not.toBeInTheDocument()
  })

  it("dit d'où vient une note", () => {
    expect(detailNote({ category: "trajet", updatedAt: LE_12_SEPTEMBRE, source: "session" })).toMatch(/^Trajet habituel · notée le /)
  })
})
