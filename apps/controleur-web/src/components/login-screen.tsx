"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, type FormEvent } from "react"

import { authClient } from "@workspace/api/auth-client"
import { useAuth, useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Stepper } from "@workspace/ui/components/stepper"

import { useOnline } from "@/hooks/use-online"

/**
 * Ouverture de session — CM-01.
 *
 * Deux facteurs, tous deux vérifiés par le serveur : le mot de passe du
 * compte de service, puis un code à six chiffres envoyé à ce compte. C'est le
 * second facteur dont dispose réellement le système ; le plan mobile prévoyait
 * un TOTP par application d'authentification, qui reste à ouvrir côté
 * authentification. Aucun écran ne simule ici une vérification qui n'aurait
 * pas lieu.
 *
 * La connexion EXIGE le réseau, et c'est la seule opération qui l'exige : on
 * ouvre sa session en gare, avant le départ. Tout ce qui suit — contrôle,
 * vente, procès-verbal — se passe du réseau.
 */

type Step = "identite" | "code"

/**
 * Traduction des refus d'authentification.
 *
 * Better Auth répond en anglais, avec des codes stables. On les traduit ici
 * plutôt que d'afficher le message brut : un agent en gare d'Owendo à 5 h du
 * matin doit lire ce qu'il doit faire, pas un identifiant technique.
 */
function authMessage(error: { code?: string; message?: string }): string {
  const traductions: Record<string, string> = {
    INVALID_EMAIL_OR_PASSWORD:
      "Identifiant ou mot de passe refusé. Vérifiez votre compte de service.",
    USER_NOT_FOUND: "Ce compte de service est inconnu.",
    INVALID_OTP: "Code refusé. Vérifiez l'heure du terminal, puis réessayez.",
    OTP_EXPIRED: "Code expiré. Demandez-en un nouveau.",
    TOO_MANY_ATTEMPTS:
      "Trop de tentatives. Patientez avant de réessayer, ou appelez le régulateur.",
    ACCOUNT_NOT_FOUND: "Ce compte de service est inconnu.",
  }
  const code = error.code ?? ""
  return (
    traductions[code] ??
    error.message ??
    "Connexion refusée. Rapprochez-vous du régulateur."
  )
}

