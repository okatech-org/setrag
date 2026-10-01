"use client"

import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  Clock3,
  LockOpen,
  RotateCcw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"
import { useState, type ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Field, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

import { erreurLisible } from "./format"

/* ============================================================ Exécution */

/**
 * Exécute une action serveur en gardant son état : en cours, réussite
 * (message écrit), erreur (message du serveur, première ligne).
 */
export function useExecution() {
  const [enCours, setEnCours] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ton: "success" | "danger"; titre: string; detail?: string } | null>(null)

  async function executer<T>(cle: string, action: () => Promise<T>, succes: (resultat: T) => string | { titre: string; detail?: string }) {
    setEnCours(cle)
    setMessage(null)
    try {
      const resultat = await action()
      const texte = succes(resultat)
      setMessage(typeof texte === "string" ? { ton: "success", titre: texte } : { ton: "success", ...texte })
      return resultat
    } catch (cause) {
      setMessage({ ton: "danger", titre: "Action impossible", detail: erreurLisible(cause) })
      return undefined
    } finally {
      setEnCours(null)
    }
  }

  const retour = message ? (
    <InlineMessage tone={message.ton} title={message.titre} role={message.ton === "danger" ? "alert" : "status"}>
      {message.detail}
    </InlineMessage>
  ) : null

  return { enCours, executer, retour, effacer: () => setMessage(null) }
}

/* ========================================================= États lisibles */

export type Forme = "ok" | "degrade" | "hs" | "neutre" | "attente"

/**
 * Pastille d’état d’un service : la FORME dit l’état autant que la teinte
 * (rond : opérationnel, triangle : dégradé, carré : hors service, cercle
 * vide : sans objet), et le libellé l’écrit toujours.
 */
export function PastilleEtat({ forme, children, className }: { forme: Forme; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[13px] font-semibold",
        forme === "ok" && "text-success-ink",
        forme === "degrade" && "text-warning-ink",
        forme === "hs" && "text-danger-ink",
        (forme === "neutre" || forme === "attente") && "text-ink-muted",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-2.5 shrink-0",
          forme === "ok" && "rounded-full bg-success",
          forme === "degrade" && "bg-warning-ink [clip-path:polygon(50%_0,100%_100%,0_100%)]",
          forme === "hs" && "rounded-[2px] bg-danger",
          forme === "neutre" && "rounded-full border-2 border-ink-faint",
          forme === "attente" && "rounded-full border-2 border-dashed border-ink-muted"
        )}
      />
      {children}
    </span>
  )
}

export type EtatCaisse = "ouverte" | "juste" | "a_justifier" | "a_viser" | "recomptage" | "visee"

export const ETATS_CAISSE: Record<
  EtatCaisse,
  { libelle: string; ton: "success" | "warning" | "danger" | "neutral" | "info" | "accent"; icone: LucideIcon }
> = {
  ouverte: { libelle: "Ouverte", ton: "neutral", icone: LockOpen },
  juste: { libelle: "Juste", ton: "success", icone: CircleCheck },
  a_justifier: { libelle: "À justifier", ton: "danger", icone: CircleAlert },
  a_viser: { libelle: "À viser", ton: "warning", icone: TriangleAlert },
  recomptage: { libelle: "Recomptage demandé", ton: "info", icone: RotateCcw },
  visee: { libelle: "Visée", ton: "accent", icone: CircleCheck },
}

export function TagCaisse({ etat }: { etat: EtatCaisse }) {
  const e = ETATS_CAISSE[etat]
  const Icone = e.icone
  return (
    <Tag tone={e.ton}>
      <Icone aria-hidden />
      {e.libelle}
    </Tag>
  )
}

export type EtatExport = "en_attente" | "envoye" | "integre" | "echec" | null | undefined

export function TagDeversement({ etat, journal }: { etat: EtatExport; journal: boolean }) {
  if (!journal) {
    return (
      <Tag tone="neutral">
        <CircleDashed aria-hidden />
        Journal à engendrer
      </Tag>
    )
  }
  if (etat === "integre" || etat === "envoye") {
    return (
      <Tag tone="success">
        <CircleCheck aria-hidden />
        Intégré
      </Tag>
    )
  }
  if (etat === "echec") {
    return (
      <Tag tone="danger">
        <CircleX aria-hidden />
        Rejeté
      </Tag>
    )
  }
  return (
    <Tag tone="warning">
      <Clock3 aria-hidden />
      En file
    </Tag>
  )
}

export function TagJournee({ statut }: { statut: "ouverte" | "cloturee" }) {
  return statut === "cloturee" ? (
    <Tag tone="neutral">
      <CircleMinus aria-hidden />
      Clôturée
    </Tag>
  ) : (
    <Tag tone="info">
      <LockOpen aria-hidden />
      Ouverte
    </Tag>
  )
}

