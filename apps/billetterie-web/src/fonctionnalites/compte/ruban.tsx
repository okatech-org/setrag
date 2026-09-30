"use client"

import type { FunctionReturnType } from "convex/server"
import { useState } from "react"
import { toast } from "sonner"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { Feuille } from "@workspace/ui/components/feuille"

import { dateCourte, dateDeService } from "@/lib/format"
import { reseauDisponible } from "@/lib/reseau"

import {
  Carte,
  EnTeteSousPage,
  EtiquetteListe,
  ExigeConnexion,
  Page,
  messageServeur,
} from "./elements"

type Note = FunctionReturnType<typeof api.ai.memory.listMine>[number]

/** Ce que chaque note décrit, en clair. */
export const CATEGORIES_NOTE: Record<Note["category"], string> = {
  preference: "Préférence",
  trajet: "Trajet habituel",
  compagnon: "Compagnon de voyage",
  contrainte: "Contrainte de voyage",
  rappel: "Rappel",
  autre: "Note",
}

/** « Préférence · notée le Ven. 2 oct. · dans une messagerie » */
export function detailNote(note: Pick<Note, "category" | "updatedAt" | "source">): string {
  return [
    CATEGORIES_NOTE[note.category],
    `notée le ${dateCourte(dateDeService(note.updatedAt))}`,
    note.source === "messaging" ? "dans une messagerie" : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

/**
 * Une note, lisible en entier (une phrase), et son bouton « Oublier » : un
 * geste distinct de la lecture, jamais la ligne entière.
 */
function LigneNote({ note, onOublier }: { note: Note; onOublier: () => void }) {
  return (
    <li className="flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0">
      <div className="grid min-w-0 flex-1 gap-0.5 pt-1.5">
        <p className="text-[15px] leading-snug font-medium">{note.content}</p>
        <p className="text-[12.5px] leading-snug text-ink-muted">{detailNote(note)}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={onOublier} aria-label={`Oublier : ${note.content}`} className="shrink-0">
        Oublier
      </Button>
    </li>
  )
}

/** La liste des notes, ou l'état vide, et « Tout oublier ». Sans accès aux données : testable seul. */
export function ListeNotes({
  notes,
  onOublier,
  onToutOublier,
}: {
  notes: Note[]
  onOublier: (note: Note) => void
  onToutOublier: () => void
}) {
  if (notes.length === 0) {
    return (
      <EmptyState
        title="Ruban n'a encore rien noté"
        description="Dites-lui par exemple « retiens que je voyage en 1re classe » : il s'en souviendra la prochaine fois."
        className="rounded-md border border-line bg-surface py-8"
      />
    )
  }
  return (
    <>
      <section aria-labelledby="notes-ruban" className="grid gap-2">
        <EtiquetteListe id="notes-ruban">
          {notes.length} note{notes.length > 1 ? "s" : ""}
        </EtiquetteListe>
        <ul className="rounded-md border border-line bg-surface">
          {notes.map((note) => (
            <LigneNote key={note._id} note={note} onOublier={() => onOublier(note)} />
          ))}
        </ul>
      </section>
      <div className="grid justify-items-start gap-2">
        <Button variant="secondary" onClick={onToutOublier} className="w-full md:w-fit">
          Tout oublier
        </Button>
        <p className="text-small text-ink-muted">Vous pouvez aussi le demander à Ruban : « oublie ça », « oublie tout ».</p>
      </div>
    </>
  )
}

function Contenu() {
  const notes = useQuery(api.ai.memory.listMine, {})
  const oublier = useMutation(api.ai.memory.forget)
  const toutOublier = useMutation(api.ai.memory.forgetAll)
  const [cible, setCible] = useState<Note | "toutes" | null>(null)
  const [enCours, setEnCours] = useState(false)

  if (notes === undefined) return <SkeletonLines />

  async function confirmer() {
    if (!cible || !reseauDisponible()) return
    setEnCours(true)
    try {
      if (cible === "toutes") {
        await toutOublier({})
        toast("Ruban a tout oublié.")
      } else {
        await oublier({ memoryId: cible._id })
        toast("Note oubliée.")
      }
      setCible(null)
    } catch (cause) {
      toast.error(messageServeur(cause, "La note n'a pas pu être effacée. Réessayez dans un instant."))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <>
      <Carte>
        <p className="text-small text-ink-muted">
          Ruban note ce qui vous facilite les voyages : votre classe préférée, vos trajets habituels, les personnes avec qui vous voyagez. Il s&apos;en sert sur le
          site, dans l&apos;application et dans vos messageries reliées, pour vous proposer d&apos;emblée ce qui vous convient. Il ne retient jamais de pièce
          d&apos;identité, de numéro, de code, de moyen de paiement ni d&apos;information de santé.
        </p>
      </Carte>

      <ListeNotes notes={notes} onOublier={setCible} onToutOublier={() => setCible("toutes")} />

      <Feuille
        open={cible !== null}
        onOpenChange={(ouverte) => !ouverte && !enCours && setCible(null)}
        titre={cible === "toutes" ? "Tout oublier ?" : "Oublier cette note ?"}
        description={
          cible === "toutes"
            ? "Ruban repartira de zéro, sur le site, l'application et vos messageries. Vos billets et votre profil ne changent pas."
            : cible
              ? `« ${cible.content} » sera effacée. Ruban ne s'en servira plus.`
              : undefined
        }
        pied={
          <div className="grid gap-2 md:flex md:justify-end">
            <Button variant="ghost" onClick={() => setCible(null)} disabled={enCours}>
              Garder
            </Button>
            <Button variant="danger" loading={enCours} loadingLabel="Effacement…" onClick={() => void confirmer()}>
              {cible === "toutes" ? "Tout oublier" : "Oublier"}
            </Button>
          </div>
        }
      >
        <span />
      </Feuille>
    </>
  )
}

/** « Ce que Ruban retient » : les notes de l'assistant, visibles et effaçables. */
export function CeQueRubanRetient() {
  return (
    <>
      <EnTeteSousPage titre="Ce que Ruban retient" sousTitre="Vos préférences et habitudes" />
      <Page>
        <ExigeConnexion
          invitation={{
            titre: "Connectez-vous pour voir ce que Ruban retient",
            texte: "Ruban ne prend de notes que pour un compte, jamais pour un visiteur.",
          }}
        >
          {() => <Contenu />}
        </ExigeConnexion>
      </Page>
    </>
  )
}
