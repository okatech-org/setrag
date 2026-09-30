"use client"

import {
  BellIcon,
  ClockAlertIcon,
  ReceiptIcon,
  TicketIcon,
  type LucideIcon,
} from "lucide-react"
import type { FunctionReturnType } from "convex/server"
import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { toast } from "sonner"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { cn } from "@workspace/ui/lib/utils"

import { BarreApp } from "@/coquille/barre-app"
import {
  EtiquetteListe,
  ExigeConnexion,
  Page,
} from "@/fonctionnalites/compte/elements"
import { useToday } from "@/hooks/use-today"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"
import { FUSEAU, ajouterJours, dateDeService, heure } from "@/lib/format"

export type Message = FunctionReturnType<
  typeof api.functions.notificationCenter.list
>[number]

/**
 * La pastille de chaque message : une icône et une teinte par nature. Elles
 * ne portent aucune information seules — le titre dit ce qui se passe, et le
 * libellé est lu aux lecteurs d'écran.
 */
const NATURES: Record<
  string,
  { icone: LucideIcon; libelle: string; teinte: string }
> = {
  retard: {
    icone: ClockAlertIcon,
    libelle: "Retard ou suppression",
    teinte: "bg-warning-soft text-warning-ink",
  },
  rappel: {
    icone: BellIcon,
    libelle: "Rappel",
    teinte: "bg-accent-soft text-accent-ink",
  },
  achat: {
    icone: TicketIcon,
    libelle: "Achat",
    teinte: "bg-success-soft text-success-ink",
  },
  remboursement: {
    icone: ReceiptIcon,
    libelle: "Remboursement",
    teinte: "bg-surface-sunk text-ink-muted",
  },
}
const NATURE_PAR_DEFAUT = {
  icone: BellIcon,
  libelle: "Message",
  teinte: "bg-surface-sunk text-ink-muted",
}

const jourDuMois = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU,
  day: "numeric",
  month: "long",
})
const jourDuMoisAnnee = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU,
  day: "numeric",
  month: "long",
  year: "numeric",
})

/** L'instant présent, lu hors du rendu (mise à jour optimiste). */
const maintenant = () => Date.now()

const instant = (message: Message) => message.sentAt ?? message._creationTime

/** « Aujourd'hui », « Hier », « 14 septembre » — à l'heure de Libreville. */
function libelleJour(moment: number, aujourdhui: number): string {
  const jour = dateDeService(moment)
  const ce = dateDeService(aujourdhui)
  if (jour === ce) return "Aujourd'hui"
  if (jour === ajouterJours(ce, -1)) return "Hier"
  return jour.slice(0, 4) === ce.slice(0, 4)
    ? jourDuMois.format(moment)
    : jourDuMoisAnnee.format(moment)
}

/** Le billet concerné, quand le message en désigne un. */
function lienBillet(message: Message): Route | null {
  if (!message.data) return null
  try {
    const donnees = JSON.parse(message.data) as { reference?: unknown }
    return typeof donnees.reference === "string" && donnees.reference
      ? `/billets/${encodeURIComponent(donnees.reference)}`
      : null
  } catch {
    return null
  }
}

/** Non lu : un point ET un mot, jamais la seule couleur. */
function Nouveau() {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-ink">
      <span aria-hidden className="size-2 rounded-pill bg-accent-base" />
      Nouveau
    </span>
  )
}

function LigneMessage({
  message,
  onLire,
}: {
  message: Message
  onLire: (message: Message) => void
}) {
  const nature =
    (message.category && NATURES[message.category]) || NATURE_PAR_DEFAUT
  const Icone = nature.icone
  const nonLu = message.readAt === undefined
  const lien = lienBillet(message)
  const moment = instant(message)

  const contenu: ReactNode = (
    <>
      <span
        aria-hidden
        className={cn(
          "grid size-10 place-items-center rounded-[12px]",
          nature.teinte
        )}
      >
        <Icone className="size-5" />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="sr-only">{nature.libelle} : </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <b className="text-[14.5px] leading-snug font-semibold">
            {message.title}
          </b>
          {nonLu && <Nouveau />}
        </span>
        <span className="text-[13px] leading-[1.4] text-ink-muted">
          {message.body}
        </span>
        {nonLu && !lien && (
          <span className="sr-only">Activer pour le marquer comme lu.</span>
        )}
      </span>
      <time
        dateTime={new Date(moment).toISOString()}
        className="tabular pt-0.5 text-[12px] text-ink-faint"
      >
        {heure(moment)}
      </time>
    </>
  )
  const classe =
    "grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-start gap-3 rounded-[inherit] px-4 py-3 text-left"
  const interactif =
    "relative transition-colors duration-[var(--dur-fast)] hover:bg-surface-sunk focus-visible:z-[1]"

  return (
    <li className="border-t border-line first:rounded-t-md first:border-t-0 last:rounded-b-md">
      {lien ? (
        <Link
          href={lien}
          onClick={() => nonLu && onLire(message)}
          className={cn(classe, interactif)}
        >
          {contenu}
        </Link>
      ) : nonLu ? (
        <button
          type="button"
          onClick={() => onLire(message)}
          className={cn(classe, interactif)}
        >
          {contenu}
        </button>
      ) : (
        <div className={classe}>{contenu}</div>
      )}
    </li>
  )
}

