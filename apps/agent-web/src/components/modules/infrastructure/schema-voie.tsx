"use client"

import type { Route } from "next"
import Link from "next/link"

import { SchemaLigne, type GareLigne } from "@workspace/ui/components/schema-ligne"
import { cn } from "@workspace/ui/lib/utils"

/**
 * La ligne Owendo–Franceville avec ses zones de travail : limitations
 * temporaires de vitesse (LTV) et, au besoin, plages travaux. `SchemaLigne`
 * ne sait poser qu'un segment ; les zones sont donc dessinées dans une bande
 * alignée sur la même échelle (marge de 30 sur 1 000 de chaque côté, comme le
 * SVG), et chacune est aussi écrite en clair dans une liste : l'information
 * ne passe jamais par le dessin seul.
 */
export interface ZoneVoie {
  id: string
  libelle: string
  pkDebut: number
  pkFin: number
  /** Précision écrite : « 30 km/h », « Coupure de voie ». */
  detail: string
  href?: string
  nature: "ltv" | "travaux" | "anomalie"
}

const MARGE = 30
const LARGEUR = 1000

function position(km: number, longueur: number) {
  return ((MARGE + (Math.max(0, Math.min(km, longueur)) / longueur) * (LARGEUR - 2 * MARGE)) / LARGEUR) * 100
}

export function SchemaVoie({
  gares,
  zones,
  segment,
  className,
  liste = true,
}: {
  gares: GareLigne[]
  zones: readonly ZoneVoie[]
  /** Plage mise en avant (section ou chantier consulté). */
  segment?: [number, number]
  className?: string
  /** Liste écrite des zones sous le schéma. */
  liste?: boolean
}) {
  if (gares.length < 2) {
    return (
      <p className="text-small text-ink-muted">
        Les gares du référentiel ne sont pas chargées : le schéma de ligne est indisponible.
      </p>
    )
  }
  const longueur = Math.max(...gares.map((gare) => gare.km))
  return (
    <figure className={cn("grid gap-2", className)}>
      <div className="relative overflow-x-auto">
        <div className="min-w-[640px]">
          <SchemaLigne gares={gares} segment={segment} />
          <div aria-hidden className="relative h-7">
            <span className="absolute top-3 h-px bg-line" style={{ left: `${position(0, longueur)}%`, right: `${100 - position(longueur, longueur)}%` }} />
            {zones.map((zone) => {
              const debut = position(Math.min(zone.pkDebut, zone.pkFin), longueur)
              const fin = position(Math.max(zone.pkDebut, zone.pkFin), longueur)
              return (
                <span
                  key={zone.id}
                  title={`${zone.libelle} · PK ${zone.pkDebut} → ${zone.pkFin} · ${zone.detail}`}
                  className={cn(
                    "absolute top-1 h-4 min-w-1.5 rounded-xs border",
                    zone.nature === "ltv" && "border-warning-ink bg-warning-soft",
                    zone.nature === "travaux" && "border-info-ink bg-info-soft",
                    zone.nature === "anomalie" && "border-danger-ink bg-danger-soft"
                  )}
                  style={{ left: `${debut}%`, width: `${Math.max(fin - debut, 0.6)}%` }}
                />
              )
            })}
          </div>
        </div>
      </div>
      {liste ? (
        zones.length === 0 ? (
          <figcaption className="text-small text-ink-muted">Aucune zone signalée sur la ligne.</figcaption>
        ) : (
          <figcaption>
            <ul className="flex flex-wrap gap-2 text-[13px]">
              {zones.map((zone) => {
                const contenu = (
                  <>
                    <b className="tabular font-semibold">{zone.libelle}</b>
                    <span className="tabular text-ink-muted">
                      PK {zone.pkDebut}–{zone.pkFin}
                    </span>
                    <span>{zone.detail}</span>
                  </>
                )
                return (
                  <li key={zone.id}>
                    {zone.href ? (
                      <Link
                        href={zone.href as Route}
                        className="inline-flex min-h-11 items-center gap-2 rounded-sm border border-line bg-surface px-3 hover:bg-surface-sunk"
                      >
                        {contenu}
                      </Link>
                    ) : (
                      <span className="inline-flex min-h-11 items-center gap-2 rounded-sm border border-line bg-surface px-3">{contenu}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </figcaption>
        )
      ) : null}
    </figure>
  )
}
