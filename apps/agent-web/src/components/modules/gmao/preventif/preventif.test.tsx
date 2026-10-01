import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { getFunctionName } from "convex/server"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const etat = vi.hoisted(() => ({
  donnees: {} as Record<string, unknown>,
  capacites: [] as string[],
  mutations: {} as Record<string, ReturnType<typeof vi.fn>>,
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/materiel/preventif",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@workspace/api/hooks", () => ({
  useQuery: (ref: never, args: unknown) => {
    if (args === "skip") return undefined
    const nom = getFunctionName(ref)
    if (nom.endsWith(":droits")) return { capacites: etat.capacites, peutEcrire: true, role: "chef_atelier", utilisateurId: "u1" }
    return etat.donnees[nom]
  },
  useMutation: (ref: never) => {
    const nom = getFunctionName(ref)
    etat.mutations[nom] ??= vi.fn().mockResolvedValue({})
    return etat.mutations[nom]
  },
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

import { DetailPlan } from "./detail-plan"
import { lireOperations } from "./formulaires-plan"
import { PagePreventif } from "./preventif"

const echeance = (surcharge: Record<string, unknown>) => ({
  planEquipementId: "pe1",
  planId: "p1",
  planCode: "VL-LOC",
  planLibelle: "Visite limitée",
  equipementId: "e1",
  numero: "CC 2201",
  famille: "locomotive",
  serie: "GT26",
  statutEngin: "en_service",
  etat: "echue",
  ratio: 1.05,
  declencheur: "km",
  kmRestants: -1500,
  joursRestants: 20,
  prochaineDate: Date.parse("2026-10-20T10:00:00Z"),
  ot: null,
  ...surcharge,
})

beforeEach(() => {
  etat.donnees = {
    "modules/gmao/queries:echeances": [
      echeance({}),
      echeance({ planEquipementId: "pe2", equipementId: "e2", numero: "CC 2202", etat: "proche", ratio: 0.93, kmRestants: 2000 }),
      echeance({ planEquipementId: "pe3", equipementId: "e3", numero: "CC 2203", ot: { id: "ot5", numero: "OT-2026-0005", statut: "planifie" } }),
    ],
    "modules/gmao/queries:plans": [
      {
        id: "p1",
        code: "VL-LOC",
        libelle: "Visite limitée",
        famille: "locomotive",
        series: [],
        seuilKm: 30_000,
        seuilJours: 90,
        alertePct: 10,
        dureeHeures: 16,
        immobilisant: true,
        actif: true,
        engins: 12,
        echues: 2,
        proches: 1,
      },
    ],
  }
  etat.capacites = []
  etat.mutations = {}
})

describe("maintenance préventive", () => {
  it("transforme les échéances cochées en OT et donne le lien de chaque OT créé", async () => {
    etat.capacites = ["ot_planifier"]
    etat.mutations["modules/gmao/mutations:genererOtPreventifs"] = vi.fn().mockResolvedValue({ crees: [{ otId: "ot9", numero: "OT-2026-0009" }], ignores: 0 })
    render(<PagePreventif />)

    // Une échéance qui a déjà son OT n'est pas sélectionnable ; son OT est lié.
    expect(screen.queryByRole("checkbox", { name: /CC 2203/ })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "OT-2026-0005" })).toHaveAttribute("href", "/materiel/ordres/ot5")

    const lancer = screen.getByRole("button", { name: /Ouvrir les OT des échéances sélectionnées \(0\)/ })
    expect(lancer).toBeDisabled()
    fireEvent.click(screen.getByRole("checkbox", { name: "Sélectionner VL-LOC pour CC 2201" }))
    fireEvent.click(screen.getByRole("button", { name: /Ouvrir les OT des échéances sélectionnées \(1\)/ }))

    await waitFor(() => expect(etat.mutations["modules/gmao/mutations:genererOtPreventifs"]).toHaveBeenCalledWith({ planEquipementIds: ["pe1"] }))
    expect(await screen.findByText(/1 OT préventif\(s\) ouvert\(s\)/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "OT-2026-0009" })).toHaveAttribute("href", "/materiel/ordres/ot9")
  })

  it("masque la sélection et l'action sans la capacité ot_planifier", () => {
    render(<PagePreventif />)
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Ouvrir les OT/ })).not.toBeInTheDocument()
    expect(screen.getAllByText("dépassé de 1 500 km")).toHaveLength(2)
  })

  it("liste les plans et réserve « Créer un plan » à plan_administrer", () => {
    const { unmount } = render(<PagePreventif />)
    fireEvent.click(screen.getByRole("tab", { name: /Plans/ }))
    expect(screen.getByText("Toute la famille")).toBeInTheDocument()
    expect(screen.getByText("30 000 km ou 90 j")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Créer un plan" })).not.toBeInTheDocument()
    unmount()

    etat.capacites = ["plan_administrer"]
    render(<PagePreventif />)
    fireEvent.click(screen.getByRole("tab", { name: /Plans/ }))
    expect(screen.getByRole("button", { name: "Créer un plan" })).toBeInTheDocument()
  })

  it("rend le dossier d'un plan : engins suivis, gamme et OT échus à ouvrir", () => {
    etat.capacites = ["plan_administrer", "ot_planifier"]
    etat.donnees["modules/gmao/queries:plan"] = {
      plan: {
        id: "p1",
        code: "VL-LOC",
        libelle: "Visite limitée",
        famille: "locomotive",
        series: ["GT26"],
        seuilKm: 30_000,
        seuilJours: null,
        alertePct: 10,
        dureeHeures: 16,
        immobilisant: true,
        operations: ["Contrôler les freins", "Graisser les essieux"],
        actif: true,
        creeLe: Date.parse("2026-01-01T10:00:00Z"),
        majLe: Date.parse("2026-09-01T10:00:00Z"),
      },
      engins: [
        {
          planEquipementId: "pe1",
          equipementId: "e1",
          numero: "CC 2201",
          serie: "GT26",
          statut: "en_service",
          compteurKm: 1_231_500,
          derniereRealisationLe: Date.parse("2026-05-01T10:00:00Z"),
          derniereRealisationKm: 1_200_000,
          etat: "echue",
          ratio: 1.05,
          prochainKm: 1_230_000,
          kmRestants: -1500,
          prochaineDate: null,
          joursRestants: null,
          otOuvertId: null,
        },
      ],
      chronologie: [],
    }
    render(<DetailPlan planId="p1" />)
    expect(screen.getByRole("heading", { name: "VL-LOC — Visite limitée" })).toBeInTheDocument()
    expect(screen.getByText("Graisser les essieux")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Détacher CC 2201 du plan" })).toBeInTheDocument()
    const principaux = screen.getAllByRole("button").filter((bouton) => bouton.className.includes("bg-accent-base"))
    expect(principaux.map((bouton) => bouton.textContent)).toEqual(["Ouvrir les OT des échéances échues (1)"])
  })

  it("lit la gamme une opération par ligne", () => {
    expect(lireOperations("• Contrôler les freins\n\n- Graisser les essieux \r\n  Essai statique")).toEqual([
      "Contrôler les freins",
      "Graisser les essieux",
      "Essai statique",
    ])
  })
})
