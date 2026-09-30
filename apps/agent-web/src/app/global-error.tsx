"use client"

import "./globals.css"

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="fr">
      <body className="bg-canvas text-ink min-h-dvh">
        <main className="flex min-h-dvh items-center justify-center p-6">
          <div className="grid max-w-md gap-4 text-center">
            <h1 className="text-h3">Le portail n’a pas pu s’afficher</h1>
            <p className="text-small text-ink-muted">
              Une erreur a interrompu le chargement. Réessayez pour revenir à
              l’écran précédent.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="bg-accent-base text-accent-ink min-h-11 justify-self-center rounded-pill px-5 font-semibold"
            >
              Réessayer
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
