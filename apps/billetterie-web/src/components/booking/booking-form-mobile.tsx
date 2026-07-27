"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { formatPrice } from "@workspace/ui/lib/format"
import { Chip, ChipScroller } from "@workspace/ui/mobile/chip-scroller"
import { StickyActions } from "@workspace/ui/mobile/sticky-actions"

import {
  SERVICE_CLASSES,
  type useBookingDraft,
} from "@/features/reservation/use-booking-draft"

type Phase = "classe" | "voyageurs" | "prix"

const PHASES = [
  { value: "classe", label: "Classe" },
  { value: "voyageurs", label: "Voyageurs" },
  { value: "prix", label: "Prix" },
]

const hourFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Libreville",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/**
 * Détail du voyage, en mobile — trois phases enchaînées.
 *
 * Le bureau montre classe, voyageurs et total sur une seule page ; sur 390 px
 * cela ferait un formulaire de six écrans de haut où l'on perd le fil. La
 * maquette découpe donc en trois volets, franchis par le bouton du bas ou
 * repris directement par le sélecteur du haut.
 */
export function BookingFormMobile({
  draft,
}: {
  draft: ReturnType<typeof useBookingDraft>
}) {
  const [phase, setPhase] = React.useState<Phase>("classe")

  return (
    <div className="grid gap-s-4 *:min-w-0 md:hidden">
      <p className="text-small rounded-md bg-accent-soft p-s-3 text-accent-ink">
        {draft.trip.originName} {hourFormatter.format(draft.trip.departureAt)} →{" "}
        {draft.trip.destinationName}{" "}
        {hourFormatter.format(draft.trip.arrivalAt)} · {draft.trip.trainNumber}{" "}
        · {draft.passengerCount} voyageur
        {draft.passengerCount > 1 ? "s" : ""}
      </p>

      <SegmentedControl
        size="touch"
        label="Étape du dossier"
        options={PHASES}
        value={phase}
        onValueChange={(value) => setPhase(value as Phase)}
      />

      {phase === "classe" && (
        <ClassPhase draft={draft} onDone={() => setPhase("voyageurs")} />
      )}
      {phase === "voyageurs" && (
        <PassengersPhase draft={draft} onDone={() => setPhase("prix")} />
      )}
      {phase === "prix" && <PricePhase draft={draft} />}
    </div>
  )
}

function ClassPhase({
  draft,
  onDone,
}: {
  draft: ReturnType<typeof useBookingDraft>
  onDone: () => void
}) {
  return (
    <>
      <ul
        className="grid gap-s-2"
        role="radiogroup"
        aria-label="Classe de voyage"
      >
        {SERVICE_CLASSES.map((item) => {
          const active = draft.booking.serviceClass === item.id
          return (
            <li key={item.id}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => draft.setServiceClass(item.id)}
                className={
                  active
                    ? "flex w-full items-center gap-s-3 rounded-md border-[1.5px] border-accent-base bg-accent-soft p-s-4 text-left"
                    : "flex w-full items-center gap-s-3 rounded-md border border-line bg-surface p-s-4 text-left hover:bg-surface-sunk"
                }
              >
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-body font-semibold">{item.label}</span>
                  <span className="text-caption text-ink-muted">
                    {item.note}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={
                    active
                      ? "size-5 shrink-0 rounded-pill border-[6px] border-accent-base"
                      : "size-5 shrink-0 rounded-pill border-2 border-line-strong"
                  }
                />
              </button>
            </li>
          )
        })}
      </ul>

      <StickyActions>
        <Button size="lg" block onClick={onDone}>
          Continuer
        </Button>
      </StickyActions>
    </>
  )
}

