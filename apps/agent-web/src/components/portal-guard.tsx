"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { flushSync } from "react-dom"
import type { FunctionReturnType } from "convex/server"

import { authClient } from "@workspace/api/auth-client"
import { useAuth, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"

import {
  asAppRole,
  canAccessManagementPath,
  canAccessSalePath,
  defaultManagementPath,
  portalForRole,
  type StaffPortal,
} from "@/lib/portal-access"
import { EcranAttente } from "@/coquille/ecran-attente"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"
const PUBLIC_TICKETING_URL =
  process.env.NEXT_PUBLIC_TICKETING_URL ??
  "https://setrag-billetterie-two.vercel.app"

type Profile = NonNullable<
  FunctionReturnType<typeof api.functions.customers.me>
>

interface PortalSession {
  profile: Profile
  signingOut: boolean
  signOut: () => Promise<void>
}

const PortalSessionContext = createContext<PortalSession | null>(null)

export function usePortalSession() {
  return useContext(PortalSessionContext)
}

function PortalStatus({ children }: { children: React.ReactNode }) {
  return <EcranAttente>{children}</EcranAttente>
}

export function PortalGuard({
  portal,
  children,
}: {
  /** « tous » : page commune au personnel des deux portails (réglages). */
  portal: StaffPortal | "tous"
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, isLoading } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const profile = useQuery(
    api.functions.customers.me,
    E2E_MODE || !isAuthenticated || signingOut ? "skip" : {}
  )
  const role = asAppRole(profile?.user?.role)
  const expectedPortal = role ? portalForRole(role) : null
  const portalAllowed =
    expectedPortal !== null && (portal === "tous" || expectedPortal === portal)
  const pathAllowed =
    role && portalAllowed
      ? portal === "tous"
        ? true
        : portal === "vente"
          ? canAccessSalePath(role, pathname)
          : canAccessManagementPath(role, pathname)
      : false

  useEffect(() => {
    if (E2E_MODE || signingOut || isLoading) return
    if (!isAuthenticated) {
      router.replace("/connexion")
      return
    }
    if (!role) return
    if (expectedPortal === null) return
    if (!portalAllowed) {
      router.replace(
        expectedPortal === "vente" ? "/vente" : defaultManagementPath(role)
      )
      return
    }
    if (!pathAllowed) {
      router.replace(
        portal === "vente" ? "/vente" : defaultManagementPath(role)
      )
    }
  }, [
    expectedPortal,
    portalAllowed,
    isAuthenticated,
    isLoading,
    pathAllowed,
    portal,
    role,
    router,
    signingOut,
  ])

  const signOut = useCallback(async () => {
    flushSync(() => setSigningOut(true))
    try {
      if (!E2E_MODE) await authClient.signOut()
      router.replace("/connexion")
      router.refresh()
    } catch (cause) {
      setSigningOut(false)
      throw cause
    }
  }, [router])

  const session = useMemo(
    () => (profile ? { profile, signingOut, signOut } : null),
    [profile, signOut, signingOut]
  )

  if (E2E_MODE) return children
  if (signingOut) return <PortalStatus>Déconnexion sécurisée…</PortalStatus>
  if (isLoading || (isAuthenticated && profile === undefined)) {
    return <PortalStatus>Vérification de vos habilitations…</PortalStatus>
  }
  if (!isAuthenticated) {
    return <PortalStatus>Redirection vers la connexion…</PortalStatus>
  }
  if (!profile?.user || !role) {
    return (
      <PortalStatus>
        Ce compte ne possède aucun profil applicatif actif.
      </PortalStatus>
    )
  }
  if (expectedPortal === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
        <div className="grid max-w-lg gap-4 text-center">
          <h1 className="text-h3">Compte voyageur</h1>
          <p className="text-small text-ink-muted">
            Ce portail est réservé au personnel SETRAG. Votre compte est
            disponible sur la billetterie voyageurs.
          </p>
          <Button asChild>
            <Link href={PUBLIC_TICKETING_URL}>Ouvrir la billetterie</Link>
          </Button>
        </div>
      </main>
    )
  }
  if (!portalAllowed || !pathAllowed || !session) {
    return <PortalStatus>Redirection vers votre espace autorisé…</PortalStatus>
  }

  return (
    <PortalSessionContext.Provider value={session}>
      {children}
    </PortalSessionContext.Provider>
  )
}
