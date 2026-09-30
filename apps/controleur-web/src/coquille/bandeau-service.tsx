"use client"

import {
  ChevronRightIcon,
  CircleAlertIcon,
  CloudCheckIcon,
  CloudOffIcon,
  KeyRoundIcon,
  RefreshCwIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@workspace/ui/lib/utils"

import { useTerminal } from "@/fonctionnalites/terminal/contexte-terminal"
import { useMaintenant } from "@/hooks/use-maintenant"
import { useOnline } from "@/hooks/use-online"
import { etatDuBandeau, type EtatBandeau, type TonBandeau } from "@/lib/bandeau"

const ICONES: Record<TonBandeau, LucideIcon> = {
  "en-ligne": CloudCheckIcon,
  "hors-ligne": CloudOffIcon,
  envoi: RefreshCwIcon,
  session: KeyRoundIcon,
  echec: CircleAlertIcon,
}

/**
 * Le bandeau lui-même : 44 px, sous la barre d'état, sur chaque écran — même
 * verrouillé. L'état s'écrit en toutes lettres ; la couleur ne fait que le
 * renforcer.
 */
function Bandeau({ etat, href }: { etat: EtatBandeau; href?: "/historique" }) {
  const Icone = ICONES[etat.ton]
  const contenu = (
    <>
      <Icone
        aria-hidden
        className={cn(
          "size-[18px] shrink-0",
          etat.ton === "en-ligne" && "text-success-ink"
        )}
      />
      <span className="min-w-0 truncate">
        <b className="font-bold">{etat.titre}</b>
        {etat.compte !== undefined ? (
          <>
            {" · "}
            <span className="inline-grid h-[22px] min-w-[22px] place-items-center rounded-pill bg-warning-soft px-1.5 font-mono text-[12.5px] font-bold text-warning-ink">
              {etat.compte}
            </span>
            {etat.detail && ` ${etat.detail}`}
          </>
        ) : (
          etat.detail && ` · ${etat.detail}`
        )}
      </span>
      {(etat.fin || href) && (
        <span
          className={cn(
            "ml-auto inline-flex shrink-0 items-center gap-0.5 text-[13px]",
            etat.ton === "echec" ? "text-danger-ink" : "text-ink-muted"
          )}
        >
          {etat.fin && (
            // Le compte à rebours d'une reprise change chaque seconde : il se
            // voit, mais ne s'annonce pas en boucle aux lecteurs d'écran.
            <span
              className="tabular"
              aria-hidden={etat.ton === "echec" || undefined}
            >
              {etat.fin}
            </span>
          )}
          {href && <ChevronRightIcon aria-hidden className="size-4" />}
        </span>
      )}
    </>
  )

  const classes = cn(
    "relative flex min-h-11 items-center gap-2.5 overflow-hidden border-b border-line pr-2.5 pl-4 text-[13.5px] font-medium whitespace-nowrap text-ink",
    etat.ton === "en-ligne" || etat.ton === "envoi"
      ? "bg-surface"
      : "bg-surface-sunk",
    etat.ton === "echec" && "bg-danger-soft text-danger-ink",
    etat.ton === "envoi" && "bandeau-envoi"
  )

  return (
    <div className="pt-safe sticky top-0 z-40 bg-surface-sunk" role="status">
      {href ? (
        <Link
          href={href}
          className={classes}
          aria-label={`${libelle(etat)} — ouvrir la file d'envoi`}
        >
          {contenu}
        </Link>
      ) : (
        <div className={classes}>{contenu}</div>
      )}
    </div>
  )
}

function libelle(etat: EtatBandeau): string {
  return [
    etat.titre,
    etat.compte !== undefined
      ? `${etat.compte} ${etat.detail ?? ""}`.trim()
      : etat.detail,
    etat.ton === "echec" ? "nouvel essai automatique" : etat.fin,
  ]
    .filter(Boolean)
    .join(", ")
}

/**
 * Bandeau d'une tournée : réseau, file d'envoi, heure de la dernière
 * synchronisation. Le toucher ouvre la file d'envoi.
 */
export function BandeauService() {
  const terminal = useTerminal()
  const chemin = usePathname()
  // Le compte à rebours d'une reprise ne bat à la seconde qu'en échec.
  const maintenant = useMaintenant(terminal.queue.failed > 0 ? 1000 : 30_000)
  const etat = etatDuBandeau(
    {
      online: terminal.online,
      authenticated: terminal.authenticated,
      syncing: terminal.syncing,
      progress: terminal.progress,
      queue: terminal.queue,
      lastSyncAt: terminal.settings.lastSyncAt,
      nextRetryAt: terminal.nextRetryAt,
    },
    maintenant ?? 0
  )
  const lien = chemin !== "/historique" && terminal.queue.total > 0
  return <Bandeau etat={etat} href={lien ? "/historique" : undefined} />
}

/** Bandeau de l'écran de connexion : la session reste à ouvrir, en gare. */
export function BandeauConnexion() {
  const online = useOnline()
  return (
    <Bandeau
      etat={
        online
          ? { ton: "en-ligne", titre: "En ligne", detail: "session à ouvrir" }
          : {
              ton: "hors-ligne",
              titre: "Hors ligne",
              detail: "réseau requis pour ouvrir la session",
            }
      }
    />
  )
}
