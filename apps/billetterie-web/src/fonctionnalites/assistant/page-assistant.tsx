"use client"

import { ArrowRightIcon, SquarePenIcon } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Avatar } from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { Tag } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

import { BarreApp } from "@/coquille/barre-app"
import { useMaintenant } from "@/hooks/use-maintenant"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"
import { dateCourte, dateDeService, heure } from "@/lib/format"
import { CIVILITES, estLeTitulaire, voyageurMoi } from "@/lib/titulaire"

import { CarteDuFil } from "./cartes"
import { useRuban } from "./contexte-ruban"
import { Conversation } from "./conversation"
import { recordOf, texteDe } from "./types"

const CANAUX: Record<string, string> = { telegram: "Telegram", whatsapp: "WhatsApp", messenger: "Messenger", apple_messages: "Messages" }

/** Les conversations passées du compte ; un invité n'a que celle de l'onglet. */
function Historique() {
  const { isAuthenticated, isProfileReady } = useTravelerAuth()
  const { conversationId, nouvelleConversation, reprendre, entrees } = useRuban()
  const conversations = useQuery(api.ai.conversations.listMine, isAuthenticated && isProfileReady ? { limit: 20 } : "skip")
  const maintenant = useMaintenant(60_000)
  const aujourdhui = maintenant === null ? null : dateDeService(maintenant)

  return (
    <aside aria-label="Conversations" className="grid content-start gap-3 overflow-y-auto border-r border-line bg-surface p-4">
      <Button variant="secondary" onClick={nouvelleConversation} disabled={entrees.length === 0} className="justify-start">
        <SquarePenIcon />
        Nouvelle conversation
      </Button>
      {!isAuthenticated && <p className="px-1 text-small text-ink-muted">Connectez-vous pour retrouver vos conversations d&apos;un appareil à l&apos;autre.</p>}
      {conversations && conversations.length > 0 && (
        <ul className="grid gap-1">
          {conversations.map((c) => {
            const jour = dateDeService(c.lastMessageAt)
            return (
              <li key={c._id}>
                <button
                  type="button"
                  onClick={() =>
                    void reprendre(c._id).catch(() =>
                      toast.error("Cette conversation n'a pas pu être rouverte. Réessayez dans un instant.")
                    )
                  }
                  aria-current={c._id === conversationId || undefined}
                  className={cn("grid w-full gap-0.5 rounded-md px-3 py-2.5 text-left text-[14px] font-medium hover:bg-surface-sunk", c._id === conversationId && "bg-accent-soft hover:bg-accent-soft")}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 truncate">{c.title ?? "Conversation avec Ruban"}</span>
                    {c.canal && <Tag tone="neutral" className="h-5 px-2 text-[11px]">{CANAUX[c.canal] ?? c.canal}</Tag>}
                  </span>
                  <small className="font-mono text-[12px] font-normal text-ink-muted">{jour === aujourdhui ? heure(c.lastMessageAt) : dateCourte(jour)}</small>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

/** Notes montrées à côté de la conversation ; la liste complète est dans le compte. */
const NOTES_VISIBLES = 5

/**
 * Ce que Ruban est en train de préparer — la dernière réservation — et ce
 * qu'il sait déjà : vous, les personnes avec qui vous voyagez, ses notes.
 */
function Contexte() {
  const { entrees } = useRuban()
  const { isAuthenticated, isProfileReady, profile } = useTravelerAuth()
  const connecte = isAuthenticated && isProfileReady
  const voyageurs = useQuery(api.functions.customers.listSavedPassengers, connecte ? {} : "skip")
  const notes = useQuery(api.ai.memory.listMine, connecte ? {} : "skip")
  const moi = connecte ? voyageurMoi(profile?.user, voyageurs ?? []) : null
  const autres = (voyageurs ?? []).filter((v) => !(moi && estLeTitulaire(profile?.user, v)))

  const reservation = [...entrees]
    .reverse()
    .flatMap((e) =>
      e.role === "ruban"
        ? [
            ...e.approbations.filter((a) => a.toolName === "create_booking" && a.etat === "confirmee").map((a) => ({ type: "show_booking", payload: a.resultat })),
            ...e.cartes.filter((c) => c.type === "show_booking" && texteDe(recordOf(c.payload).reference)),
          ]
        : []
    )[0]

  return (
    <aside aria-label="En cours" className="grid content-start gap-4 overflow-y-auto border-l border-line bg-surface-sunk p-5">
      <h2 className="text-[12px] font-bold tracking-[0.05em] text-ink-muted uppercase">Réservation en cours</h2>
      {reservation ? <CarteDuFil carte={reservation} /> : <p className="text-small text-ink-muted">Aucune pour le moment.</p>}
      <p className="text-caption text-ink-muted">Tout ce que Ruban prépare s&apos;affiche ici. Rien n&apos;est réservé ni payé sans votre geste.</p>
      {(moi || autres.length > 0) && (
        <>
          <h2 className="mt-2 text-[12px] font-bold tracking-[0.05em] text-ink-muted uppercase">Voyageurs</h2>
          <ul className="grid gap-2">
            {moi && (
              <li className="flex items-center gap-2.5 text-[14px]">
                <Avatar name={`${moi.prenom} ${moi.nom}`} size="sm" />
                <span className="min-w-0 flex-1">
                  {moi.prenom} {moi.nom}
                  <span className="block text-[12.5px] text-ink-muted">{moi.sexe ? `Vous · ${CIVILITES[moi.sexe]}` : "Vous · civilité à compléter"}</span>
                </span>
              </li>
            )}
            {autres.map((v) => (
              <li key={v._id} className="flex items-center gap-2.5 text-[14px]">
                <Avatar name={`${v.firstName} ${v.lastName}`} size="sm" />
                {v.firstName} {v.lastName}
              </li>
            ))}
          </ul>
        </>
      )}
      {notes && notes.length > 0 && (
        <>
          <h2 className="mt-2 text-[12px] font-bold tracking-[0.05em] text-ink-muted uppercase">Ce que Ruban retient</h2>
          <ul className="grid gap-1.5 text-[14px]">
            {notes.slice(0, NOTES_VISIBLES).map((note) => (
              <li key={note._id} className="leading-snug">
                {note.content}
              </li>
            ))}
          </ul>
          <Link href="/compte/ruban" className="inline-flex min-h-11 w-fit items-center gap-1 text-[14px] font-semibold text-accent-ink">
            {notes.length > NOTES_VISIBLES ? `Les ${notes.length} notes` : "Voir et effacer"}
            <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        </>
      )}
    </aside>
  )
}

/**
 * /assistant : la conversation au centre, l'historique à gauche, ce qui se
 * réserve à droite. Sur mobile, la conversation plein écran, comme dans l'app.
 */
export function PageAssistant() {
  const { nouvelleConversation, entrees } = useRuban()
  return (
    <>
      <BarreApp
        titre="Ruban"
        sousTitre="Assistant SETRAG"
        retour={true}
        actions={
          <button
            type="button"
            onClick={nouvelleConversation}
            disabled={entrees.length === 0}
            aria-label="Nouvelle conversation"
            className="grid size-11 place-items-center rounded-pill text-ink disabled:opacity-40"
          >
            <SquarePenIcon className="size-[21px]" />
          </button>
        }
      />
      {/* Toute la largeur de l'écran : l'historique et ce qui se réserve collés
          aux bords, la conversation au milieu, à largeur de lecture. */}
      <div className="grid h-[calc(100dvh-52px-env(safe-area-inset-top,0px))] grid-cols-[minmax(0,1fr)] md:h-[calc(100dvh-68px)] lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_330px]">
        <div className="hidden lg:grid">
          <Historique />
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col">
            <Conversation autoFocus className="pb-safe md:pb-0" saisieClassName="md:border-t-0 md:bg-transparent md:px-6 md:pb-5" />
          </div>
        </div>
        <div className="hidden xl:grid">
          <Contexte />
        </div>
      </div>
    </>
  )
}
