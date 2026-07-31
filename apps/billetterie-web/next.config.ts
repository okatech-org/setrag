import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Répertoire de build surchargeable, pour qu'une build de test cohabite avec
  // un serveur de développement déjà lancé sans écraser son `.next`.
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
        // Le worker est servi depuis `/public`, donc à la racine : sans cet
        // en-tête son périmètre serait limité à son propre dossier, et il ne
        // verrait aucune navigation.
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          // Le worker porte le nom de ses caches : s'il était lui-même mis en
          // cache par le navigateur, un déploiement resterait invisible.
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
