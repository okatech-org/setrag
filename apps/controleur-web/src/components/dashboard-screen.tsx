"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { humanError } from "@/lib/errors"
import { longDayTime, dayTime } from "@/lib/format"
import { freshness, isStale } from "@/lib/offline/manifest"
import { listScans } from "@/lib/offline/db"
import { NetworkBadge, StatusTag } from "./network-badge"
import { useControlSession } from "./session-guard"
import { useTerminal } from "./terminal-provider"

/**
 * Tableau de bord — CM-02.
 *
 * Point de départ de la tournée. Il répond à trois questions dans cet ordre :
 * quelle desserte, avec quelles données embarquées, et que reste-t-il à
 * envoyer. Le reste attend.
 */
export function DashboardScreen() {
  const router = useRouter()
  const { matricule, profile, signOut } = useControlSession()
  const { manifest, queue, settings, online, authenticated, setActiveTrip, ready } =
    useTerminal()
  const [now, setNow] = useState(() => Date.now())
  const [controls, setControls] = useState(0)
  const [openingCash, setOpeningCash] = useState(false)
  /** Sans point de vente, pas de caisse — donc pas de vente ni d'amende. */
  const rattache = Boolean(profile?.user.pointOfSaleId)

  // `online` ne suffit pas : le terminal peut avoir du réseau sans session
  // reconnue — au démarrage, ou après une reprise hors ligne. Interroger le
  // serveur dans cet intervalle ne produirait qu'un refus.
  const serverReady = online && authenticated
  const trips = useQuery(
    api.functions.control.assignedTrips,
    serverReady ? { limit: 8 } : "skip"
  )
  const cashSession = useQuery(
    api.functions.cash.mySession,
    serverReady ? {} : "skip"
  )
  const openCash = useMutation(api.functions.cash.openSession)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const scans = manifest ? await listScans(manifest.tripId) : []
      if (!cancelled) setControls(scans.length)
    })()
    return () => {
      cancelled = true
    }
  }, [manifest, queue.total])

  const stale = manifest ? isStale(manifest, now) : false
  const partial = manifest ? !manifest.complete : false

  /**
   * Circulations qui portent le même numéro à la même heure.
   *
   * Elles existent : deux livrets horaires qui se chevauchent produisent deux
   * dessertes pour un même train. Le contrôleur ne peut pas les distinguer à
   * l'œil, et embarquer la mauvaise fait refuser tous les titres du train.
   */
  const homonymes = useMemo(() => {
    const vus = new Map<string, number>()
    for (const trip of trips ?? []) {
      const cle = `${trip.trainNumber}|${trip.departureAt}`
      vus.set(cle, (vus.get(cle) ?? 0) + 1)
    }
    return [...vus.entries()].filter(([, n]) => n > 1).map(([cle]) => cle)
  }, [trips])

  return (
    <main className="safe-top flex flex-1 flex-col gap-5 px-5 pt-5 pb-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-ink-muted tabular">
            {longDayTime(now)}
          </p>
          <h1 className="text-h3">Bonjour, {matricule}</h1>
        </div>
        <NetworkBadge />
      </header>

      {stale && (
        <InlineMessage
          tone="warning"
          title={`Données périmées — manifeste ${freshness(manifest!, now)}.`}
        >
          Les annulations et remboursements survenus depuis ne sont pas connus
          du terminal.
        </InlineMessage>
      )}
      {partial && !stale && (
        <InlineMessage
          tone="warning"
          title={`Manifeste incomplet — ${manifest!.downloadedCount} titres sur ${manifest!.ticketCount}.`}
        >
          Les titres manquants seront sans statut connu. L&apos;absence d&apos;un
          titre ne vaut pas preuve.
        </InlineMessage>
      )}

      {manifest ? (
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-h4">
            {manifest.trainNumber} · {manifest.originName} →{" "}
            {manifest.destinationName}
          </h2>
          <p className="mt-1 text-[13px] text-ink-muted tabular">
            Départ {dayTime(manifest.departureAt)} · {manifest.stops.length}{" "}
            gares
          </p>
          <p className="mt-1 text-[15px]">
            Voiture {settings.coachLabel} ·{" "}
            <span className="tabular">{manifest.ticketCount}</span> voyageurs
            attendus
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusTag
              tone={stale ? "warning" : partial ? "warning" : "success"}
            >
              {stale ? "périmé" : partial ? "incomplet" : "manifeste à jour"}
            </StatusTag>
            <StatusTag tone="neutral">{freshness(manifest, now)}</StatusTag>
            {manifest.signing.isDemoKey && (
              <StatusTag tone="warning">clé de démonstration</StatusTag>
            )}
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-dashed border-line-strong p-5">
          <h2 className="text-h4">
            {settings.activeTripId
              ? "Manifeste non téléchargé"
              : "Aucune desserte embarquée"}
          </h2>
          <p className="mt-1 text-[15px] text-ink-muted">
            {settings.activeTripId
              ? `${settings.activeTripLabel ?? "La desserte choisie"} est sélectionnée, mais son manifeste n'est pas encore embarqué. Téléchargez-le avant le départ.`
              : "Choisissez votre desserte ci-dessous, puis téléchargez son manifeste avant le départ : au-delà de Ntoum, le réseau devient très irrégulier."}
          </p>
        </section>
      )}

      <div className="flex gap-3">
        <Counter value={controls} label="contrôlés" />
        <Counter
          value={manifest?.ticketCount ?? 0}
          label="attendus"
        />
        <Counter
          value={queue.total}
          label="à envoyer"
          tone={queue.total > 0 ? "warning" : "neutral"}
        />
      </div>

      {manifest ? (
        <div className="flex flex-col gap-3">
          <Button size="lg" block asChild>
            <Link href="/scan">
              {controls > 0 ? "Reprendre le contrôle" : "Commencer le contrôle"}
            </Link>
          </Button>
          <Button variant="secondary" size="lg" block asChild>
            <Link href="/manifeste">Détail des données embarquées</Link>
          </Button>
        </div>
      ) : (
        <Button size="lg" block asChild>
          <Link href="/manifeste">
            {settings.activeTripId
              ? "Télécharger le manifeste"
              : "Choisir une desserte"}
          </Link>
        </Button>
      )}

      {serverReady &&
        cashSession === null &&
        // Un agent sans point de vente ne PEUT pas ouvrir de caisse : lui
        // proposer le bouton reviendrait à lui promettre une action qui
        // échouera. On lui dit plutôt à qui s'adresser.
        (rattache ? (
          <InlineMessage tone="warning" title="Caisse fermée.">
            La vente à bord exige une caisse ouverte.{" "}
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              disabled={openingCash}
              onClick={() => {
                setOpeningCash(true)
                void openCash({ openingFloatXaf: 0 })
                  .then(() =>
                    toast.success("Caisse ouverte, fonds initial nul.")
                  )
                  .catch((error: unknown) => toast.error(humanError(error)))
                  .finally(() => setOpeningCash(false))
              }}
            >
              {openingCash ? "Ouverture…" : "Ouvrir la caisse maintenant"}
            </button>
          </InlineMessage>
        ) : (
          <InlineMessage
            tone="warning"
            title="Compte non rattaché à un point de vente."
          >
            La vente à bord et l&apos;encaissement des amendes exigent une
            caisse, et une caisse appartient à un point de vente. Demandez à
            votre chef de gare de rattacher le matricule {matricule}. Le
            contrôle des titres, lui, reste possible.
          </InlineMessage>
        ))}

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold tracking-wide text-ink-muted uppercase">
          Dessertes disponibles
        </h2>
        {!serverReady && (
          <p className="text-[15px] text-ink-muted">
            {online
              ? "La liste des dessertes attend que le serveur reconnaisse la session. Celle qui est embarquée reste utilisable."
              : "La liste des dessertes exige le réseau. Celle qui est embarquée reste utilisable."}
          </p>
        )}
        {serverReady && trips === undefined && (
          <p className="text-[15px] text-ink-muted">Chargement…</p>
        )}
        {serverReady && trips?.length === 0 && (
          <p className="text-[15px] text-ink-muted">
            Aucune desserte dans la fenêtre de service.
          </p>
        )}
        {homonymes.length > 0 && (
          <InlineMessage
            tone="warning"
            title="Deux circulations portent le même numéro et la même heure."
          >
            Elles viennent de livrets horaires qui se chevauchent. Ce sont bien
            deux dessertes distinctes : un titre vendu sur l&apos;une sera
            refusé sur l&apos;autre. Choisissez celle qui porte des titres, et
            signalez le doublon à l&apos;exploitation.
          </InlineMessage>
        )}
        {trips?.map((trip) => {
          const active = manifest?.tripId === trip.id
          const ambigu = homonymes.includes(`${trip.trainNumber}|${trip.departureAt}`)
          return (
            <button
              key={trip.id}
              type="button"
              aria-label={`Choisir la desserte ${trip.trainNumber} de ${trip.origin} à ${trip.destination}, départ ${dayTime(trip.departureAt)}, ${trip.expectedPassengers} titres`}
              onClick={() => {
                const label = `${trip.trainNumber} · ${trip.origin} → ${trip.destination}`
                void setActiveTrip(trip.id, label).then(() =>
                  router.push("/manifeste")
                )
              }}
              className="flex min-h-16 items-center gap-3 rounded-md border border-line bg-surface p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold tabular">
                  {trip.trainNumber} · {dayTime(trip.departureAt)}
                </span>
                <span className="block text-[13px] text-ink-muted">
                  {trip.origin} → {trip.destination} ·{" "}
                  <span className="tabular">{trip.expectedPassengers}</span>{" "}
                  titres
                  {/* Le nombre de gares départage deux circulations
                      homonymes : c'est ce qui les distingue réellement. */}
                  {ambigu && (
                    <>
                      {" · "}
                      <span className="tabular">{trip.stopCount}</span> gares
                    </>
                  )}
                </span>
              </span>
              <StatusTag tone={active ? "success" : "neutral"}>
                {active ? "embarquée" : "choisir"}
              </StatusTag>
            </button>
          )
        })}
      </section>

      <Button
        variant="ghost"
        size="sm"
        className="mt-auto self-start"
        onClick={() => void signOut()}
        disabled={!ready}
      >
        Fermer la session
      </Button>
    </main>
  )
}

function Counter({
  value,
  label,
  tone = "neutral",
}: {
  value: number
  label: string
  tone?: "neutral" | "warning"
}) {
  return (
    <div
      className={`flex-1 rounded-md border p-3 text-center ${
        tone === "warning"
          ? "border-warning bg-warning-soft"
          : "border-line bg-surface"
      }`}
    >
      <p className="text-h3 tabular">{value}</p>
      <p className="text-[13px] text-ink-muted">{label}</p>
    </div>
  )
}
