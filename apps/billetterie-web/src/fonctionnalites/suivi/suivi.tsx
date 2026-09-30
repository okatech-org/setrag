"use client"

import { ChevronRightIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useMemo, type CSSProperties } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { Jours } from "@workspace/ui/components/jours"
import {
  SchemaLigne,
  type TrainLigne,
} from "@workspace/ui/components/schema-ligne"
import { Tag } from "@workspace/ui/components/tag"
import { PastilleDesserte } from "@workspace/ui/voyage/statut"
import { cn } from "@workspace/ui/lib/utils"

import { BarreApp } from "@/coquille/barre-app"
import { useNaviguer } from "@/coquille/filet-navigation"
import { Attente, Conteneur } from "@/fonctionnalites/billets/elements"
import { useMaintenant } from "@/fonctionnalites/billets/horloge"
import { useDonneesLocales } from "@/fonctionnalites/hors-ligne/donnees-locales"
import { useGares, type Gare } from "@/fonctionnalites/reference/use-reference"
import {
  ajouterJours,
  dateDeService,
  dateLongue,
  dateRelative,
  heure,
  jourEtQuantieme,
} from "@/lib/format"
import { GARES_REPERES, nomTrain } from "@/lib/voyage"

import { DetailTrain, type Trajet } from "./detail-train"
import { estimerKmLineaire, estimerPosition, positionEnMots } from "./position"

const MINUTE = 60_000
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/

/** « TR-201 » et « 201 » désignent le même train. */
function memeTrain(a: string, b: string): boolean {
  const court = (numero: string) =>
    numero
      .trim()
      .toUpperCase()
      .replace(/^[A-Z]+-/, "")
  return court(a) === court(b)
}

function adresse(date: string, train?: string): Route {
  const parametres = new URLSearchParams({ date })
  if (train) parametres.set("train", train)
  return `/suivi?${parametres}` as Route
}

type Ligne = {
  trajet: Trajet
  origine: Gare | undefined
  destination: Gare | undefined
  sens: "aller" | "retour"
  etat: ReturnType<typeof estimerKmLineaire>["etat"]
  km?: number
  position: string
}

/** Où en est chaque train du jour, d'après son horaire et son retard. */
function lignesDuJour(
  dessertes: Trajet[],
  parId: (id: string) => Gare | undefined,
  gares: Gare[],
  maintenant: number
): Ligne[] {
  const reperes = gares.map((gare) => ({
    nom: gare.name,
    km: gare.kilometerPoint,
  }))
  return [...dessertes]
    .sort((a, b) => a.departureAt - b.departureAt)
    .map((trajet) => {
      const origine = parId(trajet.originStationId)
      const destination = parId(trajet.destinationStationId)
      const kmDepart = origine?.kilometerPoint ?? 0
      const kmArrivee = destination?.kilometerPoint ?? 0
      const sens = kmArrivee >= kmDepart ? "aller" : "retour"
      const retard = Math.max(0, trajet.delayMinutes)
      const estimation = estimerKmLineaire(
        trajet,
        kmDepart,
        kmArrivee,
        maintenant
      )
      const position =
        estimation.etat === "supprime"
          ? "—"
          : estimation.etat === "avant-depart"
            ? `${retard > 0 ? "départ estimé" : "départ"} à ${heure(trajet.departureAt + retard * MINUTE)}`
            : estimation.etat === "arrive"
              ? `arrivé à ${destination?.name ?? "destination"}`
              : positionEnMots(estimation.km ?? kmDepart, reperes, sens)
      return {
        trajet,
        origine,
        destination,
        sens,
        etat: estimation.etat,
        km: estimation.km,
        position,
      }
    })
}

