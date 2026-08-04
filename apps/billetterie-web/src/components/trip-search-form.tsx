"use client"

import { Minus, Plus } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { VoiceTravelAssistant } from "@/components/assistant/voice-travel-assistant"
import { useSearchDraft } from "@/features/recherche/use-search-draft"
import { DEFAULT_SEARCH } from "@/lib/ticketing"

export function TripSearchForm({ compact = false }: { compact?: boolean }) {
  const search = useSearchDraft()
  const { draft, stations } = search

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    search.submit()
  }

  return (
    <form
      onSubmit={onSubmit}
      action="/resultats"
      method="get"
      className={
        compact
          ? "grid gap-4 rounded-lg border border-line bg-surface p-5 shadow-sm"
          : "grid gap-5 rounded-lg bg-surface p-5 shadow-lg sm:p-7"
      }
      aria-label="Rechercher un train"
    >
      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr]">
        <Field
          label="Gare de départ"
          htmlFor="origin"
          error={
            search.submitted && search.invalidStations
              ? "Choisissez deux gares différentes."
              : undefined
          }
        >
          <SelectNative
            id="origin"
            value={draft.originId}
            onChange={(event) =>
              search.update({ originId: event.target.value })
            }
          >
            {stations.map((station) => (
              <option key={station._id} value={station._id}>
                {station.name} · PK {station.kilometerPoint}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-end md:mb-1"
          aria-label="Inverser le départ et l'arrivée"
          onClick={search.swapStations}
        >
          ⇄
        </Button>
        <Field label="Gare d'arrivée" htmlFor="destination">
          <SelectNative
            id="destination"
            value={draft.destinationId}
            onChange={(event) =>
              search.update({ destinationId: event.target.value })
            }
          >
            {stations.map((station) => (
              <option key={station._id} value={station._id}>
                {station.name} · PK {station.kilometerPoint}
              </option>
            ))}
          </SelectNative>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Aller" htmlFor="service-date">
          <Input
            id="service-date"
            type="date"
            min={DEFAULT_SEARCH.serviceDate}
            value={draft.serviceDate}
            onChange={(event) =>
              search.update({ serviceDate: event.target.value })
            }
          />
        </Field>
        <Field
          label="Retour (facultatif)"
          htmlFor="return-date"
          hint="L'aller simple reste sélectionné si ce champ est vide."
        >
          <Input id="return-date" type="date" min={draft.serviceDate} />
        </Field>
      </div>

      <div className="grid items-end gap-4 md:grid-cols-[1fr_1fr_2fr]">
        <Counter
          label="Adultes"
          value={draft.adults}
          onChange={(adults) => search.update({ adults })}
        />
        <Counter
          label="Enfants 4–11 ans · −50 %"
          value={draft.children}
          onChange={(children) => search.update({ children })}
        />
        <div className="flex items-center gap-2">
          <Button type="submit" size="lg" className="min-w-0 flex-1">
            Rechercher un train
          </Button>
          <VoiceTravelAssistant />
        </div>
      </div>

      {search.submitted && search.invalidPassengers && (
        <InlineMessage
          tone="danger"
          title="Un adulte doit accompagner chaque réservation avec enfant."
        >
          Ajoutez au moins un adulte pour continuer.
        </InlineMessage>
      )}
    </form>
  )
}

function Counter({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-[13px] font-medium">{label}</span>
      <div className="flex min-h-13 items-center justify-between rounded-md border border-line-strong bg-surface px-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Diminuer ${label.toLowerCase()}`}
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          <Minus />
        </Button>
        <strong className="tabular" aria-live="polite">
          {value}
        </strong>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Augmenter ${label.toLowerCase()}`}
          onClick={() => onChange(Math.min(9, value + 1))}
        >
          <Plus />
        </Button>
      </div>
    </div>
  )
}
