"use client"

import { CircleAlertIcon } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react"
import { toast } from "sonner"

import { authClient } from "@workspace/api/auth-client"
import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { CodeOtp } from "@workspace/ui/components/code-otp"
import {
  formatRebours,
  useCompteARebours,
} from "@workspace/ui/components/compte-a-rebours"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { Chargeur } from "@workspace/ui/components/voie"
import { LogoAnime } from "@workspace/ui/marque"
import { cn } from "@workspace/ui/lib/utils"

import { BarreApp } from "@/coquille/barre-app"
import { useNaviguer } from "@/coquille/filet-navigation"
import { useOnline } from "@/hooks/use-online"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"
import { erreurTelephone, lireTelephone } from "@/lib/telephone"
import type { Civilite } from "@/lib/titulaire"

import { AIDE_TELEPHONE, ChampTelephone } from "./champ-telephone"
import { ChoixCivilite } from "./choix-civilite"
import {
  ESSAIS_PAR_CODE,
  VALIDITE_CODE_MINUTES,
  cheminDeRetour,
  ecritureNationale,
  emailValide,
  messageErreur,
  normaliserEmail,
  type Canal,
} from "./identifiant"

/** Délai avant de pouvoir redemander un code. */
const DELAI_RENVOI_MS = 60_000

/**
 * Au-delà, la session écrite par Better Auth n'a pas été relue par le client
 * Convex : on recharge la page, qui la lit au démarrage.
 */
const ATTENTE_SESSION_MS = 8_000

const CANAUX = [
  { value: "telephone", label: "Téléphone" },
  { value: "email", label: "E-mail" },
]

const pasDAbonnement = () => () => {}

/** L'instant présent, lu dans un gestionnaire d'événement (jamais au rendu). */
const maintenant = () => Date.now()

/** Grand écran, lu côté client seulement (faux au rendu serveur). */
function useGrandEcran() {
  return useSyncExternalStore(
    (rappel) => {
      const requete = window.matchMedia("(min-width: 768px)")
      requete.addEventListener("change", rappel)
      return () => requete.removeEventListener("change", rappel)
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => false
  )
}

/**
 * La colonne de gauche, sur grand écran : le logo animé, une fois. C'est le
 * seul écran du site où il joue ; sur téléphone, l'écran reste celui d'une
 * app, sans animation, et le lecteur Lottie n'est pas même chargé.
 */
function PanneauMarque() {
  const grandEcran = useGrandEcran()
  const { resolvedTheme } = useTheme()
  const monte = useSyncExternalStore(
    pasDAbonnement,
    () => true,
    () => false
  )
  return (
    <div className="hidden border-r border-line bg-surface p-10 md:grid md:place-items-center">
      <div className="aspect-[254/126] w-full max-w-[440px]">
        {grandEcran && monte && resolvedTheme && (
          <LogoAnime
            variante="complet"
            fond={resolvedTheme === "dark" ? "sombre" : "clair"}
          />
        )}
      </div>
    </div>
  )
}

function Titre({ children, sous }: { children: ReactNode; sous?: ReactNode }) {
  return (
    <div className="grid gap-2">
      <h1 className="text-[28px] leading-[1.15] font-bold tracking-[-0.01em] text-balance md:text-[32px]">
        {children}
      </h1>
      {sous && <p className="text-small text-ink-muted">{sous}</p>}
    </div>
  )
}

/** Le bouton principal : collé en bas de l'écran sur téléphone, dans le flux sur grand écran. */
function BasDEcran({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-auto grid gap-2 bg-canvas px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] md:static md:mx-0 md:mt-2 md:bg-transparent md:p-0">
      {children}
    </div>
  )
}

/** Erreur écrite sous le champ, sans secousse ni couleur seule : une icône et une phrase. */
function Erreur({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-2 text-[14px] font-medium text-danger-ink"
    >
      <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  )
}