/* ================================================================ Écart */

/** Bandeau d’écart de caisse : manque, excédent ou juste, écrit en toutes lettres. */
export function BandeauEcart({ valeur, sousTitre }: { valeur: number; sousTitre?: ReactNode }) {
  const genre = valeur === 0 ? "juste" : valeur < 0 ? "manque" : "excedent"
  const Icone = genre === "juste" ? CircleCheck : CircleAlert
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md px-4 py-3.5 text-[14px] font-medium",
        genre === "juste" && "bg-success-soft text-success-ink",
        genre === "manque" && "bg-danger-soft text-danger-ink",
        genre === "excedent" && "bg-warning-soft text-warning-ink"
      )}
    >
      <Icone aria-hidden className="size-[22px] shrink-0" />
      <span className="grid">
        <b className="text-[16px] font-bold">
          {genre === "juste" ? "Caisse juste" : genre === "manque" ? "Manque en caisse" : "Excédent en caisse"}
        </b>
        {sousTitre}
      </span>
      <span className="ml-auto text-[22px] font-bold tabular-nums">
        {valeur === 0 ? "0" : `${valeur > 0 ? "+" : "−"}${Math.abs(Math.round(valeur)).toLocaleString("fr-FR")}`}
        <small className="ml-1 text-[13px] font-semibold">XAF</small>
      </span>
    </div>
  )
}

/* ============================================================ Mise en page */

/** Liste et dossier côte à côte sur grand écran, l’un sous l’autre ailleurs. */
export function ListeEtDossier({ liste, dossier, large }: { liste: ReactNode; dossier: ReactNode; large?: boolean }) {
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-5",
        large ? "2xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]" : "xl:grid-cols-[minmax(0,1fr)_380px]"
      )}
    >
      <div className="grid min-w-0 gap-5">{liste}</div>
      <div className="grid min-w-0 gap-5 xl:sticky xl:top-4">{dossier}</div>
    </div>
  )
}

/* ================================================== Dialogue avec motif */

/**
 * Confirmation d’une action tracée : le motif est obligatoire et part au
 * journal d’audit avec l’action.
 */
export function DialogueMotif({
  ouvert,
  surFermeture,
  titre,
  description,
  libelleMotif = "Motif",
  aide = "Repris au journal d’audit avec l’action.",
  libelleAction,
  danger,
  enCours,
  surConfirmation,
  children,
}: {
  ouvert: boolean
  surFermeture: () => void
  titre: string
  description: ReactNode
  libelleMotif?: string
  aide?: string
  libelleAction: string
  danger?: boolean
  enCours?: boolean
  surConfirmation: (motif: string) => void | Promise<unknown>
  children?: ReactNode
}) {
  const [motif, setMotif] = useState("")
  const [erreur, setErreur] = useState("")
  return (
    <Dialog
      open={ouvert}
      onOpenChange={(open) => {
        if (!open) {
          setMotif("")
          setErreur("")
          surFermeture()
        }
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-h3">{titre}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            if (motif.trim().length < 5) {
              setErreur("Écrivez un motif d’au moins 5 caractères.")
              return
            }
            setErreur("")
            await surConfirmation(motif.trim())
            setMotif("")
          }}
        >
          {children}
          <Field label={libelleMotif} hint={aide} error={erreur || undefined}>
            <Textarea value={motif} onChange={(event) => setMotif(event.target.value)} rows={3} maxLength={500} />
          </Field>
          <DialogFooter>
            <Button type="submit" variant={danger ? "danger" : "secondary"} loading={enCours} loadingLabel="Enregistrement…">
              {libelleAction}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ============================================================ Petites pièces */

/** Chiffre de cellule : mono, chiffres tabulaires, aligné à droite par la colonne. */
export function Chiffre({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono tabular-nums", className)}>{children}</span>
}

/** Écart signé dans une cellule : le signe et le mot portent l’information. */
export function CelluleEcart({ valeur }: { valeur: number | null }) {
  if (valeur === null) return <span className="text-ink-muted">—</span>
  return (
    <span
      className={cn(
        "font-mono font-semibold tabular-nums",
        valeur < 0 && "text-danger-ink",
        valeur > 0 && "text-warning-ink",
        valeur === 0 && "text-ink-muted"
      )}
    >
      {valeur === 0 ? "0" : `${valeur > 0 ? "+" : "−"}${Math.abs(Math.round(valeur)).toLocaleString("fr-FR")}`}
      <span className="sr-only">{valeur < 0 ? " (manque)" : valeur > 0 ? " (excédent)" : ""}</span>
    </span>
  )
}
