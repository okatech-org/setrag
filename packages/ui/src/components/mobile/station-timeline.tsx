"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"
import { Tag } from "@workspace/ui/components/tag"

export type StationState = "passed" | "current" | "upcoming"

export interface StationTimelineStop {
  id: string
  /** Nom de la gare. */
  name: string
  /**
   * Heure théorique, déjà mise en forme par l'appelant. Facultative : la même
   * timeline sert aux étapes d'un paiement, qui n'ont pas d'horaire.
   */
  scheduledTime?: string
  /** Heure révisée si elle diffère de la théorique. */
  revisedTime?: string
  /** Point kilométrique, affiché en second plan. */
  pk?: string
  state: StationState
  /** Mention d'état — « +35 min », « supprimé ». */
  note?: { label: string; tone: "neutral" | "warning" | "danger" | "success" }
}

/**
 * Desserte d'un train, gare après gare.
 *
 * L'avancement n'est pas déduit d'une position en temps réel — le backend n'en
 * tient pas — mais de l'état de la desserte et de son retard. L'appelant
 * calcule donc `state`, et l'affichage se contente de le rendre.
 *
 * L'état d'une gare est porté par trois signaux, jamais par la seule couleur :
 * la puce est pleine ou creuse, le nom passe en gras à la gare courante, et
 * `aria-current` la désigne aux lecteurs d'écran.
 */
function StationTimeline({
  className,
  stops,
  label,
  ...props
}: React.ComponentProps<"ol"> & {
  stops: StationTimelineStop[]
  label: string
}) {
  return (
    <ol
      data-slot="station-timeline"
      aria-label={label}
      className={cn("grid", className)}
      {...props}
    >
      {stops.map((stop, index) => {
        const isLast = index === stops.length - 1
        const isCurrent = stop.state === "current"

        return (
          <li
            key={stop.id}
            aria-current={isCurrent ? "step" : undefined}
            className="grid grid-cols-[auto_1fr] gap-s-3"
          >
            <span className="grid justify-items-center" aria-hidden>
              <span
                className={cn(
                  "mt-1.5 size-3 shrink-0 rounded-pill border-2",
                  stop.state === "upcoming"
                    ? "border-line-strong bg-surface"
                    : "border-accent-base bg-accent-base",
                  isCurrent && "ring-3 ring-accent-soft"
                )}
              />
              {!isLast && (
                <span
                  className={cn(
                    "my-1 w-0.5 flex-1 rounded-pill",
                    stop.state === "passed" ? "bg-accent-base" : "bg-line"
                  )}
                />
              )}
            </span>
            <span
              className={cn(
                "flex min-w-0 items-start gap-s-3",
                isLast ? "pb-0" : "pb-s-5"
              )}
            >
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span
                  className={cn(
                    "text-body truncate",
                    isCurrent ? "font-semibold" : "font-medium"
                  )}
                >
                  {stop.name}
                </span>
                {stop.pk && (
                  <span className="tabular text-caption text-ink-faint">
                    {stop.pk}
                  </span>
                )}
              </span>
              <span className="grid shrink-0 justify-items-end gap-1">
                {(stop.revisedTime ?? stop.scheduledTime) && (
                  <span className="tabular text-small font-semibold">
                    {stop.revisedTime ?? stop.scheduledTime}
                  </span>
                )}
                {stop.revisedTime && stop.scheduledTime && (
                  <span className="tabular text-caption text-ink-muted line-through">
                    {stop.scheduledTime}
                  </span>
                )}
                {stop.note && (
                  <Tag tone={stop.note.tone}>{stop.note.label}</Tag>
                )}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export { StationTimeline }
