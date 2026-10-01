"use client"

import { Building2, KeyRound, ShieldCheck, Wifi } from "lucide-react"
import { useRouter } from "next/navigation"
import { FormEvent, useEffect, useState } from "react"

import { authClient } from "@workspace/api/auth-client"
import { useAuth, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Logo, LogoAnime } from "@workspace/ui/marque"

import {
  DemoAccountPicker,
  type DemoAccount,
} from "@/components/demo-account-picker"
import {
  asAppRole,
  defaultManagementPath,
  portalForRole,
} from "@/lib/portal-access"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

interface LoginScreenProps {
  onPasswordSignIn: (credentials: {
    email: string
    password: string
  }) => Promise<void>
  onSsoSignIn: () => Promise<void> | void
}

export function LoginScreen({
  onPasswordSignIn,
  onSsoSignIn,
}: LoginScreenProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [demoPending, setDemoPending] = useState("")
  const demoAccounts = useQuery(
    api.functions.demoAccounts.list,
    E2E_MODE ? "skip" : {}
  )
  const [message, setMessage] = useState<{
    tone: "info" | "danger"
    title: string
    detail: string
  } | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setPending(true)
    try {
      await onPasswordSignIn({ email, password })
    } catch {
      setMessage({
        tone: "danger",
        title: "Connexion impossible.",
        detail:
          "Identifiants invalides ou compte désactivé. Vérifiez vos informations ou contactez la DSI.",
      })
    } finally {
      setPending(false)
    }
  }

  async function startSso() {
    setMessage(null)
    try {
      await onSsoSignIn()
    } catch {
      setMessage({
        tone: "info",
        title: "Compte SETRAG",
        detail:
          "Le raccordement Entra ID n’est pas encore configuré. Utilisez provisoirement votre compte de repli.",
      })
    }
  }

  async function signInWithDemoAccount(account: DemoAccount) {
    setMessage(null)
    setDemoPending(account.key)
    try {
      await onPasswordSignIn({
        email: account.email,
        password: account.password,
      })
      // Le rôle prime sur le chemin servi par le backend : l'accueil d'un
      // persona peut évoluer côté frontend sans attendre un déploiement Convex.
      const role = asAppRole(account.role)
      const landingPath = role
        ? portalForRole(role) === "vente"
          ? "/vente"
          : defaultManagementPath(role)
        : account.landingPath
      if (landingPath) window.location.assign(landingPath)
    } catch {
      setMessage({
        tone: "danger",
        title: "Connexion au compte de démonstration impossible.",
        detail:
          "Le compte n’est pas disponible ou son mot de passe Convex n’est plus synchronisé.",
      })
    } finally {
      setDemoPending("")
    }
  }

  return (
    <>
      <main className="grid min-h-dvh min-w-0 bg-canvas lg:grid-cols-[minmax(380px,1.05fr)_minmax(480px,1fr)]">
        {/* Le logo se pose, le ruban le parcourt : la marque, sans décor. */}
        <section className="relative hidden flex-col justify-between border-r border-line bg-surface px-12 py-10 lg:flex">
          <span className="text-[12px] font-semibold tracking-[0.08em] text-ink-faint uppercase">
            Portail agent
          </span>
          <div className="grid justify-items-center gap-8">
            <LogoAnime variante="complet" fond="clair" className="w-full max-w-[440px]" />
            <ul className="grid gap-3 text-[14px] text-ink-muted">
              <li className="flex items-center gap-3">
                <ShieldCheck aria-hidden className="size-[18px] text-accent-ink" />
                Accès nominatif, chaque action tracée au journal d’audit
              </li>
              <li className="flex items-center gap-3">
                <Building2 aria-hidden className="size-[18px] text-accent-ink" />
                Session liée au rôle, au poste et au périmètre
              </li>
              <li className="flex items-center gap-3">
                <Wifi aria-hidden className="size-[18px] text-accent-ink" />
                État du réseau affiché en permanence
              </li>
            </ul>
          </div>
          <p className="text-[12.5px] text-ink-faint">
            Vente au guichet, gestion, exploitation et supervision du Transgabonais.
          </p>
        </section>

        <section className="flex min-w-0 items-center justify-center px-4 py-10 sm:px-10">
          <div className="grid w-full max-w-[440px] min-w-0 gap-6">
            <Logo variante="compact" title="SETRAG" className="h-10 justify-self-start lg:hidden" />

            <div className="grid gap-1.5">
              <span className="text-[12px] font-medium tracking-[0.08em] text-accent-ink uppercase">
                Espace réservé au personnel
              </span>
              <h1 className="text-[32px] leading-tight font-bold tracking-[-0.01em]">Ouvrir une session</h1>
              <p className="text-small text-ink-muted">
                Votre identité SETRAG ou celle de votre organisation partenaire habilitée.
              </p>
            </div>

            {message ? (
              <InlineMessage tone={message.tone} title={message.title}>
                {message.detail}
              </InlineMessage>
            ) : null}

            <div className="grid gap-2">
              <Button
                type="button"
                size="lg"
                block
                onClick={startSso}
                className="h-auto min-h-13 min-w-0 justify-center px-4 py-3 text-center whitespace-normal"
              >
                <ShieldCheck />
                Se connecter avec mon compte SETRAG
              </Button>
              <p className="text-[12.5px] text-ink-muted">
                Connexion unique par l’annuaire de l’entreprise (Entra ID).
              </p>
            </div>

            <div className="flex items-center gap-3 text-[12px] text-ink-faint" aria-hidden>
              <span className="h-px flex-1 bg-line" />
              ou, avec votre compte de repli
              <span className="h-px flex-1 bg-line" />
            </div>

            <form className="grid gap-4" onSubmit={submit}>
              <Field label="Adresse e-mail professionnelle" htmlFor="agent-email">
                <Input
                  id="agent-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="prenom.nom@setrag.ga"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>

              <Field label="Mot de passe" htmlFor="agent-password">
                <Input
                  id="agent-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Votre mot de passe"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>

              <Button
                type="submit"
                variant="secondary"
                size="lg"
                block
                loading={pending}
                loadingLabel="Connexion…"
              >
                <KeyRound />
                Connexion
              </Button>
            </form>

            {E2E_MODE ? (
              <InlineMessage tone="info" title="Comptes de démonstration">
                Vente : agent@setrag.ga · Gestion : gestion@setrag.ga · mot de
                passe : secret-e2e
              </InlineMessage>
            ) : null}

            <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-4 text-[12.5px] text-ink-muted">
              <span>Besoin d’aide ? Support DSI · poste 2210</span>
              <span className="tabular">v0.1.0</span>
            </div>
          </div>
        </section>
      </main>

      <DemoAccountPicker
        accounts={demoAccounts ?? []}
        pendingAccountKey={demoPending}
        onSelect={signInWithDemoAccount}
      />
    </>
  )
}

export function LoginPageClient() {
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuth()
  const profile = useQuery(
    api.functions.customers.me,
    E2E_MODE || !isAuthenticated ? "skip" : {}
  )

  useEffect(() => {
    if (E2E_MODE || isLoading || !isAuthenticated || !profile?.user) return
    const role = asAppRole(profile.user.role)
    if (!role) return
    const portal = portalForRole(role)
    if (portal === "vente") {
      router.replace("/vente")
    } else if (portal === "gestion") {
      router.replace(defaultManagementPath(role))
    } else {
      window.location.replace(
        process.env.NEXT_PUBLIC_TICKETING_URL ??
          "https://setrag-billetterie-two.vercel.app"
      )
    }
  }, [isAuthenticated, isLoading, profile, router])

  return (
    <LoginScreen
      onSsoSignIn={() => {
        throw new Error("OIDC non configuré")
      }}
      onPasswordSignIn={async ({ email, password }) => {
        if (E2E_MODE) {
          router.push(
            email.trim().toLowerCase() === "gestion@setrag.ga"
              ? "/gestion"
              : "/vente"
          )
          return
        }
        const result = await authClient.signIn.email({ email, password })
        if (result.error) throw new Error(result.error.message)
      }}
    />
  )
}
