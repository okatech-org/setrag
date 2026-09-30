"use client"

import { ChevronRightIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState, type FormEvent } from "react"

import { authClient } from "@workspace/api/auth-client"
import { useAuth, useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { CodeOtp } from "@workspace/ui/components/code-otp"
import { Field, Input } from "@workspace/ui/components/field"
import { Stepper } from "@workspace/ui/components/stepper"
import { Logo } from "@workspace/ui/marque"

import { TERRAIN } from "@/composants/boutons"
import { Message } from "@/composants/message"
import { BandeauConnexion } from "@/coquille/bandeau-service"
import { Bas, BarreApp, Corps, Note } from "@/coquille/ecran"
import { useOnline } from "@/hooks/use-online"

/**
 * Ouverture de session — en gare, avec du réseau : c'est le seul moment où
 * il en faut.
 *
 * Deux facteurs, tous deux vérifiés par le serveur : le mot de passe du
 * compte de service, puis un code à six chiffres envoyé à ce compte. C'est le
 * second facteur dont dispose réellement le système (pas de TOTP). Aucun
 * écran ne simule une vérification qui n'aurait pas lieu.
 */

type Etape = "identite" | "code"

/**
 * Traduction des refus d'authentification.
 *
 * Better Auth répond en anglais, avec des codes stables : un agent en gare
 * d'Owendo à 5 h du matin doit lire ce qu'il doit faire, pas un identifiant
 * technique.
 */
function messageAuth(erreur: { code?: string; message?: string }): string {
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
  return (
    traductions[erreur.code ?? ""] ??
    erreur.message ??
    "Connexion refusée. Rapprochez-vous du régulateur."
  )
}

export function Connexion() {
  const router = useRouter()
  const online = useOnline()
  const { isAuthenticated, isLoading } = useAuth()
  const [etape, setEtape] = useState<Etape>("identite")
  const [email, setEmail] = useState("")
  const [motDePasse, setMotDePasse] = useState("")
  const [code, setCode] = useState("")
  const [enCours, setEnCours] = useState(false)
  const [demoEnCours, setDemoEnCours] = useState("")
  const [erreur, setErreur] = useState<string | null>(null)
  const [avis, setAvis] = useState<string | null>(null)

  const devStatus = useQuery(api.functions.devAuth.status, {})
  const relever = useMutation(api.functions.devAuth.consumeCode)
  // Ce terminal est celui d'un contrôleur : un compte guichet n'y ouvrirait
  // rien, et ses identifiants n'ont aucune raison de transiter ici.
  const comptesDemo = useQuery(api.functions.demoAccounts.list, {
    only: ["controle"],
  })

  useEffect(() => {
    if (!isLoading && isAuthenticated && etape === "identite") {
      router.replace("/tournee")
    }
  }, [isAuthenticated, isLoading, router, etape])

  /**
   * Premier facteur, puis envoi du second. Partagé avec les comptes de
   * démonstration : ils empruntent EXACTEMENT le même chemin, seule la
   * saisie leur est épargnée.
   */
  async function ouvrirSession(identifiants: {
    email: string
    password: string
  }) {
    const resultat = await authClient.signIn.email(identifiants)
    if (resultat.error) throw new Error(messageAuth(resultat.error))
    // Un envoi de code qui échoue est signalé tel quel : pas question de
    // laisser entrer « en attendant ».
    const envoi = await authClient.emailOtp.sendVerificationOtp({
      email: identifiants.email,
      type: "sign-in",
    })
    if (envoi.error) throw new Error(messageAuth(envoi.error))
  }

  /**
   * Vérifie le second facteur. `checkVerificationOtp` CONTRÔLE le code sans
   * ouvrir de session : c'est ce qui en fait un second facteur.
   * `signIn.emailOtp`, lui, ouvrirait une session à part entière et le
   * facteur suivant remplacerait le premier au lieu de s'y ajouter.
   */
  async function verifierCode(cible: string, otp: string) {
    const resultat = await authClient.emailOtp.checkVerificationOtp({
      email: cible,
      type: "sign-in",
      otp,
    })
    if (resultat.error) throw new Error(messageAuth(resultat.error))
    if (resultat.data?.success === false) {
      throw new Error(
        "Code refusé. Vérifiez l'heure du terminal, puis réessayez."
      )
    }
  }

  async function soumettreIdentite(event: FormEvent) {
    event.preventDefault()
    setErreur(null)
    setEnCours(true)
    try {
      await ouvrirSession({ email, password: motDePasse })
      setEtape("code")
      setAvis(`Code envoyé à ${email}. Il est valable 10 minutes.`)
    } catch (cause) {
      setErreur(
        (cause as Error).message ||
          "Identifiants refusés. Vérifiez votre compte de service."
      )
    } finally {
      setEnCours(false)
    }
  }

  /**
   * Compte de démonstration : les deux facteurs sont réellement vérifiés par
   * le serveur ; sur un déploiement de développement, le code est relevé
   * automatiquement. Ailleurs, on s'arrête à l'étape du code.
   */
  async function entrerDemo(compte: {
    key: string
    email: string
    password: string
  }) {
    setErreur(null)
    setAvis(null)
    setDemoEnCours(compte.key)
    setEmail(compte.email)
    setMotDePasse(compte.password)
    try {
      await ouvrirSession({ email: compte.email, password: compte.password })
      if (!devStatus?.developmentEnabled) {
        setEtape("code")
        setAvis(
          `Code envoyé à ${compte.email}. Saisissez-le pour ouvrir la session.`
        )
        return
      }
      const trouve = await relever({ identifier: compte.email })
      if (!trouve) {
        setEtape("code")
        setAvis("Code envoyé — saisissez-le pour ouvrir la session.")
        return
      }
      await verifierCode(compte.email, trouve.code)
      router.replace("/tournee")
    } catch (cause) {
      setErreur(
        (cause as Error).message ||
          "Connexion au compte de démonstration impossible."
      )
    } finally {
      setDemoEnCours("")
    }
  }

  async function soumettreCode(event: FormEvent) {
    event.preventDefault()
    setErreur(null)
    setEnCours(true)
    try {
      await verifierCode(email, code)
      router.replace("/tournee")
    } catch (cause) {
      setErreur(
        (cause as Error).message ||
          "Code refusé. Vérifiez que l'heure du terminal est correcte."
      )
      setCode("")
    } finally {
      setEnCours(false)
    }
  }

  /** Raccourci de développement : lit le code que le serveur a journalisé. */
  async function releverCode() {
    setErreur(null)
    try {
      const trouve = await relever({ identifier: email })
      if (!trouve) {
        setErreur("Aucun code en attente pour cet identifiant.")
        return
      }
      setCode(trouve.code)
      setAvis("Code récupéré depuis le déploiement de développement.")
    } catch (cause) {
      setErreur((cause as Error).message)
    }
  }

  const horsReseau = !online && (
    <Message ton="danger" titre="Réseau requis.">
      L&apos;ouverture de session exige le réseau. Rapprochez-vous du bâtiment
      voyageurs de la gare.
    </Message>
  )

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas text-ink">
      <BandeauConnexion />
      {etape === "identite" ? (
        <form className="flex flex-1 flex-col" onSubmit={soumettreIdentite}>
          <Corps className="gap-4 pt-5">
            <div>
              <Logo variante="compact" className="h-[46px]" />
              <p className="mt-2.5 text-[12px] font-semibold tracking-[0.08em] text-ink-muted uppercase">
                Application de contrôle à bord
              </p>
            </div>
            <Stepper
              steps={[
                { label: "Identifiant" },
                { label: "Code" },
                { label: "Session" },
              ]}
              current={0}
            />
            {horsReseau}
            <Field label="Compte de service" htmlFor="email">
              <Input
                type="email"
                autoComplete="username"
                inputMode="email"
                placeholder="controleur@setrag.ga"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Field>
            <Field label="Mot de passe" htmlFor="mot-de-passe">
              <Input
                type="password"
                autoComplete="current-password"
                value={motDePasse}
                onChange={(event) => setMotDePasse(event.target.value)}
                required
              />
            </Field>
            {erreur && (
              <Message ton="danger" titre="Connexion refusée.">
                {erreur}
              </Message>
            )}
            <Button
              type="submit"
              size="lg"
              block
              className={TERRAIN}
              loading={enCours}
              loadingLabel="Vérification…"
              disabled={!online || !email || !motDePasse}
            >
              Continuer
            </Button>

            {/* N'apparaissent que sur un déploiement marqué comme tel. Même
                chemin d'authentification que n'importe quel agent. */}
            {comptesDemo && comptesDemo.length > 0 && (
              <section className="grid gap-2 rounded-md border-[1.5px] border-dashed border-line-strong p-3">
                <h2 className="text-[11.5px] font-bold tracking-[0.07em] text-ink-muted uppercase">
                  Comptes de démonstration
                </h2>
                {comptesDemo.map((compte) => (
                  <Button
                    key={compte.key}
                    type="button"
                    variant="secondary"
                    block
                    className="h-auto min-h-14 justify-between rounded-md px-4 py-2.5 text-left whitespace-normal"
                    loading={demoEnCours === compte.key}
                    loadingLabel="Connexion…"
                    disabled={!online || Boolean(demoEnCours)}
                    onClick={() => void entrerDemo(compte)}
                  >
                    <span className="min-w-0">
                      <span className="block">{compte.label}</span>
                      <small className="mt-0.5 block text-[12.5px] font-normal text-ink-muted">
                        {compte.description}
                      </small>
                    </span>
                    <ChevronRightIcon aria-hidden />
                  </Button>
                ))}
              </section>
            )}

            <Note className="mt-auto">
              La session s&apos;ouvre en gare. Une fois ouverte, le contrôle, la
              vente à bord et les procès-verbaux fonctionnent sans réseau.
            </Note>
          </Corps>
        </form>
      ) : (
        <form className="flex flex-1 flex-col" onSubmit={soumettreCode}>
          <BarreApp
            onRetour={() => {
              setEtape("identite")
              setCode("")
              setAvis(null)
              setErreur(null)
            }}
            titre="Code de vérification"
            sousTitre="Étape 2 sur 3"
          />
          <Corps className="gap-4">
            <p className="text-small text-ink-muted">
              Saisissez le code à six chiffres envoyé à votre compte de service.
            </p>
            {horsReseau}
            {avis && (
              <Message ton="info" titre="Vérification en deux temps.">
                {avis}
              </Message>
            )}
            <div className="grid gap-2">
              <CodeOtp
                valeur={code}
                onChange={(valeur) => {
                  setCode(valeur)
                  setErreur(null)
                }}
                longueur={6}
                invalide={Boolean(erreur)}
                autoFocus
                label="Code de vérification à six chiffres"
              />
              {erreur && (
                <p
                  role="alert"
                  className="text-[13px] font-semibold text-danger-ink"
                >
                  {erreur}
                </p>
              )}
            </div>
          </Corps>
          <Bas className="border-t-0 bg-canvas">
            <Button
              type="submit"
              size="lg"
              block
              className={TERRAIN}
              loading={enCours}
              loadingLabel="Ouverture…"
              disabled={code.length < 6}
            >
              Ouvrir la session
            </Button>
            <Button
              type="button"
              variant="ghost"
              block
              onClick={() => {
                setEtape("identite")
                setCode("")
                setAvis(null)
                setErreur(null)
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
                onClick={() => void releverCode()}
              >
                Afficher le code (déploiement de développement)
              </Button>
            )}
          </Bas>
        </form>
      )}
    </div>
  )
}
