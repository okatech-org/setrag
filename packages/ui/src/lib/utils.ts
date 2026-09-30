import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * `tailwind-merge` ne connaît pas l'échelle typographique SETRAG
 * (`text-small`, `text-h3`… dans globals.css) : il la prendrait pour une
 * couleur, et `cn("text-caption", "text-ink-muted")` perdrait la taille. On
 * la déclare donc comme ce qu'elle est — une taille de texte.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["display", "h1", "h2", "h3", "h4", "body-lg", "body", "small", "caption", "time", "mono-label"] },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
