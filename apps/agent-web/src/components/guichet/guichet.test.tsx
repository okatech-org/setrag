import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { signatureTenue, type BrouillonVente } from "@/lib/sale-draft"

import type { Accueil, Contexte, Desserte, Siege } from "./donnees"
import { PlanVoiture, placerCoteACote, voituresDepuis } from "./plan-voiture"
import { ChoixMoyens, REGLEMENT_INITIAL, coupuresRapides, reglementPret, saisirChiffre } from "./reglement"
import { etatClasse, justificatif, voyageursPourComptes } from "./vente-billet"
import { SellerDashboardScreen } from "../seller-dashboard"
import { GROUPES_MENU } from "@/coquille/navigation"
import { RaccourcisProvider } from "@/coquille/raccourcis"

vi.mock("next/navigation", () => ({
  usePathname: () => "/vente",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@workspace/api/hooks", () => ({
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
  useAuth: () => ({ isAuthenticated: true, isLoading: false, user: null }),
}))

function siege(label: string, row: number, column: number, etat: Partial<Pick<Siege, "isBlocked" | "isOccupied">> = {}): Siege {
  const isBlocked = etat.isBlocked ?? false
  const isOccupied = etat.isOccupied ?? false
  return {
    seatId: `s-${label}`,
    coachId: "v4",
    coachLabel: "V4",
    coachPosition: 4,
    coachRowCount: 2,
    coachColumnCount: 4,
    label,
    row,
    column,
    serviceClass: "DEUXIEME",
    isBlocked,
    isOccupied,
    isFree: !isBlocked && !isOccupied,
  } as Siege
}

const SIEGES = [
  siege("1A", 1, 1, { isOccupied: true }),
  siege("1B", 1, 2),
  siege("1C", 1, 3),
  siege("1D", 1, 4, { isBlocked: true }),
  siege("2A", 2, 1),
  siege("2B", 2, 2),
  siege("2C", 2, 3),
  siege("2D", 2, 4),
]

describe("Règlement au guichet", () => {
  it("bloque des espèces insuffisantes et le dit", () => {
    expect(reglementPret({ ...REGLEMENT_INITIAL, recu: "30000" }, 32_500)).toEqual({ pret: false, raison: "Montant reçu insuffisant" })
    expect(reglementPret({ ...REGLEMENT_INITIAL, recu: "32500" }, 32_500)).toEqual({ pret: true })
  })

  it("exige le numéro du payeur pour un paiement mobile, le bon pour un compte client", () => {
    expect(reglementPret({ ...REGLEMENT_INITIAL, moyen: "airtel_money", telephone: "77" }, 1)).toMatchObject({ pret: false })
    expect(reglementPret({ ...REGLEMENT_INITIAL, moyen: "airtel_money", telephone: "+241 77 12 34 56" }, 1)).toEqual({ pret: true })
    expect(reglementPret({ ...REGLEMENT_INITIAL, moyen: "en_compte", compteId: "c1" }, 1)).toEqual({ pret: false, raison: "Bon de commande à saisir" })
  })

  it("propose des montants ronds au-dessus du total et saisit au pavé", () => {
    expect(coupuresRapides(48_750)).toEqual([49_000, 50_000, 100_000])
    expect(saisirChiffre("", "0")).toBe("")
    expect(saisirChiffre("5", "000")).toBe("5000")
    expect(saisirChiffre("5000", "⌫")).toBe("500")
  })

  it("choisit un moyen et affiche sa touche", () => {
    const choisir = vi.fn()
    render(<ChoixMoyens valeur="especes" onChange={choisir} />)
    expect(screen.getByRole("radio", { name: /Espèces/ })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("radio", { name: /Airtel Money/ })).toHaveTextContent("A")
    fireEvent.click(screen.getByRole("radio", { name: /Carte bancaire/ }))
    expect(choisir).toHaveBeenCalledWith("carte")
  })
})

describe("Composition du groupe", () => {
  it("garde la saisie de chaque voyageur quand les compteurs changent", () => {
    const existants = [
      { categorie: "", nom: "NZÉ", prenom: "Aimée", civilite: "F" as const, telephone: "" },
      { categorie: "ENFANT", nom: "NZÉ", prenom: "Joël", civilite: "M" as const, telephone: "" },
    ]
    const liste = voyageursPourComptes({ "": 2, ENFANT: 1 }, ["", "ENFANT", "MILITAIRE"], existants)
    expect(liste.map((v) => [v.categorie, v.prenom])).toEqual([
      ["", "Aimée"],
      ["", ""],
      ["ENFANT", "Joël"],
    ])
  })

  it("écrit le justificatif d'une réduction", () => {
    const categories = [
      { code: "ENFANT", label: "Enfant", ratePct: 50, minAge: 4, maxAge: 11, minPassengers: null, maxPassengers: null, requiresProof: true },
      { code: "MILITAIRE", label: "Militaire", ratePct: 10, minAge: null, maxAge: null, minPassengers: null, maxPassengers: null, requiresProof: true },
    ]
    expect(justificatif("ENFANT", categories)).toBe("−50 % · âge à vérifier sur pièce")
    expect(justificatif("MILITAIRE", categories)).toBe("−10 % · ordre de mission à présenter")
  })

  it("change de signature de tenue dès qu'une place ou une catégorie change", () => {
    const desserte = { tripId: "t", fromIndex: 0, toIndex: 2, classe: "DEUXIEME" } as BrouillonVente["desserte"]
    const a = signatureTenue(desserte, [{ categorie: "", seatId: "s1", nom: "", prenom: "", civilite: "M", telephone: "" }])
    const b = signatureTenue(desserte, [{ categorie: "ENFANT", seatId: "s1", nom: "", prenom: "", civilite: "M", telephone: "" }])
    const c = signatureTenue(desserte, [{ categorie: "", seatId: "s1", nom: "NZÉ", prenom: "", civilite: "F", telephone: "1" }])
    expect(a).not.toBe(b)
    expect(a).toBe(c)
  })
})

