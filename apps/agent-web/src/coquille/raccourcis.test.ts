import { House, Package, Ticket } from "lucide-react"
import { describe, expect, it } from "vitest"

import type { EntreeMenu } from "./navigation"
import { attribuerTouches } from "./raccourcis"

const ENTREES: EntreeMenu[] = [
  { href: "/vente", libelle: "Accueil", icone: House },
  { href: "/vente/billet", libelle: "Vendre un billet", icone: Ticket, touche: "B" },
  { href: "/vente/colis", libelle: "Colis express", icone: Package, touche: "C" },
]

describe("attribution des touches", () => {
  it("donne sa touche par défaut à chaque rubrique, l'accueil n'en a pas", () => {
    expect(Object.fromEntries(attribuerTouches(ENTREES, {}))).toEqual({ "/vente/billet": "b", "/vente/colis": "c" })
  })

  it("applique les choix de l'agent et retire une touche vidée", () => {
    const touches = attribuerTouches(ENTREES, { "/vente/billet": "v", "/vente/colis": null })
    expect(Object.fromEntries(touches)).toEqual({ "/vente/billet": "v" })
  })

  it("efface la touche par défaut reprise par un choix de l'agent", () => {
    const touches = attribuerTouches(ENTREES, { "/vente": "c" })
    expect(Object.fromEntries(touches)).toEqual({ "/vente": "c", "/vente/billet": "b" })
  })
})
