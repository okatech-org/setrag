import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CapaciteGmao, DossierOt } from "../commun"
import { actionsOt, piecesNettes } from "./actions-ot"
import { DossierOtEcran } from "./dossier-ot"

const etat = vi.hoisted(() => ({ donnees: {} as Record<string, unknown> }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/materiel/ordres/ot1",
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

// La coquille du portail (session, menus) n'est pas l'objet de ces tests.
vi.mock("@/components/enterprise-layout", () => ({
  EnterpriseShell: ({ title, actions, eyebrow, children }: { title: string; actions?: ReactNode; eyebrow?: ReactNode; children: ReactNode }) => (
    <div>
      {eyebrow}
      <h1>{title}</h1>
      <div data-testid="actions-entete">{actions}</div>
      {children}
    </div>
  ),
}))

const TOUTES: CapaciteGmao[] = ["ot_demander", "ot_planifier", "ot_executer", "ot_cloturer", "stock_mouvementer", "achat_demander", "achat_valider"]
const avec = (capacites: CapaciteGmao[]) => (capacite: CapaciteGmao) => capacites.includes(capacite)

function droits(capacites: CapaciteGmao[]) {
  return { role: "chef_atelier", peutEcrire: true, capacites, utilisateurId: "moi" }
}

function dossierOt(ot: Partial<DossierOt["ot"]> = {}, reste: Partial<DossierOt> = {}): DossierOt {
  return {
    ot: {
      id: "ot1",
      numero: "OT-2026-0042",
      titre: "Fuite sur la conduite générale",
      description: "Perte de pression constatée à Ndjolé.",
      type: "correctif",
      origine: "demande",
      priorite: "haute",
      statut: "en_cours",
      equipe: "Équipe B",
      atelierId: "at1",
      debutPrevu: 1_790_000_000_000,
      finPrevue: 1_790_100_000_000,
      debutReel: 1_790_000_000_000,
      finReelle: null,
      immobilisant: true,
      kmDebut: 1_234_567,
      heuresPassees: 6.5,
      coutMainOeuvreFcfa: 97_500,
      coutPiecesFcfa: 42_000,
      coutExterneFcfa: 0,
      coutTotalFcfa: 139_500,
      compteRendu: null,
      organe: "Conduite générale",
      demandeLe: 1_789_900_000_000,
      clotureLe: null,
      motifAnnulation: null,
      enRetard: false,
      demandeur: "A. Moussavou",
      planifiePar: "C. Mba",
      terminePar: null,
      cloturePar: null,
      termineParMoi: false,
      ...ot,
    },
    engin: { id: "eq1", numero: "CC 2204", famille: "locomotive", serie: "GT46MAC", statut: "en_atelier", compteurKm: 1_234_567 },
    atelier: { id: "at1", code: "OWE", nom: "Atelier d'Owendo", tauxHoraireFcfa: 15_000 },
    plan: null,
    visite: null,
    incident: null,
    temps: [],
    pieces: [],
    achats: [],
    chronologie: [],
    ...reste,
  } as unknown as DossierOt
}

beforeEach(() => {
  etat.donnees = {}
})

describe("GMAO · actions proposées sur un OT", () => {
  it("propose la planification d'une demande, puis le démarrage d'un OT planifié", () => {
    const demande = actionsOt({ statut: "demande", peut: avec(TOUTES), termineParMoi: false, piecesRetournables: false })
    expect(demande.principale).toBe("planifier")
    expect(demande.autres).toEqual(["modifier", "annuler"])

    const planifie = actionsOt({ statut: "planifie", peut: avec(TOUTES), termineParMoi: false, piecesRetournables: false })
    expect(planifie.principale).toBe("demarrer")
    expect(planifie.autres).toEqual(["replanifier", "modifier", "annuler"])
  })

  it("en cours : fin des travaux en principal, temps et pièces à côté ; retour seulement s'il reste une pièce", () => {
    const sansPiece = actionsOt({ statut: "en_cours", peut: avec(TOUTES), termineParMoi: false, piecesRetournables: false })
    expect(sansPiece.principale).toBe("terminer")
    expect(sansPiece.autres).toEqual(["saisir_temps", "consommer", "cout_externe", "demander_achat"])
    const avecPiece = actionsOt({ statut: "en_cours", peut: avec(TOUTES), termineParMoi: false, piecesRetournables: true })
    expect(avecPiece.autres).toContain("retourner")
  })

  it("n'offre aucune étape principale à qui n'a pas la capacité", () => {
    const magasinier = actionsOt({ statut: "en_cours", peut: avec(["stock_mouvementer"]), termineParMoi: false, piecesRetournables: true })
    expect(magasinier.principale).toBeNull()
    expect(magasinier.autres).toEqual(["consommer", "retourner"])
    const lecteur = actionsOt({ statut: "planifie", peut: avec([]), termineParMoi: false, piecesRetournables: false })
    expect(lecteur).toEqual({ principale: null, autres: [], separationTaches: false })
  })

  it("en réception : la remise en service est retirée à celui qui a déclaré la fin des travaux", () => {
    const autre = actionsOt({ statut: "travaux_termines", peut: avec(TOUTES), termineParMoi: false, piecesRetournables: false })
    expect(autre.principale).toBe("cloturer")
    expect(autre.separationTaches).toBe(false)
    const moi = actionsOt({ statut: "travaux_termines", peut: avec(TOUTES), termineParMoi: true, piecesRetournables: false })
    expect(moi.principale).toBeNull()
    expect(moi.separationTaches).toBe(true)
    expect(moi.autres).toContain("refuser_reception")
  })

  it("un OT clôturé ou annulé ne propose plus rien", () => {
    for (const statut of ["cloture", "annule"] as const) {
      expect(actionsOt({ statut, peut: avec(TOUTES), termineParMoi: false, piecesRetournables: true })).toEqual({ principale: null, autres: [], separationTaches: false })
    }
  })

  it("calcule les pièces encore retournables (sorties moins retours)", () => {
    const piece = { articleId: "a1", reference: "FR-001", designation: "Semelle de frein", unite: "pièce", valeurFcfa: 0, le: 0, auteur: null, atelierId: "at1" }
    const nettes = piecesNettes([
      { ...piece, id: "m1", sens: "sortie", quantite: 4 },
      { ...piece, id: "m2", sens: "entree", quantite: 1 },
      { ...piece, id: "m3", articleId: "a2", reference: "X", sens: "sortie", quantite: 2 },
      { ...piece, id: "m4", articleId: "a2", reference: "X", sens: "entree", quantite: 2 },
    ] as DossierOt["pieces"])
    expect(nettes).toEqual([expect.objectContaining({ articleId: "a1", quantite: 3 })])
  })
})

describe("GMAO · dossier d'OT", () => {
  it("OT en cours : étape écrite, fin des travaux en principal, temps et pièces proposés", () => {
    etat.donnees = { droits: droits(TOUTES), ordreTravail: dossierOt() }
    render(<DossierOtEcran otId="ot1" />)
    expect(screen.getByText(/Étape actuelle : En cours/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Déclarer les travaux terminés" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Saisir du temps" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Consommer une pièce" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Remettre en service" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Imprimer l.OT/ })).toHaveAttribute("href", "/materiel/ordres/ot1/impression")
    expect(screen.getByRole("link", { name: "CC 2204" })).toHaveAttribute("href", "/materiel/parc/eq1")
  })

  it("affiche la séparation des tâches à l'agent qui a déclaré la fin des travaux", () => {
    etat.donnees = {
      droits: droits(TOUTES),
      ordreTravail: dossierOt({ statut: "travaux_termines", termineParMoi: true, terminePar: "Moi", compteRendu: "Raccord changé, essai statique conforme." }),
    }
    render(<DossierOtEcran otId="ot1" />)
    expect(screen.getByText("Séparation des tâches : la remise en service revient à un autre agent")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Remettre en service" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Refuser la réception" })).toBeInTheDocument()
    expect(screen.getByText("Raccord changé, essai statique conforme.")).toBeInTheDocument()
  })

  it("propose la remise en service à un autre agent habilité", () => {
    etat.donnees = { droits: droits(TOUTES), ordreTravail: dossierOt({ statut: "travaux_termines", termineParMoi: false, terminePar: "J. Ndong" }) }
    render(<DossierOtEcran otId="ot1" />)
    expect(screen.getByRole("button", { name: "Remettre en service" })).toBeInTheDocument()
    expect(screen.queryByText(/Séparation des tâches : la remise en service/)).not.toBeInTheDocument()
  })

  it("écrit le retard en toutes lettres et l'état introuvable", () => {
    etat.donnees = { droits: droits([]), ordreTravail: dossierOt({ statut: "planifie", enRetard: true }) }
    const { unmount } = render(<DossierOtEcran otId="ot1" />)
    expect(screen.getByText("En retard")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Démarrer les travaux" })).not.toBeInTheDocument()
    unmount()

    etat.donnees = { droits: droits(TOUTES), ordreTravail: null }
    render(<DossierOtEcran otId="ot1" />)
    expect(screen.getByText("Ordre de travail introuvable", { selector: "h1" })).toBeInTheDocument()
  })
})
