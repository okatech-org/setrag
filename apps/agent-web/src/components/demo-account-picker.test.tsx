import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  DemoAccountPicker,
  filterDemoAccounts,
  groupDemoAccounts,
  moduleLabelForCode,
  type DemoAccount,
} from "./demo-account-picker"

const accounts: readonly DemoAccount[] = [
  {
    key: "chef-gare",
    label: "Chef de gare",
    description: "Supervision opérationnelle · Owendo",
    email: "chef.gare@setrag.ga",
    password: "secret-chef",
    actorType: "interne",
    group: "exploitation",
    groupLabel: "Exploitation ferroviaire",
    role: "chef_gare",
    landingPath: "/cotraf",
    moduleCodes: ["cotraf", "voyageurs"],
  },
  {
    key: "mainteneur",
    label: "Technicien matériel roulant",
    description: "Maintenance des locomotives",
    email: "mainteneur@setrag.ga",
    password: "secret-maintenance",
    actorType: "interne",
    group: "maintenance",
    groupLabel: "Maintenance & infrastructures",
    role: "mainteneur",
    landingPath: "/materiel",
    moduleCodes: ["gmao", "infrastructure"],
  },
  {
    key: "comilog",
    label: "Chargeur minier COMILOG",
    description: "Suivi des expéditions minières",
    email: "comilog@example.ga",
    password: "secret-client",
    actorType: "externe",
    group: "clients",
    groupLabel: "Clients fret & logistique",
    role: "chargeur_minier",
    landingPath: "/fret",
    moduleCodes: ["fret"],
  },
]

const documentedInternalFunctions = {
  Gouvernance: ["Direction générale", "Audit & risques", "Affaires juridiques"],
  DEF: [
    "Régulateur du COTRAF",
    "Chef de gare",
    "Conducteur de ligne",
    "Mécanicien de train",
    "Chef de train",
    "Contrôleur",
    "Agent de visite technique",
    "Visiteur de rames",
  ],
  DMAT: [
    "Ingénieur d’atelier",
    "Contremaître d’atelier",
    "Gestionnaire de stocks",
    "Magasinier pièces de rechange",
    "Mainteneur locomotives",
    "Mainteneur wagons",
  ],
  DINFRA: [
    "Agent de brigade de voie",
    "Cantonnier",
    "Agent du PRN",
    "Chef de travaux PRN",
    "Technicien télécoms",
    "Technicien signalisation",
    "Mainteneur passages à niveau",
    "Agent ouvrages et ponts",
  ],
  DCFV: [
    "Guichetier",
    "Chef de vente",
    "Gestionnaire grand compte fret",
    "Agent de billetterie",
    "Caissier",
    "Chargé des litiges fret",
  ],
  DFC: [
    "Comptable général",
    "Comptable auxiliaire",
    "Fiscaliste",
    "Trésorier",
    "Comptable fournisseurs",
    "Comptable clients",
  ],
  DRH: [
    "Gestionnaire de paie gabonaise",
    "Planificateur des roulements ferroviaires",
    "Médecin du travail",
    "Infirmier du travail",
    "Gestionnaire des habilitations",
    "Chargé des déclarations CNSS & CNAMGS",
  ],
  DSED: [
    "Responsable sécurité des circulations",
    "Enquêteur accidents ferroviaires",
    "Responsable environnement",
    "Chargé du Parc national de la Lopé",
    "Auditeur sécurité ferroviaire",
  ],
} as const

const largeAccountSet: readonly DemoAccount[] = Object.entries(
  documentedInternalFunctions
).flatMap(([groupLabel, labels]) =>
  labels.map((label, index) => ({
    key: `${groupLabel.toLocaleLowerCase()}-${index}`,
    label,
    description: `Fonction interne · ${groupLabel}`,
    email: `${groupLabel.toLocaleLowerCase()}.${index}@setrag.ga`,
    password: `mot-de-passe-volumetrie-${index}`,
    actorType: "interne" as const,
    group: groupLabel.toLocaleLowerCase(),
    groupLabel,
    role: `role_${groupLabel.toLocaleLowerCase()}_${index}`,
    landingPath: "/gestion",
    moduleCodes: ["ged", "securite"],
  }))
)

function openPicker(props?: {
  pendingAccountKey?: string
  onSelect?: (account: DemoAccount) => void
}) {
  const onSelect = props?.onSelect ?? vi.fn()
  render(
    <DemoAccountPicker
      accounts={accounts}
      pendingAccountKey={props?.pendingAccountKey}
      onSelect={onSelect}
    />
  )
  fireEvent.click(screen.getByRole("button", { name: "Comptes démo" }))
  return onSelect
}

