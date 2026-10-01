"use client"

import type { ReactNode } from "react"

import { CoquilleAgent } from "@/coquille/coquille-agent"
import type {
  CashSessionSummary,
  PointOfSaleSummary,
  SellerIdentity,
} from "@/lib/agent-data"

interface SellerShellProps {
  seller: SellerIdentity
  pointOfSale: PointOfSaleSummary
  /** Conservé pour compatibilité : la coquille lit la caisse en direct. */
  session?: CashSessionSummary | null
  online?: boolean
  onSignOut?: () => void
  portal?: "vente" | "gestion"
  /** Dernier maillon du fil d'Ariane. */
  title?: string
  children: ReactNode
}

/**
 * Cadre des écrans du guichet et de la gestion : la coquille du portail,
 * renseignée avec l'identité du vendeur et son point de vente.
 */
export function SellerShell({ seller, pointOfSale, title, children }: SellerShellProps) {
  return (
    <CoquilleAgent
      utilisateur={{
        firstName: seller.firstName,
        lastName: seller.lastName,
        matricule: seller.matricule,
        role: seller.role,
      }}
      perimetre={pointOfSale.name}
      titre={title}
    >
      {children}
    </CoquilleAgent>
  )
}
