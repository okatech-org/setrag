"use client"

import { useEffect, useState } from "react"
import { DownloadIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { LogoAnime } from "@workspace/ui/marque"
import { cn } from "@workspace/ui/lib/utils"

import { SectionAssistant } from "./section-assistant"
import { SectionComposants } from "./section-composants"
import {
  SectionConcept,
  SectionCouleurs,
  SectionIcones,
  SectionLogo,
  SectionTon,
  SectionTypographie,
  SectionVoie,
} from "./section-marque"
import { SectionMouvement } from "./section-mouvement"
import { SectionWidgets } from "./section-widgets"

const SOMMAIRE = [
  ["concept", "Le concept"],
  ["logo", "Le logo"],
  ["couleurs", "Couleurs"],
  ["typographie", "Typographie"],
  ["icones", "Icônes"],
  ["voie", "La voie et le ruban"],
  ["mouvement", "Le mouvement"],
  ["composants", "Les composants"],
  ["widgets", "Widgets & Live"],
  ["ruban", "Ruban, l'assistant"],
  ["ton", "Le ton"],
] as const

/** Section visible : la dernière dont le titre est passé sous le haut de l'écran. */
function useSectionCourante() {
  const [courante, setCourante] = useState<string>(SOMMAIRE[0][0])
  useEffect(() => {
    const observateur = new IntersectionObserver(
      (entrees) => {
        const visibles = entrees.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visibles[0]) setCourante(visibles[0].target.id)
      },
      { rootMargin: "-20% 0px -70% 0px" }
    )
    for (const [id] of SOMMAIRE) {
      const section = document.getElementById(id)
      if (section) observateur.observe(section)
    }
    return () => observateur.disconnect()
  }, [])
  return courante
}

export function Charte() {
  const [rejouer, setRejouer] = useState(0)
  const courante = useSectionCourante()

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-20 md:px-8">
      <header className="grid grid-cols-[minmax(0,1fr)] items-center gap-8 py-10 md:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid gap-4">
          <p className="text-mono-label text-ink-muted">Charte graphique · version 1</p>
          <h1 className="text-h2 md:text-display">Une voie, et le ruban qui glisse dessus</h1>
          <p className="max-w-[56ch] text-body-lg text-ink-muted max-md:text-body">
            Tout le système SETRAG part du logo. La voie ferrée du S donne la structure des écrans. Le ruban vert, jaune, bleu, les couleurs
            du Gabon, est la seule chose qui bouge : il montre où l’on en est et ce qui avance.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild variant="secondary">
              <a href="/marque/setrag-logo.svg" download>
                <DownloadIcon />
                Télécharger le logo
              </a>
            </Button>
          </div>
        </div>
        <figure className="relative grid min-h-[240px] place-items-center rounded-lg border border-line bg-[var(--c-surface)] p-8">
          <LogoAnime rejouer={rejouer} className="w-full max-w-[440px]" />
          <Button variant="ghost" size="sm" className="absolute right-3 bottom-3" onClick={() => setRejouer((n) => n + 1)}>
            <RotateCcwIcon />
            Rejouer
          </Button>
        </figure>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Sommaire de la charte" className="max-lg:sticky max-md:top-[calc(52px+env(safe-area-inset-top,0px))] max-lg:z-10 md:max-lg:top-[68px] max-lg:-mx-4 max-lg:bg-canvas/95 max-lg:backdrop-blur-sm lg:relative">
          <ol className="no-scrollbar flex gap-1 overflow-x-auto px-4 py-2 lg:sticky lg:top-24 lg:grid lg:overflow-visible lg:p-0">
            {SOMMAIRE.map(([id, titre], i) => (
              <li key={id} className="shrink-0">
                <a
                  href={`#${id}`}
                  aria-current={courante === id ? "true" : undefined}
                  className={cn(
                    "relative flex min-h-11 items-center gap-2 rounded-pill px-3 text-[14px] font-medium whitespace-nowrap transition-colors lg:rounded-sm lg:pl-4",
                    courante === id ? "bg-accent-soft text-accent-ink lg:bg-transparent" : "text-ink-muted hover:text-ink"
                  )}
                >
                  {courante === id && <span aria-hidden className="bg-ruban-v absolute inset-y-2 left-0 w-[3px] rounded-pill max-lg:hidden" />}
                  <span className="font-mono text-[11.5px] text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
                  {titre}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="min-w-0">
          <SectionConcept />
          <SectionLogo />
          <SectionCouleurs />
          <SectionTypographie />
          <SectionIcones />
          <SectionVoie />
          <SectionMouvement />
          <SectionComposants />
          <SectionWidgets />
          <SectionAssistant />
          <SectionTon />
        </div>
      </div>
    </div>
  )
}
