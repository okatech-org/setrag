"use client"

import {
  Ban,
  CircleCheck,
  Clock,
  Lock,
  RotateCcw,
  ScanLine,
  TimerOff,
  Undo2,
  WifiOff,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Stepper } from "@workspace/ui/components/stepper"
import { Tag } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

import { LienBouton } from "@/components/charte"
import { ETATS_OPERATION, type EtatOperation } from "@/lib/agent-data"

/* ═══════════════════════════════ Touche ═══════════════════════════════════ */

/** Touche du clavier, telle qu'écrite sur le bouton qu'elle déclenche. */
export function Touche({ children, surAccent, className }: { children: ReactNode; surAccent?: boolean; className?: string }) {
  return (
    <kbd
      className={cn(
        "tabular inline-grid h-[22px] min-w-[22px] shrink-0 place-items-center rounded-[6px] border border-b-2 px-1.5 text-[11.5px] font-semibold",
        surAccent ? "border-ink-inverse/45 bg-transparent text-ink-inverse" : "border-line-strong bg-surface text-ink-muted",
        className
      )}
    >
      {children}
    </kbd>
  )
}

/* ═════════════════════════ Tunnel de vente ════════════════════════════════ */

export const ETAPES_TUNNEL = ["Trajet", "Places", "Voyageurs", "Encaissement"] as const

/** En-tête d'une étape du tunnel : titre à gauche, étapes à droite. */
export function EnTeteTunnel({ titre, texte, etape }: { titre: string; texte?: ReactNode; etape: number }) {
  return (
    <header className="grid items-end gap-x-6 gap-y-4 xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="grid min-w-0 gap-1">
        <span className="text-[12px] font-medium tracking-[0.08em] text-accent-ink uppercase">Guichet · vente de billet</span>
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.01em]">{titre}</h1>
        {texte ? <p className="text-small max-w-[70ch] text-ink-muted">{texte}</p> : null}
      </div>
      <Stepper steps={ETAPES_TUNNEL.map((label) => ({ label }))} current={etape} className="pb-0.5" />
    </header>
  )
}

export interface ActionBarre {
  libelle: ReactNode
  touche?: string
  icone?: LucideIcon
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  loadingLabel?: string
}

/**
 * Barre d'action collée en bas du tunnel : résumé de la vente, total, et le
 * seul bouton principal de l'écran, avec sa touche.
 */
export function BarreVente({
  titre,
  resume,
  total,
  action,
  retour,
}: {
  titre?: ReactNode
  resume?: ReactNode
  total?: ReactNode
  action: ActionBarre
  retour?: { libelle: string; onClick: () => void }
}) {
  const Icone = action.icone
  return (
    <div className="sticky bottom-0 z-20 -mx-4 -mb-6 mt-auto border-t border-line bg-surface px-4 py-3 shadow-[0_-6px_18px_oklch(0.22_0.025_257/0.06)] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 print:hidden">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {retour ? (
          <Button type="button" variant="ghost" onClick={retour.onClick}>
            <Undo2 aria-hidden />
            {retour.libelle}
          </Button>
        ) : null}
        <div className="grid min-w-0 flex-1 text-[13px] text-ink-muted">
          {titre ? <b className="truncate text-[15px] font-bold text-ink">{titre}</b> : null}
          {resume ? <span className="truncate">{resume}</span> : null}
        </div>
        {total !== undefined ? (
          <div className="text-right text-[13px] text-ink-muted">
            Total
            <b className="block text-[22px] leading-tight font-bold text-ink tabular-nums">{total}</b>
          </div>
        ) : null}
        <Button
          type="button"
          size="lg"
          data-action-principale
          onClick={action.onClick}
          disabled={action.disabled}
          loading={action.loading}
          loadingLabel={action.loadingLabel}
          className="w-full min-w-0 sm:w-auto"
        >
          {Icone ? <Icone aria-hidden /> : null}
          <span className="truncate">{action.libelle}</span>
          {action.touche ? <Touche surAccent>{action.touche}</Touche> : null}
        </Button>
      </div>
    </div>
  )
}

/* ═════════════════════════════ États ══════════════════════════════════════ */

