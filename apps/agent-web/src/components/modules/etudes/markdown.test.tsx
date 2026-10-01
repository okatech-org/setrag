import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { analyserMarkdown, Markdown } from "./markdown"

describe("rendu Markdown des études", () => {
  it("découpe titres, tableaux, listes imbriquées, citations et code", () => {
    const blocs = analyserMarkdown(
      [
        "#### Sous-titre",
        "",
        "| N° | Décision |",
        "| --- | --- |",
        "| D1 | Lecture seule |",
        "",
        "- Premier",
        "  - Imbriqué",
        "- Second",
        "",
        "> Une citation",
        "",
        "```",
        "# pas un titre",
        "```",
        "",
        "---",
      ].join("\n")
    )
    expect(blocs.map((bloc) => bloc.type)).toEqual(["titre", "tableau", "liste", "citation", "code", "filet"])
    const liste = blocs[2] as Extract<(typeof blocs)[number], { type: "liste" }>
    expect(liste.elements).toHaveLength(2)
    expect(liste.elements[0]!.enfants?.elements[0]!.texte).toBe("Imbriqué")
  })

  it("rend le texte en ligne sans interpréter de HTML", () => {
    render(
      <Markdown texte={"Texte **gras**, `code`, [lien](https://setrag.eramet.com) et [piège](javascript:alert(1)).<br>Suite <script>x</script>"} />
    )
    expect(screen.getByText("gras").tagName).toBe("STRONG")
    expect(screen.getByText("code").tagName).toBe("CODE")
    const lien = screen.getByRole("link", { name: "lien" })
    expect(lien).toHaveAttribute("href", "https://setrag.eramet.com")
    expect(lien).toHaveAttribute("rel", "noreferrer noopener")
    expect(screen.queryByRole("link", { name: "piège" })).toBeNull()
    expect(document.querySelector("script")).toBeNull()
  })

  it("rend un tableau accessible", () => {
    render(<Markdown texte={"| Élément | Valeur |\n| --- | --- |\n| Application | Portail **agent** |"} />)
    const tableau = screen.getByRole("table")
    expect(within(tableau).getAllByRole("columnheader").map((cellule) => cellule.textContent)).toEqual(["Élément", "Valeur"])
    expect(within(tableau).getByText("agent").tagName).toBe("STRONG")
  })
})
