import type { ModuleCode } from "@workspace/backend/modules"

interface PlatformModulesEnvironment {
  readonly nodeEnv?: string
  readonly e2eMode?: string
  readonly apiEnabled?: string
}

/**
 * Le frontend peut être livré avant les nouvelles fonctions Convex. L'opt-in
 * explicite évite alors d'appeler une fonction absente du backend courant.
 */
export function isPlatformModulesApiEnabled(
  environment: PlatformModulesEnvironment
) {
  const e2eEnabled =
    environment.nodeEnv !== "production" && environment.e2eMode === "1"

  return e2eEnabled || environment.apiEnabled === "1"
}

export const PLATFORM_MODULES_API_ENABLED = isPlatformModulesApiEnabled({
  nodeEnv: process.env.NODE_ENV,
  e2eMode: process.env.NEXT_PUBLIC_E2E_MODE,
  apiEnabled: process.env.NEXT_PUBLIC_PLATFORM_MODULES_API,
})

/** Module historique déjà servi par le backend avant le déploiement ERP. */
export const LEGACY_SAFE_MODULE_CODES = [
  "voyageurs",
] as const satisfies readonly ModuleCode[]
