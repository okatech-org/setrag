import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { getFunctionName, type FunctionReference } from "convex/server"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TableauDeBord, type TableauSecurite } from "./accueil-securite"
import { EditeurInstruction } from "./enquete-dossier"
import { RegistreEvenements, type LigneRegistre } from "./evenements"

const { etat, mutation } = vi.hoisted(() => ({
  etat: { reponses: {} as Record<string, unknown> },
  mutation: vi.fn(),
}))

vi.mock("@workspace/api/hooks", () => ({
  useQuery: (reference: FunctionReference<"query">, args: unknown) =>
    args === "skip" ? undefined : etat.reponses[getFunctionName(reference)],
  useMutation: () => mutation,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/securite/evenements",
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/components/portal-guard", () => ({
  usePortalSession: () => ({
    profile: {
      user: {
        firstName: "Awa",
        lastName: "Ndong",
        role: "inspecteur_securite",
      },
    },
  }),
}))

vi.mock("@/coquille/coquille-agent", () => ({
  CoquilleAgent: ({
    children,
    rubriques,
  }: {
    children: ReactNode
    rubriques?: (options: { onNavigate: () => void }) => ReactNode
  }) => (
    <div>
      {rubriques?.({ onNavigate: () => {} })}
      <main>{children}</main>
    </div>
  ),
}))

const ACCES = "modules/securite/accueil:monAcces"
const REGISTRE = "modules/securite/evenements:lister"
const INCIDENTS = "modules/securite/evenements:incidentsAQualifier"

function acces(capacites: string[], lectureSeule = false) {
  return {
    nom: "Awa Ndong",
    role: "inspecteur_securite",
    interne: true,
    capacites,
    lectureSeule,
  }
}

const EVENEMENTS: LigneRegistre[] = [
  {
    _id: "evt-1" as LigneRegistre["_id"],
    numero: "EVS-2026-0001",
    type: "heurt_animal",
    famille: "circulation",
    gravite: "significatif",
    survenuLe: Date.UTC(2026, 8, 12, 4, 30),
    lieu: "PK 258,4",
    gareCode: undefined,
    gareNom: undefined,
    pk: 258.4,
    zoneLope: true,
    trainNumber: "V3",
    statut: "qualifie",
    blesses: 0,
    deces: 0,
    notificationRequise: false,
    enquete: null,
    actionsOuvertes: 1,
    actionsEnRetard: 0,
    notification: null,
  },
  {
    _id: "evt-2" as LigneRegistre["_id"],
    numero: "EVS-2026-0002",
    type: "deraillement",
    famille: "circulation",
    gravite: "grave",
    survenuLe: Date.UTC(2026, 8, 20, 14, 5),
    lieu: "Gare de Ndjolé",
    gareCode: "NDJ",
    gareNom: "Ndjolé",
    pk: 182,
    zoneLope: false,
    trainNumber: "M12",
    statut: "en_enquete",
    blesses: 1,
    deces: 0,
    notificationRequise: true,
    enquete: {
      _id: "enq-1" as NonNullable<LigneRegistre["enquete"]>["_id"],
      numero: "ENQ-2026-001",
      statut: "instruction",
    },
    actionsOuvertes: 0,
    actionsEnRetard: 0,
    notification: {
      statut: "a_preparer",
      echeance: Date.UTC(2026, 8, 23, 14, 5),
    },
  },
]

