"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive, RadioGroup, Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Contrôles de sélection Cadence — case 22 px (rayon 6), radio 22 px,
 * interrupteur 44 × 26. La zone cliquable englobe le libellé pour atteindre
 * la cible tactile de 44 px.
 */

const box =
  "grid size-[22px] shrink-0 place-items-center rounded-[6px] border-[1.5px] border-line-strong bg-surface text-ink-inverse transition-colors duration-200 ease-cadence outline-none data-[state=checked]:border-accent-base data-[state=checked]:bg-accent-base data-[disabled]:border-line data-[disabled]:bg-surface-sunk"

const row =
  "flex min-h-target items-center gap-3 text-[15px] text-ink data-[disabled]:text-ink-faint"

function Checkbox({
  label,
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & { label: string }) {
  return (
    <label className={cn(row, className)} data-disabled={props.disabled || undefined}>
      <CheckboxPrimitive.Root data-slot="checkbox" className={box} {...props}>
        <CheckboxPrimitive.Indicator className="text-[13px] leading-none font-semibold">
          ✓
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span>{label}</span>
    </label>
  )
}

function RadioGroupRoot({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroup.Root>) {
  return (
    <RadioGroup.Root
      data-slot="radio-group"
      className={cn("grid gap-1", className)}
      {...props}
    />
  )
}

function Radio({
  label,
  className,
  ...props
}: React.ComponentProps<typeof RadioGroup.Item> & { label: string }) {
  return (
    <label className={cn(row, className)} data-disabled={props.disabled || undefined}>
      <RadioGroup.Item
        data-slot="radio"
        className={cn(box, "rounded-pill data-[state=checked]:bg-surface")}
        {...props}
      >
        <RadioGroup.Indicator className="block size-2.5 rounded-pill bg-accent-base" />
      </RadioGroup.Item>
      <span>{label}</span>
    </label>
  )
}

function Switch({
  label,
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & { label: string }) {
  return (
    <label className={cn(row, className)} data-disabled={props.disabled || undefined}>
      <SwitchPrimitive.Root
        data-slot="switch"
        className="inline-flex h-[26px] w-11 shrink-0 items-center rounded-pill bg-line p-[3px] transition-colors duration-200 ease-cadence outline-none data-[state=checked]:bg-accent-base data-[disabled]:opacity-60"
        {...props}
      >
        <SwitchPrimitive.Thumb className="block size-5 rounded-pill bg-surface transition-transform duration-200 ease-cadence data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>
      <span>{label}</span>
    </label>
  )
}

export { Checkbox, Radio, RadioGroupRoot as RadioGroup, Switch }
