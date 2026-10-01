import { fireEvent, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ProgrammeEcran } from "./prn"
import { RapportBailleursEcran } from "./rapport"

const etat = vi.hoisted(() => ({
  reponses: new Map<string, unknown>(),
  mutation: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  csv: vi.fn(),
  parametres: new URLSearchParams(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/infrastructures/prn/rapport",
  useRouter: () => ({ push: etat.push, replace: etat.replace }),
  useSearchParams: () => etat.parametres,
}))

vi.mock("@workspace/api/hooks", async () => {
  const { getFunctionName } = await import("convex/server")
  return {
    useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => (args === "skip" ? undefined : etat.reponses.get(getFunctionName(reference))),
    useMutation: () => etat.mutation,
  }
})

vi.mock("@/components/enterprise-layout", () => ({
  EnterpriseShell: ({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <div data-testid="actions">{actions}</div>
      {children}
    </main>
  ),
}))

vi.mock("@/components/portal-guard", () => ({ usePortalSession: () => null }))

vi.mock("@/components/charte/exporter", async (original) => ({
  ...(await original<typeof import("@/components/charte/exporter")>()),
  telechargerCsv: etat.csv,
}))

const Q = "modules/infrastructure/queries"

function droits(capacites: string[], partenaire = false) {
  etat.reponses.set(`${Q}:droits`, { peutEcrire: capacites.length > 0, capacites, partenaire, role: partenaire ? "bailleur_fonds" : "responsable_prn" })
}

const chantier = {
  id: "chantier-1",
  code: "PRN-03",
  libelle: "Renouvellement de voie Ndjolé – Booué",
  description: "Remplacement complet de l'armement.",
  nature: "renouvellement_voie",
  natureLibelle: "Renouvellement de voie",
  pkDebut: 182,
  pkFin: 260,
  entreprise: "Entreprise ferroviaire du Gabon",
  maitreOeuvre: "Bureau d'études Ogooué",
  budgetFcfa: 12_000_000_000,
  financements: [
    { bailleur: "afd", bailleurLibelle: "AFD", montantFcfa: 8_000_000_000, partPct: 66.7 },
    { bailleur: "etat", bailleurLibelle: "État gabonais", montantFcfa: 4_000_000_000, partPct: 33.3 },
  ],
  uniteQuantite: "km",
  quantitePrevue: 78,
  quantiteRealisee: 32.8,
  avancementPhysiquePct: 42,
  avancementFinancierPct: 37,
  engageFcfa: 5_000_000_000,
  payeFcfa: 4_440_000_000,
  statut: "en_cours",
  statutLibelle: "En cours",
  debutLe: Date.parse("2025-01-15T12:00:00Z"),
  finPrevueLe: Date.parse("2027-06-30T12:00:00Z"),
  finReelleLe: null,
  responsableId: null,
  responsableNom: "Jeanne Mboumba",
  jalonsEnRetard: 1,
  situationsEnAttente: 2,
  majLe: Date.parse("2026-09-30T12:00:00Z"),
}

const jalonDecaissement = {
  id: "jalon-1",
  chantierId: "chantier-1",
  libelle: "Réception du lot 1",
  prevuLe: Date.parse("2026-08-31T12:00:00Z"),
  atteintLe: null,
  statut: "en_retard",
  statutLibelle: "En retard",
  conditionDecaissement: true,
  bailleur: "afd",
  bailleurLibelle: "AFD",
  preuve: null,
}

const rapport = {
  genereLe: Date.parse("2026-10-01T08:00:00Z"),
  bailleur: "afd",
  bailleurLibelle: "AFD",
  perimetre: "Avancement établi sur les seules situations validées par le responsable PRN.",
  chantiers: [
    {
      ...chantier,
      montantBailleurFcfa: 8_000_000_000,
      partBailleurPct: 66.7,
      jalons: [jalonDecaissement],
      jalonsDecaissement: [jalonDecaissement],
    },
  ],
  totaux: {
    chantiers: 1,
    montantBailleurFcfa: 8_000_000_000,
    budgetFcfa: 12_000_000_000,
    engageFcfa: 5_000_000_000,
    payeFcfa: 4_440_000_000,
    avancementPhysiquePct: 42,
    avancementFinancierPct: 37,
    jalonsEnRetard: 1,
    jalonsDecaissementEnAttente: 1,
  },
  parBailleur: [
    { bailleur: "afd", bailleurLibelle: "AFD", montantFcfa: 8_000_000_000, partPct: 66.7 },
    { bailleur: "etat", bailleurLibelle: "État gabonais", montantFcfa: 4_000_000_000, partPct: 33.3 },
  ],
}

beforeEach(() => {
  etat.reponses.clear()
  etat.parametres = new URLSearchParams()
})

describe("programme de remise à niveau", () => {
  it("affiche l'avancement de chaque chantier avec son chiffre", () => {
    droits([])
    etat.reponses.set(`${Q}:chantiers`, [chantier])
    render(<ProgrammeEcran />)

    const tableau = screen.getByRole("table", { name: "Chantiers du programme" })
    const ligne = within(tableau).getByText("PRN-03").closest("tr")!
    expect(within(ligne).getByText("42 %")).toBeInTheDocument()
    expect(within(ligne).getByText("37 %")).toBeInTheDocument()
    expect(within(ligne).getByText("1 en retard")).toBeInTheDocument()
    expect(within(ligne).getByText("En cours")).toBeInTheDocument()
  })

  it("réserve la création d'un chantier à la capacité prn_gerer", () => {
    droits([])
    etat.reponses.set(`${Q}:chantiers`, [chantier])
    const { unmount } = render(<ProgrammeEcran />)
    expect(screen.queryByRole("button", { name: /Créer un chantier/ })).not.toBeInTheDocument()
    unmount()

    droits(["prn_gerer"])
    render(<ProgrammeEcran />)
    expect(screen.getByRole("button", { name: /Créer un chantier/ })).toBeInTheDocument()
  })
})

describe("rapport aux bailleurs", () => {
  it("rend le rapport d'un bailleur, avec ses décaissements conditionnés, pour un partenaire en lecture", () => {
    droits([], true)
    etat.parametres = new URLSearchParams("bailleur=afd")
    etat.reponses.set(`${Q}:rapportBailleur`, rapport)
    render(<RapportBailleursEcran />)

    expect(screen.getByText("Rapport établi pour AFD")).toBeInTheDocument()
    const tableau = screen.getByRole("table", { name: "Chantiers financés" })
    expect(within(tableau).getByText("PRN-03")).toBeInTheDocument()
    expect(within(tableau).getByText("42 %")).toBeInTheDocument()
    const decaissements = screen.getByRole("table", { name: "Jalons de décaissement" })
    expect(within(decaissements).getByText("Réception du lot 1")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Imprimer le rapport/ })).toHaveAttribute("href", "/infrastructures/prn/rapport/impression?bailleur=afd")
  })

  it("exporte le tableau des chantiers financés en CSV", () => {
    droits([], true)
    etat.parametres = new URLSearchParams("bailleur=afd")
    etat.reponses.set(`${Q}:rapportBailleur`, rapport)
    render(<RapportBailleursEcran />)

    fireEvent.click(screen.getAllByRole("button", { name: /Exporter \(1\)/ })[0]!)
    expect(etat.csv).toHaveBeenCalledTimes(1)
    const [nom, colonnes, lignes] = etat.csv.mock.calls[0]!
    expect(nom).toMatch(/^rapport-bailleurs-afd-\d{4}-\d{2}-\d{2}$/)
    expect(colonnes.map((c: { libelle: string }) => c.libelle)).toEqual(expect.arrayContaining(["Code", "Apport AFD", "Avancement physique", "Décaissements conditionnés"]))
    expect(lignes).toHaveLength(1)
  })

  it("change de bailleur par l'adresse, pour que l'impression suive", () => {
    droits([], true)
    etat.reponses.set(`${Q}:rapportBailleur`, { ...rapport, bailleur: null, bailleurLibelle: null })
    render(<RapportBailleursEcran />)
    expect(screen.getByText("Rapport consolidé, tous bailleurs")).toBeInTheDocument()
    fireEvent.change(screen.getByRole("combobox", { name: "Bailleur" }), { target: { value: "meridiam" } })
    expect(etat.replace).toHaveBeenCalledWith("/infrastructures/prn/rapport?bailleur=meridiam", { scroll: false })
  })
})
