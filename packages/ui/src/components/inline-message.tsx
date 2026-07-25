import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Message en ligne Cadence — fond teinté, filet de 3 px à gauche.
 *
 * Ton : on écrit « Votre train partira 12 min plus tard. Votre place est
 * conservée. », jamais « Incident d'exploitation : perturbation prévisionnelle ».
 */
const inlineMessageVariants = cva(
  "flex flex-wrap gap-x-2 gap-y-1 rounded-md border-l-[3px] p-4 text-[15px] leading-snug",
  {
    variants: {
      tone: {
        info: "border-l-info bg-info-soft text-info-ink",
        success: "border-l-success bg-success-soft text-success-ink",
        warning: "border-l-warning bg-warning-soft text-warning-ink",
        danger: "border-l-danger bg-danger-soft text-danger-ink",
      },
    },
    defaultVariants: {
      tone: "info",
    },
  }
)

export interface InlineMessageProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof inlineMessageVariants> {
  title: string
}

function InlineMessage({
  className,
  tone,
  title,
  children,
  ...props
}: InlineMessageProps) {
  return (
    <div
      data-slot="inline-message"
      role={tone === "danger" ? "alert" : "status"}
      className={cn(inlineMessageVariants({ tone }), className)}
      {...props}
    >
      <span className="font-semibold">{title}</span>
      {children && <span>{children}</span>}
    </div>
  )
}

/** Bandeau de confirmation flottant — fond encre, action à droite. */
function ToastBar({
  className,
  action,
  children,
  ...props
}: React.ComponentProps<"div"> & { action?: React.ReactNode }) {
  return (
    <div
      data-slot="toast-bar"
      role="status"
      className={cn(
        "flex items-center gap-3.5 rounded-md bg-ink px-4 py-3.5 shadow-lg",
        className
      )}
      {...props}
    >
      <span className="flex-1 text-[15px] leading-snug font-medium text-ink-inverse">
        {children}
      </span>
      {action && (
        <span className="text-[14px] leading-none font-semibold text-accent-base">
          {action}
        </span>
      )}
    </div>
  )
}

export { InlineMessage, ToastBar, inlineMessageVariants }
