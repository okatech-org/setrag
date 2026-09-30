import { describe, expect, it } from "vitest"
import { codeUnique, courriel, mono, paragraphe } from "./courriels"

describe("gabarit des e-mails", () => {
  it("pose le logo servi par la billetterie, titre en indigo", () => {
    const html = courriel({
      titre: "Vos billets SETRAG",
      corps: paragraphe(`Dossier ${mono("VTE-1")}`),
      siteUrl: "https://billets.setrag.ga/",
    })
    expect(html).toContain('src="https://billets.setrag.ga/marque/setrag-logo.png"')
    expect(html).toContain("color:#1A003B")
    expect(html).toContain("IBM Plex Mono")
    // Aucune trace de l'ancienne identité.
    expect(html).not.toMatch(/Arial,sans-serif;color:#131b26/)
  })

  it("écrit le nom et signe du ruban sans adresse de site", () => {
    const html = courriel({ titre: "Connexion", corps: codeUnique("123456") })
    expect(html).not.toContain("<img")
    expect(html).toContain(">SETRAG</span>")
    expect(html).toContain("background:#FCDF49")
  })

  it("échappe le titre, les références et le code", () => {
    const html = courriel({
      titre: "<b>",
      corps: paragraphe(mono("<script>")) + codeUnique("<1>"),
    })
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("&lt;1&gt;")
    expect(html).not.toContain("<b>")
  })
})
