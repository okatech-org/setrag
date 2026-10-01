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
  usePathname: () => "/materiel/parc",
  useRouter: () => ({ push: etat.push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@workspace/api/hooks", () => ({
  useQuery: (ref: never, args: unknown) => {
    if (args === "skip") return undefined
    const nom = getFunctionName(ref)
    if (nom.endsWith(":droits")) return { capacites: etat.capacites, peutEcrire: true, role: "chef_atelier", utilisateurId: "u1" }
    return etat.donnees[nom]
  },
  useMutation: () => vi.fn().mockResolvedValue({}),
}))
vi.mock("@/components/enterprise-layout", () => ({
  EnterpriseShell: ({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <div>{actions}</div>
      {children}
    </main>
  ),
}))

import { FicheEngin } from "./fiche-engin"
import { actionsStatutPossibles, horodatageLocal, valeurLocale } from "./formulaires-engin"
import { ListeParc } from "./liste-parc"

const engin = (surcharge: Record<string, unknown>) => ({
  id: "e1",
  numero: "CC 2201",
  famille: "locomotive",
  serie: "GT26",
  constructeur: "EMD",
  statut: "en_service",
  motifStatut: null,
  statutDepuis: 0,
  atelier: "Owendo",
  atelierCode: "OWE",
  compteurKm: 1_234_567,
  compteurHeures: 0,
  proprietaire: "SETRAG",
  train: "402",
  lieAuReferentiel: false,
  otOuverts: 2,
  prochaineEcheance: { planCode: "VL-LOC", etat: "echue", ratio: 1.1, kmRestants: -1200, joursRestants: null },
  ...surcharge,
})

beforeEach(() => {
  etat.donnees = {}
  etat.capacites = []
})

describe("parc du matériel roulant", () => {
  it("liste les engins avec leur statut et leur échéance écrits", () => {
    etat.donnees["modules/gmao/queries:equipements"] = [
      engin({}),
      engin({ id: "e2", numero: "WT 4508", famille: "wagon", serie: "Trémie", statut: "immobilise", motifStatut: "Boîte d'essieu chaude", prochaineEcheance: null, train: null }),
    ]
    render(<ListeParc />)
    const tableau = within(screen.getByRole("table", { name: "Parc du matériel roulant" }))
    expect(tableau.getByText("CC 2201")).toBeInTheDocument()
    expect(tableau.getByText("Immobilisé")).toBeInTheDocument()
    expect(tableau.getByText("Boîte d'essieu chaude")).toBeInTheDocument()
    expect(tableau.getByText("Échue")).toBeInTheDocument()
    expect(tableau.getByText("dépassé de 1 200 km")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Exporter \(2\)/ })).toBeEnabled()
  })

  it("n'offre « Ajouter un engin » qu'avec la capacité parc_administrer", () => {
    etat.donnees["modules/gmao/queries:equipements"] = []
    const { unmount } = render(<ListeParc />)
    expect(screen.queryByRole("button", { name: "Ajouter un engin" })).not.toBeInTheDocument()
    expect(screen.getByText("Le parc est vide")).toBeInTheDocument()
    unmount()
    etat.capacites = ["parc_administrer"]
    render(<ListeParc />)
    expect(screen.getByRole("button", { name: "Ajouter un engin" })).toBeInTheDocument()
  })

  it("annonce une fiche introuvable", () => {
    etat.donnees["modules/gmao/queries:equipement"] = null
    render(<FicheEngin equipementId="inconnu" />)
    expect(screen.getByText("Engin introuvable")).toBeInTheDocument()
  })

  it("rend la fiche de vie avec un seul bouton principal", () => {
    etat.capacites = ["ot_demander", "compteur_relever", "parc_administrer"]
    etat.donnees["modules/gmao/queries:equipement"] = {
      engin: {
        id: "e1",
        numero: "CC 2201",
        famille: "locomotive",
        serie: "GT26",
        constructeur: "EMD",
        anneeMiseEnService: 1998,
        numeroSerie: null,
        statut: "immobilise",
        motifStatut: "OT urgent en attente",
        immobilisationManuelle: null,
        statutDepuis: Date.parse("2026-09-30T10:00:00Z"),
        compteurKm: 1_234_567,
        compteurHeures: 5400,
        compteurReleveLe: Date.parse("2026-09-30T10:00:00Z"),
        proprietaire: "SETRAG",
        tareTonnes: 120,
        chargeUtileTonnes: null,
        notes: null,
        atelierId: "a1",
        trainId: null,
        creeLe: Date.parse("2026-01-01T10:00:00Z"),
      },
      atelier: { id: "a1", code: "OWE", nom: "Atelier d'Owendo" },
      voiture: null,
      train: null,
      echeances: [
        {
          planEquipementId: "pe1",
          planId: "p1",
          planCode: "VL-LOC",
          planLibelle: "Visite limitée",
          seuilKm: 30_000,
          seuilJours: 90,
          actif: true,
          derniereRealisationLe: Date.parse("2026-06-01T10:00:00Z"),
          derniereRealisationKm: 1_200_000,
          otOuvertId: "ot9",
          ratio: 1.15,
          etat: "echue",
          kmRestants: -4567,
          joursRestants: -12,
          declencheur: "km",
        },
      ],
      ordres: [
        {
          id: "ot9",
          numero: "OT-2026-0009",
          titre: "Visite limitée",
          type: "preventif",
          priorite: "urgente",
          statut: "demande",
          demandeLe: Date.parse("2026-09-29T10:00:00Z"),
          clotureLe: null,
          coutFcfa: 0,
          enRetard: true,
          demandeur: "A. Ndong",
        },
      ],
      releves: [],
      visites: [],
      indicateurs: { coutCumuleFcfa: 2_500_000, otOuverts: 1, defaillances: 0, mtbfJours: null, mttrHeures: null, joursImmobilisation: 1.5 },
      chronologie: [{ id: "ev1", type: "creation", libelle: "Entrée au parc de CC 2201", detail: null, auteur: "A. Ndong", le: Date.parse("2026-01-01T10:00:00Z") }],
    }
    render(<FicheEngin equipementId="e1" />)
    expect(screen.getByRole("heading", { name: "CC 2201" })).toBeInTheDocument()
    expect(screen.getByText(/OT urgent en attente/)).toBeInTheDocument()
    expect(screen.getByText("En retard")).toBeInTheDocument()
    expect(screen.getByText("Entrée au parc de CC 2201")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Voir l’OT" })).toHaveAttribute("href", "/materiel/ordres/ot9")
    const principaux = screen.getAllByRole("button").filter((bouton) => bouton.className.includes("bg-accent-base"))
    expect(principaux.map((bouton) => bouton.textContent)).toEqual(["Demander un OT"])
    expect(screen.getByRole("button", { name: "Relever les compteurs" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Changer le statut" })).toBeInTheDocument()
  })

  it("ne propose que les décisions de statut admises", () => {
    expect(actionsStatutPossibles({ statut: "en_service", immobilisationManuelle: null })).toEqual(["immobilise", "reforme"])
    expect(actionsStatutPossibles({ statut: "immobilise", immobilisationManuelle: "Décision" })).toEqual(["en_service", "reforme"])
    expect(actionsStatutPossibles({ statut: "reforme", immobilisationManuelle: null })).toEqual([])
  })

  it("lit et écrit les dates de relevé à l'heure de Libreville", () => {
    const horodatage = horodatageLocal("2026-10-01T08:30")
    expect(horodatage).toBe(Date.parse("2026-10-01T07:30:00Z"))
    expect(valeurLocale(horodatage)).toBe("2026-10-01T08:30")
  })
})
