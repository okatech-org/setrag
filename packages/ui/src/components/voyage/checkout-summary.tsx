"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"
import { formatPrice } from "@workspace/ui/lib/format"
import { Button } from "@workspace/ui/components/button"

export interface CheckoutLine {
  label: string
  amountXaf: number
  /** Remise ou réduction — affichée en accent, montant négatif. */
  discount?: boolean
}

export interface PaymentOption {
  id: string
  label: string
  /** Détail à droite (« •••• 4242 », « 3 × 55 333 F »). */
  note?: string
  /** Rend le détail en mono (numéros de carte, échéances). */
  noteMono?: boolean
}

export interface CheckoutSummaryProps
  extends Omit<React.ComponentProps<"div">, "onSubmit"> {
  lines: CheckoutLine[]
  options: PaymentOption[]
  selectedOption?: string
  onSelectOption?: (id: string) => void
  onSubmit?: () => void
  submitting?: boolean
  /** Rassure sur la suite : livraison du billet, conditions d'annulation. */
  footnote?: string
}

/**
 * Tunnel de paiement — récapitulatif, choix du moyen de paiement, action.
 * Le total est le seul chiffre en 31 px : c'est lui qu'on lit en premier.
 */
function CheckoutSummary({
  lines,
  options,
  selectedOption,
  onSelectOption,
  onSubmit,
  submitting = false,
  footnote,
  className,
  ...props
}: CheckoutSummaryProps) {
  const total = lines.reduce(
    (sum, line) => sum + (line.discount ? -line.amountXaf : line.amountXaf),
    0
  )

  return (
    <div
      data-slot="checkout-summary"
      className={cn(
        "grid gap-5 rounded-lg border border-line bg-surface p-7",
        className
      )}
      {...props}
    >
      <div className="grid gap-3">
        {lines.map((line) => (
          <div
            key={line.label}
            className={cn(
              "flex justify-between gap-4 text-[15px] leading-snug",
              line.discount ? "text-accent-ink" : "text-ink-muted"
            )}
          >
            <span>{line.label}</span>
            <span className="tabular whitespace-nowrap">
              {line.discount ? "−" : ""}
              {formatPrice(line.amountXaf)}
            </span>
          </div>
        ))}

        <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
          <span className="text-[18px] leading-snug font-semibold">Total</span>
          <span className="text-h2 font-bold">{formatPrice(total)}</span>
        </div>
      </div>

      <fieldset className="grid gap-2.5">
        <legend className="sr-only">Moyen de paiement</legend>
        {options.map((option) => {
          const checked = option.id === selectedOption

          return (
            <label
              key={option.id}
              className={cn(
                "flex min-h-target cursor-pointer items-center gap-3 rounded-md border p-4 transition-colors duration-200 ease-setrag",
                checked
                  ? "border-[1.5px] border-accent-base bg-accent-soft"
                  : "border-line hover:bg-surface-sunk"
              )}
            >
              <input
                type="radio"
                name="payment-option"
                value={option.id}
                checked={checked}
                onChange={() => onSelectOption?.(option.id)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-pill border-[1.5px]",
                  checked ? "border-accent-base" : "border-line-strong"
                )}
              >
                {checked && <span className="size-2.5 rounded-pill bg-accent-base" />}
              </span>
              <span className="flex-1 text-[15px] leading-none font-medium">
                {option.label}
              </span>
              {option.note && (
                <span
                  className={cn(
                    "text-[13px] leading-none text-ink-muted",
                    option.noteMono && "tabular text-[14px]"
                  )}
                >
                  {option.note}
                </span>
              )}
            </label>
          )
        })}
      </fieldset>

      <Button
        size="lg"
        block
        onClick={onSubmit}
        loading={submitting}
        loadingLabel="Paiement en cours…"
      >
        Payer {formatPrice(total)}
      </Button>

      {footnote && (
        <p className="text-center text-[12px] leading-normal text-ink-muted">
          {footnote}
        </p>
      )}
    </div>
  )
}

export { CheckoutSummary }
