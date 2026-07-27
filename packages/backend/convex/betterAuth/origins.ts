type AuthEnvironment = {
  readonly [name: string]: string | undefined
}

/**
 * Origines web officielles de la chaîne SETRAG.
 *
 * Elles restent autorisées même si la variable Convex TRUSTED_ORIGINS est
 * absente ou mal renseignée. La variable d'environnement permet d'ajouter
 * d'autres domaines sans remplacer cette liste minimale.
 */
export const SETRAG_WEB_ORIGINS = [
  "https://setrag-billetterie-web.vercel.app",
  "https://setrag-agent-web.vercel.app",
] as const

const LOCAL_WEB_ORIGINS = [
  "http://localhost:3000",
  "https://localhost:3000",
  "http://localhost:3001",
  "https://localhost:3001",
] as const

const NATIVE_APP_ORIGINS = ["setrag://**", "setrag://", "exp://**"] as const

function configuredOrigins(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function unique(origins: readonly string[]): string[] {
  return [...new Set(origins)]
}

/** Origines HTTP autorisées à appeler les routes Better Auth via CORS. */
export function trustedWebOrigins(
  environment: AuthEnvironment = process.env
): string[] {
  const origins = [
    ...SETRAG_WEB_ORIGINS,
    ...configuredOrigins(environment.TRUSTED_ORIGINS),
  ]

  if (environment.DEV_SIGNIN_ENABLED === "true") {
    origins.push(...LOCAL_WEB_ORIGINS)
  }

  return unique(origins)
}

/** Origines reconnues par Better Auth, y compris les applications natives. */
export function trustedAuthOrigins(
  environment: AuthEnvironment = process.env
): string[] {
  return unique([...trustedWebOrigins(environment), ...NATIVE_APP_ORIGINS])
}