function CarteTrain({
  ligne,
  actif,
  votre,
  date,
  index,
}: {
  ligne: Ligne
  actif: boolean
  votre: boolean
  date: string
  index: number
}) {
  const { trajet } = ligne
  return (
    <li style={{ "--i": index } as CSSProperties}>
      <Link
        href={adresse(date, trajet.trainNumber)}
        aria-current={actif ? "true" : undefined}
        className={cn(
          "grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md border bg-surface px-4 py-3 transition-colors hover:border-line-strong",
          actif
            ? "border-accent-base shadow-[inset_3px_0_0_var(--c-accent)]"
            : "border-line"
        )}
      >
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <b className="text-[16px]">
            {nomTrain(trajet.trainType, trajet.trainNumber)}
          </b>
          <span className="font-mono text-[13px] text-ink-muted tabular-nums">
            {heure(trajet.departureAt)} → {heure(trajet.arrivalAt)}
          </span>
        </span>
        <span className="flex items-center gap-2 justify-self-end">
          <PastilleDesserte
            statut={trajet.status}
            retard={trajet.delayMinutes}
          />
          <ChevronRightIcon
            className="size-4 text-ink-muted md:hidden"
            aria-hidden
          />
        </span>
        <span className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-ink-muted">
          <span className="truncate">
            {ligne.origine?.name ?? "—"} → {ligne.destination?.name ?? "—"}
          </span>
          <span aria-hidden>·</span>
          <span className="truncate">{ligne.position}</span>
          {votre && <Tag tone="second">Votre train</Tag>}
        </span>
      </Link>
    </li>
  )
}

