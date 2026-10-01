import { render, screen, within } from "@testing-library/react"
import { getFunctionName } from "convex/server"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const etat = vi.hoisted(() => ({
  donnees: {} as Record<string, unknown>,
  capacites: [] as string[],
  push: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/materiel",
  useRouter: () => ({ push: etat.push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@workspace/api/hooks", () => ({
  useQuery: (ref: never, args: unknown) => {
    if (args === "skip") return undefined
    const nom = getFunctionName(ref)
    if (nom.endsWith(":droits")) return { capacites: etat.capacites, peutEcrire: etat.capacites.length > 0, role: "chef_atelier", utilisateurId: "u1" }
    return etat.donnees[nom]
  },
  useMutation: () => vi.fn().mockResolvedValue({}),
}))
vi.mock("@/components/enterprise-layout", () => ({
  EnterpriseShell: ({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <div data-testid="actions">{actions}</div>
      {children}
    </main>
  ),
}))

import { lienPriorite, TableauDeBordGmao } from "./tableau-de-bord"

const ACCUEIL = "modules/gmao/queries:accueil"

const accueil = {
  genereLe: Date.parse("2026-10-01T08:00:00+01:00"),
  vide: false,
  parc: [
    { famille: "locomotive", total: 12, enService: 9, immobilises: 2, enAtelier: 1, reformes: 0, utiles: 12, disponibilite: 0.75 },
    { famille: "voiture", total: 20, enService: 19, immobilises: 0, enAtelier: 1, reformes: 0, utiles: 20, disponibilite: 0.95 },
    { famille: "wagon", total: 0, enService: 0, immobilises: 0, enAtelier: 0, reformes: 0, utiles: 0, disponibilite: 0 },
  ],
  disponibiliteGlobale: 0.875,
  enginsUtiles: 32,
  enginsEnService: 28,
  ot: {
    ouverts: 7,
    parStatut: [
      { statut: "demande", nombre: 3 },
      { statut: "planifie", nombre: 2 },
      { statut: "en_cours", nombre: 1 },
      { statut: "travaux_termines", nombre: 1 },
    ],
    enRetard: 2,
    urgents: 1,
    clotures30: 4,
    cout30Fcfa: 1_250_000,
  },
  fiabilite: { defaillances: 5, mtbfJours: 412.5, mttrHeures: 18.4, fenetreJours: 180 },
  preventif: { echues: 3, echuesSansOt: 1, proches: 4, suivies: 40 },
  stock: { articles: 120, sousSeuil: 6, ruptures: 2, valeurFcfa: 48_000_000, achatsAValider: 3 },
  visitesJour: { total: 5, signees: 4, inaptes: 1 },
  priorites: [
    { type: "visite", id: "v1", titre: "VT-2026-0012 — convoi 402 inapte", detail: "1 défaut(s), départ bloqué", niveau: "critique", echeance: null },
    { type: "ot", id: "ot1", titre: "OT-2026-0042 — Fuite conduite générale", detail: "CC 2201 · GT26 · Demandé · en retard", niveau: "eleve", echeance: null },
  ],
}

beforeEach(() => {
  etat.donnees = {}
  etat.capacites = []
})

describe("tableau de bord GMAO", () => {
  it("rend les indicateurs et les priorités fournis par le serveur", () => {
    etat.donnees[ACCUEIL] = accueil
    render(<TableauDeBordGmao />)

    expect(screen.getByText("Disponibilité du parc")).toBeInTheDocument()
    expect(screen.getByText("88 %")).toBeInTheDocument()
    expect(screen.getByText("28 en service sur 32 engins utiles")).toBeInTheDocument()
    expect(screen.getByText("Aucun engin enregistré")).toBeInTheDocument()
    expect(screen.getByText("2 en retard · 1 urgent(s)")).toBeInTheDocument()

    // Chaque priorité mène à son dossier, son niveau est écrit.
    const visite = screen.getByRole("link", { name: /VT-2026-0012/ })
    expect(visite).toHaveAttribute("href", "/materiel/visites/v1")
    expect(within(visite).getByText("Niveau critique")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /OT-2026-0042/ })).toHaveAttribute("href", "/materiel/ordres/ot1")

    // La répartition des OT est doublée d'une table.
    expect(screen.getByRole("table")).toHaveTextContent("Total7")
  })

  it("explique un parc vide au lieu d'afficher des zéros", () => {
    etat.donnees[ACCUEIL] = { ...accueil, vide: true }
    render(<TableauDeBordGmao />)
    expect(screen.getByText("Le parc n'est pas encore chargé")).toBeInTheDocument()
    expect(screen.queryByText("Disponibilité du parc")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ouvrir le parc" })).toHaveAttribute("href", "/materiel/parc")
  })

  it("masque « Demander un OT » sans la capacité ot_demander", () => {
    etat.donnees[ACCUEIL] = accueil
    const { unmount } = render(<TableauDeBordGmao />)
    expect(screen.queryByRole("button", { name: "Demander un OT" })).not.toBeInTheDocument()
    unmount()

    etat.capacites = ["ot_demander"]
    render(<TableauDeBordGmao />)
    expect(screen.getByRole("button", { name: "Demander un OT" })).toBeInTheDocument()
  })

  it("mène chaque type de priorité à son dossier", () => {
    expect(lienPriorite({ type: "echeance", id: "pe1" })).toBe("/materiel/preventif")
    expect(lienPriorite({ type: "stock", id: "a1" })).toBe("/materiel/stock/a1")
    expect(lienPriorite({ type: "achat", id: "d1" })).toBe("/materiel/achats/d1")
  })
})
