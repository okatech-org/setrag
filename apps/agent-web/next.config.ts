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
  // Les études sont lues sur disque par la route authentifiée : sans cette
  // inclusion, le traçage de Vercel ne les embarquerait pas dans la fonction.
  outputFileTracingIncludes: {
    "/documents/[name]": ["./documents/**/*"],
  },
}

export default nextConfig
