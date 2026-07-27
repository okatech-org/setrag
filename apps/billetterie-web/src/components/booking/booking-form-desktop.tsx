"use client"

import { Button } from "@workspace/ui/components/button"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { formatPrice } from "@workspace/ui/lib/format"

import {
  SERVICE_CLASSES,
  type useBookingDraft,
} from "@/features/reservation/use-booking-draft"

/** Détail du voyage au format bureau : classe, voyageurs et total d'un bloc. */
export function BookingFormDesktop({
  draft,
}: {
  draft: ReturnType<typeof useBookingDraft>
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void draft.submit()
      }}
      action="/paiement"
      method="get"
      className="hidden min-w-0 gap-7 md:grid"
    >
      <fieldset className="grid min-w-0 gap-3">
        <legend className="text-h3 mb-3">Choisissez votre classe</legend>
        <div className="grid min-w-0 gap-3 md:grid-cols-3">
          {SERVICE_CLASSES.map((item) => (
            <label
              key={item.id}
              className={
                draft.booking.serviceClass === item.id
                  ? "min-w-0 cursor-pointer rounded-lg border-2 border-accent-base bg-accent-soft p-5"
                  : "min-w-0 cursor-pointer rounded-lg border border-line bg-surface p-5 hover:border-line-strong"
              }
            >
              <input
                className="sr-only"
                type="radio"
                name="serviceClass"
                checked={draft.booking.serviceClass === item.id}
                onChange={() => draft.setServiceClass(item.id)}
              />
              <strong className="block">{item.label}</strong>
              <span className="text-small text-ink-muted">{item.note}</span>
              <span className="mt-4 block font-semibold">
                {formatPrice(Math.round(draft.trip.priceXaf * item.factor))} /
                voyageur
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className="grid gap-5">
        <h2 className="text-h3">Voyageurs</h2>
        {draft.booking.passengers.map((passenger, index) => (
          <div
            key={index}
            className="grid gap-4 rounded-lg border border-line bg-surface p-5 md:grid-cols-2"
          >
            <h3 className="text-h4 md:col-span-2">Voyageur {index + 1}</h3>
            <Field label="Prénom" htmlFor={`firstName-${index}`}>
              <Input
                id={`firstName-${index}`}
                autoComplete="given-name"
                value={passenger.firstName}
                onChange={(event) =>
                  draft.updatePassenger(index, {
                    firstName: event.target.value,
                  })
                }
              />
            </Field>
            <Field label="Nom" htmlFor={`lastName-${index}`}>
              <Input
                id={`lastName-${index}`}
                autoComplete="family-name"
                value={passenger.lastName}
                onChange={(event) =>
                  draft.updatePassenger(index, { lastName: event.target.value })
                }
              />
            </Field>
            <Field label="Sexe" htmlFor={`gender-${index}`}>
              <SelectNative
                id={`gender-${index}`}
                value={passenger.gender}
                onChange={(event) =>
                  draft.updatePassenger(index, {
                    gender: event.target.value as "M" | "F",
                  })
                }
              >
                <option value="F">Femme</option>
                <option value="M">Homme</option>
              </SelectNative>
            </Field>
            <Field label="Contact d'urgence" htmlFor={`emergency-${index}`}>
              <Input
                id={`emergency-${index}`}
                type="tel"
                value={passenger.emergencyPhone ?? ""}
                onChange={(event) =>
                  draft.updatePassenger(index, {
                    emergencyPhone: event.target.value,
                  })
                }
              />
            </Field>
          </div>
        ))}
      </section>

      <section className="grid gap-4 rounded-lg border border-line bg-surface p-5 md:grid-cols-2">
        <h2 className="text-h3 md:col-span-2">Contact de réservation</h2>
        <Field label="Téléphone" htmlFor="contact-phone">
          <Input
            id="contact-phone"
            type="tel"
            autoComplete="tel"
            value={draft.booking.contactPhone}
            onChange={(event) =>
              draft.updateContact({ contactPhone: event.target.value })
            }
          />
        </Field>
        <Field label="E-mail (facultatif)" htmlFor="contact-email">
          <Input
            id="contact-email"
            type="email"
            autoComplete="email"
            value={draft.booking.contactEmail ?? ""}
            onChange={(event) =>
              draft.updateContact({ contactEmail: event.target.value })
            }
          />
        </Field>
      </section>

      {draft.error && <InlineMessage tone="danger" title={draft.error} />}

      <div className="sticky bottom-2 grid min-w-0 gap-3 rounded-lg border border-line bg-surface p-3 shadow-lg sm:bottom-4 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:p-4">
        <div className="min-w-0">
          <span className="text-caption text-ink-muted">Total indicatif</span>
          <strong className="text-h3 block">{formatPrice(draft.total)}</strong>
        </div>
        <Button
          type="submit"
          size="lg"
          loading={draft.submitting}
          loadingLabel="Réservation…"
          className="h-auto min-h-13 w-full min-w-0 px-5 py-3 text-center whitespace-normal sm:w-auto sm:whitespace-nowrap"
        >
          Continuer vers le paiement
        </Button>
      </div>
    </form>
  )
}
