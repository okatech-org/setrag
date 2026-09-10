"use client"

import type { FunctionReturnType } from "convex/server"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import type { ModuleCode } from "@workspace/backend/modules"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { PLATFORM_MODULES_API_ENABLED } from "@/lib/platform-modules-runtime"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

export type ModuleAccess = FunctionReturnType<
  typeof api.modules.platform.queries.getMyModuleAccess
>

export function ModuleAccessBoundary({
  access,
  children,
}: {
  access: ModuleAccess | undefined
  children: React.ReactNode
}) {
  if (access === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
        <p role="status" className="text-small text-center text-ink-muted">
          Vérification de l’accès au module…
        </p>
      </main>
    )
  }

  if (!access.canAccess) {
    const description = access.enabled
      ? "Votre profil ne dispose pas de l’habilitation requise. Contactez votre responsable si cet accès est nécessaire."
      : "Ce module n’est pas activé pour votre périmètre. Contactez votre administrateur fonctionnel si cet accès est nécessaire."

    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-xl">
          <InlineMessage
            tone="warning"
            title={`Accès au module ${access.label} indisponible`}
          >
            {description}
          </InlineMessage>
        </div>
      </main>
    )
  }

  return children
}

/**
 * Complément UX à l’autorisation serveur : les requêtes métier restent seules
 * responsables de la protection des données du module.
 */
export function ModuleGuard({
  moduleCode,
  children,
}: {
  moduleCode: ModuleCode
  children: React.ReactNode
}) {
  const access = useQuery(
    api.modules.platform.queries.getMyModuleAccess,
    E2E_MODE || !PLATFORM_MODULES_API_ENABLED ? "skip" : { moduleCode }
  )

  if (E2E_MODE) return children
  if (!PLATFORM_MODULES_API_ENABLED) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-xl">
          <InlineMessage tone="info" title="Module en cours d’activation">
            Ce module sera disponible après l’activation de son service
            sécurisé.
          </InlineMessage>
        </div>
      </main>
    )
  }

  return <ModuleAccessBoundary access={access}>{children}</ModuleAccessBoundary>
}