export function Connexion() {
  const parametres = useSearchParams()
  const retour = cheminDeRetour(parametres.get("retour"))
  const naviguer = useNaviguer()
  const enLigne = useOnline()
  const { isLoading, isAuthenticated, isProfileReady, profile } =
    useTravelerAuth()
  const statut = useQuery(api.functions.devAuth.status, {})
  const lireCodeDev = useMutation(api.functions.devAuth.consumeCode)

  const [canalChoisi, setCanalChoisi] = useState<Canal | null>(null)
  const [telephone, setTelephone] = useState("")
  /** Le numéro ou l'adresse auquel le dernier code a été envoyé, sous sa forme normalisée. */
  const [destinataire, setDestinataire] = useState("")
  const [email, setEmail] = useState("")
  const [etape, setEtape] = useState<"identifiant" | "code">("identifiant")
  const [code, setCode] = useState("")
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [verification, setVerification] = useState(false)
  const [verifie, setVerifie] = useState(false)
  const [envoyeLe, setEnvoyeLe] = useState<number | undefined>(undefined)
  const [essais, setEssais] = useState(0)
  const [codeDev, setCodeDev] = useState<string | null>(null)
  const [lectureDev, setLectureDev] = useState(false)
  const [nomPasse, setNomPasse] = useState(false)

  const dev = statut?.developmentEnabled === true
  const smsOuvert = dev || statut?.smsDeliveryEnabled === true
  const emailOuvert = dev || statut?.emailDeliveryEnabled === true
  // Le téléphone d'abord — l'adresse e-mail reste minoritaire au Gabon —,
  // sauf si seul l'e-mail peut réellement recevoir un code.
  const canal: Canal =
    canalChoisi ?? (statut && !smsOuvert && emailOuvert ? "email" : "telephone")
  const canalOuvert = canal === "telephone" ? smsOuvert : emailOuvert

  const aUnNom = Boolean(
    profile?.user.firstName?.trim() || profile?.user.lastName?.trim()
  )
  const pret = isAuthenticated && isProfileReady && Boolean(profile)
  const demanderNom = pret && !aUnNom && !nomPasse

  // Connecté, et nommé (ou le voyageur a remis son nom à plus tard) : on
  // rejoint la page d'où il venait.
  const redirige = useRef(false)
  useEffect(() => {
    if (!pret || demanderNom || redirige.current) return
    redirige.current = true
    naviguer(retour, { remplacer: true })
  }, [pret, demanderNom, naviguer, retour])

  // Le code est accepté, mais la session tarde à atteindre le client Convex.
  useEffect(() => {
    if (!verifie || isAuthenticated) return
    const minuteur = window.setTimeout(
      () => window.location.reload(),
      ATTENTE_SESSION_MS
    )
    return () => window.clearTimeout(minuteur)
  }, [verifie, isAuthenticated])

  function choisirCanal(valeur: string) {
    setCanalChoisi(valeur as Canal)
    setErreur(null)
  }

  async function envoyer(event?: FormEvent) {
    event?.preventDefault()
    setErreur(null)
    if (!enLigne) {
      setErreur(
        "Hors réseau, le code ne peut pas partir. Réessayez une fois le réseau revenu."
      )
      return
    }
    let cible: string
    if (canal === "telephone") {
      // Better Auth n'accepte que les numéros gabonais : +241 suivi de 8 chiffres.
      const lecture = lireTelephone(telephone, { gabonais: true })
      if (!lecture.ok) {
        setErreur(
          lecture.raison === "etranger"
            ? "La connexion par SMS n'accepte que les numéros gabonais (+241). Sinon, utilisez votre adresse e-mail."
            : erreurTelephone(lecture.raison)
        )
        return
      }
      cible = lecture.numero
    } else {
      cible = normaliserEmail(email)
      if (!emailValide(cible)) {
        setErreur(
          "Cette adresse e-mail est incomplète, par exemple nadia@exemple.ga."
        )
        return
      }
    }
    setEnvoi(true)
    try {
      const { error } =
        canal === "telephone"
          ? await authClient.phoneNumber.sendOtp({ phoneNumber: cible })
          : await authClient.emailOtp.sendVerificationOtp({
              email: cible,
              type: "sign-in",
            })
      if (error) {
        setErreur(messageErreur(error, { etape: "envoi", canal }))
        return
      }
      if (etape === "code")
        toast(
          dev
            ? "Un nouveau code est prêt."
            : canal === "telephone"
              ? "Un nouveau code est parti par SMS."
              : "Un nouveau code est parti par e-mail."
        )
      setDestinataire(cible)
      setEtape("code")
      setCode("")
      setEssais(0)
      setCodeDev(null)
      setEnvoyeLe(maintenant())
    } catch {
      setErreur(messageErreur(null, { etape: "envoi", canal }))
    } finally {
      setEnvoi(false)
    }
  }

  async function valider(valeur: string) {
    if (verification) return
    if (valeur.length !== 6) {
      setErreur("Saisissez les 6 chiffres du code.")
      return
    }
    setErreur(null)
    setVerification(true)
    try {
      const { error } =
        canal === "telephone"
          ? await authClient.phoneNumber.verify({
              phoneNumber: destinataire,
              code: valeur,
            })
          : await authClient.signIn.emailOtp({
              email: destinataire,
              otp: valeur,
            })
      if (error) {
        const faits = essais + 1
        setEssais(faits)
        setErreur(
          messageErreur(error, {
            etape: "verification",
            canal,
            essaisRestants: Math.max(0, ESSAIS_PAR_CODE - faits),
          })
        )
        setVerification(false)
        return
      }
      // Le bouton reste en attente jusqu'à l'arrivée de la session.
      setVerifie(true)
    } catch {
      setErreur(messageErreur(null, { etape: "verification", canal }))
      setVerification(false)
    }
  }

  function saisirCode(valeur: string) {
    setCode(valeur)
    if (erreur) setErreur(null)
    // La validation part d'elle-même à la sixième saisie.
    if (valeur.length === 6) void valider(valeur)
  }

  async function afficherCodeDev() {
    setLectureDev(true)
    setErreur(null)
    try {
      const resultat = await lireCodeDev({ identifier: destinataire })
      if (!resultat) {
        setErreur(
          "Aucun code de développement en attente pour cet identifiant. Demandez un nouveau code."
        )
        return
      }
      setCodeDev(resultat.code)
      saisirCode(resultat.code)
    } catch (cause) {
      setErreur(
        cause instanceof Error
          ? cause.message
          : "Le code de développement est illisible."
      )
    } finally {
      setLectureDev(false)
    }
  }

  function modifierIdentifiant() {
    setEtape("identifiant")
    setCode("")
    setErreur(null)
    setCodeDev(null)
  }

  let contenu: ReactNode
  if (demanderNom) {
    contenu = <EtapeNom onPlusTard={() => setNomPasse(true)} />
  } else if (isAuthenticated) {
    // Déjà connecté, ou le code vient d'être accepté : la redirection suit.
    contenu = (
      <Chargeur className="my-auto py-16">Ouverture de votre compte…</Chargeur>
    )
  } else if (isLoading && !verifie) {
    contenu = <SkeletonLines className="border-0 bg-transparent p-0" />
  } else {
    contenu =
      etape === "identifiant" ? (
        <form
          onSubmit={envoyer}
          noValidate
          className="flex flex-1 flex-col gap-5 md:flex-none"
        >
          <Titre
            sous={
              canal === "telephone"
                ? "Un code vous est envoyé par SMS. Pas de mot de passe à retenir."
                : "Un code vous est envoyé par e-mail. Pas de mot de passe à retenir."
            }
          >
            Connexion
          </Titre>
          <SegmentedControl
            label="Se connecter avec"
            size="touch"
            options={CANAUX}
            value={canal}
            onValueChange={choisirCanal}
            className="w-full"
          />
          {canal === "telephone" ? (
            <Field
              label="Numéro de téléphone"
              hint={AIDE_TELEPHONE}
              error={erreur ?? undefined}
              htmlFor="connexion-telephone"
            >
              <ChampTelephone valeur={telephone} onChange={setTelephone} />
            </Field>
          ) : (
            <Field
              label="Adresse e-mail"
              error={erreur ?? undefined}
              htmlFor="connexion-email"
            >
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="nadia@exemple.ga"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
          )}
          <EtatDesEnvois
            canal={canal}
            statut={statut}
            enLigne={enLigne}
            emailOuvert={emailOuvert}
            onEmail={() => choisirCanal("email")}
          />
          <BasDEcran>
            <Button
              type="submit"
              size="lg"
              block
              loading={envoi}
              loadingLabel="Envoi du code…"
              disabled={!canalOuvert || !enLigne || statut === undefined}
            >
              Recevoir le code
            </Button>
            <p className="text-caption text-center font-normal text-ink-muted md:text-left">
              Pas encore de compte ? Il s&apos;ouvre à la première connexion,
              avec le même code.{" "}
              <Link
                href="/conditions"
                className="font-semibold text-accent-ink underline-offset-2 hover:underline"
              >
                Conditions générales
              </Link>
            </p>
          </BasDEcran>
        </form>
      ) : (
        <EtapeCode
          canal={canal}
          identifiant={
            canal === "telephone"
              ? ecritureNationale(destinataire)
              : destinataire
          }
          dev={dev}
          code={code}
          onCode={saisirCode}
          erreur={erreur}
          envoyeLe={envoyeLe}
          renvoiLibre={erreur !== null && essais >= ESSAIS_PAR_CODE}
          envoi={envoi}
          verification={verification || verifie}
          codeDev={codeDev}
          lectureDev={lectureDev}
          onCodeDev={afficherCodeDev}
          onRenvoyer={() => void envoyer()}
          onModifier={modifierIdentifiant}
          onValider={() => void valider(code)}
        />
      )
  }

  return (
    <>
      <BarreApp retour={true} />
      <div className="grid flex-1 md:grid-cols-2">
        <PanneauMarque />
        <div className="flex min-w-0 flex-col px-4 pt-2 md:justify-center md:px-16 md:py-12">
          <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-5 md:flex-none">
            {contenu}
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Ce que le serveur peut réellement envoyer, dit avant que le voyageur ne
 * tape son numéro : un SMS qui ne partira jamais ne s'attend pas.
 */
function EtatDesEnvois({
  canal,
  statut,
  enLigne,
  emailOuvert,
  onEmail,
}: {
  canal: Canal
  statut:
    | {
        developmentEnabled: boolean
        emailDeliveryEnabled: boolean
        smsDeliveryEnabled: boolean
      }
    | undefined
  enLigne: boolean
  emailOuvert: boolean
  onEmail: () => void
}) {
  if (!enLigne) {
    return (
      <InlineMessage tone="warning" title="Hors réseau.">
        Le code arrive par SMS ou par e-mail : il faut du réseau pour le
        recevoir.
      </InlineMessage>
    )
  }
  if (!statut) return null
  const livraison =
    canal === "telephone"
      ? statut.smsDeliveryEnabled
      : statut.emailDeliveryEnabled
  if (livraison) return null
  if (statut.developmentEnabled) {
    return (
      <InlineMessage tone="info" title="Mode développement.">
        {canal === "telephone" ? "Aucun SMS ne part" : "Aucun e-mail ne part"} :
        le code s&apos;affichera sur l&apos;écran suivant.
      </InlineMessage>
    )
  }
  if (canal === "telephone") {
    return (
      <InlineMessage
        tone="warning"
        title="La connexion par SMS n'est pas encore ouverte."
      >
        Aucun service d&apos;envoi de SMS n&apos;est branché.{" "}
        {emailOuvert ? (
          <button
            type="button"
            onClick={onEmail}
            className="font-semibold underline underline-offset-2"
          >
            Recevoir le code par e-mail
          </button>
        ) : (
          "La connexion par e-mail ne l'est pas non plus : se connecter est impossible pour le moment."
        )}
      </InlineMessage>
    )
  }
  return (
    <InlineMessage
      tone="warning"
      title="La connexion par e-mail n'est pas encore ouverte."
    >
      Aucun service d&apos;envoi d&apos;e-mails n&apos;est branché : se
      connecter par e-mail est impossible pour le moment.
    </InlineMessage>
  )
}

function EtapeCode({
  canal,
  identifiant,
  dev,
  code,
  onCode,
  erreur,
  envoyeLe,
  renvoiLibre,
  envoi,
  verification,
  codeDev,
  lectureDev,
  onCodeDev,
  onRenvoyer,
  onModifier,
  onValider,
}: {
  canal: Canal
  identifiant: string
  dev: boolean
  code: string
  onCode: (code: string) => void
  erreur: string | null
  envoyeLe: number | undefined
  /** Le code est détruit : inutile d'attendre la fin du délai pour en redemander un. */
  renvoiLibre: boolean
  envoi: boolean
  verification: boolean
  codeDev: string | null
  lectureDev: boolean
  onCodeDev: () => void
  onRenvoyer: () => void
  onModifier: () => void
  onValider: () => void
}) {
  const restant = useCompteARebours(
    envoyeLe ? envoyeLe + DELAI_RENVOI_MS : undefined
  )
  const titre = dev
    ? "Entrez le code de connexion"
    : canal === "telephone"
      ? "Entrez le code reçu par SMS"
      : "Entrez le code reçu par e-mail"

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onValider()
      }}
      noValidate
      className="flex flex-1 flex-col gap-5 md:flex-none"
    >
      <Titre
        sous={
          <>
            {dev ? "Demandé pour" : "Envoyé au"}{" "}
            <span
              className={cn(
                canal === "telephone" && "tabular",
                "font-medium text-ink"
              )}
            >
              {identifiant}
            </span>{" "}
            ·{" "}
            <button
              type="button"
              onClick={onModifier}
              className="inline-flex min-h-11 items-center font-semibold text-accent-ink underline-offset-2 hover:underline"
            >
              Modifier
            </button>
          </>
        }
      >
        {titre}
      </Titre>

      <div className="grid gap-3">
        <CodeOtp
          valeur={code}
          onChange={onCode}
          invalide={erreur !== null}
          autoFocus
          label="Code de connexion à 6 chiffres"
          // La case courante porte déjà l'anneau de focus ; celui du champ
          // invisible, posé sur toute la rangée, ferait doublon. En erreur, la
          // case n'a plus d'anneau : on garde alors celui de la rangée.
          className={cn(
            erreur === null && "[&_input:focus-visible]:shadow-none"
          )}
        />
        {erreur && <Erreur>{erreur}</Erreur>}
        <p className="text-small text-ink-muted">
          Le code reste valable {VALIDITE_CODE_MINUTES} minutes.
        </p>
      </div>

      {dev && (
        <div className="grid gap-3 rounded-md border border-dashed border-line-strong bg-surface p-4">
          <p className="text-small">
            <b>Mode développement.</b>{" "}
            {canal === "telephone"
              ? "Aucun SMS n'est parti"
              : "Aucun e-mail n'est parti"}{" "}
            : le code se lit ici, une seule fois.
          </p>
          {codeDev ? (
            <p className="text-small text-ink-muted">
              Code :{" "}
              <b className="tabular text-[20px] tracking-[0.18em] text-ink">
                {codeDev}
              </b>
            </p>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-fit"
              loading={lectureDev}
              onClick={onCodeDev}
            >
              Afficher le code
            </Button>
          )}
        </div>
      )}

      <div aria-live="polite">
        {restant > 0 && !renvoiLibre ? (
          <p className="text-small flex min-h-11 items-center text-ink-muted">
            Renvoyer le code dans&nbsp;
            <b className="tabular font-semibold text-ink">
              {formatRebours(restant)}
            </b>
          </p>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="-ml-5"
            loading={envoi}
            loadingLabel="Envoi…"
            onClick={onRenvoyer}
          >
            Renvoyer le code
          </Button>
        )}
      </div>

      <BasDEcran>
        <Button
          type="submit"
          size="lg"
          block
          loading={verification}
          loadingLabel="Vérification…"
          disabled={code.length !== 6 && !verification}
        >
          Valider
        </Button>
      </BasDEcran>
    </form>
  )
}

