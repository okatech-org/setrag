import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { InspectionRapport } from "./inspection"
import { OuvragesEcran } from "./ouvrages"

const etat = vi.hoisted(() => ({
  reponses: new Map<string, unknown>(),
  mutation: vi.fn(),
  session: null as null | { profile: { user: { _id: string } } },
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/infrastructures/ouvrages",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

vi.mock("@/components/portal-guard", () => ({ usePortalSession: () => etat.session }))

const Q = "modules/infrastructure/queries"

function droits(capacites: string[]) {
  etat.reponses.set(`${Q}:droits`, { peutEcrire: capacites.length > 0, capacites, partenaire: false, role: "chef_district_voie" })
}

const ouvrage = {
  id: "ouvrage-1",
  code: "OA-278",
  nom: "Pont sur l'Ogooué",
  type: "pont",
  typeLibelle: "Pont",
  pk: 278.1,
  sectionId: null,
  sectionLibelle: "Ndjolé – Booué",
  longueurM: 240,
  materiau: "Acier",
  anneeConstruction: 1983,
  franchissement: "Ogooué",
  cotation: "2E",
  cotationLibelle: "2E — défauts à surveiller, évolution possible",
  surveillanceRenforcee: true,
  periodiciteMois: 6,
  derniereInspectionLe: Date.parse("2025-09-01T12:00:00Z"),
  prochaineInspectionLe: Date.parse("2026-03-01T12:00:00Z"),
  inspectionEnRetard: true,
  anomaliesOuvertes: 1,
  majLe: Date.parse("2026-09-01T12:00:00Z"),
}

const dossierInspection = {
  inspection: {
    id: "inspection-1",
    numero: "INS-2026-0012",
    type: "inspection_detaillee",
    typeLibelle: "Inspection détaillée",
    dateInspection: Date.parse("2026-09-20T12:00:00Z"),
    inspecteurId: "agent-inspecteur",
    inspecteurNom: "Paul Ndong",
    constats: "Corrosion des appareils d'appui de la pile P2.",
    desordres: [{ partie: "Pile P2", description: "Corrosion avancée des appareils d'appui", gravite: "elevee", graviteLibelle: "Élevée" }],
    cotationAvant: "2E",
    cotationAvantLibelle: "2E — défauts à surveiller, évolution possible",
    cotationProposee: "3",
    cotationProposeeLibelle: "3 — structure altérée, travaux à programmer",
    surveillanceRenforceeProposee: true,
    periodiciteProposeeMois: 6,
    recommandations: "Remplacer les appareils d'appui avant la saison des pluies.",
    statut: "brouillon",
    statutLibelle: "Brouillon",
    valideParId: null,
    valideParNom: null,
    valideLe: null,
    creeLe: Date.parse("2026-09-21T09:00:00Z"),
  },
  ouvrage,
  chronologie: [{ id: "evt-1", type: "inspection_redigee", libelle: "Inspection INS-2026-0012 rédigée (brouillon)", detail: null, auteurNom: "Paul Ndong", creeLe: Date.parse("2026-09-21T09:00:00Z") }],
}

beforeEach(() => {
  etat.reponses.clear()
  etat.session = null
  etat.mutation.mockReset()
})

describe("inventaire des ouvrages", () => {
  it("écrit la cotation, la surveillance renforcée et le retard d'inspection", () => {
    droits([])
    etat.reponses.set(`${Q}:ouvrages`, [ouvrage])
    render(<OuvragesEcran />)
    const ligne = within(screen.getByRole("table", { name: "Inventaire des ouvrages d'art" })).getByText("OA-278").closest("tr")!
    expect(within(ligne).getByText("IQOA 2E")).toBeInTheDocument()
    expect(within(ligne).getByText("Surveillance renforcée")).toBeInTheDocument()
    expect(within(ligne).getByText("Inspection en retard")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Ajouter un ouvrage/ })).not.toBeInTheDocument()
  })
})

describe("rapport d'inspection", () => {
  it("masque la validation sans la capacité inspection_valider", () => {
    droits(["ouvrage_inspecter"])
    etat.reponses.set(`${Q}:inspection`, dossierInspection)
    render(<InspectionRapport inspectionId="inspection-1" />)
    expect(screen.getByRole("heading", { name: "Inspection INS-2026-0012" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Valider l.inspection/ })).not.toBeInTheDocument()
    expect(screen.getByText("Pile P2")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Imprimer le rapport/ })).toHaveAttribute("href", "/infrastructures/ouvrages/inspections/inspection-1/impression")
  })

  it("propose la validation au valideur et affiche le refus du serveur", async () => {
    droits(["inspection_valider"])
    etat.session = { profile: { user: { _id: "agent-inspecteur" } } }
    etat.reponses.set(`${Q}:inspection`, dossierInspection)
    etat.mutation.mockRejectedValue(new Error("[CONVEX M(modules/infrastructure/mutations:validerInspection)] Uncaught Error: Séparation des tâches : l'inspecteur ne peut pas valider sa propre inspection.\n    at handler"))
    render(<InspectionRapport inspectionId="inspection-1" />)

    expect(screen.getByText("Vous êtes l'inspecteur de ce rapport.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Valider l.inspection/ }))
    const fenetre = await screen.findByRole("dialog")
    fireEvent.click(within(fenetre).getByRole("button", { name: /Valider l.inspection/ }))
    await waitFor(() => expect(etat.mutation).toHaveBeenCalledWith({ inspectionId: "inspection-1" }))
    expect((await screen.findAllByText("Séparation des tâches : l'inspecteur ne peut pas valider sa propre inspection.")).length).toBeGreaterThan(0)
  })

  it("ne propose plus rien sur une inspection validée", () => {
    droits(["inspection_valider", "ouvrage_inspecter"])
    etat.reponses.set(`${Q}:inspection`, { ...dossierInspection, inspection: { ...dossierInspection.inspection, statut: "validee", statutLibelle: "Validée", valideParNom: "Awa Moussavou", valideLe: Date.parse("2026-09-25T10:00:00Z") } })
    render(<InspectionRapport inspectionId="inspection-1" />)
    expect(screen.queryByRole("button", { name: /Valider l.inspection/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Modifier/ })).not.toBeInTheDocument()
  })
})
