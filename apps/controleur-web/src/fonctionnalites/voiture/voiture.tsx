"use client"

import { useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { cn } from "@workspace/ui/lib/utils"

import { TERRAIN } from "@/composants/boutons"
import { CarteTitre } from "@/composants/carte-titre"
import { Message } from "@/composants/message"
import { PictoVerdict } from "@/composants/picto-verdict"
import { Bas, BarreApp, Corps, Note } from "@/coquille/ecran"
import { humanError } from "@/lib/errors"
import { classeLongue } from "@/lib/format"
import type { EmbarkedManifest, EmbarkedTicket } from "@/lib/offline/types"
import { arretDeRang } from "@/lib/position"
import {
  etatDuTitre,
  LIBELLE_ETAT_PLACE,
  planDeVoiture,
  titreEnCours,
  type EtatPlace,
  type Place,
} from "@/lib/tournee"
import { memeVoiture, numeroVoiture, voitureDe } from "@/lib/train"

import { useControle, type ResultatControle } from "../controle/controle"
import { Verdict } from "../controle/verdict"
import { EtatTitre } from "../recherche/recherche"
import { useTerminal } from "../terminal/contexte-terminal"
import { useDonneesTournee } from "../tournee/donnees-tournee"

type Vue = "plan" | "liste"

/**
 * Manifeste d'une voiture — par place : qui reste à contrôler.
 *
 * Quatre états de place, chacun avec sa forme (grisée et cochée, cerclée,
 * octogone, en tirets) et son mot dans la légende. Toucher une place ouvre
 * son titre ; la vérification sans le code passe par le manifeste et le dit.
 */
export function PlanVoiture() {
  const parametres = useSearchParams()
  const { manifest, settings, ready } = useTerminal()
  const donnees = useDonneesTournee(manifest)
  const { inspecter } = useControle()
  const [vue, setVue] = useState<Vue>("plan")
  const [choisi, setChoisi] = useState<EmbarkedTicket | null>(null)
  const [resultat, setResultat] = useState<ResultatControle | null>(null)

  const voiture = voitureDe(donnees.composition, parametres.get("v") ?? settings.coachLabel)
  const plan = useMemo(
    () => (voiture ? planDeVoiture(voiture, donnees.tickets, donnees.scans) : []),
    [donnees.scans, donnees.tickets, voiture]
  )
  const titres = useMemo(
    () =>
      voiture
        ? donnees.tickets
            .filter((t) => memeVoiture(t.coachLabel, voiture.label) && titreEnCours(t))
            .sort((a, b) => (a.seatLabel ?? "").localeCompare(b.seatLabel ?? "", "fr", { numeric: true }))
        : [],
    [donnees.tickets, voiture]
  )

  if (!ready) return null
  if (!manifest || !voiture) {
    return (
      <>
        <BarreApp retour="/tournee" titre="Voiture" />
        <Corps>
          <Message ton="alerte" titre={manifest ? "Voiture inconnue de la composition." : "Aucun manifeste embarqué."}>
            {manifest
              ? "Le manifeste embarqué ne connaît pas cette voiture : mettez-le à jour en gare."
              : "Le plan des voitures voyage avec le manifeste de la desserte."}
          </Message>
        </Corps>
      </>
    )
  }

  if (resultat) {
    return (
      <Verdict
        resultat={resultat}
        onFermer={() => {
          setResultat(null)
          setChoisi(null)
        }}
      />
    )
  }

  async function verifier(ticket: EmbarkedTicket) {
    if (!ticket.barcodePayload) {
      toast.error("Ce titre n'a pas de code embarqué : il ne peut pas être vérifié hors ligne.")
      return
    }
    try {
      setResultat(await inspecter(ticket.barcodePayload, { manuel: true }))
    } catch (error) {
      toast.error(humanError(error))
    }
  }

  const numero = numeroVoiture(voiture.label)
  const details = [
    voiture.seatCount > 0 && `${voiture.seatCount} places assises`,
    voiture.standingCapacity > 0 && `${voiture.standingCapacity} debout`,
    `${titres.length} titre${titres.length > 1 ? "s" : ""}`,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <>
      <BarreApp
        retour="/tournee"
        titre={`Voiture ${numero}${voiture.serviceClass ? ` · ${classeLongue(voiture.serviceClass)}` : ""}`}
        sousTitre={details}
      />
      <Corps>
        <SegmentedControl
          label="Affichage de la voiture"
          size="touch"
          options={[
            { value: "plan", label: "Plan" },
            { value: "liste", label: "Liste" },
          ]}
          value={vue}
          onValueChange={(valeur) => setVue(valeur as Vue)}
          className="w-full"
        />
        {vue === "plan" ? (
          voiture.seats.length > 0 ? (
            <>
              <Legende />
              <Plan
                places={plan}
                colonnes={voiture.columnCount}
                choisi={choisi?.number}
                onChoisir={setChoisi}
              />
            </>
          ) : (
            <Note>Le plan de cette voiture n&apos;est pas embarqué : consultez la liste.</Note>
          )
        ) : (
          <ul className="grid gap-2">
            {titres.length === 0 && <Note>Aucun titre vendu dans cette voiture.</Note>}
            {titres.map((ticket) => (
              <li key={ticket.number}>
                <button
                  type="button"
                  aria-pressed={choisi?.number === ticket.number}
                  onClick={() => setChoisi(ticket)}
                  className={cn(
                    "grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-md border bg-surface px-3.5 py-2.5 text-left",
                    choisi?.number === ticket.number
                      ? "border-accent-base shadow-[inset_0_0_0_1px_var(--c-accent)]"
                      : "border-line"
                  )}
                >
                  <b className="truncate text-[15px] font-bold">
                    {ticket.passenger.lastName} {ticket.passenger.firstName}
                  </b>
                  <span className="col-start-2 row-start-1">
                    <EtatTitre ticket={ticket} scans={donnees.scans} />
                  </span>
                  <span className="col-span-2 truncate font-mono text-[12px] text-ink-muted">
                    {ticket.seatLabel ?? "debout"} · {ticket.number}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Corps>
      <Bas>
        {choisi ? (
          <>
            <CarteTitre titre={`${choisi.passenger.lastName} ${choisi.passenger.firstName}${choisi.seatLabel ? ` · ${choisi.seatLabel}` : ""}`} className="py-2.5">
              <p>
                {trajet(manifest, choisi)} · {ETAT_DU_TITRE[etatDuTitre(choisi, donnees.scans)]}
              </p>
            </CarteTitre>
            <Button variant="secondary" size="lg" block className={TERRAIN} onClick={() => void verifier(choisi)}>
              Vérifier ce titre sans le code
            </Button>
          </>
        ) : (
          <Note className="text-center">Touchez une place pour ouvrir son titre.</Note>
        )}
      </Bas>
    </>
  )
}

const ETAT_DU_TITRE: Record<EtatPlace, string> = {
  controle: "titre contrôlé",
  titre: "titre non contrôlé",
  refus: "titre refusé",
  libre: "titre qui ne tient plus sa place",
}

function trajet(manifest: EmbarkedManifest, ticket: EmbarkedTicket): string {
  const de = arretDeRang(manifest, ticket.fromStopIndex)?.name ?? "?"
  const a = arretDeRang(manifest, ticket.toStopIndex)?.name ?? "?"
  return `${de} → ${a}`
}

const STYLE_PLACE: Record<EtatPlace, string> = {
  controle: "border-[1.5px] border-line-strong bg-surface-sunk text-ink-muted",
  titre: "border-2 border-accent-base bg-accent-soft text-accent-ink",
  refus: "border-2 border-danger bg-danger-soft text-danger-ink",
  libre: "border-[1.5px] border-dashed border-line-strong bg-surface font-normal text-ink-muted",
}

/** La forme d'une place, sans son libellé : légende et plan. */
function MarquePlace({ etat }: { etat: EtatPlace }) {
  if (etat === "controle") {
    return (
      <svg viewBox="0 0 12 12" aria-hidden className="absolute top-1 right-1 size-3 text-success-ink">
        <path d="M2 6.4 4.8 9 10 3.2" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (etat === "refus") {
    return <PictoVerdict famille="refus" className="absolute top-[3px] right-[3px] size-3" />
  }
  return null
}

function Legende() {
  const etats: EtatPlace[] = ["controle", "titre", "refus", "libre"]
  return (
    <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12px] font-medium text-ink-muted">
      {etats.map((etat) => (
        <li key={etat} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("relative block h-[18px] w-6 rounded-[5px]", STYLE_PLACE[etat])}>
            <MarquePlace etat={etat} />
          </span>
          {LIBELLE_ETAT_PLACE[etat]}
        </li>
      ))}
    </ul>
  )
}

/**
 * Le plan : les places rangée par rangée, l'allée au milieu. Une place avec
 * un titre se touche ; une place sans titre n'est qu'un repère.
 */
function Plan({
  places,
  colonnes,
  choisi,
  onChoisir,
}: {
  places: Place[]
  colonnes: number
  choisi?: string
  onChoisir: (ticket: EmbarkedTicket) => void
}) {
  const gauche = Math.ceil(colonnes / 2)
  const lettres = Array.from({ length: colonnes }, (_, i) => String.fromCharCode(65 + i))
  const rangees = [...new Set(places.map((p) => p.row))].sort((a, b) => a - b)
  const gabarit = `26px repeat(${gauche}, minmax(0, 1fr)) 18px repeat(${colonnes - gauche}, minmax(0, 1fr))`
  return (
    <div role="grid" aria-label="Plan de la voiture" className="grid gap-1.5">
      <div role="row" className="grid items-center gap-1.5" style={{ gridTemplateColumns: gabarit }}>
        <span role="columnheader" />
        {lettres.map((lettre, i) => (
          <span
            key={lettre}
            role="columnheader"
            className="text-center text-[11px] font-bold text-ink-muted"
            style={{ gridColumn: i < gauche ? i + 2 : i + 3 }}
          >
            {lettre}
          </span>
        ))}
      </div>
      {rangees.map((rangee) => (
        <div key={rangee} role="row" className="grid items-center gap-1.5" style={{ gridTemplateColumns: gabarit }}>
          <span role="rowheader" className="text-center font-mono text-[12px] text-ink-muted">
            {rangee}
          </span>
          {places
            .filter((p) => p.row === rangee)
            .map((place) => {
              const colonne = place.column <= gauche ? place.column + 1 : place.column + 2
              const classes = cn(
                "relative grid min-h-12 place-items-center rounded-[10px] font-mono text-[12px] font-semibold",
                STYLE_PLACE[place.etat],
                choisi && place.ticket?.number === choisi && "ring-2 ring-ink ring-offset-2 ring-offset-canvas"
              )
              const nom = `Place ${place.label}, ${LIBELLE_ETAT_PLACE[place.etat]}${place.ticket ? `, ${place.ticket.passenger.lastName} ${place.ticket.passenger.firstName}` : ""}`
              return place.ticket ? (
                <button
                  key={place.label}
                  type="button"
                  role="gridcell"
                  aria-label={nom}
                  aria-selected={place.ticket.number === choisi}
                  onClick={() => onChoisir(place.ticket!)}
                  className={classes}
                  style={{ gridColumn: colonne }}
                >
                  <MarquePlace etat={place.etat} />
                  {place.label}
                </button>
              ) : (
                <span key={place.label} role="gridcell" aria-label={nom} className={classes} style={{ gridColumn: colonne }}>
                  {place.label}
                </span>
              )
            })}
        </div>
      ))}
    </div>
  )
}
