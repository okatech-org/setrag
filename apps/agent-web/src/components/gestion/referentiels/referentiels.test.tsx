import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { etapeGrille, GrilleKilometrique, lireGrilleCsv } from "@/components/fare-schedule-detail"
import { declencheur } from "@/components/pricing-rule-detail"
import { lirePlanCsv } from "@/components/train-detail"

import { differences } from "./audit-entree"
import { MatriceDroits, rolesAvecDroit } from "./droits-matrice"
import { coefficient, joursCirculation, messageErreur, signePct } from "./format"
import { evenementsHistorique, libelleAction } from "./libelles-audit"

vi.mock("@workspace/api/hooks", () => ({ useQuery: () => undefined, useMutation: () => vi.fn() }))

describe("lectures de fichiers", () => {
  it("lit un plan de voiture CSV, avec ou sans en-tête", () => {
    expect(lirePlanCsv("rangee;colonne;numero;type\n1;1;1A;pmr\n1;2;1B;standard\n").lignes).toEqual([
      { rangee: 1, colonne: 1, numero: "1A", type: "pmr" },
      { rangee: 1, colonne: 2, numero: "1B", type: "standard" },
    ])
    expect(lirePlanCsv("1,1\n1,2").lignes).toHaveLength(2)
    expect(lirePlanCsv("rangee;colonne\nx;1").erreurs[0]).toMatch(/Ligne 2/)
    expect(lirePlanCsv("place;type\n1A;pmr").erreurs[0]).toMatch(/En-tête incomplet/)
  })

  it("lit une grille tarifaire CSV et refuse une ligne inconnue", () => {
    expect(lireGrilleCsv("type;classe;court;long\nExpress;2e;47,51;43,42\nOmnibus;1re;46.93;42.89")).toEqual([
      { trainType: "EXPRESS", serviceClass: "DEUXIEME", shortDistanceRate: 47.51, longDistanceRate: 43.42 },
      { trainType: "OMNIBUS", serviceClass: "PREMIERE", shortDistanceRate: 46.93, longDistanceRate: 42.89 },
    ])
    expect(() => lireGrilleCsv("type;classe\nExpress;2e;47\nTGV;2e;1;1")).toThrow(/Ligne 2|Ligne 3/)
  })
})

describe("libellés et calculs d'affichage", () => {
  it("dit les jours de circulation et les modulations en clair", () => {
    expect(joursCirculation([])).toBe("Tous les jours")
    expect(joursCirculation([5, 1, 3])).toBe("Lun, mer, ven")
    expect(coefficient(12)).toBe("×1,12")
    expect(signePct(-10)).toBe("−10 %")
  })

  it("décrit le déclencheur d'une règle de yield", () => {
    const base = { code: "R", scope: "reseau" as const, serviceClass: undefined, validFrom: undefined, validUntil: undefined, floorXaf: undefined, capXaf: undefined }
    expect(declencheur({ ...base, type: "anticipation", threshold: 30, modifierPct: -10 })).toBe("Départ dans 30 jours ou plus")
    expect(declencheur({ ...base, type: "anticipation", threshold: 2, modifierPct: 10 })).toBe("Départ dans moins de 2 jours")
    expect(declencheur({ ...base, type: "remplissage", threshold: 0.85, modifierPct: 20 })).toBe("85 % vendus ou plus")
    expect(declencheur({ ...base, type: "periode", threshold: 5, modifierPct: 12 })).toBe("Départ le vendredi")
  })

  it("place une grille dans son cycle : approuvée tant que l'effet est futur", () => {
    expect(etapeGrille({ status: "a_valider", validFrom: 0 })).toBe(1)
    expect(etapeGrille({ status: "actif", validFrom: 2_000 }, 1_000)).toBe(2)
    expect(etapeGrille({ status: "actif", validFrom: 500 }, 1_000)).toBe(3)
  })

  it("épure les erreurs du serveur", () => {
    expect(messageErreur(new Error("[CONVEX M(functions/x:y)] [Request ID: 1] Server Error\nUncaught Error: Séparation des tâches : refusé\n    at handler"))).toBe("Séparation des tâches : refusé")
  })

  it("traduit le journal en chronologie, motif compris", () => {
    expect(libelleAction("tarif.grille.activer")).toBe("Approbation et activation")
    expect(libelleAction("module.inconnu_x")).toBe("Module · inconnu x")
    const [evenement] = evenementsHistorique([
      { id: "1", action: "place.liberer", createdAt: Date.UTC(2026, 9, 1, 12), acteur: { nom: "Serge Ndong", court: "S. Ndong", matricule: "G-044" }, after: JSON.stringify({ note: "Siège réparé" }) },
    ])
    expect(evenement?.titre).toBe("Déblocage de place")
    expect(evenement?.detail).toMatch(/S\. Ndong · G-044 — Siège réparé/)
  })

  it("compare les valeurs avant et après d'une entrée d'audit", () => {
    expect(differences({ role: "vendeur_guichet", matricule: "V-1", _id: "x" }, { role: "chef_gare", matricule: "V-1" })).toEqual([
      { cle: "role", avant: "vendeur_guichet", apres: "chef_gare", change: true },
      { cle: "matricule", avant: "V-1", apres: "V-1", change: false },
    ])
    expect(differences(undefined, "texte")).toBeNull()
  })
})

describe("grille kilométrique", () => {
  it("montre l'ancienne valeur barrée et dit « avant » aux lecteurs d'écran", () => {
    render(
      <GrilleKilometrique
        bases={[{ trainType: "AUTORAIL", serviceClass: "PREMIERE", shortDistanceRate: 61.9, longDistanceRate: 54.93 }]}
        reference={[{ trainType: "AUTORAIL", serviceClass: "PREMIERE", shortDistanceRate: 60.1, longDistanceRate: 54.93 }]}
      />
    )
    const ligne = screen.getByRole("row", { name: /0–99 km/ })
    expect(within(ligne).getByText("61,90")).toBeInTheDocument()
    expect(within(ligne).getByText(/avant/)).toBeInTheDocument()
    expect(within(ligne).getByText("(modifié)")).toBeInTheDocument()
    const longue = screen.getByRole("row", { name: /100 km et plus/ })
    expect(within(longue).queryByText(/avant/)).not.toBeInTheDocument()
  })
})

describe("matrice des droits", () => {
  it("se lit depuis model/permissions et affirme l'invariant du contrôle à bord", () => {
    expect(rolesAvecDroit("controles", "modifier")).toEqual([])
    render(<MatriceDroits rolesInitiaux={["vendeur_guichet", "admin_fonctionnel"]} />)
    const ventes = screen.getByRole("row", { name: /Vendre, encaisser/ })
    expect(within(ventes).getAllByText("Lire")).toHaveLength(2)
    expect(within(ventes).getByText("Créer")).toBeInTheDocument()
    const tarifs = screen.getByRole("row", { name: /Grilles tarifaires/ })
    expect(within(tarifs).getByText("Tous")).toBeInTheDocument()
    expect(screen.getByText(/est accordé à aucun rôle/)).toBeInTheDocument()
  })
})
