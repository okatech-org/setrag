import { render, screen, within } from "@testing-library/react"
import { getFunctionName } from "convex/server"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const etat = vi.hoisted(() => ({
  donnees: {} as Record<string, unknown>,
  capacites: [] as string[],
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/materiel/visites",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@workspace/api/hooks", () => ({
  useQuery: (ref: never, args: unknown) => {
    if (args === "skip") return undefined
    const nom = getFunctionName(ref)
    if (nom.endsWith(":droits")) return { capacites: etat.capacites, peutEcrire: true, role: "visiteur_rames", utilisateurId: "u1" }
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

import { BulletinVisite } from "./bulletin-visite"
import { aptitudesAdmises } from "./decision"
import { BulletinImprimable } from "./impression-visite"
import { PageVisites } from "./visites"

const DEPART = Date.parse("2026-10-01T07:40:00+01:00")

const visiteEnCours = {
  visite: {
    id: "v1",
    numero: "VT-2026-0012",
    convoi: "402",
    statut: "en_cours",
    aptitude: null,
    observations: null,
    debutLe: DEPART - 3_600_000,
    signeeLe: null,
    visiteur: "J. Moussavou",
    controles: [
      { code: "freins", libelle: "Essai de frein", resultat: "defaut" },
      { code: "attelage", libelle: "Attelages et tampons", resultat: "ok" },
    ],
    defauts: [{ index: 0, equipementId: "e1", organe: "Semelle de frein", description: "Semelle usée à la limite", gravite: "bloquant", numeroEngin: "CC 2201" }],
  },
  atelier: { id: "a1", nom: "Atelier d'Owendo" },
  trajet: { id: "t1", train: "402", serviceDate: "2026-10-01", departureAt: DEPART, statut: "planifie" },
  engins: [{ id: "e1", numero: "CC 2201", famille: "locomotive", serie: "GT26", statut: "immobilise" }],
  decision: {
    autorise: false,
    motifs: ["La visite avant départ n'est pas signée.", "CC 2201 est immobilisé."],
    aptitude: null,
  },
  ordres: [],
  chronologie: [],
}

beforeEach(() => {
  etat.donnees = {}
  etat.capacites = []
})

describe("visites avant départ", () => {
  it("écrit la décision de départ bloquée et ses motifs en tête du bulletin", () => {
    etat.capacites = ["visite_signer"]
    etat.donnees["modules/gmao/queries:visite"] = visiteEnCours
    render(<BulletinVisite visiteId="v1" />)

    const bandeau = screen.getByRole("alert")
    expect(bandeau).toHaveTextContent("Départ bloqué")
    expect(bandeau).toHaveTextContent("La visite avant départ n'est pas signée.")
    expect(bandeau).toHaveTextContent("CC 2201 est immobilisé.")

    // Check-list éditable tant que la visite est en cours.
    expect(screen.getByRole("radiogroup", { name: "Essai de frein" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Signer la visite" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Imprimer le bulletin" })).toHaveAttribute("href", "/materiel/visites/v1/impression")
    expect(screen.getByText("Bloquant")).toBeInTheDocument()
  })

  it("fige le bulletin signé et masque les actions sans capacité", () => {
    etat.donnees["modules/gmao/queries:visite"] = {
      ...visiteEnCours,
      visite: { ...visiteEnCours.visite, statut: "signee", aptitude: "apte", signeeLe: DEPART - 600_000, defauts: [] },
      engins: [{ ...visiteEnCours.engins[0], statut: "en_service" }],
      decision: { autorise: true, motifs: [], aptitude: "apte" },
    }
    render(<BulletinVisite visiteId="v1" />)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.getAllByText("Départ autorisé").length).toBeGreaterThan(0)
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Signer la visite" })).not.toBeInTheDocument()
    expect(screen.getByText("Conforme")).toBeInTheDocument()
  })

  it("liste les départs du jour avec la décision écrite en toutes lettres", () => {
    etat.capacites = ["visite_signer"]
    etat.donnees["modules/gmao/queries:departs"] = [
      {
        tripId: "t1",
        train: "402",
        departureAt: DEPART,
        origine: "Owendo",
        destination: "Franceville",
        statutTrajet: "planifie",
        visite: null,
        decision: { autorise: false, motifs: ["Aucune visite technique avant départ."], aptitude: null },
      },
      {
        tripId: "t2",
        train: "404",
        departureAt: DEPART + 3_600_000,
        origine: "Owendo",
        destination: "Ndjolé",
        statutTrajet: "planifie",
        visite: { id: "v2", numero: "VT-2026-0013", statut: "signee" },
        decision: { autorise: true, motifs: [], aptitude: "apte" },
      },
    ]
    etat.donnees["modules/gmao/queries:visites"] = []
    render(<PageVisites />)

    const departs = within(screen.getByRole("table", { name: /^Départs du/ }))
    expect(departs.getByText("Départ bloqué")).toBeInTheDocument()
    expect(departs.getByText("Aucune visite technique avant départ.")).toBeInTheDocument()
    expect(departs.getByText("Départ autorisé")).toBeInTheDocument()
    expect(departs.getByRole("button", { name: "Ouvrir la visite" })).toBeInTheDocument()
    expect(departs.getByRole("link", { name: "VT-2026-0013" })).toHaveAttribute("href", "/materiel/visites/v2")
    expect(screen.getByRole("button", { name: "Ouvrir une visite" })).toBeInTheDocument()
    expect(screen.getByText("Aucune visite enregistrée")).toBeInTheDocument()
  })

  it("masque l'ouverture de visite sans la capacité visite_signer", () => {
    etat.donnees["modules/gmao/queries:departs"] = []
    etat.donnees["modules/gmao/queries:visites"] = []
    render(<PageVisites />)
    expect(screen.queryByRole("button", { name: "Ouvrir une visite" })).not.toBeInTheDocument()
    expect(screen.getByText("Aucun départ ce jour")).toBeInTheDocument()
  })

  it("imprime un bulletin lisible sans couleur, décision écrite", () => {
    vi.useFakeTimers()
    const imprimer = vi.spyOn(window, "print").mockImplementation(() => {})
    etat.donnees["modules/gmao/queries:visite"] = visiteEnCours
    render(<BulletinImprimable visiteId="v1" />)
    expect(screen.getByText("Départ bloqué")).toBeInTheDocument()
    expect(screen.getByText("CC 2201 est immobilisé.")).toBeInTheDocument()
    expect(screen.getByText("Défaut")).toBeInTheDocument()
    vi.advanceTimersByTime(500)
    expect(imprimer).toHaveBeenCalledTimes(1)
    imprimer.mockRestore()
    vi.useRealTimers()
  })

  it("ne propose jamais une aptitude plus favorable que les défauts", () => {
    expect(aptitudesAdmises([{ gravite: "bloquant" }, { gravite: "mineur" }])).toEqual(["inapte"])
    expect(aptitudesAdmises([{ gravite: "majeur" }])).toEqual(["apte_sous_reserve", "inapte"])
    expect(aptitudesAdmises([])).toEqual(["apte", "apte_sous_reserve", "inapte"])
  })
})
