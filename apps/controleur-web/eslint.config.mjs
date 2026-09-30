import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypeScript from "eslint-config-next/typescript"

const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    // `.next-*` : les builds séparés (`NEXT_DIST_DIR`) de vérification.
    ignores: [".next/**", ".next-*/**", "node_modules/**", "next-env.d.ts", "public/sw.js"],
  },
]

export default config
