"use client"

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  WifiOffIcon,
  type LucideIcon,
} from "lucide-react"
import type { FunctionReturnType } from "convex/server"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useId, useState, type ReactNode } from "react"

import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/choice"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { cn } from "@workspace/ui/lib/utils"

import { BarreApp } from "@/coquille/barre-app"
import { useNaviguer } from "@/coquille/filet-navigation"
import { useOnline } from "@/hooks/use-online"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"
import { seDeconnecter } from "@/lib/offline/deconnexion"

export type ProfilVoyageur = NonNullable<
  FunctionReturnType<typeof api.functions.customers.me>
>

/** Conteneur des écrans du compte : la largeur du site, une colonne de lecture sur grand écran. */
export function Page({
  children,
  large,
  className,
}: {
  children: ReactNode
  large?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1240px] px-4 pt-2 pb-10 md:px-8 md:pt-8 md:pb-16",
        className
      )}
    >
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)] gap-6",
          !large && "md:max-w-[720px]"
        )}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * En-tête d'une sous-page du compte : la barre d'app avec son retour sur
 * téléphone, un lien de retour et le titre sur grand écran.
 */
export function EnTeteSousPage({
  titre,
  sousTitre,
  retour = "/compte",
  libelleRetour = "Compte",
  actions,
  actionsBureau,
}: {
  titre: string
  sousTitre?: ReactNode
  retour?: Route
  libelleRetour?: string
  /** Actions de la barre d'app (téléphone). */
  actions?: ReactNode
  /** Actions à droite du titre (grand écran). */
  actionsBureau?: ReactNode
}) {
  return (
    <>
      <BarreApp
        titre={titre}
        sousTitre={sousTitre}
        retour={retour}
        actions={actions}
      />
      <div className="mx-auto hidden w-full max-w-[1240px] px-8 pt-8 md:block">
        <Link
          href={retour}
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-pill pr-3 pl-1 text-[14px] font-semibold text-accent-ink hover:bg-accent-soft"
        >
          <ChevronLeftIcon className="size-5" aria-hidden />
          {libelleRetour}
        </Link>
        <div className="flex max-w-[720px] flex-wrap items-end justify-between gap-3">
          <h1 className="text-h1">{titre}</h1>
          {actionsBureau}
        </div>
      </div>
    </>
  )
}

/** Étiquette au-dessus d'une liste : « ALERTES », « INFORMATIONS ». */
export function EtiquetteListe({
  children,
  id,
}: {
  children: ReactNode
  id?: string
}) {
  return (
    <h2
      id={id}
      className="px-1 text-[12px] font-bold tracking-[0.06em] text-ink-muted uppercase"
    >
      {children}
    </h2>
  )
}

/** Section de lignes, comme dans les réglages d'un téléphone. */
export function Section({
  titre,
  children,
  className,
}: {
  titre?: string
  children: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={titre ? id : undefined}
      className={cn("grid gap-2", className)}
    >
      {titre && <EtiquetteListe id={id}>{titre}</EtiquetteListe>}
      <ul className="rounded-md border border-line bg-surface">{children}</ul>
    </section>
  )
}

const ligneBase =
  "relative flex min-h-14 w-full items-center gap-3 rounded-[inherit] px-4 py-2 text-left text-[15px] font-medium transition-colors duration-[var(--dur-fast)] focus-visible:z-[1]"

function ContenuLigne({
  icone: Icone,
  debut,
  libelle,
  detail,
  fin,
  chevron,
}: {
  icone?: LucideIcon
  debut?: ReactNode
  libelle: ReactNode
  detail?: ReactNode
  fin?: ReactNode
  chevron: boolean
}) {
  return (
    <>
      {Icone && (
        <Icone className="size-5 shrink-0 text-ink-muted" aria-hidden />
      )}
      {debut}
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate">{libelle}</span>
        {detail && (
          <span className="text-[12.5px] leading-snug font-normal text-ink-muted">
            {detail}
          </span>
        )}
      </span>
      {fin !== undefined && (
        <span className="shrink-0 text-[14px] font-medium text-ink-muted">
          {fin}
        </span>
      )}
      {chevron && (
        <ChevronRightIcon
          className="size-[18px] shrink-0 text-ink-faint"
          aria-hidden
        />
      )}
    </>
  )
}

/** Une ligne de liste : un lien, un bouton, ou un simple constat. Au moins 56 px de haut. */
export function Ligne({
  icone,
  debut,
  libelle,
  detail,
  fin,
  href,
  onClick,
  ton,
  chevron,
  "aria-label": ariaLabel,
}: {
  icone?: LucideIcon
  /** Élément de tête libre (un avatar), à la place de l'icône. */
  debut?: ReactNode
  libelle: ReactNode
  detail?: ReactNode
  fin?: ReactNode
  href?: Route
  onClick?: () => void
  ton?: "danger"
  chevron?: boolean
  "aria-label"?: string
}) {
  const interactif = Boolean(href || onClick)
  const avecChevron = chevron ?? interactif
  const classe = cn(
    ligneBase,
    interactif && "hover:bg-surface-sunk active:bg-surface-sunk",
    ton === "danger" && "text-danger-ink [&>svg:first-child]:text-danger-ink"
  )
  const contenu = (
    <ContenuLigne
      icone={icone}
      debut={debut}
      libelle={libelle}
      detail={detail}
      fin={fin}
      chevron={avecChevron}
    />
  )
  return (
    <li className="border-t border-line first:rounded-t-md first:border-t-0 last:rounded-b-md">
      {href ? (
        <Link href={href} className={classe} aria-label={ariaLabel}>
          {contenu}
        </Link>
      ) : onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={classe}
          aria-label={ariaLabel}
        >
          {contenu}
        </button>
      ) : (
        <div className={classe}>{contenu}</div>
      )}
    </li>
  )
}

