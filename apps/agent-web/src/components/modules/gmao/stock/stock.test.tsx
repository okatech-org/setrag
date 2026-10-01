import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { DossierArticle, LigneArticle } from "../commun"
import { ecartInventaire, libelleEcart } from "./dialogues-stock"
import { FicheArticle } from "./fiche-article"
import { EcranStock, quantiteSignee } from "./stock"

const etat = vi.hoisted(() => ({ donnees: {} as Record<string, unknown> }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/materiel/stock",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@workspace/api/hooks", async () => {
  const { getFunctionName } = await import("convex/server")
  return {
    useQuery: (reference: never, args: unknown) => (args === "skip" ? undefined : etat.donnees[getFunctionName(reference).split(":").pop()!]),
    useMutation: () => vi.fn().mockResolvedValue({}),
  }
})

vi.mock("@/components/enterprise-layout", () => ({
  EnterpriseShell: ({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <div>{actions}</div>
      {children}
    </div>
  ),
}))

/** Textes rendus hors des listes de filtres et des libellés de fiche. */
const affiches = (texte: string) => screen.queryAllByText(texte).filter((element) => element.tagName !== "OPTION" && element.tagName !== "DT")

const droits = { role: "magasinier", peutEcrire: true, capacites: ["stock_mouvementer", "achat_demander"], utilisateurId: "moi" }

function article(partiel: Record<string, unknown>): LigneArticle {
  return {
    id: "a1",
    reference: "FR-001",
    designation: "Semelle de frein composite",
    famille: "Freinage",
    unite: "pièce",
    prixUnitaireFcfa: 18_000,
    fournisseur: "Faiveley",
    critique: true,
    actif: true,
    quantite: 0,
    valeurFcfa: 0,
    sousSeuil: true,
    rupture: true,
    achatsEnCours: 1,
    magasins: [{ stockId: "s1", atelierId: "at1", atelier: "OWE", quantite: 0, seuilReappro: 10, sousSeuil: true }],
    ...partiel,
  } as unknown as LigneArticle
}

beforeEach(() => {
  etat.donnees = {}
})

describe("GMAO · stock", () => {
  it("écrit la rupture et le passage sous le seuil en toutes lettres", () => {
    etat.donnees = {
      droits,
      articles: [
        article({}),
        article({ id: "a2", reference: "RL-220", designation: "Roulement d'essieu", rupture: false, sousSeuil: true, quantite: 3, valeurFcfa: 54_000, critique: false, magasins: [{ stockId: "s2", atelierId: "at1", atelier: "OWE", quantite: 3, seuilReappro: 4, sousSeuil: true }] }),
        article({ id: "a3", reference: "FI-010", designation: "Filtre à huile", rupture: false, sousSeuil: false, quantite: 40, valeurFcfa: 400_000, critique: false, magasins: [] }),
      ],
    }
    render(<EcranStock />)
    expect(affiches("Rupture")).toHaveLength(1)
    expect(affiches("Sous le seuil")).toHaveLength(1)
    expect(affiches("Critique")).toHaveLength(1)
    // Une seule action principale : l'entrée en stock.
    expect(screen.getByRole("button", { name: "Entrée en stock" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Générer les demandes sous le seuil" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Exporter \(3\)/ })).toBeInTheDocument()
  })

  it("dit honnêtement un catalogue vide", () => {
    etat.donnees = { droits, articles: [] }
    render(<EcranStock />)
    expect(screen.getByText("Aucun article au catalogue")).toBeInTheDocument()
  })

  it("calcule et écrit l'écart d'inventaire avant validation", () => {
    expect(ecartInventaire(7, 10)).toBe(-3)
    expect(ecartInventaire(10.25, 10)).toBe(0.25)
    expect(libelleEcart(-3, "pièce")).toBe("Écart : −3 pièce (manquant)")
    expect(libelleEcart(0, "pièce")).toMatch(/Aucun écart/)
    expect(quantiteSignee({ sens: "ajustement", quantite: 3, ecart: -3 })).toBe("−3")
    expect(quantiteSignee({ sens: "entree", quantite: 4, ecart: null }, "pièce")).toBe("+4 pièce")
  })

  it("fiche article : rupture par magasin écrite, actions par magasin", () => {
    const dossier = {
      article: {
        id: "a1",
        reference: "FR-001",
        designation: "Semelle de frein composite",
        famille: "Freinage",
        unite: "pièce",
        prixUnitaireFcfa: 18_000,
        fournisseur: "Faiveley",
        delaiApproJours: 45,
        critique: true,
        compatibilite: "GT46MAC, voitures Grand Confort",
        actif: true,
      },
      stocks: [
        { id: "s1", atelierId: "at1", atelier: "Atelier d'Owendo", atelierCode: "OWE", quantite: 0, seuilReappro: 10, quantiteReappro: 20, emplacement: "A-12", sousSeuil: true },
      ],
      mouvements: [],
      demandes: [],
      consommation6Mois: 24,
      chronologie: [],
    } as unknown as DossierArticle
    etat.donnees = { droits, article: dossier, articles: [], formulaires: { ateliers: [], articles: [] } }
    render(<FicheArticle articleId="a1" />)
    expect(affiches("Rupture").length).toBeGreaterThan(0)
    expect(affiches("Pièce critique")).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Paramétrer le magasin OWE" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Demander un achat" })).toBeInTheDocument()
  })
})
