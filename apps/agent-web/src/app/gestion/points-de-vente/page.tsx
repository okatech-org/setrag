import type { Metadata } from "next"

import { PointsDeVenteListe } from "@/components/gestion/referentiels/points-de-vente"

export const metadata: Metadata = { title: "Gestion · Points de vente" }

export default function PointsDeVentePage() {
  return <PointsDeVenteListe />
}
