import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  closeDb,
  DB_NAME,
  lireEtat,
  listerDossiers,
  openDb,
  remplacerDossiers,
} from "@/lib/offline/db"
import type { Dossier } from "@/lib/offline/types"

const { authState, convexQuery, queryState } = vi.hoisted(() => ({
  authState: {
    value: {
      isAuthenticated: false,
      isLoading: false,
      isProfileReady: true,
      user: null as null | { id: string },
    },
  },
  convexQuery: vi.fn().mockResolvedValue(null),
  queryState: { value: undefined as unknown },
}))

vi.mock("@workspace/api/hooks", () => ({
  useQuery: () => queryState.value,
  useMutation: () => vi.fn(),
  useConvex: () => ({ query: convexQuery }),
}))

vi.mock("@/hooks/use-traveler-auth", () => ({
  useTravelerAuth: () => authState.value,
}))

const { DonneesLocalesProvider, useDonneesLocales } = await import(
  "./donnees-locales"
)

function dossier(reference: string): Dossier {
  return {
    sale: { number: reference, status: "confirmee" },
    tickets: [],
    trip: { _id: "trip-1", departureAt: 2_000, arrivalAt: 3_000 },
    origin: null,
    destination: null,
  } as unknown as Dossier
}

/** Sonde : rend l'état exposé par le fournisseur, sans mise en forme. */
function Sonde() {
  const donnees = useDonneesLocales()
  return (
    <ul aria-label="dossiers">
      <li>{donnees.chargement ? "chargement" : "prêt"}</li>
      <li>{donnees.depuisLeCache ? "cache" : "serveur"}</li>
      {donnees.dossiers.map((item) => (
        <li key={item.sale.number}>{item.sale.number}</li>
      ))}
    </ul>
  )
}

function poserReseau(enLigne: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => enLigne,
  })
}

async function baseNeuve() {
  await closeDb()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
  await openDb()
}

beforeEach(async () => {
  await baseNeuve()
  authState.value = {
    isAuthenticated: false,
    isLoading: false,
    isProfileReady: true,
    user: null,
  }
  queryState.value = undefined
  poserReseau(true)
  convexQuery.mockClear()
})

describe("copie locale de l'espace voyageur", () => {
  it("affiche les billets enregistrés quand l'appareil est hors réseau", async () => {
    // Le voyageur avait téléchargé ses billets ; il ouvre l'application en
    // gare, sans réseau : la session ne peut pas être revalidée.
    await remplacerDossiers([dossier("RS-1")], 1_000)
    poserReseau(false)

    render(
      <DonneesLocalesProvider>
        <Sonde />
      </DonneesLocalesProvider>
    )

    expect(await screen.findByText("RS-1")).toBeInTheDocument()
    expect(screen.getByText("cache")).toBeInTheDocument()
    // Et surtout : rien n'a été effacé au passage.
    expect(await listerDossiers()).toHaveLength(1)
  })

  it("efface les billets quand le réseau répond et que la session a disparu", async () => {
    await remplacerDossiers([dossier("RS-1")], 1_000)
    poserReseau(true)

    render(
      <DonneesLocalesProvider>
        <Sonde />
      </DonneesLocalesProvider>
    )

    await waitFor(async () => {
      expect(await listerDossiers()).toHaveLength(0)
    })
    expect(screen.queryByText("RS-1")).not.toBeInTheDocument()
  })

  it("enregistre les dossiers reçus et leur propriétaire", async () => {
    authState.value = {
      isAuthenticated: true,
      isLoading: false,
      isProfileReady: true,
      user: { id: "voyageur-a" },
    }
    queryState.value = [dossier("RS-9")]

    render(
      <DonneesLocalesProvider>
        <Sonde />
      </DonneesLocalesProvider>
    )

    await waitFor(async () => {
      expect(await listerDossiers()).toHaveLength(1)
    })
    expect((await lireEtat()).utilisateur).toBe("voyageur-a")
    expect(screen.getByText("serveur")).toBeInTheDocument()
  })
})