describe("module Sécurité", () => {
  beforeEach(() => {
    etat.reponses = {}
    mutation.mockReset()
    mutation.mockResolvedValue(undefined)
  })

  it("rend le registre des événements avec ses filtres et son export", () => {
    etat.reponses = {
      [ACCES]: acces([
        "indicateurs",
        "registre.lire",
        "artf.lire",
        "environnement.lire",
        "evenement.declarer",
        "evenement.qualifier",
      ]),
      [REGISTRE]: EVENEMENTS,
      [INCIDENTS]: [],
    }
    render(<RegistreEvenements />)

    const tableau = screen.getByRole("table", {
      name: "Registre des événements de sécurité",
    })
    expect(within(tableau).getByText("EVS-2026-0001")).toBeInTheDocument()
    expect(within(tableau).getByText("Déraillement")).toBeInTheDocument()
    // Le retard de notification s'écrit en toutes lettres, pas seulement en couleur.
    expect(within(tableau).getByText("En retard")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Exporter \(2\)/ })).toBeEnabled()
    expect(
      screen.getByRole("button", { name: "Déclarer un événement" })
    ).toBeInTheDocument()

    fireEvent.change(screen.getByRole("combobox", { name: /^Gravité/ }), {
      target: { value: "grave" },
    })
    expect(screen.getByRole("button", { name: /Exporter \(1\)/ })).toBeEnabled()
    expect(
      within(screen.getByRole("table")).queryByText("EVS-2026-0001")
    ).not.toBeInTheDocument()
  })

  it("masque les actions et les rubriques que le profil n'a pas", () => {
    etat.reponses = {
      [ACCES]: acces(["indicateurs", "registre.lire"], true),
      [REGISTRE]: EVENEMENTS,
    }
    render(<RegistreEvenements />)

    expect(
      screen.getByRole("table", { name: "Registre des événements de sécurité" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Déclarer un événement" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("Incidents du terrain à qualifier")
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        /votre profil lit le registre de sécurité sans pouvoir le modifier/
      )
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Registre des événements" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: "Déclarations ARTF" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: "Environnement · Lopé" })
    ).not.toBeInTheDocument()
  })

  it("n'interroge pas le registre sans le droit de le lire", () => {
    etat.reponses = {
      [ACCES]: acces(["indicateurs"], true),
      [REGISTRE]: EVENEMENTS,
    }
    render(<RegistreEvenements />)

    expect(screen.getByText(/ne consulte pas le registre/)).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("éditeur d'enquête : ajoute une cause, désigne la cause racine et enregistre", async () => {
    const enregistrer = vi.fn().mockResolvedValue({ manques: [] })
    render(
      <EditeurInstruction
        initial={{ causes: [], recommandations: [] }}
        onEnregistrer={enregistrer}
        onSoumettre={vi.fn()}
      />
    )

    expect(screen.getByText("au moins une cause")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une cause" }))

    const description = screen.getByLabelText("Description de la cause n° 1")
    fireEvent.change(description, {
      target: { value: "Clôture du parc dégradée au PK 258" },
    })
    fireEvent.change(screen.getByLabelText("Catégorie de la cause n° 1"), {
      target: { value: "infrastructure" },
    })
    expect(screen.queryByText("au moins une cause")).not.toBeInTheDocument()

    const racine = screen.getByRole("checkbox", { name: "Cause racine" })
    expect(racine).toBeChecked()
    fireEvent.click(racine)
    expect(screen.getByText("la cause racine")).toBeInTheDocument()
    fireEvent.click(racine)
    expect(screen.queryByText("la cause racine")).not.toBeInTheDocument()
    expect(
      screen.getByText("Modifications non enregistrées.")
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: /Enregistrer l'instruction/ })
    )
    await waitFor(() => expect(enregistrer).toHaveBeenCalledTimes(1))
    expect(enregistrer).toHaveBeenCalledWith({
      constats: undefined,
      causes: [
        {
          categorie: "infrastructure",
          description: "Clôture du parc dégradée au PK 258",
          racine: true,
        },
      ],
      recommandations: [],
      conclusion: undefined,
    })
    expect(
      await screen.findByText("Instruction enregistrée")
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: "Retirer la cause n° 1" })
    )
    expect(screen.getByText("au moins une cause")).toBeInTheDocument()
  })

  it("explique un taux pour mille non calculable plutôt que d'afficher zéro", () => {
    etat.reponses = { [ACCES]: acces(["indicateurs"], true) }
    const tableau = {
      aujourdhui: "2026-10-01",
      evenements12Mois: 3,
      parGravite: { mineur: 1, significatif: 1, grave: 1, majeur: 0 },
      parFamille: { circulation: 2, personnel: 0, environnement: 1, surete: 0 },
      parMois: [{ mois: "2026-09", nombre: 3, graves: 1 }],
      victimes: { blesses: 1, deces: 0 },
      circulations12Mois: 0,
      tauxPourMille: null,
      joursSansEvenementGrave: null,
      enquetes: { ouvertes: 1, enRetard: 0, aCloturer: 0 },
      actions: { ouvertes: 2, aVerifier: 0, enRetard: 1, verifiees: 0 },
      artf: {
        aTransmettre: 1,
        enRetard: 1,
        transmises12Mois: 0,
        horsDelai12Mois: 0,
        bilanAPreparer: null,
      },
      inspections: { aVenir30Jours: 0, enRetard: 0, ncSansAction: 0 },
      listes: null,
    } satisfies TableauSecurite
    render(<TableauDeBord tableau={tableau} bilan={null} />)

    expect(
      screen.getByText(
        "Non calculable : aucune circulation enregistrée sur 12 mois"
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText("Aucun événement grave au registre")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("list", { name: "Événements par gravité" })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Votre profil consulte les indicateurs consolidés/)
    ).toBeInTheDocument()
  })
})
