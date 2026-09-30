import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Dossier de build distinct pour les vérifications, sans toucher au
  // serveur de développement (même réglage que la billetterie).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Les paquets du monorepo sont publiés en TypeScript source.
  transpilePackages: [
    "@workspace/ui",
    "@workspace/api",
    "@workspace/shared",
    "@workspace/backend",
  ],
  reactCompiler: true,
  typedRoutes: true,
  // Les études sont lues sur disque par la route authentifiée : sans cette
  // inclusion, le traçage de Vercel ne les embarquerait pas dans la fonction.
  outputFileTracingIncludes: {
    "/documents/[name]": ["./documents/**/*"],
  },
}

export default nextConfig
