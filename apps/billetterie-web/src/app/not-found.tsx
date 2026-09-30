import type { Metadata } from "next"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import { SAttente } from "@workspace/ui/components/empty-state"

import { BarreApp } from "@/coquille/barre-app"

export const metadata: Metadata = {
  title: "Page introuvable",
}

/**
 * Adresse inconnue. Le S gris, rame à quai : rien ne roule ici, mais il y a
 * toujours une sortie — chercher un train, ou retrouver ses billets.
 */
export default function PageIntrouvable() {
  return (
    <>
      <BarreApp titre="Page introuvable" retour={true} />
      <div className="mx-auto grid w-full max-w-[1240px] flex-1 place-items-center px-4 py-12 md:px-8 md:py-24">
        <div className="grid max-w-[40ch] justify-items-center gap-4 text-center">
          <SAttente className="h-28" />
          <p className="text-mono-label text-ink-muted">Erreur 404</p>
          <h1 className="text-h3 md:text-h2">Cette page n’existe pas</h1>
          <p className="text-body text-ink-muted">
            L’adresse est peut-être incomplète, ou la page a changé de place.
            Vos billets, eux, n’ont pas bougé.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button asChild>
              <Link href="/">Chercher un train</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/billets">Mes billets</Link>
            </Button>
          </div>
          <nav
            aria-label="Autres pages"
            className="flex flex-wrap justify-center gap-x-6"
          >
            <Link
              href="/suivi"
              className="inline-flex min-h-11 items-center rounded-sm text-[15px] font-semibold text-accent-ink hover:underline"
            >
              Suivre un train
            </Link>
            <Link
              href="/aide"
              className="inline-flex min-h-11 items-center rounded-sm text-[15px] font-semibold text-accent-ink hover:underline"
            >
              Aide
            </Link>
          </nav>
        </div>
      </div>
    </>
  )
}
