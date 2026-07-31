import { describe, expect, it } from "vitest"

import {
  SETRAG_WEB_ORIGINS,
  trustedAuthOrigins,
  trustedWebOrigins,
} from "./origins"

describe("origines de confiance Better Auth", () => {
  it("autorise toujours les deux applications web de production", () => {
    expect(trustedWebOrigins({})).toEqual([...SETRAG_WEB_ORIGINS])
  })

  it("ajoute les origines configurées sans doublon", () => {
    expect(
      trustedWebOrigins({
        TRUSTED_ORIGINS:
          "https://partenaire.example, https://setrag-agent-web.vercel.app",
      })
    ).toEqual([...SETRAG_WEB_ORIGINS, "https://partenaire.example"])
  })

  it("n'autorise localhost que lorsque la connexion de développement est active", () => {
    expect(trustedWebOrigins({ DEV_SIGNIN_ENABLED: "false" })).not.toContain(
      "http://localhost:3000"
    )
    expect(trustedWebOrigins({ DEV_SIGNIN_ENABLED: "true" })).toEqual(
      expect.arrayContaining([
        "http://localhost:3000",
        "https://localhost:3000",
        "http://localhost:3001",
        "https://localhost:3001",
        // Application de contrôle à bord.
        "http://localhost:3002",
        "https://localhost:3002",
      ])
    )
  })

  it("ajoute les schémas des applications natives uniquement à Better Auth", () => {
    expect(trustedAuthOrigins({})).toEqual([
      ...SETRAG_WEB_ORIGINS,
      "setrag://**",
      "setrag://",
      "exp://**",
    ])
    expect(trustedWebOrigins({})).not.toContain("setrag://")
  })
})
