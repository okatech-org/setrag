"use client"

import * as React from "react"
import { ArrowLeftRight, CalendarDays, Users } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Chip, ChipScroller } from "@workspace/ui/mobile/chip-scroller"
import { Counter } from "@workspace/ui/mobile/counter"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/mobile/sheet"

import { VoiceTravelAssistant } from "@/components/assistant/voice-travel-assistant"
import { useSearchDraft } from "@/features/recherche/use-search-draft"
import { gabonDate } from "@/lib/ticketing"

const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Libreville",
  weekday: "short",
  day: "numeric",
  month: "short",
})

function dateLabel(serviceDate: string) {
  if (serviceDate === gabonDate(0)) return "Aujourd’hui"
  if (serviceDate === gabonDate(1)) return "Demain"
  return dayFormatter.format(new Date(`${serviceDate}T12:00:00+01:00`))
}

function passengersLabel(adults: number, children: number) {
  const total = adults + children
  return `${total} voyageur${total > 1 ? "s" : ""}`
}

/** Les quatre prochains jours, proposés en pastilles avant le calendrier complet. */
const QUICK_DATES = [0, 1, 2, 3]

/**
 * Recherche mobile — l'écran d'accueil n'affiche que le résumé du trajet, et
 * chaque partie s'ouvre dans sa propre feuille.
 *
 * Le formulaire complet du bureau tiendrait à peine sur 390 px et repousserait
 * les départs du jour hors de l'écran ; en le repliant, l'accueil garde sa
 * hiérarchie — le prochain billet d'abord, la recherche ensuite.
 */
export function MobileSearchCard() {
  const search = useSearchDraft()
  const [openSheet, setOpenSheet] = React.useState<
    "stations" | "date" | "passengers" | null
  >(null)

  const { draft } = search

  return (
    <section
      aria-labelledby="recherche-mobile"
      className="grid min-w-0 grid-cols-1 gap-s-3 rounded-lg border border-line bg-surface p-s-4 shadow-md"
    >
      <h2 id="recherche-mobile" className="text-mono-label text-ink-muted">
        Où allez-vous ?
      </h2>

      <div className="flex items-center gap-s-2">
        <button
          type="button"
          onClick={() => setOpenSheet("stations")}
          className="text-body flex min-h-13 min-w-0 flex-1 items-center rounded-md border border-line-strong bg-surface px-s-4 text-left font-medium hover:bg-surface-sunk"
        >
          <span className="min-w-0 truncate">
            {search.stationName(draft.originId)} →{" "}
            {search.stationName(draft.destinationId)}
          </span>
        </button>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Inverser le départ et l’arrivée"
          onClick={search.swapStations}
        >
          <ArrowLeftRight />
        </Button>
      </div>

      <div className="flex flex-wrap gap-s-2">
        <Chip onClick={() => setOpenSheet("date")}>
          <CalendarDays aria-hidden />
          {dateLabel(draft.serviceDate)}
        </Chip>
        <Chip onClick={() => setOpenSheet("passengers")}>
          <Users aria-hidden />
          {passengersLabel(draft.adults, draft.children)}
        </Chip>
      </div>

      {search.submitted && search.invalidStations && (
        <InlineMessage tone="danger" title="Choisissez deux gares différentes.">
          Le départ et l’arrivée sont identiques.
        </InlineMessage>
      )}
      {search.submitted && search.invalidPassengers && (
        <InlineMessage
          tone="danger"
          title="Un adulte doit accompagner chaque réservation avec enfant."
        >
          Ajoutez au moins un adulte pour continuer.
        </InlineMessage>
      )}

      <div className="flex items-center gap-s-2">
        <Button
          size="lg"
          className="min-w-0 flex-1"
          onClick={() => search.submit()}
        >
          Rechercher une desserte
        </Button>
        <VoiceTravelAssistant onSearchChange={search.update} />
      </div>

      <Sheet
        open={openSheet === "stations"}
        onOpenChange={(open) => setOpenSheet(open ? "stations" : null)}
      >
        <SheetContent aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle>Votre trajet</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <Field label="Gare de départ" htmlFor="origin-mobile">
              <SelectNative
                id="origin-mobile"
                value={draft.originId}
                onChange={(event) =>
                  search.update({ originId: event.target.value })
                }
              >
                {search.stations.map((station) => (
                  <option key={station._id} value={station._id}>
                    {station.name} · PK {station.kilometerPoint}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Button
              variant="ghost"
              onClick={search.swapStations}
              className="justify-self-start"
            >
              <ArrowLeftRight />
              Inverser
            </Button>
            <Field label="Gare d’arrivée" htmlFor="destination-mobile">
              <SelectNative
                id="destination-mobile"
                value={draft.destinationId}
                onChange={(event) =>
                  search.update({ destinationId: event.target.value })
                }
              >
                {search.stations.map((station) => (
                  <option key={station._id} value={station._id}>
                    {station.name} · PK {station.kilometerPoint}
                  </option>
                ))}
              </SelectNative>
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button size="lg" block onClick={() => setOpenSheet(null)}>
              Valider
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet
        open={openSheet === "date"}
        onOpenChange={(open) => setOpenSheet(open ? "date" : null)}
      >
        <SheetContent aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle>Date de départ</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <ChipScroller label="Jours proposés">
              {QUICK_DATES.map((offset) => {
                const value = gabonDate(offset)
                return (
                  <Chip
                    key={value}
                    selected={draft.serviceDate === value}
                    onClick={() => search.update({ serviceDate: value })}
                  >
                    {dateLabel(value)}
                  </Chip>
                )
              })}
            </ChipScroller>
            <Field label="Autre date" htmlFor="service-date-mobile">
              <Input
                id="service-date-mobile"
                type="date"
                min={gabonDate(0)}
                value={draft.serviceDate}
                onChange={(event) =>
                  search.update({ serviceDate: event.target.value })
                }
              />
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button size="lg" block onClick={() => setOpenSheet(null)}>
              Valider
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet
        open={openSheet === "passengers"}
        onOpenChange={(open) => setOpenSheet(open ? "passengers" : null)}
      >
        <SheetContent aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle>Voyageurs</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <Counter
              label="Adultes"
              description="12 ans et plus"
              unitLabel="adulte"
              value={draft.adults}
              onValueChange={(adults) => search.update({ adults })}
            />
            <Counter
              label="Enfants"
              description="4 à 11 ans · réduction de 50 %"
              unitLabel="enfant"
              value={draft.children}
              onValueChange={(children) => search.update({ children })}
            />
          </SheetBody>
          <SheetFooter>
            <Button size="lg" block onClick={() => setOpenSheet(null)}>
              Valider
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </section>
  )
}
