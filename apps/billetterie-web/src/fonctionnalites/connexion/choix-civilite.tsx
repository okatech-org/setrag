"use client"

import { Radio, RadioGroup } from "@workspace/ui/components/choice"
import { cn } from "@workspace/ui/lib/utils"

import { CIVILITES, type Civilite } from "@/lib/titulaire"

/**
 * La civilité du titulaire — Madame ou Monsieur —, telle qu'elle figure sur
 * ses billets. Demandée une fois (fin d'inscription), modifiable dans le
 * profil. L'erreur s'écrit sous le choix, jamais par la couleur seule.
 */
export function ChoixCivilite({
  valeur,
  onChange,
  erreur,
  id,
  facultative,
}: {
  valeur: Civilite | ""
  onChange: (valeur: Civilite) => void
  erreur?: string
  id: string
  /** Le profil l'accepte vide : les comptes plus anciens n'en ont pas. */
  facultative?: boolean
}) {
  return (
    <fieldset className="grid gap-1">
      <legend
        id={`${id}-legende`}
        className={cn(
          "mb-1 text-[13px] font-medium",
          erreur && "text-danger-ink"
        )}
      >
        Civilité{facultative ? " (facultative)" : ""}
      </legend>
      <RadioGroup
        id={id}
        value={valeur}
        onValueChange={(choix) => onChange(choix as Civilite)}
        aria-labelledby={`${id}-legende`}
        aria-describedby={erreur ? `${id}-erreur` : undefined}
        aria-invalid={erreur ? true : undefined}
        orientation="horizontal"
        className="flex flex-wrap gap-x-8"
      >
        <Radio value="F" label={CIVILITES.F} />
        <Radio value="M" label={CIVILITES.M} />
      </RadioGroup>
      {erreur && (
        <span
          id={`${id}-erreur`}
          role="alert"
          className="text-[12px] font-medium text-danger-ink"
        >
          {erreur}
        </span>
      )}
    </fieldset>
  )
}
