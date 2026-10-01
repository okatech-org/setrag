import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { LoginScreen } from "./login-screen"
import { SellerShell } from "./seller-shell"

const push = vi.fn()
const replace = vi.fn()
const vendeur = {
  seller: { id: "user-seller-demo", firstName: "Aly", lastName: "MBOUMBA", matricule: "V-101", role: "vendeur_guichet" },
  pointOfSale: { code: "OWE-PV", name: "Gare d’Owendo Virié · guichet 3", type: "gare", stationName: "Owendo" },
  session: { id: "cash-demo", openedAt: 0, openingFloatXaf: 50_000 },
}

vi.mock("next/navigation", () => ({
  usePathname: () => "/vente",
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@workspace/api/hooks", () => ({
  useQuery: () => undefined,
  useMutation: () => vi.fn().mockResolvedValue({}),
  useAction: () => vi.fn().mockResolvedValue({}),
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    user: null,
  }),
}))

vi.mock("@workspace/api/auth-client", () => ({
  authClient: {
    signIn: { email: vi.fn() },
    signOut: vi.fn(),
  },
}))

describe("AW-00 · connexion", () => {
  it("soumet le compte de repli", async () => {
    const signIn = vi.fn().mockResolvedValue(undefined)
    render(<LoginScreen onPasswordSignIn={signIn} onSsoSignIn={vi.fn()} />)

    fireEvent.change(screen.getByLabelText("Adresse e-mail professionnelle"), {
      target: { value: "agent@setrag.ga" },
    })
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "secret-solide" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Connexion" }))

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith({
        email: "agent@setrag.ga",
        password: "secret-solide",
      })
    )
  })

  it("explique honnêtement un SSO non raccordé", async () => {
    render(
      <LoginScreen
        onPasswordSignIn={vi.fn()}
        onSsoSignIn={vi.fn().mockRejectedValue(new Error("OIDC"))}
      />
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "Se connecter avec mon compte SETRAG",
      })
    )
    expect(
      await screen.findByText(/raccordement Entra ID/i)
    ).toBeInTheDocument()
  })

  it("autorise le libellé SSO à se replier sur petit écran", () => {
    render(<LoginScreen onPasswordSignIn={vi.fn()} onSsoSignIn={vi.fn()} />)
    expect(
      screen.getByRole("button", {
        name: "Se connecter avec mon compte SETRAG",
      })
    ).toHaveClass("whitespace-normal", "min-w-0")
  })
})


describe("structure du portail vendeur", () => {
  it("SellerShell expose le menu du guichet, chaque entrée avec son icône", () => {
    render(
      <SellerShell
        seller={vendeur.seller}
        pointOfSale={vendeur.pointOfSale}
        session={vendeur.session}
        online
      >
        <p>Contenu vendeur</p>
      </SellerShell>
    )
    const menu = screen.getByRole("navigation", { name: "Menu du portail" })
    const entrees = Array.from(menu.querySelectorAll("a"))
    expect(entrees.map((lien) => lien.textContent?.replace(/[A-Z]$/, ""))).toEqual([
      "Accueil",
      "Vendre un billet",
      "Bagage",
      "Colis express",
      "Prestations spéciales",
      "Après-vente",
      "Ventes manuelles",
      "Caisse",
    ])
    // Une entrée sans icône est un oubli : toutes en portent une.
    for (const lien of entrees) expect(lien.querySelector("svg")).not.toBeNull()
    // L'accueil est l'entrée courante.
    expect(screen.getByRole("link", { name: "Accueil" })).toHaveAttribute("aria-current", "page")
    // Le vendeur n'ouvre que le portail de vente.
    expect(screen.queryByRole("link", { name: "Tableau de bord" })).not.toBeInTheDocument()
    expect(screen.getByText("En ligne · synchronisé")).toBeInTheDocument()
    expect(screen.getByText(vendeur.pointOfSale.name)).toBeInTheDocument()
    expect(screen.getByText("Contenu vendeur")).toBeInTheDocument()
  })
})
