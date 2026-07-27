"use client"

import { Building2, KeyRound, ShieldCheck, Wifi } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { FormEvent, useEffect, useState } from "react"

import { authClient } from "@workspace/api/auth-client"
import { useAuth, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

const E2E_MODE = process.env.NEXT_PUBLIC_E2E_MODE === "1"

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

  return (
    <main className="grid min-h-dvh min-w-0 bg-surface lg:grid-cols-[minmax(360px,0.9fr)_minmax(520px,1.1fr)]">
      <section
        data-theme="dark"
        className="relative hidden overflow-hidden bg-[oklch(0.24_0.058_257)] p-10 text-ink lg:flex lg:flex-col lg:justify-between"
      >
        <div
          aria-hidden
          className="absolute -top-28 -right-36 size-96 rounded-full border border-white/10"
        />
        <div
          aria-hidden
          className="absolute right-12 bottom-24 size-48 rounded-full border border-white/10"
        />

        <Image
          src="/setrag-logo.png"
          alt="SETRAG"
          width={150}
          height={54}
          priority
          className="relative h-12 w-auto self-start rounded-sm bg-white px-3 py-2"
        />

        <div className="relative grid max-w-lg gap-5">
          <span className="text-mono-label text-accent-on-ink">
            Billettique SETRAG
          </span>
          <h1 className="text-h1 text-ink">
            Le portail opérationnel du Transgabonais.
          </h1>
          <p className="text-body-lg max-w-md text-ink-muted">
            Vente, encaissement et suivi des opérations depuis votre point de
            vente habilité.
          </p>
          <div className="text-small mt-4 grid gap-3 text-ink-muted">
            <span className="flex items-center gap-3">
              <ShieldCheck className="size-5 text-success" />
              Accès nominatif et actions auditées
            </span>
            <span className="flex items-center gap-3">
              <Building2 className="size-5 text-accent-on-ink" />
              Session liée au guichet et à l’appareil
            </span>
            <span className="flex items-center gap-3">
              <Wifi className="size-5 text-info" />
              État réseau visible en permanence
            </span>
          </div>
        </div>

        <p className="text-caption relative text-ink-faint">
          Accès réservé au personnel et aux agences accréditées.
        </p>
      </section>

      <section className="flex min-w-0 items-center justify-center bg-canvas px-4 py-8 sm:px-10 sm:py-10">
        <div className="grid w-full max-w-md min-w-0 gap-7">
          <Image
            src="/setrag-logo.png"
            alt="SETRAG"
            width={138}
            height={50}
            priority
            className="h-12 w-auto lg:hidden"
          />

          <div className="grid gap-2">
            <span className="text-mono-label text-accent-ink">AW-00</span>
            <h2 className="text-h2">Connexion</h2>
            <p className="text-ink-muted">
              Utilisez votre identité professionnelle SETRAG.
            </p>
          </div>

          {message ? (
            <InlineMessage tone={message.tone} title={message.title}>
              {message.detail}
            </InlineMessage>
          ) : null}

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

          <div className="flex items-center gap-4" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            <span className="text-caption text-ink-muted">compte de repli</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <form className="grid gap-5" onSubmit={submit}>
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

          <div className="text-caption flex flex-wrap justify-between gap-3 border-t border-line pt-5 text-ink-muted">
            <span>Besoin d’aide ? Support DSI · poste 2210</span>
            <span className="font-mono">v0.1.0</span>
          </div>
        </div>
      </section>
    </main>
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
    const sellerRoles = new Set([
      "vendeur_guichet",
      "vendeur_agence",
      "taxateur",
    ])
    router.replace(sellerRoles.has(profile.user.role) ? "/vente" : "/gestion")
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