function PassengersPhase({
  draft,
  onDone,
}: {
  draft: ReturnType<typeof useBookingDraft>
  onDone: () => void
}) {
  const [current, setCurrent] = React.useState(0)
  const passenger = draft.booking.passengers[current]
  if (!passenger) return null

  const isChild = Boolean(passenger.discountCode)

  return (
    <>
      {draft.booking.passengers.length > 1 && (
        <ChipScroller label="Voyageurs du dossier">
          {draft.booking.passengers.map((item, index) => (
            <Chip
              key={index}
              selected={index === current}
              onClick={() => setCurrent(index)}
            >
              {index + 1} · {item.discountCode ? "enfant" : "adulte"}
            </Chip>
          ))}
        </ChipScroller>
      )}

      <div className="grid gap-s-3 rounded-md border border-line bg-surface p-s-4">
        <h2 className="text-h4">
          Voyageur {current + 1}
          <span className="text-small font-normal text-ink-muted">
            {" "}
            · {isChild ? "enfant, réduction de 50 %" : "adulte"}
          </span>
        </h2>
        <Field label="Prénom" htmlFor={`m-firstName-${current}`}>
          <Input
            id={`m-firstName-${current}`}
            autoComplete="given-name"
            value={passenger.firstName}
            onChange={(event) =>
              draft.updatePassenger(current, { firstName: event.target.value })
            }
          />
        </Field>
        <Field label="Nom" htmlFor={`m-lastName-${current}`}>
          <Input
            id={`m-lastName-${current}`}
            autoComplete="family-name"
            value={passenger.lastName}
            onChange={(event) =>
              draft.updatePassenger(current, { lastName: event.target.value })
            }
          />
        </Field>
        <Field label="Sexe" htmlFor={`m-gender-${current}`}>
          <SelectNative
            id={`m-gender-${current}`}
            value={passenger.gender}
            onChange={(event) =>
              draft.updatePassenger(current, {
                gender: event.target.value as "M" | "F",
              })
            }
          >
            <option value="F">Femme</option>
            <option value="M">Homme</option>
          </SelectNative>
        </Field>
        <Field label="Contact d’urgence" htmlFor={`m-emergency-${current}`}>
          <Input
            id={`m-emergency-${current}`}
            type="tel"
            value={passenger.emergencyPhone ?? ""}
            onChange={(event) =>
              draft.updatePassenger(current, {
                emergencyPhone: event.target.value,
              })
            }
          />
        </Field>
      </div>

      <div className="grid gap-s-3 rounded-md border border-line bg-surface p-s-4">
        <h2 className="text-h4">Contact du dossier</h2>
        <Field
          label="Téléphone"
          htmlFor="m-contact-phone"
          hint="C’est ce numéro qui reçoit le billet et les alertes de retard."
        >
          <Input
            id="m-contact-phone"
            type="tel"
            autoComplete="tel"
            value={draft.booking.contactPhone}
            onChange={(event) =>
              draft.updateContact({ contactPhone: event.target.value })
            }
          />
        </Field>
        <Field label="E-mail (facultatif)" htmlFor="m-contact-email">
          <Input
            id="m-contact-email"
            type="email"
            autoComplete="email"
            value={draft.booking.contactEmail ?? ""}
            onChange={(event) =>
              draft.updateContact({ contactEmail: event.target.value })
            }
          />
        </Field>
      </div>

      <StickyActions>
        <Button size="lg" block onClick={onDone}>
          Continuer
        </Button>
      </StickyActions>
    </>
  )
}

function PricePhase({ draft }: { draft: ReturnType<typeof useBookingDraft> }) {
  const lines = draft.quote?.lines

  return (
    <>
      <div className="grid gap-s-3 rounded-md border border-line bg-surface p-s-4">
        <h2 className="text-h4">Récapitulatif</h2>
        <ul className="grid gap-s-2">
          {lines
            ? lines.map((line, index) => (
                <li key={index} className="flex items-baseline gap-s-3">
                  <span className="text-small min-w-0 flex-1">
                    {draft.selectedClass.label}
                    {line.discountLabel ? ` · ${line.discountLabel}` : ""}
                    {line.quotaLabel ? ` · ${line.quotaLabel}` : ""}
                  </span>
                  <span className="tabular text-small shrink-0 font-semibold">
                    {formatPrice(line.unitPriceTtc)}
                  </span>
                </li>
              ))
            : Array.from({ length: draft.passengerCount }, (_, index) => (
                <li key={index} className="flex items-baseline gap-s-3">
                  <span className="text-small min-w-0 flex-1">
                    {draft.selectedClass.label}
                  </span>
                  <span className="tabular text-small shrink-0 font-semibold">
                    {formatPrice(
                      Math.round(draft.total / draft.passengerCount)
                    )}
                  </span>
                </li>
              ))}
        </ul>
        <div className="flex items-baseline gap-s-3 border-t border-line pt-s-3">
          <span className="text-body min-w-0 flex-1 font-semibold">Total</span>
          <span className="tabular text-h4 shrink-0">
            {formatPrice(draft.total)}
          </span>
        </div>
      </div>

      {draft.quote && (
        <p className="text-caption text-ink-muted">
          Barème : {draft.quote.distanceKm} km × tarif kilométrique, ajusté au
          remplissage de la desserte.
        </p>
      )}

      <InlineMessage
        tone="warning"
        title="Le tarif se fige à l’ouverture du dossier."
      >
        Vos places sont ensuite tenues quinze minutes. Passé ce délai, elles
        repartent à la vente et le prix est recalculé.
      </InlineMessage>

      {!draft.passengersNamed && (
        <InlineMessage tone="danger" title="Nom manquant.">
          Renseignez le nom et le prénom de chaque voyageur avant de payer.
        </InlineMessage>
      )}
      {draft.passengersNamed && !draft.contactValid && (
        <InlineMessage tone="danger" title="Téléphone de contact manquant.">
          Ce numéro reçoit le billet : il est obligatoire.
        </InlineMessage>
      )}
      {draft.error && <InlineMessage tone="danger" title={draft.error} />}

      <StickyActions>
        <Button
          size="lg"
          block
          loading={draft.submitting}
          loadingLabel="Réservation…"
          onClick={() => draft.submit()}
        >
          Passer au paiement · {formatPrice(draft.total)}
        </Button>
      </StickyActions>
    </>
  )
}
