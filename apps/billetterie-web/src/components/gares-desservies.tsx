"use client"

import { useQuery } from "convex/react"
import { api } from "@workspace/backend/generated"

import { Badge } from "@workspace/ui/components/badge"

/** Gares actives du réseau, servies en temps réel par Convex. */
export function GaresDesservies() {
  const gares = useQuery(api.functions.referential.listStations, {})

  if (gares === undefined) {
    return (
      <p className="text-sm text-muted-foreground">Chargement des gares…</p>
    )
  }

  if (gares.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune gare n&apos;est encore ouverte à la vente.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {gares.map((gare) => (
        <Badge key={gare._id} variant="secondary">
          {gare.name}
          <span className="text-muted-foreground">
            PK {gare.kilometerPoint}
          </span>
        </Badge>
      ))}
    </div>
  )
}
