import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypeScript from "eslint-config-next/typescript"

const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    // `.next-*` : les builds séparés (`NEXT_DIST_DIR`) des tests de bout en bout.
    ignores: [".next/**", ".next-*/**", "node_modules/**", "next-env.d.ts"],
  },
]

export default config
