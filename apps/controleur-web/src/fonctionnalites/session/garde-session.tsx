"use client"

import { useRouter } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { FunctionReturnType } from "convex/server"

import { authClient } from "@workspace/api/auth-client"
import { useAuth, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Chargeur } from "@workspace/ui/components/voie"
import { Logo } from "@workspace/ui/marque"

import { TERRAIN } from "@/composants/boutons"
import { BandeauService } from "@/coquille/bandeau-service"
import { asAppRole, canControl } from "@/lib/access"
import { useTerminal } from "../terminal/contexte-terminal"
import { Verrouillage } from "./verrouillage"

type Profil = NonNullable<FunctionReturnType<typeof api.functions.customers.me>>

interface SessionControle {
  /**
   * Profil serveur, `null` lorsque la tournée reprend hors réseau : le
   * terminal connaît alors le matricule, mais plus les droits à jour.
   */
  profil: Profil | null
  /** Identifiant de service affiché partout : C-401, jamais un e-mail. */
  matricule: string
  role: string | undefined
  ouverteLe: number | undefined
  fermeture: boolean
  fermer: () => Promise<void>
}

const Contexte = createContext<SessionControle | null>(null)

export function useSessionControle(): SessionControle {
  const valeur = useContext(Contexte)
  if (!valeur) {
    throw new Error("useSessionControle doit être utilisé sous GardeSession")
  }
  return valeur
}

/**
 * Identifiant de service du contrôleur.
 *
 * Le matricule vient de l'annuaire ; à défaut, on compose un identifiant
 * stable à partir du nom. Aucun écran n'affiche l'adresse personnelle de
 * l'agent : elle n'a rien à faire sur un terminal qui peut être perdu.
 */
function matriculeDe(profil: Profil): string {
  const user = profil.user as { matricule?: string; lastName?: string }
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
 * données embarquées — le bandeau de service dit alors « Hors ligne » ou
 * « Session non reconnue ».
 */
const ATTENTE_SERVEUR_MS = 3500

function Attente({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas">
      <BandeauService />
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
        <Logo variante="compact" className="h-9" />
        {children}
      </main>
    </div>
  )
}

export function GardeSession({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuth()
  const { settings, ready, updateSettings } = useTerminal()
  const [fermeture, setFermeture] = useState(false)
  const [attendu, setAttendu] = useState(false)
  const profil = useQuery(
    api.functions.customers.me,
    !isAuthenticated || fermeture ? "skip" : {}
  )
  const role = asAppRole(profil?.user?.role)

  useEffect(() => {
    const minuteur = window.setTimeout(() => setAttendu(true), ATTENTE_SERVEUR_MS)
    return () => window.clearTimeout(minuteur)
  }, [])

  // La session vérifiée par le serveur laisse une trace locale : c'est elle
  // qui autorisera la reprise hors réseau, et elle seule.
  useEffect(() => {
    if (!profil || !ready) return
    const matricule = matriculeDe(profil)
    if (
      settings.session?.matricule === matricule &&
      settings.session.role === profil.user.role
    ) {
      return
    }
    void updateSettings({
      session: { matricule, role: profil.user.role, openedAt: Date.now() },
    })
  }, [profil, ready, settings.session, updateSettings])

  const locale = settings.session
  /**
   * Reprise hors ligne : le serveur ne répond pas, mais ce terminal a déjà
   * ouvert une session. On rend la main à l'agent plutôt que de l'enfermer
   * dans un écran d'attente — le code court de verrouillage reste, lui, la
   * garde effective de l'appareil.
   */
  const repriseHorsLigne =
    ready && attendu && Boolean(locale) && (!isAuthenticated || profil === undefined)

  useEffect(() => {
    if (fermeture || isLoading || !ready) return
    // Sans session locale, aucune reprise possible : retour à la connexion.
    if (!isAuthenticated && attendu && !locale) router.replace("/connexion")
  }, [isAuthenticated, isLoading, locale, ready, router, fermeture, attendu])

  const fermer = useCallback(async () => {
    setFermeture(true)
    await updateSettings({ session: undefined })
    await authClient.signOut()
    router.replace("/connexion")
  }, [router, updateSettings])

  const session = useMemo<SessionControle | null>(
    () =>
      profil
        ? {
            profil,
            matricule: matriculeDe(profil),
            role: profil.user.role,
            ouverteLe: locale?.openedAt,
            fermeture,
            fermer,
          }
        : locale
          ? {
              profil: null,
              matricule: locale.matricule,
              role: locale.role,
              ouverteLe: locale.openedAt,
              fermeture,
              fermer,
            }
          : null,
    [locale, profil, fermer, fermeture]
  )

  if (repriseHorsLigne && session) {
    return (
      <Contexte.Provider value={session}>
        <Verrouillage>{children}</Verrouillage>
      </Contexte.Provider>
    )
  }

  // Tant que le délai d'attente court sans réponse du serveur, on ne conclut
  // rien : annoncer une redirection puis reprendre la tournée hors ligne
  // ferait clignoter deux messages contradictoires sous les yeux de l'agent.
  // Une session reconnue, elle, ouvre la tournée sans attendre.
  if (
    !ready ||
    isLoading ||
    (isAuthenticated && profil === undefined) ||
    (!isAuthenticated && !attendu)
  ) {
    return (
      <Attente>
        <Chargeur className="w-full">Ouverture de la session…</Chargeur>
      </Attente>
    )
  }
  if (!isAuthenticated) {
    return (
      <Attente>
        <p role="status" className="text-small text-ink-muted">
          Redirection vers la connexion…
        </p>
      </Attente>
    )
  }
  if (!profil) {
    return (
      <Attente>
        <p role="status" className="text-small text-ink-muted">
          Profil introuvable pour ce compte.
        </p>
      </Attente>
    )
  }

  if (!canControl(role)) {
    return (
      <Attente>
        <h1 className="text-[22px] font-bold">Application réservée au contrôle à bord</h1>
        <p className="max-w-sm text-small text-ink-muted">
          Le rôle « {profil.user.role} » n&apos;autorise pas l&apos;enregistrement
          de contrôles. Rapprochez-vous de votre chef de gare si vous devez
          contrôler à bord.
        </p>
        <Button variant="secondary" size="lg" block className={TERRAIN} onClick={() => void fermer()}>
          Changer de compte
        </Button>
      </Attente>
    )
  }

  return (
    <Contexte.Provider value={session!}>
      <Verrouillage>{children}</Verrouillage>
    </Contexte.Provider>
  )
}
