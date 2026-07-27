"use client"

import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"
import {
  StationTimeline,
  type StationTimelineStop,
} from "@workspace/ui/mobile/station-timeline"

import { useToday } from "@/hooks/use-today"

export interface TrackingStop {
  _id: string
  station?: { name: string } | null
  arrivalAt?: number
  departureAt?: number
  kilometerPoint?: number
}

const hourFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Libreville",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/**
 * Suivi d'une desserte, en mobile.
 *
 * L'avancement est déduit des horaires théoriques et du retard déclaré : le
 * backend ne tient aucune position en temps réel — ni GPS, ni événement de
 * passage. Les gares « franchies » le sont donc au sens de l'horaire, pas au
 * sens du train, et l'écran le dit plutôt que de laisser croire à un suivi
 * live.
 */
export function TrackingMobile({
  trainNumber,
  serviceDate,
  onTrainNumberChange,
  onServiceDateChange,
  onSubmit,
  showTimeline,
  status,
  statusTone,
  statusNote,
  delayMinutes,
  stops,
  cancelled,
}: {
  trainNumber: string
  serviceDate: string
  onTrainNumberChange: (value: string) => void
  onServiceDateChange: (value: string) => void
  onSubmit: () => void
  showTimeline: boolean
  status: string
  statusTone: "success" | "warning" | "danger"
  statusNote: string
  delayMinutes: number
  stops: TrackingStop[]
  cancelled: boolean
}) {
  const now = useToday()

  const timelineStops: StationTimelineStop[] = stops.map((stop, index) => {
    const scheduled = stop.departureAt ?? stop.arrivalAt
    const revised =
      scheduled !== undefined && delayMinutes > 0
        ? scheduled + delayMinutes * 60_000
        : undefined
    const effective = revised ?? scheduled

    // Tant que l'horloge du navigateur n'est pas disponible, tout est « à
    // venir » : mieux vaut ne rien affirmer que d'annoncer un passage à tort.
    const state: StationTimelineStop["state"] =
      cancelled || now === null || effective === undefined
        ? "upcoming"
        : effective < now
          ? "passed"
          : stops[index - 1] &&
              (stops[index - 1]!.departureAt ?? stops[index - 1]!.arrivalAt) !==
                undefined &&
              (stops[index - 1]!.departureAt ?? stops[index - 1]!.arrivalAt)! +
                delayMinutes * 60_000 <
                now
            ? "current"
            : "upcoming"

    return {
      id: stop._id,
      name: stop.station?.name ?? "Gare",
      scheduledTime:
        scheduled !== undefined ? hourFormatter.format(scheduled) : undefined,
      revisedTime:
        revised !== undefined ? hourFormatter.format(revised) : undefined,
      pk:
        stop.kilometerPoint !== undefined
          ? `PK ${stop.kilometerPoint}`
          : undefined,
      state,
      note: cancelled
        ? { label: "supprimé", tone: "danger" as const }
        : index === 0
          ? { label: "départ", tone: "neutral" as const }
          : index === stops.length - 1
            ? { label: "terminus", tone: "neutral" as const }
            : undefined,
    }
  })

  return (
    <div className="grid gap-s-4 *:min-w-0 md:hidden">
      <form
        className="grid gap-s-3 rounded-md border border-line bg-surface p-s-4"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <Field label="Numéro de train" htmlFor="m-train-number">
          <Input
            id="m-train-number"
            value={trainNumber}
            placeholder="TR-201"
            onChange={(event) =>
              onTrainNumberChange(event.target.value.toUpperCase())
            }
          />
        </Field>
        <Field label="Date de circulation" htmlFor="m-tracking-date">
          <Input
            id="m-tracking-date"
            type="date"
            value={serviceDate}
            onChange={(event) => onServiceDateChange(event.target.value)}
          />
        </Field>
        <Button type="submit" block>
          Suivre ce train
        </Button>
      </form>

      {!showTimeline ? (
        <EmptyState
          title="Saisissez le numéro indiqué sur votre billet"
          description="Le statut de la desserte apparaîtra ici et se mettra à jour automatiquement."
        />
      ) : (
        <>
          <section className="grid gap-s-2 rounded-lg bg-ink p-s-4 text-ink-inverse">
            <span className="text-mono-label text-accent-on-ink">
              {cancelled ? "Circulation supprimée" : "En circulation"}
            </span>
            <div className="flex items-center gap-s-3">
              <span className="text-h3 flex-1">{trainNumber || "TR-201"}</span>
              <Tag tone={statusTone}>{status}</Tag>
            </div>
            <p className="text-small text-ink-faint">{statusNote}</p>
          </section>

          {stops.length === 0 ? (
            <InlineMessage tone="info" title="Desserte non détaillée.">
              Les arrêts de cette circulation ne sont pas publiés.
            </InlineMessage>
          ) : (
            <StationTimeline
              label={`Arrêts du train ${trainNumber}`}
              stops={timelineStops}
              className="px-s-1"
            />
          )}

          <p className="text-caption text-ink-muted">
            Horaires théoriques, ajustés du retard déclaré par l’exploitation.
            La position réelle du train n’est pas suivie.
          </p>
        </>
      )}
    </div>
  )
}