describe("filtrage et groupement des comptes de démonstration", () => {
  it("recherche sans tenir compte des accents dans les modules et les groupes", () => {
    expect(filterDemoAccounts(accounts, "materiel", "all")).toEqual([
      accounts[1],
    ])
    expect(filterDemoAccounts(accounts, "logistique", "externe")).toEqual([
      accounts[2],
    ])
    expect(filterDemoAccounts(accounts, "owendo", "externe")).toEqual([])
  })

  it("préserve l’ordre des groupes et prend en charge un compte historique", () => {
    const legacyAccount: DemoAccount = {
      key: "agent",
      label: "Compte agent",
      description: "Vente au guichet",
      email: "agent@setrag.ga",
      password: "secret",
    }

    expect(groupDemoAccounts([...accounts, legacyAccount])).toEqual([
      { label: "Exploitation ferroviaire", accounts: [accounts[0]] },
      { label: "Maintenance & infrastructures", accounts: [accounts[1]] },
      { label: "Clients fret & logistique", accounts: [accounts[2]] },
      { label: "Accès SETRAG", accounts: [legacyAccount] },
    ])
    expect(moduleLabelForCode("gmao")).toBe("Matériel & GMAO")
  })
})

describe("sélecteur de comptes de démonstration", () => {
  it("affiche les compteurs, groupes et libellés français des modules", () => {
    openPicker()

    expect(
      screen.getByRole("heading", { name: "Comptes de démonstration" })
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Tous (3)" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(
      screen.getByRole("button", { name: "Personnel SETRAG (2)" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Parties prenantes (1)" })
    ).toBeInTheDocument()
    expect(screen.getByText("Exploitation ferroviaire")).toBeInTheDocument()
    expect(screen.getByText("Matériel & GMAO")).toBeInTheDocument()
    expect(screen.queryByText("secret-chef")).not.toBeInTheDocument()
  })

  it("filtre par type et par recherche, puis présente un état vide", () => {
    openPicker()

    fireEvent.click(
      screen.getByRole("button", { name: "Parties prenantes (1)" })
    )
    expect(screen.getByText("Chargeur minier COMILOG")).toBeInTheDocument()
    expect(screen.queryByText("Chef de gare")).not.toBeInTheDocument()

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Rechercher un compte de démonstration",
      }),
      { target: { value: "ressources humaines" } }
    )
    expect(screen.getByText("Aucun profil trouvé")).toBeInTheDocument()
  })

  it("désactive les autres profils pendant la connexion du compte choisi", () => {
    openPicker({ pendingAccountKey: "chef-gare" })

    const selected = screen.getByRole("button", {
      name: "Se connecter avec Chef de gare",
    })
    const other = screen.getByRole("button", {
      name: "Se connecter avec Chargeur minier COMILOG",
    })

    expect(selected).toHaveAttribute("aria-busy", "true")
    expect(selected).not.toBeDisabled()
    expect(selected).toHaveTextContent("Connexion…")
    expect(other).toBeDisabled()
  })

  it("transmet le profil complet au callback", () => {
    const onSelect = vi.fn()
    openPicker({ onSelect })

    fireEvent.click(
      screen.getByRole("button", {
        name: "Se connecter avec Chargeur minier COMILOG",
      })
    )
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(accounts[2])
  })

  it("reste navigable et recherche un poste précis parmi plus de 40 fonctions", () => {
    render(<DemoAccountPicker accounts={largeAccountSet} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Comptes démo" }))

    expect(largeAccountSet.length).toBeGreaterThan(40)
    expect(
      screen.getByRole("button", {
        name: `Tous (${largeAccountSet.length})`,
      })
    ).toBeInTheDocument()

    const search = screen.getByRole("searchbox", {
      name: "Rechercher un compte de démonstration",
    })
    fireEvent.change(search, { target: { value: "Infirmier du travail" } })

    const preciseJob = screen.getByRole("button", {
      name: "Se connecter avec Infirmier du travail",
    })
    expect(screen.getByText(/1 profil affiché/)).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Se connecter avec Chef de gare" })
    ).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent("mot-de-passe-volumetrie-")

    search.focus()
    fireEvent.keyDown(search, { key: "ArrowDown" })
    expect(preciseJob).toHaveFocus()
  })
})
