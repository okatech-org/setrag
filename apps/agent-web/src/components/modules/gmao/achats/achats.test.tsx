import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CapaciteGmao, DossierAchat, LigneAchat } from "../commun"
import { EcranAchats, livraisonEnRetard } from "./achats"
import { actionsAchat, DossierAchatEcran, MENTION_COMMANDE_SIMULEE } from "./dossier-achat"

const etat = vi.hoisted(() => ({ donnees: {} as Record<string, unknown> }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/materiel/achats",
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

const TOUTES: CapaciteGmao[] = ["achat_demander", "achat_valider", "stock_mouvementer"]
const avec = (capacites: CapaciteGmao[]) => (capacite: CapaciteGmao) => capacites.includes(capacite)
const droits = (capacites: CapaciteGmao[]) => ({ role: "acheteur", peutEcrire: true, capacites, utilisateurId: "moi" })
const JOUR = 86_400_000

function dossierAchat(demande: Partial<DossierAchat["demande"]> = {}): DossierAchat {
  return {
    demande: {
      id: "d1",
      numero: "DA-2026-0007",
      quantite: 20,
      prixUnitaireFcfa: 18_000,
      montantFcfa: 360_000,
      motif: "Stock sous le seuil (0 pour un seuil de 10)",
      origine: "seuil",
      statut: "soumise",
      demandeLe: Date.now() - 10 * JOUR,
      demandeur: "A. Moussavou",
      demandeParMoi: false,
      valideur: null,
      valideLe: null,
      motifRefus: null,
      commande: null,
      quantiteRecue: null,
      recueLe: null,
      ...demande,
    },
    article: { id: "a1", reference: "FR-001", designation: "Semelle de frein composite", unite: "pièce", fournisseur: "Faiveley", delaiApproJours: 45 },
    atelier: { id: "at1", code: "OWE", nom: "Atelier d'Owendo" },
    stock: { quantite: 0, seuilReappro: 10, quantiteReappro: 20 },
    ot: null,
    chronologie: [],
  } as unknown as DossierAchat
}

beforeEach(() => {
  etat.donnees = {}
})

describe("GMAO · actions sur une demande d'achat", () => {
  it("le demandeur ne valide pas sa propre demande", () => {
    expect(actionsAchat({ statut: "soumise", peut: avec(TOUTES), demandeParMoi: false })).toEqual({ principale: "valider", autres: ["refuser", "annuler"], separationTaches: false })
    expect(actionsAchat({ statut: "soumise", peut: avec(TOUTES), demandeParMoi: true })).toEqual({ principale: null, autres: ["refuser", "annuler"], separationTaches: true })
  })

  it("enchaîne commande puis réception, puis plus rien", () => {
    expect(actionsAchat({ statut: "validee", peut: avec(TOUTES), demandeParMoi: true }).principale).toBe("commander")
    expect(actionsAchat({ statut: "commandee", peut: avec(TOUTES), demandeParMoi: false }).principale).toBe("receptionner")
    expect(actionsAchat({ statut: "commandee", peut: avec(["achat_valider"]), demandeParMoi: false }).principale).toBeNull()
    for (const statut of ["recue", "refusee", "annulee"] as const) {
      expect(actionsAchat({ statut, peut: avec(TOUTES), demandeParMoi: false })).toEqual({ principale: null, autres: [], separationTaches: false })
    }
  })
})

describe("GMAO · dossier d'achat", () => {
  it("dit que la commande est simulée et propose la réception", () => {
    const livraison = Date.now() - 2 * JOUR
    etat.donnees = {
      droits: droits(TOUTES),
      demandeAchat: dossierAchat({
        statut: "commandee",
        commande: { numero: "CF-2026-0003", fournisseur: "Faiveley", passeeLe: Date.now() - 47 * JOUR, livraisonPrevueLe: livraison, simulee: true },
      }),
    }
    render(<DossierAchatEcran demandeId="d1" />)
    expect(screen.getByText(MENTION_COMMANDE_SIMULEE)).toBeInTheDocument()
    expect(MENTION_COMMANDE_SIMULEE).toBe("Commande simulée : aucun système achats n'est raccordé.")
    expect(screen.getByText("CF-2026-0003")).toBeInTheDocument()
    expect(screen.getAllByText("Livraison en retard").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Réceptionner" })).toBeInTheDocument()
    expect(screen.getByText("Rupture")).toBeInTheDocument()
  })

  it("explique la séparation des tâches au demandeur au lieu du bouton de validation", () => {
    etat.donnees = { droits: droits(TOUTES), demandeAchat: dossierAchat({ demandeParMoi: true }) }
    render(<DossierAchatEcran demandeId="d1" />)
    expect(screen.getByText("Séparation des tâches : un autre agent valide cette demande")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Valider la demande" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Refuser" })).toBeInTheDocument()
  })

  it("signale une livraison partielle", () => {
    etat.donnees = {
      droits: droits(TOUTES),
      demandeAchat: dossierAchat({
        statut: "recue",
        quantiteRecue: 12,
        recueLe: Date.now(),
        commande: { numero: "CF-2026-0004", fournisseur: "Faiveley", passeeLe: Date.now() - 50 * JOUR, livraisonPrevueLe: Date.now() - 5 * JOUR, simulee: true },
      }),
    }
    render(<DossierAchatEcran demandeId="d1" />)
    expect(screen.getByText("Livraison partielle")).toBeInTheDocument()
    expect(screen.queryByText("Livraison en retard")).not.toBeInTheDocument()
  })
})

describe("GMAO · liste des achats", () => {
  it("écrit la livraison en retard d'une commande non reçue", () => {
    const maintenant = Date.now()
    expect(livraisonEnRetard({ statut: "commandee", livraisonPrevueLe: maintenant - JOUR }, maintenant)).toBe(true)
    expect(livraisonEnRetard({ statut: "recue", livraisonPrevueLe: maintenant - JOUR }, maintenant)).toBe(false)

    const ligne = {
      id: "d1",
      numero: "DA-2026-0007",
      articleId: "a1",
      reference: "FR-001",
      designation: "Semelle de frein composite",
      unite: "pièce",
      atelier: "OWE",
      quantite: 20,
      montantFcfa: 360_000,
      origine: "seuil",
      statut: "commandee",
      demandeLe: maintenant - 50 * JOUR,
      demandeur: "A. Moussavou",
      livraisonPrevueLe: maintenant - 3 * JOUR,
      commandeNumero: "CF-2026-0003",
    } as LigneAchat
    etat.donnees = { droits: droits(TOUTES), demandesAchat: [ligne] }
    render(<EcranAchats />)
    expect(affiches("Livraison en retard")).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Demander un achat" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Exporter \(1\)/ })).toBeInTheDocument()
  })
})
