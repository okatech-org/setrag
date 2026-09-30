"use client"

import { ArrowRightIcon, BadgePercentIcon, LuggageIcon, RouteIcon } from "lucide-react"
import Link from "next/link"
import { useCallback, useMemo, useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { SchemaLigne } from "@workspace/ui/components/schema-ligne"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Voie } from "@workspace/ui/components/voie"
import { PastilleDesserte } from "@workspace/ui/voyage/statut"
import { TableauDeparts } from "@workspace/ui/voyage/tableau-departs"
import { SigneRuban } from "@workspace/ui/marque"

import { BarreApp, GrandTitre } from "@/coquille/barre-app"
import { useHoraires } from "@/fonctionnalites/billets/use-horaires"
import { useDonneesLocales } from "@/fonctionnalites/hors-ligne/donnees-locales"
import { FormulaireRecherche } from "@/fonctionnalites/recherche/formulaire-recherche"
import { useGares, useReductions } from "@/fonctionnalites/reference/use-reference"
import { useMaintenant } from "@/hooks/use-maintenant"
import { useToday } from "@/hooks/use-today"
import { dateDeService, dateRelative, deGare, duree, heure, minutesEntre } from "@/lib/format"
import { GARES_REPERES, nomTrain } from "@/lib/voyage"

/** Le prochain voyage du voyageur, lu dans ses dossiers (ou leur copie locale). */
function ProchainVoyage() {
  const { dossiers } = useDonneesLocales()
  const maintenant = useMaintenant()
  const prochain = useMemo(() => {
    if (maintenant === null) return null
    return (
      dossiers
        .filter((d) => d.sale.status === "confirmee" && d.trip && d.trip.arrivalAt > maintenant)
        .sort((a, b) => a.trip!.departureAt - b.trip!.departureAt)[0] ?? null
    )
  }, [dossiers, maintenant])

  const horaires = useHoraires(prochain)
  if (!prochain?.trip || maintenant === null) return null
  const { trip, sale, origin, destination } = prochain
  const aujourdhui = dateDeService(maintenant)
  const depart = horaires.departAt ?? trip.departureAt
  const arrivee = horaires.arriveeAt ?? trip.arrivalAt
  return (
    <section aria-labelledby="prochain-voyage" className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <h2 id="prochain-voyage" className="text-[17px] font-bold">
          Prochain voyage
        </h2>
        <Link href="/billets" className="text-[14px] font-semibold text-accent-ink">
          Tout voir
        </Link>
      </div>
      <Link
        href={`/billets/${encodeURIComponent(sale.number)}`}
        className="grid gap-3 rounded-md border border-line bg-surface p-4 transition-colors hover:border-line-strong"
      >
        <div className="flex items-center justify-between gap-2 text-[13px] font-semibold text-ink-muted">
          <span>
            {nomTrain(trip.trainType, trip.trainNumber)} · {dateRelative(trip.serviceDate, aujourdhui)}
          </span>
          <PastilleDesserte statut={trip.status} retard={trip.delayMinutes} />
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <div>
            <b className="block font-mono text-[22px] leading-none font-semibold tabular-nums">{heure(depart)}</b>
            <span className="mt-1 block text-[13px] text-ink-muted">{origin?.name}</span>
          </div>
          <div className="grid justify-items-center gap-1 font-mono text-[11.5px] text-ink-muted">
            <Voie etat="pleine" className="w-full" />
            {duree(minutesEntre(depart, arrivee))}
          </div>
          <div className="text-right">
            <b className="block font-mono text-[22px] leading-none font-semibold tabular-nums">{heure(arrivee)}</b>
            <span className="mt-1 block text-[13px] text-ink-muted">{destination?.name}</span>
          </div>
        </div>
      </Link>
    </section>
  )
}

/** Les prochains départs de la gare choisie, comme sur le tableau en gare. */
function Departs({ codeGare }: { codeGare: string }) {
  const { parCode } = useGares()
  const maintenant = useMaintenant()
  const departs = useQuery(api.functions.trips.nextDepartures, { originCode: codeGare, limit: 6 })
  const gare = parCode(codeGare)

  if (departs === undefined) return <Skeleton className="h-64 rounded-lg" />
  if (departs.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface p-5 text-small text-ink-muted">
        Aucun départ ouvert à la vente depuis {gare?.name ?? "cette gare"} pour le moment.
      </p>
    )
  }
  return (
    <TableauDeparts
      titre={`Départs ${deGare(gare?.name ?? codeGare)}`}
      horloge={maintenant === null ? undefined : heure(maintenant)}
      departs={departs.map((depart) => {
        const retard = depart.delayMinutes > 0 ? depart.delayMinutes : 0
        return {
          cle: depart.tripId,
          heure: heure(depart.departureAt + retard * 60_000),
          heurePrevue: retard ? heure(depart.departureAt) : undefined,
          destination: depart.destination?.name ?? "—",
          via: maintenant !== null && depart.serviceDate !== dateDeService(maintenant) ? dateRelative(depart.serviceDate, dateDeService(maintenant)) : undefined,
          train: nomTrain(depart.trainType, depart.trainNumber),
          statut: <PastilleDesserte statut={depart.status} retard={depart.delayMinutes} />,
        }
      })}
    />
  )
}

