"use client"

import type { ComponentProps } from "react"

import { Input } from "@workspace/ui/components/field"

import { EXEMPLE_TELEPHONE } from "@/lib/telephone"

/** Texte d'aide du `Field` : l'écriture attendue, par l'exemple. */
export const AIDE_TELEPHONE = `9 chiffres, par exemple ${EXEMPLE_TELEPHONE}, ou avec l'indicatif +241.`

/**
 * Numéro de téléphone, saisi comme on l'écrit au Gabon depuis 2024 : 9
 * chiffres en national. Toutes les écritures courantes sont acceptées
 * (espaces, +241, 00241) et relues par `lireTelephone`. Se place dans un
 * `Field`, qui lui transmet l'identifiant et les liens ARIA.
 */
export function ChampTelephone({
  valeur,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  valeur: string
  onChange: (valeur: string) => void
}) {
  return (
    <Input
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder={EXEMPLE_TELEPHONE}
      {...props}
      className="tabular"
      value={valeur}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}
