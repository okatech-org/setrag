"use client"

import { RotateCcwIcon } from "lucide-react"
import { useEffect } from "react"

import { Button } from "@workspace/ui/components/button"
import { SAttente } from "@workspace/ui/components/empty-state"
import { Logo } from "@workspace/ui/marque"

import "./globals.css"

/**
 * Dernier recours : la mise en page racine elle-même a échoué. Plus de
 * coquille ni de fournisseurs — seulement le logo, la phrase et le bouton.
 * Le retour à l'accueil recharge tout le document, pas seulement la route.
 */
export default function ErreurGlobale({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="fr">
      <body className="bg-canvas">
        <title>Incident · SETRAG</title>
        <main className="pt-safe grid min-h-dvh place-items-center px-4 py-12">
          <div
            role="alert"
            className="grid max-w-[42ch] justify-items-center gap-4 text-center"
          >
            <Logo variante="compact" title="SETRAG" className="h-[34px]" />
            <SAttente className="mt-4 h-28" />
            <h1 className="text-h3 md:text-h2">
              La billetterie ne s’est pas chargée
            </h1>
            <p className="text-body text-ink-muted">
              Un incident a interrompu l’ouverture. Réessayez dans un instant.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Button onClick={() => unstable_retry()}>
                <RotateCcwIcon aria-hidden />
                Réessayer
              </Button>
              <Button
                variant="secondary"
                onClick={() => window.location.assign("/")}
              >
                Retour à l’accueil
              </Button>
            </div>
            {error.digest && (
              <p className="text-caption text-ink-muted">
                Référence de l’incident :{" "}
                <code className="font-mono">{error.digest}</code>
              </p>
            )}
          </div>
        </main>
      </body>
    </html>
  )
}