function CarteInfo({ icone, titre, children, lien }: { icone: React.ReactNode; titre: string; children: React.ReactNode; lien: { href: "/tarifs" | "/bagages" | "/assistant"; libelle: string } }) {
  return (
    <div className="grid content-start gap-2 rounded-lg border border-line bg-surface p-5">
      {icone}
      <b className="text-[17px]">{titre}</b>
      <div className="text-small text-ink-muted">{children}</div>
      <Link href={lien.href} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-accent-ink">
        {lien.libelle}
        <ArrowRightIcon className="size-4" aria-hidden />
      </Link>
    </div>
  )
}

function Informations() {
  const { reductions } = useReductions()
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <CarteInfo icone={<BadgePercentIcon className="size-[26px] text-accent-ink" aria-hidden />} titre="Tarifs réduits" lien={{ href: "/tarifs", libelle: "Tous les tarifs" }}>
        {reductions === undefined ? (
          <Skeleton className="h-20" />
        ) : (
          <ul className="grid gap-1">
            {reductions.map((reduction) => (
              <li key={reduction.code} className="flex justify-between gap-3 border-b border-dashed border-line py-1">
                <span>{reduction.label}</span>
                <b className="font-mono text-[14px] text-success-ink">−{reduction.ratePct} %</b>
              </li>
            ))}
          </ul>
        )}
      </CarteInfo>
      <CarteInfo icone={<LuggageIcon className="size-[26px] text-accent-ink" aria-hidden />} titre="Bagages et colis" lien={{ href: "/bagages", libelle: "Préparer son voyage" }}>
        Les bagages volumineux et les colis sont pesés et taxés au comptoir de la gare, avant le départ.
      </CarteInfo>
      <CarteInfo icone={<SigneRuban className="h-[26px] w-auto" />} titre="Ruban, l'assistant" lien={{ href: "/assistant", libelle: "Poser une question" }}>
        Il cherche un train, réserve et vous guide jusqu&apos;au paiement, à l&apos;écrit ou à la voix.
      </CarteInfo>
    </div>
  )
}

export function Accueil() {
  const { gares } = useGares()
  const [trajet, setTrajet] = useState<{ de: string | null; a: string | null }>({ de: null, a: null })
  const surGares = useCallback((de: string | null, a: string | null) => setTrajet({ de, a }), [])
  const instant = useToday()

  const segment = useMemo((): [number, number] | undefined => {
    const de = gares?.find((g) => g.code === trajet.de)
    const a = gares?.find((g) => g.code === trajet.a)
    if (!de || !a) return undefined
    return [Math.min(de.kilometerPoint, a.kilometerPoint), Math.max(de.kilometerPoint, a.kilometerPoint)]
  }, [gares, trajet])

  const intermediaires = gares ? gares.length - 2 : null

  return (
    <>
      <BarreApp logo />
      <section className="border-line bg-surface md:border-b">
        <div className="mx-auto grid w-full max-w-[1240px] gap-5 px-4 pt-2 pb-6 md:gap-7 md:px-8 md:pt-12 md:pb-8">
          <div className="grid gap-2">
            <GrandTitre className="md:hidden">Où allez-vous ?</GrandTitre>
            <h1 className="hidden max-w-[20ch] text-[44px] leading-[1.08] font-bold tracking-[-0.015em] md:block">
              Owendo–Franceville{intermediaires !== null ? `, et ${intermediaires} gares entre les deux.` : "."}
            </h1>
            <p className="hidden text-body-lg text-ink-muted md:block">
              Réservez, payez en Mobile Money, gardez votre billet sur votre téléphone : il se lit sans réseau.
            </p>
          </div>
          <FormulaireRecherche onGaresChange={surGares} />
          {gares && (
            <SchemaLigne
              className="hidden md:block"
              gares={gares.map((gare) => ({ nom: gare.name, km: gare.kilometerPoint, majeure: GARES_REPERES.has(gare.code) }))}
              segment={segment}
              aria-label={segment ? "Votre trajet sur la ligne du Transgabonais" : "La ligne du Transgabonais"}
            />
          )}
        </div>
      </section>
      <div className="mx-auto grid w-full max-w-[1240px] gap-6 px-4 py-6 md:gap-8 md:px-8 md:py-10">
        <ProchainVoyage />
        <Departs codeGare={trajet.de ?? "OWE"} />
        <Link
          href="/suivi"
          className="flex min-h-14 items-center gap-3 rounded-md border border-line bg-surface px-4 text-[15px] font-semibold md:hidden"
        >
          <RouteIcon className="size-5 text-accent-ink" aria-hidden />
          Suivre un train
          <ArrowRightIcon className="ml-auto size-4 text-ink-muted" aria-hidden />
        </Link>
        {instant !== null && <Informations />}
      </div>
    </>
  )
}
