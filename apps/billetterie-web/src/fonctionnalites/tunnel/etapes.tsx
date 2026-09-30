import type { ComponentProps, ReactNode } from "react"

import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { Stepper } from "@workspace/ui/components/stepper"
import { cn } from "@workspace/ui/lib/utils"

/** Les quatre gares du tunnel d'achat, communes à tous ses écrans. */
export const ETAPES = [
  { label: "Trajet" },
  { label: "Voyageurs" },
  { label: "Paiement" },
  { label: "Billet" },
]

export function libelleEtape(etape: number) {
  return `Étape ${etape + 1} sur ${ETAPES.length}`
}

/** Conteneur de page du tunnel. */
export function Page({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[1240px] px-4 md:px-8", className)}
      {...props}
    />
  )
}

/**
 * En-tête d'une étape : sur grand écran, le titre et son résumé à gauche, les
 * étapes à droite ; sur mobile, la barre d'app porte le titre (il reste lu
 * par les lecteurs d'écran) et les étapes passent dessous.
 */
export function EnTeteTunnel({
  etape,
  titre,
  detail,
  action,
  etapesMobile = true,
}: {
  etape: number
  titre: ReactNode
  detail?: ReactNode
  action?: ReactNode
  /** Les étapes sous la barre d'app mobile (masquées sur les résultats). */
  etapesMobile?: boolean
}) {
  return (
    <Page className="grid gap-3 pt-2 pb-1 md:flex md:items-center md:gap-10 md:pt-8 md:pb-3">
      <div className="md:flex md:min-w-0 md:flex-1 md:flex-wrap md:items-baseline md:gap-x-2.5 md:gap-y-1">
        <h1 className="text-[22px] leading-tight font-bold max-md:sr-only">
          {titre}
        </h1>
        {detail && (
          <span className="hidden text-[15px] text-ink-muted md:inline">
            · {detail}
          </span>
        )}
        {action && <span className="hidden md:inline-flex">{action}</span>}
      </div>
      <Stepper
        steps={ETAPES}
        current={etape}
        className={cn(
          "md:w-[440px] md:shrink-0",
          !etapesMobile && "max-md:hidden"
        )}
      />
    </Page>
  )
}

/**
 * Un écran qui s'arrête là : réservation expirée, train supprimé, adresse
 * incomplète. Un fait, ce que ça change, et toujours une sortie.
 */
export function EcranMessage({
  titre,
  description,
  action,
  illustration,
  className,
}: {
  titre: ReactNode
  description?: ReactNode
  action?: ReactNode
  illustration?: ReactNode | false
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-surface py-6 md:py-10",
        className
      )}
    >
      <EmptyState
        title={titre}
        description={description}
        action={action}
        illustration={illustration}
      />
    </div>
  )
}

/** Attente courte (moins d'une seconde) : la forme de l'écran, en gris. */
export function SqueletteTunnel({ lignes = 3 }: { lignes?: number }) {
  return (
    <Page className="grid gap-3 py-6 md:py-10" aria-hidden>
      {Array.from({ length: lignes }, (_, i) => (
        <SkeletonLines key={i} />
      ))}
    </Page>
  )
}
