import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

export type TonMessage = "info" | "ok" | "alerte" | "danger"

const TONS: Record<TonMessage, { classes: string; titre: string; icone: LucideIcon }> = {
  info: { classes: "border-l-info bg-info-soft", titre: "text-info-ink", icone: InfoIcon },
  ok: { classes: "border-l-success bg-success-soft", titre: "text-success-ink", icone: CircleCheckIcon },
  alerte: { classes: "border-l-warning bg-warning-soft", titre: "text-warning-ink", icone: TriangleAlertIcon },
  danger: { classes: "border-l-danger bg-danger-soft", titre: "text-danger-ink", icone: CircleAlertIcon },
}

/**
 * Message en ligne du terminal : filet de 3 px, titre en gras avec son icône,
 * puis la phrase qui dit quoi faire. Plus serré que le message de la
 * billetterie : l'écran d'un contrôle est déjà chargé.
 */
export function Message({
  ton = "info",
  titre,
  icone,
  children,
  className,
}: {
  ton?: TonMessage
  titre: ReactNode
  icone?: LucideIcon
  children?: ReactNode
  className?: string
}) {
  const { classes, titre: encre, icone: IconeParDefaut } = TONS[ton]
  const Icone = icone ?? IconeParDefaut
  return (
    <div
      role={ton === "danger" ? "alert" : "status"}
      className={cn(
        "grid gap-0.5 rounded-sm border-l-[3px] py-2.5 pr-3 pl-3.5 text-[13px] leading-[1.4] text-ink",
        classes,
        className
      )}
    >
      <p className={cn("flex items-start gap-1.5 font-bold", encre)}>
        <Icone aria-hidden className="mt-px size-4 shrink-0" />
        <span>{titre}</span>
      </p>
      {children && <div>{children}</div>}
    </div>
  )
}
