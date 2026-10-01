import { fireEvent, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { EquipementDossier } from "./equipement-dossier"
import { EquipementsEcran } from "./equipements"

const etat = vi.hoisted(() => ({
  reponses: new Map<string, unknown>(),
  mutation: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/infrastructures/equipements",
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

vi.mock("@/components/portal-guard", () => ({ usePortalSession: () => null }))

const Q = "modules/infrastructure/queries"

function droits(capacites: string[]) {
  etat.reponses.set(`${Q}:droits`, { peutEcrire: capacites.length > 0, capacites, partenaire: false, role: "technicien_signalisation" })
}

const base = {
  sectionId: null,
  sectionLibelle: "Owendo – Ntoum",
  alimentation: "Secteur SEEG",
  periodiciteJours: 90,
  notes: null,
  majLe: Date.parse("2026-09-01T12:00:00Z"),
}

const signal = {
  ...base,
  id: "eq-1",
  code: "SIG-NTM-E1",
  libelle: "Signal d'entrée de Ntoum",
  categorie: "signalisation",
  categorieLibelle: "Signalisation",
  type: "Signal d'entrée",
  pk: 38.2,
  pkFin: null,
  etat: "degrade",
  etatLibelle: "Dégradé",
  derniereMaintenanceLe: Date.parse("2026-03-01T12:00:00Z"),
  prochaineMaintenanceLe: Date.parse("2026-05-30T12:00:00Z"),
  maintenanceEnRetard: true,
}

const fibre = {
  ...base,
  id: "eq-2",
  code: "FO-01",
  libelle: "Fibre optique Owendo – Ndjolé",
  categorie: "telecoms",
  categorieLibelle: "Télécommunications",
  type: "Fibre optique",
  pk: 0,
  pkFin: 182,
  etat: "en_service",
  etatLibelle: "En service",
  derniereMaintenanceLe: Date.parse("2026-09-01T12:00:00Z"),
  prochaineMaintenanceLe: Date.parse("2026-11-30T12:00:00Z"),
  maintenanceEnRetard: false,
}

beforeEach(() => {
  etat.reponses.clear()
})

describe("signalisation, passages à niveau et télécoms", () => {
  it("écrit l'état, le retard de maintenance et la plage d'un équipement linéaire", () => {
    droits([])
    etat.reponses.set(`${Q}:equipements`, [signal, fibre])
    render(<EquipementsEcran />)
    const tableau = screen.getByRole("table", { name: "Inventaire des équipements" })
    const ligneSignal = within(tableau).getByText("SIG-NTM-E1").closest("tr")!
    expect(within(ligneSignal).getAllByText("Dégradé").length).toBeGreaterThan(0)
    expect(within(ligneSignal).getByText("Maintenance en retard")).toBeInTheDocument()
    const ligneFibre = within(tableau).getByText("FO-01").closest("tr")!
    expect(within(ligneFibre).getByText("PK 0 → 182")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Ajouter un équipement/ })).not.toBeInTheDocument()
  })

  it("filtre par onglet de catégorie", () => {
    droits(["equipement_telecoms"])
    etat.reponses.set(`${Q}:equipements`, [signal, fibre])
    render(<EquipementsEcran />)
    expect(screen.getByRole("button", { name: /Ajouter un équipement/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("tab", { name: /Télécommunications/ }))
    const tableau = screen.getByRole("table", { name: "Inventaire des équipements" })
    expect(within(tableau).queryByText("SIG-NTM-E1")).not.toBeInTheDocument()
    expect(within(tableau).getByText("FO-01")).toBeInTheDocument()
  })

  it("réserve les gestes du dossier à la capacité de la catégorie", () => {
    droits(["equipement_telecoms"])
    etat.reponses.set(`${Q}:equipement`, {
      equipement: signal,
      anomalies: [],
      chronologie: [{ id: "evt-1", type: "equipement_maintenance", libelle: "Maintenance réalisée, état dégradé", detail: "Lampe rouge à remplacer.", auteurNom: "Luc Obame", creeLe: Date.parse("2026-03-01T12:00:00Z") }],
    })
    render(<EquipementDossier equipementId="eq-1" />)
    expect(screen.queryByRole("button", { name: /Enregistrer une maintenance/ })).not.toBeInTheDocument()
    const historique = screen.getByRole("table", { name: "Maintenances de SIG-NTM-E1" })
    expect(within(historique).getByText("Lampe rouge à remplacer.")).toBeInTheDocument()
  })
})
