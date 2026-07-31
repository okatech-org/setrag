import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ]
  },
}

export default nextConfig