/** Caisse fermée : rien ne se vend, et l'écran dit où l'ouvrir. */
export function CaisseFermee({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-md border-l-[3px] border-l-warning bg-warning-soft px-4 py-3 text-[15px] text-warning-ink",
        className
      )}
    >
      <Lock aria-hidden className="size-5 shrink-0" />
      <p className="min-w-0 flex-1">
        <b className="font-semibold">Caisse fermée.</b> Rien ne se vend tant que la caisse n&apos;est pas ouverte avec son fonds.
      </p>
      <LienBouton href="/vente/caisse" variante="secondary" taille="sm">
        Ouvrir la caisse
      </LienBouton>
    </div>
  )
}

/** Hors réseau : la vente électronique s'arrête, le carnet de secours prend le relais. */
export function HorsReseau({ className }: { className?: string }) {
  return (
    <InlineMessage tone="warning" title="Réseau perdu." className={className}>
      <span className="inline-flex flex-wrap items-center gap-2">
        <WifiOff aria-hidden className="size-4" />
        Les ventes électroniques sont suspendues. Vendez sur le carnet de secours, puis ressaisissez chaque souche au retour du réseau.
      </span>
    </InlineMessage>
  )
}

/** Erreur de lecture : la phrase dit quoi faire. */
export function ErreurLecture({ titre, children }: { titre: string; children?: ReactNode }) {
  return (
    <InlineMessage tone="danger" title={titre}>
      {children ?? "Rechargez la page. Si l'erreur persiste, prévenez le chef de gare."}
    </InlineMessage>
  )
}

const ICONES_ETAT: Record<EtatOperation, LucideIcon> = {
  emis: CircleCheck,
  enregistre: CircleCheck,
  controle: ScanLine,
  annule: Ban,
  rembourse: RotateCcw,
  annulation: Ban,
  remboursement: RotateCcw,
  en_attente: Clock,
  expire: TimerOff,
}

/** État d'une opération : le mot porte l'information, l'icône la renforce. */
export function PastilleEtat({ etat }: { etat: string }) {
  const connu = ETATS_OPERATION[etat as EtatOperation]
  if (!connu) return <Tag tone="neutral">{etat}</Tag>
  const Icone = ICONES_ETAT[etat as EtatOperation]
  return (
    <Tag tone={connu.ton}>
      <Icone aria-hidden />
      {connu.libelle}
    </Tag>
  )
}

/* ════════════════════════════ Mise en page ════════════════════════════════ */

/** Deux colonnes : contenu, puis colonne latérale de 360 px dès xl. */
export function GrilleLaterale({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]", className)}>{children}</div>
}

export function Pile({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid min-w-0 content-start gap-4", className)}>{children}</div>
}

/** Ligne de récapitulatif : libellé à gauche, montant mono à droite. */
export function LigneRecap({ libelle, valeur, fort }: { libelle: ReactNode; valeur: ReactNode; fort?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", fort ? "border-t border-line pt-3 text-[18px] font-bold" : "text-[14px] text-ink-muted")}>
      <span className="min-w-0">{libelle}</span>
      <span className={cn("tabular shrink-0 whitespace-nowrap", fort ? "text-ink" : "text-ink")}>{valeur}</span>
    </div>
  )
}

/** Récapitulatif encadré : en-tête (trajet, desserte), lignes, total. */
export function Recap({ titre, sousTitre, children, className }: { titre: ReactNode; sousTitre?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-md border border-line bg-surface", className)}>
      <header className="grid gap-1 border-b border-line p-4">
        <b className="text-[17px] font-bold">{titre}</b>
        {sousTitre ? <span className="tabular text-[13px] text-ink-muted">{sousTitre}</span> : null}
      </header>
      <div className="grid gap-2.5 p-4 pt-3">{children}</div>
    </section>
  )
}

/** Encart d'information à icône : option, conséquence, rappel. */
export function Encart({ icone: Icone, titre, children, ton = "neutre" }: { icone: LucideIcon; titre: ReactNode; children?: ReactNode; ton?: "neutre" | "info" | "attention" }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md px-4 py-3 text-[14px]",
        ton === "info" ? "bg-info-soft text-info-ink" : ton === "attention" ? "bg-warning-soft text-warning-ink" : "bg-surface-sunk text-ink-muted"
      )}
    >
      <Icone aria-hidden className="mt-0.5 size-[18px] shrink-0" />
      <span className="grid gap-0.5">
        <b className={cn("font-semibold", ton === "neutre" && "text-ink")}>{titre}</b>
        {children ? <small className="text-[13px]">{children}</small> : null}
      </span>
    </div>
  )
}
