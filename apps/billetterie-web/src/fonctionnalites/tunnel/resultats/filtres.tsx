"use client"

import { SlidersHorizontalIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/choice"
import { Feuille } from "@workspace/ui/components/feuille"
import { tagVariants } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

import { libelleTypeTrain } from "@/lib/voyage"

import {
  CRENEAUX,
  DETAIL_CRENEAU,
  LIBELLE_CRENEAU,
  SANS_FILTRE,
  creneau,
  filtrer,
  nombreFiltres,
  type Creneau,
  type Filtres,
  type Resultat,
} from "./modele"

interface Option<V extends string> {
  valeur: V
  libelle: string
  detail?: string
  nombre: number
}

type Groupes = { types: Option<string>[]; creneaux: Option<Creneau>[] }

/**
 * Les filtres qui ont un sens pour ces résultats : un groupe n'apparaît que
 * s'il départage au moins deux trains (inutile de filtrer « Express » quand
 * il n'y a que des Express).
 */
export function useGroupesFiltres(resultats: Resultat[]): Groupes {
  return useMemo(() => {
    const types = [...new Set(resultats.map((r) => r.trip.trainType))]
      .sort()
      .map((type) => ({
        valeur: type,
        libelle: libelleTypeTrain(type),
        nombre: resultats.filter((r) => r.trip.trainType === type).length,
      }))
    const creneaux = CRENEAUX.map((valeur) => ({
      valeur,
      libelle: LIBELLE_CRENEAU[valeur],
      detail: DETAIL_CRENEAU[valeur],
      nombre: resultats.filter((r) => creneau(r.departureAt) === valeur).length,
    })).filter((option) => option.nombre > 0)
    return {
      types: types.length > 1 ? types : [],
      creneaux: creneaux.length > 1 ? creneaux : [],
    }
  }, [resultats])
}

export function aDesFiltres(groupes: Groupes) {
  return groupes.types.length > 0 || groupes.creneaux.length > 0
}

/** Coche ou décoche une option ; tout cocher revient à ne rien filtrer. */
function basculer<V extends string>(choisis: V[], toutes: V[], valeur: V): V[] {
  const effectifs = choisis.length === 0 ? toutes : choisis
  const suivants = effectifs.includes(valeur)
    ? effectifs.filter((v) => v !== valeur)
    : [...effectifs, valeur]
  return suivants.length === toutes.length ? [] : suivants
}

function Groupe<V extends string>({
  titre,
  options,
  choisis,
  onChange,
}: {
  titre: string
  options: Option<V>[]
  choisis: V[]
  onChange: (choisis: V[]) => void
}) {
  if (!options.length) return null
  const toutes = options.map((o) => o.valeur)
  return (
    <fieldset className="grid gap-0.5">
      <legend className="mb-1 text-[12px] font-semibold tracking-[0.06em] text-ink-muted uppercase">
        {titre}
      </legend>
      {options.map((option) => (
        <div
          key={option.valeur}
          className="flex items-center justify-between gap-3"
        >
          <Checkbox
            label={
              option.detail
                ? `${option.libelle} (${option.detail})`
                : option.libelle
            }
            checked={choisis.length === 0 || choisis.includes(option.valeur)}
            onCheckedChange={() =>
              onChange(basculer(choisis, toutes, option.valeur))
            }
            className="min-w-0 flex-1"
          />
          <span
            className="font-mono text-[13px] text-ink-muted tabular-nums"
            aria-label={`${option.nombre} train${option.nombre > 1 ? "s" : ""}`}
          >
            {option.nombre}
          </span>
        </div>
      ))}
    </fieldset>
  )
}

/** Les groupes de cases : colonne de gauche sur grand écran, feuille sur mobile. */
export function GroupesFiltres({
  groupes,
  filtres,
  onChange,
}: {
  groupes: Groupes
  filtres: Filtres
  onChange: (filtres: Filtres) => void
}) {
  return (
    <div className="grid gap-5">
      <Groupe
        titre="Départ"
        options={groupes.creneaux}
        choisis={filtres.creneaux}
        onChange={(creneaux) => onChange({ ...filtres, creneaux })}
      />
      <Groupe
        titre="Train"
        options={groupes.types}
        choisis={filtres.types}
        onChange={(types) => onChange({ ...filtres, types })}
      />
    </div>
  )
}

/** Pastille de filtre : 34 px à l'œil, 44 px sous le doigt. */
function Pastille({
  actif,
  onClick,
  children,
}: {
  actif: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={cn(
        tagVariants({ tone: actif ? "filterOn" : "filterOff" }),
        "relative shrink-0 after:absolute after:inset-x-0 after:-inset-y-[5px] [&>svg]:size-4"
      )}
    >
      {children}
    </button>
  )
}

/**
 * Sur mobile : les créneaux en pastilles, à portée de pouce, et le reste des
 * filtres dans une feuille.
 */
export function PastillesFiltres({
  groupes,
  filtres,
  onChange,
  resultats,
}: {
  groupes: Groupes
  filtres: Filtres
  onChange: (filtres: Filtres) => void
  resultats: Resultat[]
}) {
  const [ouvert, setOuvert] = useState(false)
  const actifs = nombreFiltres(filtres)
  const retenus = filtrer(resultats, filtres).length

  return (
    <div className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 py-[5px] md:hidden">
      <Pastille actif={actifs > 0} onClick={() => setOuvert(true)}>
        <SlidersHorizontalIcon aria-hidden />
        {actifs > 0 ? `Filtres · ${actifs}` : "Filtres"}
      </Pastille>
      {groupes.creneaux.map((option) => (
        <Pastille
          key={option.valeur}
          actif={filtres.creneaux.includes(option.valeur)}
          onClick={() =>
            onChange({
              ...filtres,
              creneaux: filtres.creneaux.includes(option.valeur)
                ? filtres.creneaux.filter((c) => c !== option.valeur)
                : [...filtres.creneaux, option.valeur],
            })
          }
        >
          {option.libelle}
        </Pastille>
      ))}
      <Feuille
        open={ouvert}
        onOpenChange={setOuvert}
        titre="Filtrer les trains"
        pied={
          <div className="grid gap-2">
            <Button block size="lg" onClick={() => setOuvert(false)}>
              {retenus === 0
                ? "Aucun train retenu"
                : `Voir ${retenus} train${retenus > 1 ? "s" : ""}`}
            </Button>
            {actifs > 0 && (
              <Button
                block
                variant="ghost"
                onClick={() => onChange(SANS_FILTRE)}
              >
                Tout afficher
              </Button>
            )}
          </div>
        }
      >
        <GroupesFiltres
          groupes={groupes}
          filtres={filtres}
          onChange={onChange}
        />
      </Feuille>
    </div>
  )
}
