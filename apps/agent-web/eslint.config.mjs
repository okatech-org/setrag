import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypeScript from "eslint-config-next/typescript"

const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    // `.next-*` : les builds de vérification (`NEXT_DIST_DIR`).
    ignores: [".next/**", ".next-*/**", "node_modules/**", "next-env.d.ts"],
  },
]

export default config