export function LoginScreen() {
  const router = useRouter()
  const online = useOnline()
  const { isAuthenticated, isLoading } = useAuth()
  const [step, setStep] = useState<Step>("identite")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [pending, setPending] = useState(false)
  const [demoPending, setDemoPending] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const devStatus = useQuery(api.functions.devAuth.status, {})
  const consumeCode = useMutation(api.functions.devAuth.consumeCode)
  const demoAccounts = useQuery(api.functions.demoAccounts.list, {})

  useEffect(() => {
    if (!isLoading && isAuthenticated && step === "identite") {
      router.replace("/tournee")
    }
  }, [isAuthenticated, isLoading, router, step])

  /**
   * Premier facteur, puis envoi du second.
   *
   * Extrait pour être partagé avec les comptes de démonstration : ceux-ci
   * empruntent EXACTEMENT le même chemin d'authentification, ils ne le
   * contournent pas. Seule la saisie leur est épargnée.
   */
  async function openSession(credentials: {
    email: string
    password: string
  }): Promise<void> {
    const result = await authClient.signIn.email(credentials)
    if (result.error) throw new Error(authMessage(result.error))

    // Le mot de passe est établi : on demande le second facteur. Un envoi
    // qui échoue est signalé tel quel — pas question de laisser entrer
    // « en attendant ».
    const sent = await authClient.emailOtp.sendVerificationOtp({
      email: credentials.email,
      type: "sign-in",
    })
    if (sent.error) throw new Error(authMessage(sent.error))
  }

  /** Vérifie le second facteur. Ne rend la main qu'une fois le code accepté. */
  async function verifyCode(target: string, otp: string): Promise<void> {
    const result = await authClient.emailOtp.checkVerificationOtp({
      email: target,
      type: "sign-in",
      otp,
    })
    if (result.error) throw new Error(authMessage(result.error))
    if (result.data?.success === false) {
      throw new Error("Code refusé. Vérifiez l'heure du terminal, puis réessayez.")
    }
  }

  async function submitIdentity(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      await openSession({ email, password })
      setStep("code")
      setNotice(`Code envoyé à ${email}. Il est valable 10 minutes.`)
    } catch (cause) {
      setError(
        (cause as Error).message ||
          "Identifiants refusés. Vérifiez votre compte de service."
      )
    } finally {
      setPending(false)
    }
  }

  /**
   * Connexion à un compte de démonstration.
   *
   * Les deux facteurs sont réellement vérifiés par le serveur ; sur un
   * déploiement de développement, le code est simplement relevé
   * automatiquement au lieu d'être recopié depuis une boîte mail. Ailleurs, on
   * s'arrête à l'étape du code, identifiant pré-rempli.
   */
  async function signInWithDemoAccount(account: {
    key: string
    email: string
    password: string
  }) {
    setError(null)
    setNotice(null)
    setDemoPending(account.key)
    setEmail(account.email)
    setPassword(account.password)
    try {
      await openSession({ email: account.email, password: account.password })

      if (!devStatus?.developmentEnabled) {
        setStep("code")
        setNotice(
          `Code envoyé à ${account.email}. Saisissez-le pour ouvrir la session.`
        )
        return
      }

      const found = await consumeCode({ identifier: account.email })
      if (!found) {
        setStep("code")
        setNotice("Code envoyé — saisissez-le pour ouvrir la session.")
        return
      }
      await verifyCode(account.email, found.code)
      router.replace("/tournee")
    } catch (cause) {
      setError(
        (cause as Error).message ||
          "Connexion au compte de démonstration impossible."
      )
    } finally {
      setDemoPending("")
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      // `checkVerificationOtp` VÉRIFIE le code sans ouvrir de session : c'est
      // ce qui en fait un second facteur. `signIn.emailOtp`, lui, ouvrirait
      // une session à part entière et détacherait le compte de son mot de
      // passe — le facteur suivant remplacerait le premier au lieu de s'y
      // ajouter.
      await verifyCode(email, code)
      router.replace("/tournee")
    } catch (cause) {
      setError(
        (cause as Error).message ||
          "Code refusé. Vérifiez que l'heure du terminal est correcte."
      )
      setCode("")
    } finally {
      setPending(false)
    }
  }

  /** Raccourci de développement : lit le code que le serveur a journalisé. */
  async function revealDevCode() {
    setError(null)
    try {
      const found = await consumeCode({ identifier: email })
      if (!found) {
        setError("Aucun code en attente pour cet identifiant.")
        return
      }
      setCode(found.code)
      setNotice("Code récupéré depuis le déploiement de développement.")
    } catch (cause) {
      setError((cause as Error).message)
    }
  }

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 bg-canvas px-5 py-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-9 items-center justify-center rounded-sm bg-accent-base text-[13px] font-bold text-ink-inverse"
          >
            ST
          </span>
          <div>
            <p className="text-[15px] font-semibold">SETRAG</p>
            <p className="text-[13px] text-ink-muted">
              Application de contrôle à bord
            </p>
          </div>
        </div>
        <Stepper
          steps={[
            { label: "Identifiant" },
            { label: "Code" },
            { label: "Session" },
          ]}
          current={step === "identite" ? 0 : 1}
        />
      </header>

      {!online && (
        <InlineMessage tone="danger" title="Réseau requis.">
          L&apos;ouverture de session exige le réseau. Rapprochez-vous du
          bâtiment voyageurs de la gare.
        </InlineMessage>
      )}
      {error && (
        <InlineMessage tone="danger" title="Connexion refusée.">
          {error}
        </InlineMessage>
      )}
      {notice && !error && (
        <InlineMessage tone="info" title="Vérification en deux temps.">
          {notice}
        </InlineMessage>
      )}

      {step === "identite" ? (
        <form className="flex flex-col gap-4" onSubmit={submitIdentity}>
          <Field label="Compte de service" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              placeholder="controleur@setrag.ga"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
          <Field label="Mot de passe" htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>
          <Button
            type="submit"
            size="lg"
            block
            loading={pending}
            loadingLabel="Vérification…"
            disabled={!online || !email || !password}
          >
            Continuer
          </Button>

          {/* Comptes de démonstration : n'apparaissent que sur un déploiement
              explicitement marqué comme tel. Ils empruntent le même chemin
              d'authentification que n'importe quel agent — les deux facteurs
              sont vérifiés par le serveur. */}
          {demoAccounts && demoAccounts.length > 0 && (
            <section className="mt-2 rounded-md border border-dashed border-line-strong p-4">
              <h2 className="text-[13px] font-semibold tracking-wide text-ink-muted uppercase">
                Comptes de démonstration
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {demoAccounts.map((account) => (
                  <li key={account.key}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      block
                      className="justify-between"
                      loading={demoPending === account.key}
                      loadingLabel="Connexion…"
                      disabled={!online || Boolean(demoPending)}
                      onClick={() => void signInWithDemoAccount(account)}
                    >
                      <span className="min-w-0 text-left">
                        <span className="block truncate">{account.label}</span>
                        <span className="block truncate text-[13px] font-normal text-ink-muted">
                          {account.description}
                        </span>
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </form>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submitCode}>
          <div>
            <h2 className="text-h3">Code de vérification</h2>
            <p className="mt-1 text-[15px] text-ink-muted">
              Saisissez le code à six chiffres envoyé à votre compte de service.
            </p>
          </div>
          <Field label="Code à six chiffres" htmlFor="otp">
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="text-center text-h3 tracking-[0.4em] tabular"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              required
            />
          </Field>
          <Button
            type="submit"
            size="lg"
            block
            loading={pending}
            loadingLabel="Ouverture…"
            disabled={code.length < 6}
          >
            Ouvrir la session
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            block
            onClick={() => {
              setStep("identite")
              setCode("")
              setNotice(null)
            }}
          >
            Revenir à l&apos;identifiant
          </Button>
          {devStatus?.developmentEnabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              block
              onClick={() => void revealDevCode()}
            >
              Afficher le code (déploiement de développement)
            </Button>
          )}
        </form>
      )}

      <p className="mt-auto text-[13px] text-ink-muted">
        La session s&apos;ouvre en gare. Une fois ouverte, le contrôle, la vente
        à bord et les procès-verbaux fonctionnent sans réseau.
      </p>
    </main>
  )
}