/**
 * Premier passage : le compte vient d'être ouvert, sans nom. Le nom et la
 * civilité figurent sur les billets ; ils se donnent une fois, ici — le compte
 * porte alors son voyageur « Moi », que le tunnel et Ruban réutilisent sans
 * rien redemander — et se modifient dans le profil.
 */
function EtapeNom({ onPlusTard }: { onPlusTard: () => void }) {
  const majProfil = useMutation(api.functions.customers.updateProfile)
  const [prenom, setPrenom] = useState("")
  const [nom, setNom] = useState("")
  const [civilite, setCivilite] = useState<Civilite | "">("")
  const [erreurs, setErreurs] = useState<{
    prenom?: string
    nom?: string
    civilite?: string
    envoi?: string
  }>({})
  const [envoi, setEnvoi] = useState(false)

  async function enregistrer(event: FormEvent) {
    event.preventDefault()
    const manque = {
      prenom: prenom.trim() ? undefined : "Indiquez votre prénom.",
      nom: nom.trim() ? undefined : "Indiquez votre nom de famille.",
      civilite: civilite
        ? undefined
        : "Choisissez Madame ou Monsieur : la civilité figure sur vos billets.",
    }
    setErreurs(manque)
    if (manque.prenom || manque.nom || !civilite) return
    setEnvoi(true)
    try {
      // Le profil se met à jour en direct : la page repart d'elle-même vers
      // l'écran d'origine dès que le nom est enregistré.
      await majProfil({
        firstName: prenom.trim(),
        lastName: nom.trim(),
        gender: civilite,
      })
    } catch {
      setErreurs({
        envoi:
          "Votre nom n'a pas pu être enregistré. Réessayez dans un instant.",
      })
      setEnvoi(false)
    }
  }

  return (
    <form
      onSubmit={enregistrer}
      noValidate
      className="flex flex-1 flex-col gap-5 md:flex-none"
    >
      <Titre sous="Il figurera sur vos billets, et Ruban ne vous le redemandera pas. Vous pourrez le modifier dans votre profil.">
        Comment vous appelez-vous ?
      </Titre>
      <Field label="Prénom" error={erreurs.prenom} htmlFor="connexion-prenom">
        <Input
          autoComplete="given-name"
          autoFocus
          value={prenom}
          onChange={(event) => setPrenom(event.target.value)}
        />
      </Field>
      <Field label="Nom" error={erreurs.nom} htmlFor="connexion-nom">
        <Input
          autoComplete="family-name"
          value={nom}
          onChange={(event) => setNom(event.target.value)}
        />
      </Field>
      <ChoixCivilite
        valeur={civilite}
        onChange={setCivilite}
        erreur={erreurs.civilite}
        id="connexion-civilite"
      />
      {erreurs.envoi && <Erreur>{erreurs.envoi}</Erreur>}
      <BasDEcran>
        <Button
          type="submit"
          size="lg"
          block
          loading={envoi}
          loadingLabel="Enregistrement…"
        >
          Continuer
        </Button>
        <Button
          type="button"
          variant="ghost"
          block
          onClick={onPlusTard}
          disabled={envoi}
        >
          Plus tard
        </Button>
      </BasDEcran>
    </form>
  )
}
