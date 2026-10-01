"use client"

import type { GenericId } from "convex/values"
import { ArrowRight, Lock, LockOpen } from "lucide-react"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { Chronologie, Fiche, LienBouton, Panneau } from "@/components/charte"
import { useDroitsGestion } from "./gestion/referentiels/droits"
import { RetourOperation, useOperation } from "./gestion/referentiels/elements"
import { CLASSES, dateHeure, dateService, jourMois, heure, MOTIFS_BLOCAGE } from "./gestion/referentiels/format"
import { FenetreFormulaire } from "./gestion/referentiels/formulaire"
import { TagBlocage } from "./gestion/referentiels/statuts"
import { ManagementDetailShell } from "./management-detail-shell"

type SeatBlockId = GenericId<"seatBlocks">

function nom(user?: { firstName?: string; lastName?: string; matricule?: string } | null) {
  if (!user) return "Non renseigné"
  const complet = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Agent"
  return user.matricule ? `${complet} · ${user.matricule}` : complet
}

export function SeatBlockDetail({ blockId }: { blockId: string }) {
  const id = blockId as SeatBlockId
  const droits = useDroitsGestion()
  const detail = useQuery(api.functions.management.getSeatBlock, { blockId: id })
  const releaseBlock = useMutation(api.functions.management.releaseSeatBlock)
  const operation = useOperation()
  const [liberation, setLiberation] = useState(false)

  if (detail === undefined || detail === null) {
    return (
      <ManagementDetailShell title={detail === null ? "Blocage introuvable" : "Blocage de place"} eyebrow="Exploitation · inventaire" backHref="/gestion/places" verrouillage="aucun">
        {detail === null ? <InlineMessage tone="danger" title="Ce blocage n'existe plus." /> : <SkeletonLines />}
      </ManagementDetailShell>
    )
  }

  const { block, trip, seat, coach, creator, releaser, occupancy, stops } = detail
  const segments = detail.blockedSegments
  const premier = stops.find(({ stop }) => stop.sequence === (segments[0] ?? 0))?.station
  const dernier = stops.find(({ stop }) => stop.sequence === (segments[segments.length - 1] ?? 0) + 1)?.station
  const [motif, ...notes] = (block.comment ?? "").split("\n")
  const peutLiberer = block.isActive && droits.may("places", "modifier")
  const evenements = [
    {
      cle: "creation",
      heure: jourMois(block._creationTime),
      titre: `Blocage · ${MOTIFS_BLOCAGE[block.reason]}`,
      detail: `${heure(block._creationTime)} · ${nom(creator)}${motif ? ` — ${motif}` : ""}`,
    },
    ...(block.releasedAt
      ? [
          {
            cle: "liberation",
            heure: jourMois(block.releasedAt),
            titre: "Déblocage : place rendue à la vente",
            detail: `${heure(block.releasedAt)} · ${nom(releaser)}${notes.length ? ` — ${notes.join(" ").replace(/^Libération : /, "")}` : ""}`,
          },
        ]
      : []),
  ].reverse()

  return (
    <ManagementDetailShell
      title={`${trip?.trainNumber ?? "Desserte"} · ${coach?.label ?? "?"} · ${seat?.label ?? "?"}`}
      eyebrow="Exploitation · blocage de place"
      backHref="/gestion/places"
      verrouillage="aucun"
      actions={
        <>
          {trip ? (
            <LienBouton href={`/gestion/places?date=${trip.serviceDate}&desserte=${trip._id}`} variante="ghost">
              Occupation de la desserte
              <ArrowRight />
            </LienBouton>
          ) : null}
          {peutLiberer ? (
            <Button type="button" onClick={() => setLiberation(true)}>
              <LockOpen />
              Débloquer la place
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagBlocage actif={block.isActive} />
      </div>
      <RetourOperation retour={operation.retour} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panneau titre="Blocage" icone={Lock}>
          <Fiche
            elements={[
              ["Desserte", trip ? `${trip.trainNumber} · ${dateService(trip.serviceDate)}` : "—"],
              ["Place", <span key="p" className="tabular">{coach?.label ?? "?"} · {seat?.label ?? "?"}</span>],
              ["Classe", occupancy ? CLASSES[occupancy.serviceClass].long : "—"],
              ["Portion bloquée", `${premier?.name ?? "?"} → ${dernier?.name ?? "?"}`],
              ["Motif", MOTIFS_BLOCAGE[block.reason]],
              ["Détail", motif || "—"],
              ["Bloquée par", nom(creator)],
              ["Le", <span key="l" className="tabular">{dateHeure(block._creationTime)}</span>],
              block.releasedAt ? ["Débloquée par", nom(releaser)] : null,
              block.releasedAt ? ["Le", <span key="r" className="tabular">{dateHeure(block.releasedAt)}</span>] : null,
            ]}
          />
        </Panneau>
        <Panneau titre="Traçabilité" icone={LockOpen} sousTitre="qui, quand">
          <Chronologie evenements={evenements} />
          <p className="text-[12.5px] text-ink-muted">Un déblocage ne touche ni aux ventes ni aux réservations : seuls les segments de ce blocage reviennent à la vente.</p>
        </Panneau>
      </div>
      <FenetreFormulaire
        open={liberation}
        onOpenChange={setLiberation}
        titre="Débloquer la place"
        description="La place revient à la vente sur la portion bloquée. La note reste au journal."
        libelleValider={
          <>
            <LockOpen />
            Débloquer
          </>
        }
        enCours={operation.enCours === "liberer"}
        erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
        onSubmit={async (donnees) => {
          const ok = await operation.executer(
            "liberer",
            () => releaseBlock({ blockId: id, note: String(donnees.get("note") ?? "") }).then(() => true),
            "Place débloquée : les compteurs de disponibilité sont recalculés."
          )
          if (ok) setLiberation(false)
        }}
      >
        <Field label="Note de déblocage" htmlFor="seat-block-release-note">
          <Textarea id="seat-block-release-note" name="note" required minLength={3} placeholder="Siège réparé et contrôlé par l'atelier d'Owendo." />
        </Field>
      </FenetreFormulaire>
    </ManagementDetailShell>
  )
}
