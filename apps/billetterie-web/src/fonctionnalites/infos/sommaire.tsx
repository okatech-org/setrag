"use client"

import { useEffect, useState } from "react"

import { cn } from "@workspace/ui/lib/utils"

export type EntreeSommaire = readonly [id: string, titre: string]

/** Section visible : la première dont le titre passe dans le haut de l'écran. */
function useSectionCourante(ids: readonly string[]) {
  const [courante, setCourante] = useState<string | undefined>(ids[0])
  const cle = ids.join("|")
  useEffect(() => {
    const observateur = new IntersectionObserver(
      (entrees) => {
        const visibles = entrees
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visibles[0]) setCourante(visibles[0].target.id)
      },
      { rootMargin: "-20% 0px -70% 0px" }
    )
    for (const id of cle.split("|")) {
      const section = document.getElementById(id)
      if (section) observateur.observe(section)
    }
    return () => observateur.disconnect()
  }, [cle])
  return courante
}

/**
 * Sommaire d'une page de lecture. Colonne fixe sur grand écran ; sur mobile,
 * une rangée de pastilles qui reste sous la barre d'app, comme dans une app.
 */
export function Sommaire({
  entrees,
  label = "Sommaire de la page",
}: {
  entrees: EntreeSommaire[]
  label?: string
}) {
  const courante = useSectionCourante(entrees.map(([id]) => id))

  return (
    <nav
      aria-label={label}
      className="max-lg:sticky max-lg:z-10 max-lg:-mx-4 max-lg:bg-canvas/95 max-lg:backdrop-blur-sm max-md:top-[calc(52px+env(safe-area-inset-top,0px))] md:max-lg:top-[68px] lg:relative"
    >
      <ol className="no-scrollbar flex gap-1 overflow-x-auto px-4 py-2 lg:sticky lg:top-24 lg:grid lg:overflow-visible lg:p-0">
        {entrees.map(([id, titre], i) => (
          <li key={id} className="shrink-0">
            <a
              href={`#${id}`}
              aria-current={courante === id ? "true" : undefined}
              className={cn(
                "relative flex min-h-11 items-center gap-2 rounded-pill px-3 text-[14px] font-medium whitespace-nowrap transition-colors lg:rounded-sm lg:pl-4",
                courante === id
                  ? "bg-accent-soft text-accent-ink lg:bg-transparent"
                  : "text-ink-muted hover:text-ink"
              )}
            >
              {courante === id && (
                <span
                  aria-hidden
                  className="bg-ruban-v absolute inset-y-2 left-0 w-[3px] rounded-pill max-lg:hidden"
                />
              )}
              <span className="font-mono text-[11.5px] text-ink-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
              {titre}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

/**
 * Ouvre la question visée par l'ancre de l'adresse (`/aide#hors-reseau`) :
 * un lien vers une réponse doit montrer la réponse, pas une question fermée.
 */
export function OuvrirAncre() {
  useEffect(() => {
    const ouvrir = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!id) return
      const cible = document.getElementById(id)
      if (cible instanceof HTMLDetailsElement) {
        cible.open = true
        cible.scrollIntoView({ block: "start" })
      }
    }
    ouvrir()
    window.addEventListener("hashchange", ouvrir)
    return () => window.removeEventListener("hashchange", ouvrir)
  }, [])
  return null
}
