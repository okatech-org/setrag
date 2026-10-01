import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { getFunctionName, type FunctionReference } from "convex/server"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ListeAgents } from "./agents"
import { DossierVisite } from "./aptitude"
import { DossierPeriode } from "./paie"

const { reponses, mutation } = vi.hoisted(() => ({
  reponses: new Map<string, unknown>(),
  mutation: vi.fn(),
}))

vi.mock("@workspace/api/hooks", () => ({
  useQuery: (reference: FunctionReference<"query">, args: unknown) => (args === "skip" ? undefined : reponses.get(getFunctionName(reference))),
  useMutation: () => mutation,
}))

vi.mock("@/coquille/coquille-agent", () => ({
  CoquilleAgent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/portal-guard", () => ({
  usePortalSession: () => ({ profile: { user: { _id: "u1", role: "gestionnaire_paie", firstName: "Démo", lastName: "Paie" } } }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/rh",
  useSearchParams: () => new URLSearchParams(),
}))

function acces(capacites: string[], lectureSeule = false) {
  reponses.set("modules/rh/accueil:monAcces", { nom: "Démo", role: "gestionnaire_paie", capacites, lectureSeule })
}

const agent = {
  _id: "a1",
  matricule: "SET-00042",
  nom: "OBAME",
  prenom: "Guy-Roger",
  nomComplet: "Guy-Roger OBAME",
  sexe: "M",
  direction: "DEF",
  metier: "conducteur_ligne",
  poste: "Conducteur de ligne",
  gareCode: "OWE",
  gareNom: "Owendo",
  categorie: "maitrise",
  echelon: 4,
  contrat: "cdi",
  dateEmbauche: "2015-02-01",
  ancienneteAnnees: 11,
  statut: "actif",
  aCompte: false,
  aptitude: { etat: "a_renouveler", valideJusquau: "2026-11-02" },
  habilitationsEnAlerte: 1,
}

describe("écrans RH", () => {
  beforeEach(() => {
    reponses.clear()
    mutation.mockReset()
  })

  it("liste le personnel avec export, et ne propose l'embauche qu'au service du personnel", () => {
    acces(["dossiers.lire", "dossiers.gerer", "aptitude.lire"])
    reponses.set("modules/rh/agents:lister", [agent])
    const { unmount } = render(<ListeAgents />)
    expect(screen.getByText("Guy-Roger OBAME")).toBeInTheDocument()
    expect(screen.getByText("À renouveler")).toBeInTheDocument()
    expect(screen.getByText("1 à échéance")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Exporter \(1\)/ })).toBeEnabled()
    expect(screen.getByRole("button", { name: /Enregistrer une embauche/ })).toBeInTheDocument()
    unmount()

    acces(["dossiers.lire", "roulements.lire", "roulements.planifier"])
    render(<ListeAgents />)
    expect(screen.queryByRole("button", { name: /Enregistrer une embauche/ })).not.toBeInTheDocument()
  })

  it("ne montre jamais le volet médical hors du service de santé", () => {
    acces(["aptitude.lire", "dossiers.lire"])
    reponses.set("modules/rh/aptitude:visite", {
      visite: { _id: "v1", numero: "VM-2026-0007", type: "periodique", statut: "realisee", dateProgrammee: "2026-09-12", lieu: "Centre médical SETRAG — Owendo", resultat: "apte_restriction", restrictionFonctionnelle: "Pas de conduite de nuit", valideJusquau: "2027-09-12", realiseeLe: Date.UTC(2026, 8, 12, 9) },
      agent: { _id: "a1", matricule: "SET-00042", nomComplet: "Guy-Roger OBAME", metier: "conducteur_ligne", metierLibelle: "Conducteur de ligne", posteSecurite: true, gareNom: "Owendo", statut: "actif" },
      aptitudeCourante: { etat: "apte_restriction", valideJusquau: "2027-09-12", restrictionFonctionnelle: "Pas de conduite de nuit" },
      periodiciteMois: 12,
      examensSaisis: null,
      historique: [],
      chronologie: [],
      lieux: ["Centre médical SETRAG — Owendo"],
    })
    render(<DossierVisite visiteId="v1" />)
    expect(screen.getAllByText("Pas de conduite de nuit").length).toBeGreaterThan(0)
    expect(screen.getByText(/qu'au médecin et à l'infirmier du travail/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Ouvrir le dossier médical/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Prononcer/ })).not.toBeInTheDocument()
  })

  it("ouvre le dossier médical sur demande, consultation tracée par le serveur", async () => {
    acces(["aptitude.lire", "medical.detail", "medical.programmer", "medical.prononcer"])
    reponses.set("modules/rh/aptitude:visite", {
      visite: { _id: "v1", numero: "VM-2026-0007", type: "periodique", statut: "programmee", dateProgrammee: "2020-01-01", lieu: "Centre médical SETRAG — Owendo" },
      agent: { _id: "a1", matricule: "SET-00042", nomComplet: "Guy-Roger OBAME", metier: "conducteur_ligne", metierLibelle: "Conducteur de ligne", posteSecurite: true, gareNom: "Owendo", statut: "actif" },
      aptitudeCourante: { etat: "a_renouveler" },
      periodiciteMois: 12,
      examensSaisis: true,
      historique: [],
      chronologie: [],
      lieux: ["Centre médical SETRAG — Owendo"],
    })
    mutation.mockResolvedValue([{ _id: "e1", observations: "Hypertension débutante", saisiParNom: "Inf. Prisca", saisiLe: Date.UTC(2026, 8, 1), visite: null }])
    render(<DossierVisite visiteId="v1" />)
    expect(screen.getByRole("button", { name: /Prononcer l'aptitude/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Ouvrir le dossier médical/ }))
    await waitFor(() => expect(screen.getByText("Hypertension débutante")).toBeInTheDocument())
    expect(mutation).toHaveBeenCalledWith({ agentId: "a1" })
  })

  it("réserve la validation de la paie à une autre personne que le service paie", () => {
    const periode = {
      periode: { _id: "p1", code: "2026-09", libelle: "Septembre 2026", debut: "2026-09-01", fin: "2026-09-30", statut: "calculee", calculeePar: "u1", calculeeParNom: "Démo Paie", totaux: { effectif: 1, brut: 700_000, net: 560_000, cnssSalarie: 17_500, cnssPatronal: 112_000, cnamgsSalarie: 14_000, cnamgsPatronal: 28_700, irpp: 40_000, tcs: 35_000, coutEmployeur: 840_700 } },
      parametres: { code: "GA-PAIE-2026.1", libelle: "Paie Gabon 2026" },
      effectifPayable: 1,
      variablesSaisies: 0,
      bulletins: [],
      declarations: [],
      chronologie: [],
      peutValider: false,
    }
    reponses.set("modules/rh/paie:periode", periode)
    acces(["paie.lire", "paie.preparer", "declarations.lire"])
    const { unmount } = render(<DossierPeriode periodeId="p1" />)
    expect(screen.getByText("En attente de validation")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Valider la paie/ })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Recalculer/ })).toBeInTheDocument()
    unmount()

    acces(["paie.lire", "paie.preparer", "paie.valider", "declarations.lire"])
    render(<DossierPeriode periodeId="p1" />)
    expect(screen.getByRole("button", { name: /Valider la paie/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Renvoyer à la saisie/ })).toBeInTheDocument()
  })
})
