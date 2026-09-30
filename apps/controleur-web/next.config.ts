import path from "node:path"

import type { NextConfig } from "next"

/**
 * Empreinte du build, qui nomme les caches du service worker : le commit
 * déployé sur Vercel, à défaut l'instant de la compilation.
 */
const EMPREINTE_BUILD = (
  process.env.VERCEL_GIT_COMMIT_SHA ?? Date.now().toString(36)
).slice(0, 12)

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_EMPREINTE_BUILD: EMPREINTE_BUILD },
  // La racine du monorepo, dite explicitement : sans elle, Turbopack la
  // devine d'après le premier `bun.lock` trouvé en remontant — celui d'un
  // dépôt parent quand l'application est extraite dans un worktree.
  // Next se lance depuis le dossier de l'application (`bun run dev|build`).
  turbopack: { root: path.resolve(process.cwd(), "..", "..") },
  reactStrictMode: true,
  // Répertoire de build surchargeable, pour qu'une build de vérification
  // cohabite avec un serveur de développement sans écraser son `.next`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  allowedDevOrigins: ["127.0.0.1"],
  // Les paquets du monorepo sont publiés en TypeScript source.
  transpilePackages: [
    "@workspace/ui",
    "@workspace/api",
    "@workspace/shared",
    "@workspace/backend",
  ],
  reactCompiler: true,
  typedRoutes: true,
  async headers() {
    return [
      {
        // Le service worker doit pouvoir contrôler toute l'application, pas
        // seulement son propre répertoire, et ne jamais être servi depuis un
        // cache périmé : une version figée gèlerait le mode hors ligne.
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ]
  },
}

export default nextConfig
