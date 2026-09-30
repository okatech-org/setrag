import Link from "next/link"
import type { Route } from "next"

import { Logo } from "@workspace/ui/marque"

/**
 * Liens de service seulement : ce que l'en-tête montre déjà n'est pas répété,
 * à l'exception de l'aide.
 */
const LIENS: { href: Route; libelle: string }[] = [
  { href: "/aide", libelle: "Aide" },
  { href: "/conditions", libelle: "Conditions de vente" },
  { href: "/charte", libelle: "Charte graphique" },
]

/** Pied du site sur grand écran. Sur mobile, ces liens vivent dans « Compte ». */
export function Pied() {
  return (
    <footer className="hidden border-t border-line bg-surface md:block">
      <div className="flex w-full items-center gap-8 px-10 py-6">
        <Logo variante="compact" title="SETRAG" className="h-[30px]" />
        <p className="text-small text-ink-muted">Société d&apos;Exploitation du Transgabonais</p>
        <nav aria-label="Liens de service" className="ml-auto flex gap-5 text-small">
          {LIENS.map((lien) => (
            <Link key={lien.href} href={lien.href} className="text-ink-muted hover:text-ink">
              {lien.libelle}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
