"use client"

import { BabyIcon, UserRoundIcon } from "lucide-react"
import { useId } from "react"

import { Radio, RadioGroup } from "@workspace/ui/components/choice"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { Tag, tagVariants } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

import {
  libelleEnfant,
  type Reduction,
} from "@/fonctionnalites/reference/use-reference"
import { EXEMPLE_TELEPHONE } from "@/lib/telephone"

import type { BrouillonVoyageur, Sexe } from "./brouillon"
import { idChamp } from "./validation"

/** Une personne connue du compte, pour préremplir un bloc d'un geste. */
export interface Candidat {
  id: string
  libelle: string
  voyageur: Partial<BrouillonVoyageur>
}

/**
 * Un voyageur : son nom tel qu'il sera écrit sur le billet, son sexe, et ce
 * qui justifie son tarif — la date de naissance d'un enfant, la réduction
 * d'un adulte (militaire…), à présenter au contrôle.
 */
export function BlocVoyageur({
  index,
  enfant,
  reductionEnfant,
  individuelles,
  voyageur,
  candidats,
  erreurs,
  dateVoyage,
  onChange,
}: {
  index: number
  enfant: boolean
  reductionEnfant: Reduction | null
  individuelles: Reduction[]
  voyageur: BrouillonVoyageur
  candidats: Candidat[]
  erreurs: Map<string, string>
  dateVoyage: string
  onChange: (modif: Partial<BrouillonVoyageur>) => void
}) {
  const titreId = useId()
  const sexeId = useId()
  const reduction = individuelles.find((r) => r.code === voyageur.reduction)
  const erreurSexe = erreurs.get(idChamp.sexe(index))
  const Icone = enfant ? BabyIcon : UserRoundIcon

  return (
    <section
      aria-labelledby={titreId}
      className="grid gap-4 rounded-lg border border-line bg-surface p-4 md:p-5"
    >
      <header className="flex items-center gap-2.5">
        <Icone className="size-5 shrink-0 text-ink-muted" aria-hidden />
        <h3 id={titreId} className="min-w-0 flex-1 text-[17px] font-bold">
          Voyageur {index + 1} ·{" "}
          {enfant ? libelleEnfant(reductionEnfant).toLowerCase() : "adulte"}
        </h3>
        {voyageur.source === "moi" && <Tag tone="accent">Vous</Tag>}
        {enfant && reductionEnfant && (
          <Tag tone="success">−{reductionEnfant.ratePct} %</Tag>
        )}
      </header>

      {candidats.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] text-ink-muted">Remplir avec</span>
          {candidats.map((candidat) => {
            const actif = voyageur.source === candidat.id
            return (
              <button
                key={candidat.id}
                type="button"
                aria-pressed={actif}
                onClick={() =>
                  onChange({ ...candidat.voyageur, source: candidat.id })
                }
                className={cn(
                  tagVariants({ tone: actif ? "filterOn" : "filterOff" }),
                  "relative after:absolute after:inset-x-0 after:-inset-y-[5px]"
                )}
              >
                {candidat.libelle}
              </button>
            )
          })}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Prénom"
          htmlFor={idChamp.prenom(index)}
          error={erreurs.get(idChamp.prenom(index))}
        >
          <Input
            value={voyageur.prenom}
            autoComplete={index === 0 ? "given-name" : "off"}
            autoCapitalize="words"
            onChange={(e) =>
              onChange({ prenom: e.target.value, source: undefined })
            }
          />
        </Field>
        <Field
          label="Nom"
          htmlFor={idChamp.nom(index)}
          error={erreurs.get(idChamp.nom(index))}
        >
          <Input
            value={voyageur.nom}
            autoComplete={index === 0 ? "family-name" : "off"}
            autoCapitalize="words"
            onChange={(e) =>
              onChange({ nom: e.target.value, source: undefined })
            }
          />
        </Field>

        <fieldset className="grid content-start gap-1.5">
          <legend
            id={sexeId}
            className={cn(
              "mb-1.5 text-[13px] leading-snug font-medium",
              erreurSexe && "text-danger-ink"
            )}
          >
            Sexe
          </legend>
          <RadioGroup
            id={idChamp.sexe(index)}
            aria-labelledby={sexeId}
            aria-describedby={
              erreurSexe ? `${idChamp.sexe(index)}-erreur` : undefined
            }
            aria-invalid={erreurSexe ? true : undefined}
            orientation="horizontal"
            value={voyageur.sexe}
            onValueChange={(valeur) => onChange({ sexe: valeur as Sexe })}
            className="flex min-h-13 flex-wrap items-center gap-x-6"
          >
            <Radio value="F" label="Femme" />
            <Radio value="M" label="Homme" />
          </RadioGroup>
          {erreurSexe && (
            <span
              id={`${idChamp.sexe(index)}-erreur`}
              className="text-[12px] leading-normal font-medium text-danger-ink"
            >
              {erreurSexe}
            </span>
          )}
        </fieldset>

        {enfant ? (
          <Field
            label="Date de naissance"
            htmlFor={idChamp.naissance(index)}
            hint={
              reductionEnfant?.requiresProof
                ? "Un justificatif d'âge est demandé au contrôle."
                : undefined
            }
            error={erreurs.get(idChamp.naissance(index))}
          >
            <Input
              type="date"
              value={voyageur.naissance}
              max={dateVoyage}
              onChange={(e) => onChange({ naissance: e.target.value })}
            />
          </Field>
        ) : (
          individuelles.length > 0 && (
            <Field
              label="Réduction"
              htmlFor={`voyageur-${index}-reduction`}
              hint={
                reduction
                  ? reduction.requiresProof
                    ? `${reduction.label} −${reduction.ratePct} % : justificatif demandé au contrôle.`
                    : `${reduction.label} −${reduction.ratePct} %.`
                  : "Facultatif."
              }
            >
              <SelectNative
                value={voyageur.reduction}
                onChange={(e) => onChange({ reduction: e.target.value })}
              >
                <option value="">Aucune — plein tarif</option>
                {individuelles.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label} −{r.ratePct} %
                  </option>
                ))}
              </SelectNative>
            </Field>
          )
        )}

        <Field
          label="Téléphone en cas d'urgence"
          htmlFor={idChamp.urgence(index)}
          hint={`Facultatif. Un proche à prévenir pendant le voyage, par exemple ${EXEMPLE_TELEPHONE}.`}
          error={erreurs.get(idChamp.urgence(index))}
          className="md:col-span-2"
        >
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={voyageur.urgence}
            onChange={(e) => onChange({ urgence: e.target.value })}
          />
        </Field>
      </div>
    </section>
  )
}
