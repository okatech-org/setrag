export const PLATFORM_ENVIRONMENTS = [
  "development",
  "preview",
  "staging",
  "production",
  "test",
] as const

export type PlatformEnvironment = (typeof PLATFORM_ENVIRONMENTS)[number]

export interface EnvironmentSource {
  readonly SETRAG_ENV?: string
  readonly NODE_ENV?: string
  readonly CONVEX_DEPLOYMENT?: string
}

function recognizedEnvironment(value: string | undefined) {
  const normalized = value?.trim().toLowerCase()
  return PLATFORM_ENVIRONMENTS.find((candidate) => candidate === normalized)
}

/** Dérive un environnement stable à partir de données serveur uniquement. */
export function derivePlatformEnvironment(
  source: EnvironmentSource = {}
): PlatformEnvironment {
  const configured = recognizedEnvironment(source.SETRAG_ENV)
  if (configured) return configured

  const nodeEnvironment = recognizedEnvironment(source.NODE_ENV)
  if (nodeEnvironment) return nodeEnvironment

  if (source.CONVEX_DEPLOYMENT?.startsWith("prod:")) return "production"
  if (source.CONVEX_DEPLOYMENT?.startsWith("dev:")) return "development"
  return "development"
}

export function currentPlatformEnvironment(): PlatformEnvironment {
  return derivePlatformEnvironment(process.env)
}
