"use client"

import { Button } from "@workspace/ui/components/button"

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="grid max-w-md gap-4 text-center">
        <h1 className="text-h3">Impossible d’afficher cet écran</h1>
        <p className="text-small text-ink-muted">
          Une erreur a interrompu le chargement. Vos données ne sont pas
          perdues.
        </p>
        <Button type="button" className="min-h-11 justify-self-center" onClick={() => reset()}>
          Réessayer
        </Button>
      </div>
    </main>
  )
}
