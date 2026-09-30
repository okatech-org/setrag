"use client"

import { InfoIcon, TicketIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { LigneArrets, type Arret } from "@workspace/ui/components/ligne-arrets"
import { Tag } from "@workspace/ui/components/tag"
import { PastilleDesserte } from "@workspace/ui/voyage/statut"

import { Attente } from "@/fonctionnalites/billets/elements"
import { AvisCopieLocale } from "@/fonctionnalites/hors-ligne/copie-locale"
import { useDonneesLocales } from "@/fonctionnalites/hors-ligne/donnees-locales"
import { LimiteErreur } from "@/fonctionnalites/tunnel/limite-erreur"
import { dateDeService, dateRelative, deGare, heure } from "@/lib/format"
import type { DetailTrajet } from "@/lib/offline/types"
import { GARES_REPERES, nomTrain } from "@/lib/voyage"

import { estimerPosition, type Estimation } from "./position"
import { useParcoursLocal } from "./use-parcours-local"

const MINUTE = 60_000

export type Trajet = DetailTrajet["trip"]

/** Ce que l'état du train change pour le voyageur, en une phrase. */
function phrase(
  detail: DetailTrajet,
  estimation: Estimation,
  maintenant: number,
  voyageur: boolean
): string {
  const { trip, stops } = detail
  const retard = Math.max(0, trip.delayMinutes)
  const origine = stops[0]?.station?.name ?? "la gare de départ"
  const terminus = stops.at(-1)?.station?.name ?? "destination"
  switch (estimation.etat) {
    case "supprime":
      return voyageur
        ? "Ce train est supprimé ce jour-là. Pour un report ou un remboursement, adressez-vous au guichet d'une gare SETRAG."
        : "Ce train est supprimé ce jour-là."
    case "arrive":
      return trip.status === "termine"
        ? `Le train est arrivé à ${terminus}.`
        : `D'après l'horaire, le train est arrivé à ${terminus}.`
    case "avant-depart": {
      const jour =
        trip.serviceDate === dateDeService(maintenant)
          ? ""
          : `${dateRelative(trip.serviceDate, dateDeService(maintenant)).toLowerCase()} `
      const depart = heure(trip.departureAt + retard * MINUTE)
      return retard > 0
        ? `Départ ${deGare(origine)} annoncé avec ${retard} min de retard, ${jour}à ${depart}.`
        : `Départ ${deGare(origine)} ${jour}à ${depart}. Aucun retard annoncé.`
    }
    default:
      return retard > 0
        ? `Le train roule avec ${retard} min de retard annoncé. Les heures ci-dessous en tiennent compte.`
        : "Le train roule. Aucun retard annoncé."
  }
}

/** Le parcours d'un train : ses arrêts, ses heures, la rame à sa position estimée. */
function Parcours({
  detail,
  maintenant,
  depuisLeCache,
  enregistreLe,
}: {
  detail: DetailTrajet
  maintenant: number
  depuisLeCache: boolean
  enregistreLe: number | null
}) {
  const { dossiers, enLigne } = useDonneesLocales()
  const { trip, stops } = detail
  const retard = trip.status === "termine" ? 0 : Math.max(0, trip.delayMinutes)
  const estimation = estimerPosition(stops, retard, trip.status, maintenant)

  // Les billets du voyageur sur ce train : l'arrêt où il monte, puis celui
  // où il descend une fois le premier quitté.
  const mesDossiers = dossiers.filter(
    (dossier) =>
      dossier.sale.status === "confirmee" &&
      dossier.trip?.trainNumber === trip.trainNumber &&
      dossier.trip?.serviceDate === trip.serviceDate
  )
  const vous = new Set<number>()
  for (const dossier of mesDossiers) {
    const montee = stops.findIndex(
      (stop) => stop.stationId === dossier.origin?._id
    )
    const descente = stops.findIndex(
      (stop) => stop.stationId === dossier.destination?._id
    )
    if (montee >= 0 && !estimation.passes[montee]) vous.add(montee)
    else if (descente >= 0) vous.add(descente)
  }

  const dernier = stops.length - 1
  const arrets: Arret[] = stops.map((stop, index) => {
    const base =
      index === 0
        ? (stop.departureAt ?? stop.arrivalAt)
        : (stop.arrivalAt ?? stop.departureAt)
    const passe = estimation.passes[index] ?? false
    // Une gare quittée garde son heure prévue : on ne sait pas à quelle heure
    // le train y est réellement passé. Les suivantes portent l'estimation.
    const decale = !passe && retard > 0 && estimation.etat !== "supprime"
    return {
      nom: stop.station?.name ?? "Gare",
      heure: base == null ? "—" : heure(base + (decale ? retard * MINUTE : 0)),
      heurePrevue: decale && base != null ? heure(base) : undefined,
      km: stop.kilometerPoint,
      majeur:
        index === 0 ||
        index === dernier ||
        GARES_REPERES.has(stop.station?.code ?? ""),
      passe,
      mention: vous.has(index) ? (
        <Tag tone="second">Vous</Tag>
      ) : estimation.prochain === index ? (
        <Tag tone="accent">Prochain</Tag>
      ) : undefined,
    }
  })

  const terminus = stops.at(-1)
  const arrivee = terminus ? (terminus.arrivalAt ?? terminus.departureAt) : null
  const dossierVoyageur = mesDossiers[0]

  return (
    <div className="grid gap-4">
      {depuisLeCache && (
        <AvisCopieLocale
          recuLe={enregistreLe}
          enLigne={enLigne}
          objet="Les horaires de ce train"
        />
      )}

      <section
        aria-label="État du train"
        className="grid gap-2 rounded-md border border-line bg-surface p-4"
      >
        <div className="flex items-end justify-between gap-3">
          <div className="grid gap-1">
            <small className="text-caption text-ink-muted">
              {estimation.etat === "arrive" ? "Arrivée" : "Arrivée prévue"} à{" "}
              {terminus?.station?.name ?? "destination"}
            </small>
            <b className="font-mono text-[30px] leading-none font-semibold tabular-nums">
              {arrivee == null || estimation.etat === "supprime"
                ? "—"
                : heure(arrivee + retard * MINUTE)}
            </b>
          </div>
          <PastilleDesserte statut={trip.status} retard={trip.delayMinutes} />
        </div>
        <p className="text-small text-ink-muted">
          {phrase(detail, estimation, maintenant, mesDossiers.length > 0)}
        </p>
      </section>

      <div className="rounded-md border border-line bg-surface px-2 py-2 md:px-3">
        <LigneArrets
          arrets={arrets}
          rame={estimation.rame}
          aria-label={`Arrêts de ${nomTrain(trip.trainType, trip.trainNumber)}`}
        />
      </div>

      <p className="text-caption flex items-start gap-1.5 text-ink-faint">
        <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          Position estimée d&apos;après l&apos;horaire et le retard annoncé,
          recalculée chaque minute (dernière fois à{" "}
          <span className="font-mono">{heure(maintenant)}</span>). Ce n&apos;est
          pas un relevé GPS.
        </span>
      </p>

      {dossierVoyageur && (
        <Button
          asChild
          variant="secondary"
          size="lg"
          className="md:justify-self-start"
        >
          <Link
            href={
              `/billets/${encodeURIComponent(dossierVoyageur.sale.number)}` as Route
            }
          >
            <TicketIcon aria-hidden />
            Voir mon billet
          </Link>
        </Button>
      )}
    </div>
  )
}

function ParcoursServeur({
  tripId,
  train,
  date,
  maintenant,
}: {
  tripId: Trajet["_id"] | null
  train: string
  date: string
  maintenant: number
}) {
  const serveur = useQuery(
    api.functions.trips.get,
    tripId ? { tripId } : "skip"
  )
  // La copie locale ne sert qu'en l'absence de réponse : un horaire relevé la
  // veille ne recouvre jamais celui du jour.
  const local = useParcoursLocal(train, date, serveur === undefined)
  const { enLigne } = useDonneesLocales()

  if (serveur)
    return (
      <Parcours
        detail={serveur}
        maintenant={maintenant}
        depuisLeCache={false}
        enregistreLe={null}
      />
    )
  if (local)
    return (
      <Parcours
        detail={local.detail}
        maintenant={maintenant}
        depuisLeCache
        enregistreLe={local.enregistreLe}
      />
    )
  if (!enLigne) {
    return (
      <EmptyState
        title="Hors réseau"
        description="Sans réseau, seuls les trains de vos billets se suivent, et seulement s'ils ont été ouverts une fois avec du réseau."
      />
    )
  }
  return <Attente phrase="Lecture des horaires du train…" />
}

/**
 * Le détail d'un train du suivi. `trajet` vient de la liste du jour ; hors
 * réseau il manque, et le parcours enregistré sur l'appareil prend le relais.
 */
export function DetailTrain({
  train,
  date,
  trajet,
  listeChargee,
  maintenant,
}: {
  train: string
  date: string
  trajet: Trajet | null
  /** La liste des trains du jour a répondu (même vide). */
  listeChargee: boolean
  maintenant: number
}) {
  const tripId = trajet ? trajet._id : null

  // Le serveur a répondu sans ce train : sa réponse fait foi, même si une
  // copie ancienne en garde la trace.
  if (listeChargee && !trajet) {
    return (
      <EmptyState
        title={`Aucun train ${train.replace(/^[A-Z]+-/, "")} ${dateRelative(date, dateDeService(maintenant)).toLowerCase()}`}
        description="Ce numéro ne correspond à aucune circulation ce jour-là. Choisissez un train dans la liste du jour."
        action={
          <Button asChild variant="secondary">
            <Link href={`/suivi?date=${date}` as Route}>Trains du jour</Link>
          </Button>
        }
      />
    )
  }

  return (
    <LimiteErreur
      key={tripId ?? train}
      secours={() => (
        <EmptyState
          title="Horaires indisponibles"
          description="Le serveur n'a pas pu rendre les arrêts de ce train. Réessayez dans un instant."
        />
      )}
    >
      <ParcoursServeur
        tripId={tripId}
        train={train}
        date={date}
        maintenant={maintenant}
      />
    </LimiteErreur>
  )
}
