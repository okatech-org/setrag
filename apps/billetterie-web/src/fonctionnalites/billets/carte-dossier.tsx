"use client"

import { QrCodeIcon, ReceiptTextIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import { Voie } from "@workspace/ui/components/voie"
import { PastilleDesserte } from "@workspace/ui/voyage/statut"
import { cn } from "@workspace/ui/lib/utils"

import { adressePaiement } from "@/fonctionnalites/tunnel/adresses"
import { dateCourte, heure, prix } from "@/lib/format"
import { nomTrain } from "@/lib/voyage"

import {
  aPayer,
  estAVenir,
  finDeTenue,
  nomCourt,
  statutVente,
  type Dossier,
} from "./dossier"
import { PastilleVente } from "./elements"
import { useHoraires } from "./use-horaires"

/**
 * Une réservation dans la liste « Billets ».
 *
 * Payée et à venir, elle a l'allure d'un billet : fond encre, comme sur la
 * maquette mobile. Sinon — à payer, annulée, voyage fait — c'est une carte
 * claire : ce n'est pas (ou plus) un titre de transport. Le mot de l'état est
 * toujours écrit ; la teinte ne fait que l'appuyer.
 */
export function CarteDossier({
  dossier,
  maintenant,
  onAnnuler,
}: {
  dossier: Dossier
  maintenant: number
  onAnnuler: () => void
}) {
  const trip = dossier.trip
  const horaires = useHoraires(dossier)
  const reference = dossier.sale.number
  const aVenir = estAVenir(dossier, maintenant)
  const billet = aVenir && dossier.sale.status === "confirmee"
  const aRegler = aPayer(dossier, maintenant)
  const fin = finDeTenue(dossier)
  const statut = statutVente(dossier, maintenant)
  const trainChange =
    aVenir &&
    trip &&
    (trip.status === "annule" ||
      (trip.delayMinutes > 0 && trip.status !== "termine"))
  const titres = dossier.tickets
  const voyageurs =
    titres.length > 2
      ? `${nomCourt(titres[0]!)} et ${titres.length - 1} autres`
      : titres.map(nomCourt).join(", ")
  const Icone = billet ? QrCodeIcon : ReceiptTextIcon

  return (
    <article
      data-theme={billet ? "dark" : undefined}
      className={cn(
        "@container relative grid gap-3 rounded-lg p-4 transition-shadow",
        billet
          ? "bg-brand-encre text-ink shadow-md"
          : "border border-line bg-surface hover:border-line-strong",
        !aVenir && "text-ink-muted"
      )}
    >
      <header className="flex min-w-0 items-center justify-between gap-2 text-[13px] font-semibold text-ink-muted">
        <span className="truncate">
          {trip
            ? `${nomTrain(trip.trainType, trip.trainNumber)} · ${dateCourte(trip.serviceDate)}`
            : reference}
        </span>
        {trainChange ? (
          <PastilleDesserte statut={trip.status} retard={trip.delayMinutes} />
        ) : (
          <PastilleVente statut={statut} />
        )}
      </header>

      {trip && (
        <div
          className={cn(
            "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3",
            !aVenir && "opacity-70"
          )}
        >
          <div className="min-w-0">
            <b className="block font-mono text-[22px] leading-none font-semibold text-ink tabular-nums">
              {horaires.departAt === null ? "--:--" : heure(horaires.departAt)}
            </b>
            <span className="mt-1 block truncate text-[13px] font-medium">
              {dossier.origin?.name}
            </span>
          </div>
          <Voie
            etat={aVenir ? "pleine" : "vide"}
            fond={billet ? "encre" : "clair"}
            className="w-full"
          />
          <div className="min-w-0 text-right">
            <b className="block font-mono text-[22px] leading-none font-semibold text-ink tabular-nums">
              {horaires.arriveeAt === null
                ? "--:--"
                : heure(horaires.arriveeAt)}
            </b>
            <span className="mt-1 block truncate text-[13px] font-medium">
              {dossier.destination?.name}
            </span>
          </div>
        </div>
      )}

      <footer className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-[13px] font-medium">
          <b className="font-semibold text-ink">
            {titres.length > 1 ? `${titres.length} billets` : "1 billet"}
          </b>
          {voyageurs && <span className="block truncate">{voyageurs}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <b className="font-mono text-[14px] font-semibold text-ink tabular-nums">
            {prix(dossier.sale.amounts.ttc)}
          </b>
          <Link
            href={`/billets/${encodeURIComponent(reference)}` as Route}
            aria-label={`Ouvrir la réservation ${reference}`}
            className={cn(
              "grid size-11 place-items-center rounded-md after:absolute after:inset-0 after:rounded-lg",
              billet ? "bg-line text-ink" : "bg-surface-sunk text-ink"
            )}
          >
            <Icone className="size-5" aria-hidden />
          </Link>
        </span>
      </footer>

      {aRegler && fin !== null && (
        <div className="relative z-[1] grid gap-2 border-t border-line pt-3 @md:flex @md:items-center @md:justify-between">
          <p className="text-[13px] font-medium text-warning-ink">
            À payer avant <b className="font-mono tabular-nums">{heure(fin)}</b>
            , sinon les places sont remises en vente.
          </p>
          <div className="grid grid-cols-2 gap-2 @md:flex">
            <Button asChild variant="secondary">
              <Link href={adressePaiement(reference)}>Payer</Link>
            </Button>
            <Button variant="ghost" onClick={onAnnuler}>
              Annuler
            </Button>
          </div>
        </div>
      )}
    </article>
  )
}
