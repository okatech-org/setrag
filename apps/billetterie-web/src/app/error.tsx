"use client"

import { RotateCcwIcon } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"

import { Button } from "@workspace/ui/components/button"
import { SAttente } from "@workspace/ui/components/empty-state"

import { BarreApp } from "@/coquille/barre-app"

/**
 * Un écran a échoué. La coquille tient toujours : l'en-tête, les onglets et
 * les billets enregistrés sur le téléphone restent là. On propose de
 * réessayer, et une sortie vers les billets.
 */
export default function Erreur({
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
    <>
      <BarreApp titre="Incident" retour={true} />
      <div className="mx-auto grid w-full max-w-[1240px] flex-1 place-items-center px-4 py-12 md:px-8 md:py-24">
        <div
          role="alert"
          className="grid max-w-[42ch] justify-items-center gap-4 text-center"
        >
          <SAttente className="h-28" />
          <h1 className="text-h3 md:text-h2">L’écran ne s’est pas affiché</h1>
          <p className="text-body text-ink-muted">
            Un incident a interrompu le chargement. Réessayez. Si le réseau
            manque, les billets enregistrés sur ce téléphone restent lisibles
            dans Billets.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button onClick={() => unstable_retry()}>
              <RotateCcwIcon aria-hidden />
              Réessayer
            </Button>
            <Button asChild variant="secondary">
              <Link href="/billets">Mes billets</Link>
            </Button>
          </div>
          {error.digest && (
            <p className="text-caption text-ink-muted">
              Référence de l’incident :{" "}
              <code className="font-mono">{error.digest}</code>
            </p>
          )}
        </div>
      </div>
    </>
  )
}
