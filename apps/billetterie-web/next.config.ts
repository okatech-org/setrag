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
}

export default nextConfig
