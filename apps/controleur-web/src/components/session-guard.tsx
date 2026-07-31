"use client"

import { useRouter } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { FunctionReturnType } from "convex/server"

import { authClient } from "@workspace/api/auth-client"
import { useAuth, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"

import { asAppRole, canControl } from "@/lib/access"
import { LockScreen } from "./lock-screen"
import { useTerminal } from "./terminal-provider"

/** Bandeau permanent d'une tournée reprise sans réponse du serveur. */
function OfflineBanner({ online }: { online: boolean }) {
  return (
    <p
      role="status"
      className="safe-top bg-warning-soft px-5 py-2 text-[13px] font-semibold text-warning-ink"
    >
      {online
        ? "Session non reconnue par le serveur — tournée reprise sur les données embarquées."
        : "Hors réseau — tournée reprise sur les données embarquées."}{" "}
      Le contrôle, la vente et les procès-verbaux fonctionnent ; les écritures
      partiront une fois la session rétablie.
    </p>
  )
}

type Profile = NonNullable<FunctionReturnType<typeof api.functions.customers.me>>

interface ControlSession {
  /**
   * Profil serveur, `null` lorsque la tournée reprend hors réseau : le
   * terminal connaît alors le matricule, mais plus les droits à jour.
   */
  profile: Profile | null
  /** Identifiant de service affiché partout : CTRL-0428, jamais un e-mail. */
  matricule: string
  signingOut: boolean
  signOut: () => Promise<void>
}

const SessionContext = createContext<ControlSession | null>(null)

export function useControlSession(): ControlSession {
  const value = useContext(SessionContext)
  if (!value) {
    throw new Error("useControlSession doit être utilisé sous SessionGuard")
  }
  return value
}

function Status({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <p role="status" className="text-center text-[15px] text-ink-muted">
        {children}
      </p>
    </main>
  )
}

/**
 * Identifiant de service du contrôleur.
 *
 * Le matricule vient de l'annuaire ; à défaut, on compose un identifiant
 * stable à partir du nom. Ce qui compte, c'est qu'aucun écran n'affiche
 * l'adresse personnelle de l'agent : elle n'a rien à faire sur un terminal
 * qui peut être perdu.
 */
function matriculeOf(profile: Profile): string {
  const user = profile.user as { matricule?: string; lastName?: string }
  if (user.matricule) return user.matricule
  const nom = (user.lastName ?? "AGENT").toUpperCase().replace(/[^A-Z]/g, "")
  return `CTRL-${nom.slice(0, 4) || "0000"}`
}

/**
 * Délai au-delà duquel on cesse d'attendre le serveur.
 *
 * Court volontairement : un contrôleur qui rouvre son terminal entre deux
 * gares ne doit pas regarder un écran d'attente. Passé ce délai, si une
 * session a déjà été ouverte sur ce terminal, on reprend la tournée sur les
 * données embarquées.
 */
const SERVER_WAIT_MS = 3500

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuth()
  const { settings, ready, updateSettings, online } = useTerminal()
  const [signingOut, setSigningOut] = useState(false)
  const [waited, setWaited] = useState(false)
  const profile = useQuery(
    api.functions.customers.me,
    !isAuthenticated || signingOut ? "skip" : {}
  )
  const role = asAppRole(profile?.user?.role)

  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), SERVER_WAIT_MS)
    return () => window.clearTimeout(timer)
  }, [])

  // La session vérifiée par le serveur laisse une trace locale : c'est elle
  // qui autorisera la reprise hors réseau, et elle seule.
  useEffect(() => {
    if (!profile || !ready) return
    const matricule = matriculeOf(profile)
    if (
      settings.session?.matricule === matricule &&
      settings.session.role === profile.user.role
    ) {
      return
    }
    void updateSettings({
      session: {
        matricule,
        role: profile.user.role,
        openedAt: Date.now(),
      },
    })
  }, [profile, ready, settings.session, updateSettings])

  const local = settings.session
  /**
   * Reprise hors ligne : le serveur ne répond pas, mais ce terminal a déjà
   * ouvert une session. On rend la main à l'agent plutôt que de l'enfermer
   * dans un écran d'attente — le code court de verrouillage reste, lui, la
   * garde effective de l'appareil.
   */
  const offlineSession =
    ready &&
    waited &&
    Boolean(local) &&
    (!isAuthenticated || profile === undefined)

  useEffect(() => {
    if (signingOut || isLoading || !ready) return
    // Sans session locale, aucune reprise possible : retour à la connexion.
    if (!isAuthenticated && waited && !local) router.replace("/connexion")
  }, [isAuthenticated, isLoading, local, ready, router, signingOut, waited])

  const signOut = useCallback(async () => {
    setSigningOut(true)
    await updateSettings({ session: undefined })
    await authClient.signOut()
    router.replace("/connexion")
  }, [router, updateSettings])

  const session = useMemo<ControlSession | null>(
    () =>
      profile
        ? {
            profile,
            matricule: matriculeOf(profile),
            signingOut,
            signOut,
          }
        : local
          ? {
              profile: null,
              matricule: local.matricule,
              signingOut,
              signOut,
            }
          : null,
    [local, profile, signOut, signingOut]
  )

  if (offlineSession && session) {
    return (
      <SessionContext.Provider value={session}>
        <LockScreen>
          <OfflineBanner online={online} />
          {children}
        </LockScreen>
      </SessionContext.Provider>
    )
  }

  // Tant que le délai d'attente court, on ne conclut rien : annoncer une
  // redirection puis reprendre la tournée hors ligne ferait clignoter deux
  // messages contradictoires sous les yeux de l'agent.
  if (!ready || isLoading || !waited || (isAuthenticated && profile === undefined)) {
    return <Status>Ouverture de la session…</Status>
  }
  if (!isAuthenticated) return <Status>Redirection vers la connexion…</Status>
  if (!profile) return <Status>Profil introuvable pour ce compte.</Status>

  if (!canControl(role)) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas p-6 text-center">
        <h1 className="text-h3">Application réservée au contrôle à bord</h1>
        <p className="max-w-sm text-[15px] text-ink-muted">
          Le rôle « {profile.user.role} » n&apos;autorise pas l&apos;enregistrement
          de contrôles. Rapprochez-vous de votre chef de gare si vous devez
          contrôler à bord.
        </p>
        <Button variant="secondary" onClick={() => void signOut()}>
          Changer de compte
        </Button>
      </main>
    )
  }

  return (
    <SessionContext.Provider value={session!}>
      <LockScreen>{children}</LockScreen>
    </SessionContext.Provider>
  )
}