/** Hors réseau : les trains des billets du voyageur, les seuls qu'on peut suivre. */
function MesTrains({ maintenant }: { maintenant: number }) {
  const { dossiers } = useDonneesLocales()
  const trains = useMemo(() => {
    const vus = new Map<
      string,
      { train: string; date: string; libelle: string; trajet: string }
    >()
    for (const dossier of dossiers) {
      const trip = dossier.trip
      if (
        !trip ||
        dossier.sale.status !== "confirmee" ||
        trip.arrivalAt + Math.max(0, trip.delayMinutes) * MINUTE <
          maintenant - 6 * 3_600_000
      )
        continue
      vus.set(`${trip.trainNumber}|${trip.serviceDate}`, {
        train: trip.trainNumber,
        date: trip.serviceDate,
        libelle: `${nomTrain(trip.trainType, trip.trainNumber)} · ${dateRelative(trip.serviceDate, dateDeService(maintenant))}`,
        trajet: `${dossier.origin?.name ?? "—"} → ${dossier.destination?.name ?? "—"}`,
      })
    }
    return [...vus.values()]
  }, [dossiers, maintenant])

  return (
    <div className="grid gap-3">
      <EmptyState
        title="Hors réseau"
        description="La liste des trains du jour demande une connexion. Les trains de vos billets restent consultables, d'après leur dernier relevé."
      />
      {trains.length > 0 && (
        <ul className="grid gap-2">
          {trains.map((train) => (
            <li key={`${train.train}|${train.date}`}>
              <Link
                href={adresse(train.date, train.train)}
                className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-2"
              >
                <span className="grid min-w-0">
                  <b className="truncate text-[15px]">{train.libelle}</b>
                  <span className="truncate text-[13px] text-ink-muted">
                    {train.trajet}
                  </span>
                </span>
                <ChevronRightIcon
                  className="size-4 shrink-0 text-ink-muted"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Le suivi des trains : `/suivi?train=&date=`.
 *
 * Un statut de desserte, pas un GPS : la position de chaque train est
 * estimée d'après son horaire et le retard annoncé, et l'écran le dit. Sur
 * mobile, la liste du jour puis le train choisi, comme deux écrans ; sur
 * grand écran, la ligne, la liste et le train côte à côte.
 */
export function Suivi() {
  const parametres = useSearchParams()
  const naviguer = useNaviguer()
  const maintenant = useMaintenant()
  const { gares, parId } = useGares()
  const { dossiers, enLigne } = useDonneesLocales()

  const aujourdhui = maintenant === null ? null : dateDeService(maintenant)
  const demandee = parametres.get("date") ?? ""
  const date = DATE_ISO.test(demandee) ? demandee : aujourdhui
  const train = (parametres.get("train") ?? "").trim().toUpperCase()

  const dessertes = useQuery(
    api.functions.trips.listByDate,
    date ? { serviceDate: date } : "skip"
  )
  const lignes = useMemo(
    () =>
      dessertes && gares && maintenant !== null
        ? lignesDuJour(dessertes, (id) => parId(id), gares, maintenant)
        : null,
    [dessertes, gares, maintenant, parId]
  )
  const choisie =
    train && lignes
      ? (lignes.find((ligne) => memeTrain(ligne.trajet.trainNumber, train)) ??
        null)
      : null
  const trajetChoisi =
    choisie?.trajet ??
    (train && dessertes
      ? (dessertes.find((trajet) => memeTrain(trajet.trainNumber, train)) ??
        null)
      : null)

  // Le train choisi se place d'après ses arrêts, plus finement qu'à vitesse
  // constante : la liste et la ligne disent alors la même chose que le
  // détail. La même requête y est posée ; Convex ne l'envoie qu'une fois.
  const parcoursChoisi = useQuery(
    api.functions.trips.get,
    trajetChoisi ? { tripId: trajetChoisi._id } : "skip"
  )
  const lignesAffichees = useMemo(() => {
    if (!lignes || !parcoursChoisi || maintenant === null) return lignes
    const { trip, stops } = parcoursChoisi
    const estimation = estimerPosition(
      stops,
      trip.status === "termine" ? 0 : trip.delayMinutes,
      trip.status,
      maintenant
    )
    if (estimation.etat !== "en-route" || estimation.km === undefined)
      return lignes
    const arrets = stops
      .map((stop) => ({
        nom: stop.station?.name ?? "",
        km: stop.kilometerPoint,
      }))
      .filter((arret) => arret.nom)
    return lignes.map((ligne) =>
      ligne.trajet._id === trip._id
        ? {
            ...ligne,
            etat: estimation.etat,
            km: estimation.km,
            position: positionEnMots(estimation.km!, arrets, ligne.sens),
          }
        : ligne
    )
  }, [lignes, parcoursChoisi, maintenant])
  const mesTrains = new Set(
    dossiers
      .filter((dossier) => dossier.sale.status === "confirmee" && dossier.trip)
      .map(
        (dossier) => `${dossier.trip!.trainNumber}|${dossier.trip!.serviceDate}`
      )
  )

  const jours = useMemo(() => {
    if (!aujourdhui || !date) return []
    const valeurs = Array.from({ length: 8 }, (_, i) =>
      ajouterJours(aujourdhui, i - 1)
    )
    if (!valeurs.includes(date)) valeurs.push(date)
    return valeurs.sort().map((valeur) => ({
      valeur,
      libelle: jourEtQuantieme(valeur),
      detail: valeur === aujourdhui ? "auj." : undefined,
    }))
  }, [aujourdhui, date])

  const trains: TrainLigne[] =
    lignesAffichees
      ?.filter((ligne) => ligne.etat === "en-route" && ligne.km !== undefined)
      .map((ligne) => ({
        km: ligne.km!,
        libelle: `${ligne.trajet.trainNumber.replace(/^[A-Z]+-/, "")}${ligne.trajet.delayMinutes > 0 ? ` +${ligne.trajet.delayMinutes} min` : ""}`,
        etat:
          ligne.trajet.delayMinutes > 0 ? ("retard" as const) : ("ok" as const),
        sens: ligne.sens,
      })) ?? []

  const titreTrain = trajetChoisi
    ? nomTrain(trajetChoisi.trainType, trajetChoisi.trainNumber)
    : train
      ? `Train ${train.replace(/^[A-Z]+-/, "")}`
      : null
  const sousTitreTrain = choisie
    ? `${choisie.origine?.name ?? "—"} → ${choisie.destination?.name ?? "—"}`
    : date
      ? dateLongue(date)
      : undefined

  return (
    <>
      <BarreApp
        titre={titreTrain ?? "Suivi des trains"}
        sousTitre={
          titreTrain ? sousTitreTrain : date ? dateLongue(date) : undefined
        }
        retour={true}
        actions={
          titreTrain && dessertes && enLigne ? (
            <span className="inline-flex items-center gap-1.5 pr-2 text-[12px] font-semibold text-success-ink">
              <span aria-hidden className="size-2 rounded-pill bg-success" />
              En direct
            </span>
          ) : undefined
        }
      />
      <Conteneur>
        <div className={cn("grid gap-4", train && "max-md:hidden")}>
          <div className="hidden flex-wrap items-baseline gap-x-4 gap-y-1 md:flex">
            <h1 className="text-h2">Suivi des trains</h1>
            {dessertes && enLigne && (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-success-ink">
                <span aria-hidden className="size-2 rounded-pill bg-success" />
                En direct
              </span>
            )}
          </div>
          {date && jours.length > 0 && (
            <Jours
              jours={jours}
              valeur={date}
              onChange={(valeur) =>
                naviguer(adresse(valeur), { remplacer: true })
              }
              label="Jour de circulation"
            />
          )}
        </div>

        {gares && gares.length > 1 && (
          <div className="hidden rounded-lg border border-line bg-surface px-5 py-4 md:block">
            <SchemaLigne
              gares={gares.map((gare) => ({
                nom: gare.name,
                km: gare.kilometerPoint,
                majeure: GARES_REPERES.has(gare.code),
              }))}
              trains={trains}
              aria-label={
                trains.length > 0
                  ? `La ligne du Transgabonais et ${trains.length} train(s) en circulation, à leur position estimée`
                  : "La ligne du Transgabonais"
              }
            />
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)] md:items-start md:gap-8">
          <section
            aria-label="Trains du jour"
            className={cn("grid min-w-0 gap-3", train && "max-md:hidden")}
          >
            {maintenant === null || !date ? (
              <Attente phrase="Chargement des trains du jour…" />
            ) : dessertes === undefined ? (
              enLigne ? (
                <Attente phrase="Chargement des trains du jour…" />
              ) : (
                <MesTrains maintenant={maintenant} />
              )
            ) : lignesAffichees && lignesAffichees.length > 0 ? (
              <ul className="st-apparait grid gap-2">
                {lignesAffichees.map((ligne, index) => (
                  <CarteTrain
                    key={ligne.trajet._id}
                    ligne={ligne}
                    index={index}
                    date={date}
                    actif={choisie?.trajet._id === ligne.trajet._id}
                    votre={mesTrains.has(
                      `${ligne.trajet.trainNumber}|${ligne.trajet.serviceDate}`
                    )}
                  />
                ))}
              </ul>
            ) : lignes ? (
              <EmptyState
                title={`Aucun train ne circule ${dateRelative(date, aujourdhui ?? date).toLowerCase()}`}
                description="Aucune circulation n'est publiée ce jour-là. Les horaires se publient au fil de l'ouverture des ventes."
                action={
                  <Button
                    variant="secondary"
                    onClick={() =>
                      naviguer(adresse(ajouterJours(date, 1)), {
                        remplacer: true,
                      })
                    }
                  >
                    Jour suivant
                  </Button>
                }
              />
            ) : (
              <Attente phrase="Chargement des trains du jour…" />
            )}
          </section>

          <section
            aria-label={titreTrain ?? "Train choisi"}
            className={cn("grid min-w-0 gap-3", !train && "max-md:hidden")}
          >
            {titreTrain && (
              <h2 className="hidden flex-wrap items-center gap-2 text-[18px] font-bold md:flex">
                {titreTrain}
                {sousTitreTrain && (
                  <span className="text-[14px] font-medium text-ink-muted">
                    {sousTitreTrain}
                  </span>
                )}
              </h2>
            )}
            {train && date && maintenant !== null ? (
              <DetailTrain
                train={train}
                date={date}
                trajet={trajetChoisi}
                listeChargee={dessertes !== undefined}
                maintenant={maintenant}
              />
            ) : (
              <div className="text-small hidden rounded-lg border border-dashed border-line-strong p-6 text-center text-ink-muted md:block">
                Choisissez un train dans la liste pour voir ses arrêts et sa
                position estimée.
              </div>
            )}
          </section>
        </div>
      </Conteneur>
    </>
  )
}
