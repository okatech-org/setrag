import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

export interface AvatarProps extends React.ComponentProps<"span"> {
  /** Nom complet — les initiales en sont dérivées. */
  name: string
  size?: "sm" | "md" | "lg"
  src?: string
}

/** Initiales sur pastille acier, ou photo si `src` est fourni. */
function Avatar({ name, size = "md", src, className, ...props }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")

  const dimension = { sm: "size-7 text-[11px]", md: "size-[34px] text-[13px]", lg: "size-11 text-[15px]" }[size]

  return (
    <span
      data-slot="avatar"
      title={name}
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-pill bg-second-soft leading-none font-semibold text-second-ink",
        dimension,
        className
      )}
      {...props}
    >
      {/* `img` natif : ce paquet n'est pas lié à Next, pas de next/image ici. */}
      {src ? (
        <img src={src} alt={name} className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
      <span className="sr-only">{name}</span>
    </span>
  )
}

export { Avatar }