describe("Classe d'une desserte", () => {
  const desserte = {
    tripId: "t",
    status: "planifie",
    delayMinutes: 0,
    departAt: Date.now() + 3_600_000,
    classes: {
      DEUXIEME: { disponibles: 3, capacite: 80, prixAdulteTtc: 32_500, totalTtc: 32_500, lignes: [32_500] },
      VIP: { disponibles: 0, capacite: 24, prixAdulteTtc: 65_000, totalTtc: 65_000, lignes: [65_000] },
    },
  } as unknown as Desserte

  it("dit pourquoi une classe ne se vend pas", () => {
    expect(etatClasse(desserte, "DEUXIEME", 2)).toEqual({ vendable: true })
    expect(etatClasse(desserte, "DEUXIEME", 4)).toEqual({ vendable: false, raison: "3 places seulement" })
    expect(etatClasse(desserte, "VIP", 1)).toEqual({ vendable: false, raison: "Complet" })
    expect(etatClasse(desserte, "PREMIERE", 1)).toEqual({ vendable: false, raison: "Pas de voiture" })
    expect(etatClasse({ ...desserte, status: "annule" }, "DEUXIEME", 1)).toEqual({ vendable: false, raison: "Supprimé" })
  })
})

describe("Plan de voiture", () => {
  it("rend chaque état lisible sans la couleur", () => {
    const placer = vi.fn()
    render(<PlanVoiture sieges={SIEGES} choisies={new Map([["s-2B", 1]])} nosPlaces={new Set()} onPlace={placer} libelleVoiture="Voiture 4" />)
    expect(screen.getByRole("button", { name: "Place 1A, vendue" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Place 1D, bloquée par la gestion" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Place 2B, voyageur 1" })).toHaveTextContent("1")
    fireEvent.click(screen.getByRole("button", { name: "Place 1C, libre" }))
    expect(placer).toHaveBeenCalledWith(expect.objectContaining({ label: "1C" }))
  })

  it("traite les places de la tenue en cours comme libres pour la vente", () => {
    const occupee = siege("2A", 2, 1, { isOccupied: true })
    const [voiture] = voituresDepuis([occupee], new Set([occupee.seatId]))
    expect(voiture?.libres).toBe(1)
  })

  it("place le groupe côte à côte sur un même rang", () => {
    const places = placerCoteACote(SIEGES, 3, "DEUXIEME", new Set())
    expect(places.map((p) => p.label)).toEqual(["2A", "2B", "2C"])
  })
})

describe("Accueil vendeur", () => {
  const contexte = {
    seller: { id: "u", firstName: "Nadège", lastName: "MOUSSAVOU", matricule: "V-101", role: "vendeur_guichet" },
    pointOfSale: { id: "p", code: "OWE-PV", name: "Gare d'Owendo · guichet 2", type: "gare", isActive: true, stationId: "g", stationCode: "OWE", stationName: "Owendo" },
    session: { id: "c", openedAt: Date.parse("2026-10-01T06:30:00+01:00"), openingFloatXaf: 50_000, emergencyBooklet: null },
    parametres: { tenueMinutes: 15, tentativesMobile: 3, ventesDegradees: true, mentionDuplicata: "DUPLICATA", piedBillet: "" },
  } as unknown as Contexte
  const accueil = {
    station: { id: "g", code: "OWE", name: "Owendo" },
    caisse: { ouverteA: 0, fonds: 50_000 },
    indicateurs: { encaisse: 653_300, operations: 19, billets: 21, enfants: 4, especesAttendues: 432_750, sorties: 1, sortiesMontant: -29_250 },
    departs: [],
    trafic: [
      { tripId: "t", trainNumber: "TR-207", trainType: "EXPRESS", serviceDate: "2026-10-01", departAt: Date.parse("2026-10-01T14:05:00+01:00"), status: "retarde", delayMinutes: 25, destination: "Franceville" },
    ],
    operations: [],
  } as unknown as Accueil

  it("annonce le retard, les indicateurs et les raccourcis avec leurs touches", () => {
    render(
      <RaccourcisProvider groupes={GROUPES_MENU.filter((groupe) => groupe.cle === "guichet")}>
        <SellerDashboardScreen contexte={contexte} accueil={accueil} enLigne onOuvrirOperation={vi.fn()} />
      </RaccourcisProvider>
    )
    expect(screen.getByRole("heading", { name: "Bonjour Nadège" })).toBeInTheDocument()
    expect(screen.getByText("Express 207 : départ à 14:30 au lieu de 14:05.")).toBeInTheDocument()
    expect(screen.getByText(/653.300/)).toBeInTheDocument()
    const produits = within(screen.getByRole("navigation", { name: "Produits du guichet" }))
    expect(produits.getByRole("link", { name: /Vendre un billet/ })).toHaveTextContent("B")
    expect(produits.getByRole("link", { name: /Bagage/ })).toHaveTextContent("G")
  })

  it("bloque la vente quand la caisse est fermée, avec la raison écrite", () => {
    render(<SellerDashboardScreen contexte={{ ...contexte, session: null }} accueil={accueil} enLigne onOuvrirOperation={vi.fn()} />)
    expect(screen.getByText(/Caisse fermée\./)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Vendre un billet — Caisse fermée/ })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("link", { name: /Après-vente/ })).not.toHaveAttribute("aria-disabled")
  })
})
