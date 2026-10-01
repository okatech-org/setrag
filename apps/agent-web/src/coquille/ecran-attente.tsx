import type { ReactNode } from "react"

import { Chargeur } from "@workspace/ui/components/voie"
import { Logo } from "@workspace/ui/marque"

/**
 * Écran d'attente du portail (vérification de la session, redirection) : le
 * logo, et la rame qui passe sur la voie tant que la réponse n'est pas là.
 */
export function EcranAttente({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-6">
      <div className="grid justify-items-center gap-6">
        <Logo variante="compact" title="SETRAG" className="h-10" />
        <Chargeur>{children}</Chargeur>
      </div>
    </main>
  )
}