function useMarquage() {
  const lire = useMutation(
    api.functions.notificationCenter.markRead
  ).withOptimisticUpdate((local, { notificationId }) => {
    const liste = local.getQuery(api.functions.notificationCenter.list, {})
    const visee = liste?.find(
      (m) => m._id === notificationId && m.readAt === undefined
    )
    if (!liste || !visee) return
    local.setQuery(
      api.functions.notificationCenter.list,
      {},
      liste.map((m) =>
        m._id === notificationId ? { ...m, readAt: maintenant() } : m
      )
    )
    const compte = local.getQuery(
      api.functions.notificationCenter.unreadCount,
      {}
    )
    if (compte !== undefined)
      local.setQuery(
        api.functions.notificationCenter.unreadCount,
        {},
        Math.max(0, compte - 1)
      )
  })
  const toutLire = useMutation(
    api.functions.notificationCenter.markAllRead
  ).withOptimisticUpdate((local) => {
    const liste = local.getQuery(api.functions.notificationCenter.list, {})
    const lu = maintenant()
    if (liste)
      local.setQuery(
        api.functions.notificationCenter.list,
        {},
        liste.map((m) => (m.readAt === undefined ? { ...m, readAt: lu } : m))
      )
    local.setQuery(api.functions.notificationCenter.unreadCount, {}, 0)
  })
  return {
    lire: (message: Message) =>
      void lire({ notificationId: message._id }).catch(() =>
        toast.error("Le message n'a pas pu être marqué comme lu.")
      ),
    toutLire: () =>
      void toutLire({}).catch(() =>
        toast.error("Les messages n'ont pas pu être marqués comme lus.")
      ),
  }
}

export function ListeMessages({
  messages,
  onLire,
}: {
  messages: Message[]
  onLire: (message: Message) => void
}) {
  const aujourdhui = useToday()
  if (messages.length === 0) {
    return (
      <EmptyState
        title="Aucune notification"
        description="Les messages liés à vos voyages s'afficheront ici. Les alertes de retard automatiques ne sont pas encore en service. En attendant, suivez l'heure réelle de votre train."
        action={
          <Button asChild variant="secondary">
            <Link href="/suivi">Suivre un train</Link>
          </Button>
        }
        className="rounded-md border border-line bg-surface py-8"
      />
    )
  }
  if (aujourdhui === null) return <SkeletonLines />

  // Les messages arrivent du plus récent au plus ancien : on les range par jour.
  const jours: { libelle: string; messages: Message[] }[] = []
  for (const message of messages) {
    const libelle = libelleJour(instant(message), aujourdhui)
    const dernier = jours.at(-1)
    if (dernier?.libelle === libelle) dernier.messages.push(message)
    else jours.push({ libelle, messages: [message] })
  }

  return (
    <div className="grid gap-5">
      {jours.map((jour) => (
        <section
          key={jour.libelle}
          aria-label={jour.libelle}
          className="grid gap-2"
        >
          <EtiquetteListe>{jour.libelle}</EtiquetteListe>
          <ul className="rounded-md border border-line bg-surface">
            {jour.messages.map((message) => (
              <LigneMessage
                key={message._id}
                message={message}
                onLire={onLire}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * Les notifications du voyageur, ouvertes depuis la cloche. Un message non lu
 * le devient quand on le touche ; « Tout lire » les solde d'un geste.
 */
export function Notifications() {
  const { isAuthenticated, isProfileReady, profile } = useTravelerAuth()
  const pret =
    isAuthenticated && isProfileReady && Boolean(profile?.user.isActive)
  const messages = useQuery(
    api.functions.notificationCenter.list,
    pret ? {} : "skip"
  )
  const { lire, toutLire } = useMarquage()
  const nonLus = messages?.filter((m) => m.readAt === undefined).length ?? 0

  return (
    <>
      <BarreApp
        titre="Notifications"
        sousTitre={
          nonLus > 0 ? `${nonLus} non lue${nonLus > 1 ? "s" : ""}` : undefined
        }
        retour={true}
        actions={
          nonLus > 0 && (
            <button
              type="button"
              onClick={toutLire}
              className="min-h-11 rounded-pill px-3 text-[15px] font-semibold text-accent-ink active:bg-surface-sunk"
            >
              Tout lire
            </button>
          )
        }
      />
      <div className="mx-auto hidden w-full max-w-[1240px] px-8 pt-10 md:block">
        <div className="flex max-w-[720px] flex-wrap items-end justify-between gap-3">
          <h1 className="text-h1">Notifications</h1>
          {nonLus > 0 && (
            <Button variant="ghost" onClick={toutLire}>
              Tout marquer comme lu
            </Button>
          )}
        </div>
      </div>
      <Page>
        <ExigeConnexion
          invitation={{
            titre: "Connectez-vous pour lire vos notifications",
            texte:
              "Les messages sur vos voyages sont rattachés à votre compte.",
          }}
        >
          {() =>
            messages === undefined ? (
              <SkeletonLines />
            ) : (
              <ListeMessages messages={messages} onLire={lire} />
            )
          }
        </ExigeConnexion>
      </Page>
    </>
  )
}
