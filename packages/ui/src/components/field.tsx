"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Champs de saisie SETRAG — hauteur 52, rayon 12, anneau de focus à
 * l'extérieur. L'erreur porte toujours un libellé écrit : l'information
 * n'est jamais portée par la couleur seule.
 */

const controlBase =
  "min-w-0 w-full rounded-md border bg-surface px-4 text-[16px] text-ink transition-[border-color,box-shadow] duration-200 ease-setrag outline-none placeholder:text-ink-muted focus-visible:border-accent-base disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-sunk disabled:text-ink-muted"

const controlTone = {
  default: "border-line-strong",
  invalid: "border-[1.5px] border-danger bg-danger-soft",
} as const

export interface FieldProps extends React.ComponentProps<"div"> {
  label: string
  /** Texte d'aide affiché sous le champ, tant qu'il n'y a pas d'erreur. */
  hint?: string
  /** Message d'erreur — remplace le texte d'aide et colore le libellé. */
  error?: string
  htmlFor?: string
  disabled?: boolean
}

/** Enveloppe libellé + contrôle + aide/erreur, avec les liens ARIA posés. */
function Field({
  label,
  hint,
  error,
  htmlFor,
  disabled,
  className,
  children,
  ...props
}: FieldProps) {
  const generatedId = React.useId()
  const id = htmlFor ?? generatedId
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div className={cn("grid content-start gap-1.5", className)} {...props}>
      <label
        htmlFor={id}
        className={cn(
          "text-[13px] leading-snug font-medium",
          error && "text-danger-ink",
          disabled && "text-ink-muted"
        )}
      >
        {label}
      </label>

      {React.isValidElement(children)
        ? React.cloneElement(
            children as React.ReactElement<FieldControlProps>,
            {
              id,
              "aria-describedby":
                describedBy ??
                (children as React.ReactElement<FieldControlProps>).props[
                  "aria-describedby"
                ],
              "aria-invalid": error ? true : undefined,
              disabled,
            }
          )
        : children}

      {error ? (
        <span
          id={`${id}-error`}
          className="text-[12px] leading-normal font-medium text-danger-ink"
        >
          {error}
        </span>
      ) : hint ? (
        <span
          id={`${id}-hint`}
          className="text-[12px] leading-normal text-ink-muted"
        >
          {hint}
        </span>
      ) : null}
    </div>
  )
}

interface FieldControlProps {
  id?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
  disabled?: boolean
}

function Input({
  className,
  "aria-invalid": invalid,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      aria-invalid={invalid}
      className={cn(
        controlBase,
        "h-13",
        invalid ? controlTone.invalid : controlTone.default,
        className
      )}
      {...props}
    />
  )
}

function Textarea({
  className,
  "aria-invalid": invalid,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      aria-invalid={invalid}
      className={cn(
        controlBase,
        "min-h-24 resize-y py-3 leading-relaxed",
        invalid ? controlTone.invalid : controlTone.default,
        className
      )}
      {...props}
    />
  )
}

function SelectNative({
  className,
  "aria-invalid": invalid,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select-native"
        aria-invalid={invalid}
        className={cn(
          controlBase,
          "h-13 appearance-none pr-10",
          invalid ? controlTone.invalid : controlTone.default,
          className
        )}
        {...props}
      >
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-muted"
      >
        ▾
      </span>
    </div>
  )
}

export { Field, Input, Textarea, SelectNative }