/** Une ligne portant un interrupteur, le libellé à gauche, l'explication dessous. */
export function LigneInterrupteur({
  libelle,
  detail,
  checked,
  onCheckedChange,
  disabled,
}: {
  libelle: string
  detail?: ReactNode
  checked: boolean
  onCheckedChange: (valeur: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <li className="grid gap-0.5 border-t border-line px-4 py-1.5 first:border-t-0">
      <Switch
        label={libelle}
        checked={checked}
        onCheckedChange={(valeur) => onCheckedChange(valeur === true)}
        disabled={disabled}
        aria-describedby={detail ? id : undefined}
        className="min-h-12 flex-row-reverse justify-between font-medium"
      />
      {detail && (
        <p id={id} className="pb-2 text-[12.5px] leading-snug text-ink-muted">
          {detail}
        </p>
      )}
    </li>
  )
}

/** Carte de contenu libre, alignée sur les listes. */
export function Carte({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "grid gap-3 rounded-md border border-line bg-surface p-4",
        className
      )}
    >
      {children}
    </div>
  )
}

/** Invitation à se connecter : jamais une redirection brutale, toujours une explication. */
export function InvitationConnexion({
  titre,
  children,
}: {
  titre: string
  children?: ReactNode
}) {
  const chemin = usePathname()
  return (
    <Carte className="justify-items-start gap-3 p-5">
      <h2 className="text-[18px] leading-snug font-bold">{titre}</h2>
      {children && <div className="text-small text-ink-muted">{children}</div>}
      <p className="text-small text-ink-muted">
        Un code à usage unique suffit, sans mot de passe.
      </p>
      <Button asChild size="lg" className="mt-1 w-full md:w-auto">
        <Link href={{ pathname: "/connexion", query: { retour: chemin } }}>
          Se connecter
        </Link>
      </Button>
    </Carte>
  )
}

/**
 * Hors réseau, la session ne peut pas être revalidée : le voyageur paraît
 * déconnecté sans l'être. On ne l'invite donc pas à se reconnecter, et rien
 * n'est effacé : ses billets enregistrés restent dans « Billets ».
 */
export function HorsReseau({ children }: { children?: ReactNode }) {
  return (
    <Carte className="justify-items-start gap-3 p-5">
      <p className="flex items-center gap-2 text-[17px] font-bold">
        <WifiOffIcon className="size-5 shrink-0 text-ink-muted" aria-hidden />
        Hors réseau
      </p>
      <p className="text-small text-ink-muted">
        {children ?? "Votre compte ne peut pas être vérifié sans réseau."} Les
        billets enregistrés sur cet appareil restent lisibles, et le contrôleur
        les lit sans réseau.
      </p>
      <Button asChild variant="secondary">
        <Link href="/billets">Voir mes billets</Link>
      </Button>
    </Carte>
  )
}

/**
 * Le motif d'un refus du serveur (« 1 réservation(s) en cours… »), tel que
 * Convex le transmet en développement. En production, le message d'une
 * erreur ordinaire est masqué : on retombe alors sur la phrase de repli.
 */
export function messageServeur(cause: unknown, repli: string): string {
  const message = cause instanceof Error ? cause.message : ""
  const debut = message.indexOf("Uncaught Error: ")
  if (debut < 0) return repli
  return (
    message
      .slice(debut + "Uncaught Error: ".length)
      .split("\n")[0]
      ?.trim() || repli
  )
}

/**
 * Compte désactivé — supprimé par son titulaire, ou suspendu par
 * l'administration : la session survit, le profil ne donne plus accès à rien.
 * On propose de fermer la session ; la billetterie reste utilisable en invité.
 */
export function CompteSupprime() {
  const naviguer = useNaviguer()
  const [enCours, setEnCours] = useState(false)
  return (
    <Carte className="justify-items-start gap-3 p-5">
      <h2 className="text-[18px] leading-snug font-bold">
        Ce compte n’est plus actif.
      </h2>
      <p className="text-small text-ink-muted">
        Il ne donne plus accès à des billets ni à des réglages. Déconnectez-vous
        pour continuer sans compte ; si vous n’avez pas supprimé ce compte
        vous-même, adressez-vous à un guichet SETRAG.
      </p>
      <Button
        variant="secondary"
        loading={enCours}
        onClick={async () => {
          setEnCours(true)
          await seDeconnecter().catch(() => {})
          naviguer("/", { remplacer: true })
        }}
      >
        Se déconnecter
      </Button>
    </Carte>
  )
}

/**
 * Garde des sous-pages du compte : chargement, hors réseau, invitation à se
 * connecter, puis le contenu, qui reçoit le profil prêt à l'emploi.
 */
export function ExigeConnexion({
  invitation,
  children,
}: {
  invitation: { titre: string; texte?: ReactNode }
  children: (profil: ProfilVoyageur) => ReactNode
}) {
  const { isLoading, isAuthenticated, isProfileReady, profile } =
    useTravelerAuth()
  const enLigne = useOnline()
  if (isLoading) return <SkeletonLines />
  if (!isAuthenticated) {
    if (!enLigne) return <HorsReseau />
    return (
      <InvitationConnexion titre={invitation.titre}>
        {invitation.texte}
      </InvitationConnexion>
    )
  }
  if (profile && !profile.user.isActive) return <CompteSupprime />
  if (!isProfileReady || !profile) return <SkeletonLines />
  return <>{children(profile)}</>
}
