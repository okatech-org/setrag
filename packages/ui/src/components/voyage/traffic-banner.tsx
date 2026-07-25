import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Bandeau info trafic — perturbation ou travaux annoncés.
 *
 * Le ton reste concret et rassurant : on dit l'effet sur le voyage du client
 * (« Vos billets restent valables sur le train suivant »), pas le vocabulaire
 * d'exploitation.
 */
export interface TrafficBannerProps extends React.ComponentProps<"section"> {
  title: string
  description: string
  tone?: "warning" | "info" | "danger"
  action?: React.ReactNode
}

const tones = {
  warning: {
    box: "border-warning/40 bg-warning-soft",
    dot: "bg-warning",
    title: "text-warning-ink",
    text: "text-warning-ink/85",
  },
  info: {
    box: "border-info/40 bg-info-soft",
    dot: "bg-info",
    title: "text-info-ink",
    text: "text-info-ink/85",
  },
  danger: {
    box: "border-danger/40 bg-danger-soft",
    dot: "bg-danger",
    title: "text-danger-ink",
    text: "text-danger-ink/85",
  },
} as const

function TrafficBanner({
  title,
  description,
  tone = "warning",
  action,
  className,
  ...props
}: TrafficBannerProps) {
  const t = tones[tone]

  return (
    <section
      data-slot="traffic-banner"
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-4 rounded-[16px] border p-5",
        t.box,
        className
      )}
      {...props}
    >
      <span aria-hidden className={cn("mt-[7px] size-2 shrink-0 rounded-pill", t.dot)} />
      <div className="grid gap-1.5">
        <h3 className={cn("text-[16px] leading-snug font-semibold", t.title)}>
          {title}
        </h3>
        <p className={cn("text-[14px] leading-normal", t.text)}>{description}</p>
        {action && <div className="pt-1">{action}</div>}
      </div>
    </section>
  )
}

export { TrafficBanner }
