import { Fragment, type ReactNode } from "react"

/**
 * Rendu Markdown des études, sans `dangerouslySetInnerHTML` : le texte est
 * découpé en blocs (titres, paragraphes, listes imbriquées, tableaux,
 * citations, code, filets) puis en éléments en ligne (gras, italique, code,
 * liens, retours à la ligne). Couvre ce qu'emploient les études du dépôt.
 */

type Bloc =
  | { type: "titre"; niveau: number; texte: string }
  | { type: "paragraphe"; lignes: string[] }
  | { type: "liste"; elements: ElementListe[]; ordonnee: boolean }
  | { type: "tableau"; entete: string[]; lignes: string[][] }
  | { type: "citation"; lignes: string[] }
  | { type: "code"; texte: string }
  | { type: "filet" }

interface ElementListe {
  texte: string
  enfants: { elements: ElementListe[]; ordonnee: boolean } | null
}

const PUCE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/

function cellules(ligne: string): string[] {
  const propre = ligne.trim().replace(/^\|/, "").replace(/\|$/, "")
  return propre.split(/(?<!\\)\|/).map((cellule) => cellule.trim().replace(/\\\|/g, "|"))
}

function lireListe(lignes: string[], depart: number): { liste: Extract<Bloc, { type: "liste" }>; suivant: number } {
  const premiere = PUCE.exec(lignes[depart]!)!
  const retraitBase = premiere[1]!.length
  const ordonnee = /\d/.test(premiere[2]!)
  const elements: ElementListe[] = []
  let index = depart
  while (index < lignes.length) {
    const ligne = lignes[index]!
    if (ligne.trim() === "") {
      // Une ligne vide ne coupe la liste que si la suivante n'en fait pas partie.
      const suivante = lignes[index + 1]
      if (suivante !== undefined && PUCE.test(suivante) && PUCE.exec(suivante)![1]!.length >= retraitBase) {
        index += 1
        continue
      }
      break
    }
    const puce = PUCE.exec(ligne)
    if (puce) {
      const retrait = puce[1]!.length
      if (retrait < retraitBase) break
      if (retrait > retraitBase && elements.length > 0) {
        const { liste, suivant } = lireListe(lignes, index)
        elements[elements.length - 1]!.enfants = { elements: liste.elements, ordonnee: liste.ordonnee }
        index = suivant
        continue
      }
      elements.push({ texte: puce[3]!, enfants: null })
      index += 1
      continue
    }
    // Ligne de continuation d'un élément (retrait sans puce).
    if (/^\s+\S/.test(ligne) && elements.length > 0) {
      elements[elements.length - 1]!.texte += ` ${ligne.trim()}`
      index += 1
      continue
    }
    break
  }
  return { liste: { type: "liste", elements, ordonnee }, suivant: index }
}

export function analyserMarkdown(markdown: string): Bloc[] {
  const lignes = markdown.replace(/\r\n/g, "\n").split("\n")
  const blocs: Bloc[] = []
  let index = 0
  while (index < lignes.length) {
    const ligne = lignes[index]!
    if (ligne.trim() === "") {
      index += 1
      continue
    }
    if (ligne.trimStart().startsWith("```")) {
      const contenu: string[] = []
      index += 1
      while (index < lignes.length && !lignes[index]!.trimStart().startsWith("```")) {
        contenu.push(lignes[index]!)
        index += 1
      }
      blocs.push({ type: "code", texte: contenu.join("\n") })
      index += 1
      continue
    }
    const titre = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(ligne)
    if (titre) {
      blocs.push({ type: "titre", niveau: titre[1]!.length, texte: titre[2]! })
      index += 1
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(ligne)) {
      blocs.push({ type: "filet" })
      index += 1
      continue
    }
    if (ligne.trimStart().startsWith("|") && /^\s*\|?\s*:?-{2,}/.test(lignes[index + 1] ?? "")) {
      const entete = cellules(ligne)
      const corps: string[][] = []
      index += 2
      while (index < lignes.length && lignes[index]!.trimStart().startsWith("|")) {
        corps.push(cellules(lignes[index]!))
        index += 1
      }
      blocs.push({ type: "tableau", entete, lignes: corps })
      continue
    }
    if (ligne.trimStart().startsWith(">")) {
      const contenu: string[] = []
      while (index < lignes.length && lignes[index]!.trimStart().startsWith(">")) {
        contenu.push(lignes[index]!.trimStart().replace(/^>\s?/, ""))
        index += 1
      }
      blocs.push({ type: "citation", lignes: contenu })
      continue
    }
    if (PUCE.test(ligne)) {
      const { liste, suivant } = lireListe(lignes, index)
      blocs.push(liste)
      index = suivant
      continue
    }
    const contenu: string[] = []
    while (
      index < lignes.length &&
      lignes[index]!.trim() !== "" &&
      !/^(#{1,6})\s/.test(lignes[index]!) &&
      !lignes[index]!.trimStart().startsWith("```") &&
      !(lignes[index]!.trimStart().startsWith("|") && contenu.length === 0) &&
      !PUCE.test(lignes[index]!)
    ) {
      contenu.push(lignes[index]!)
      index += 1
    }
    if (contenu.length === 0) {
      contenu.push(ligne)
      index += 1
    }
    blocs.push({ type: "paragraphe", lignes: contenu })
  }
  return blocs
}

const EN_LIGNE = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))|(<br\s*\/?>)/gi

function lienSur(url: string): string | null {
  if (/^https?:\/\//i.test(url) || url.startsWith("/") || url.startsWith("#")) return url
  return null
}

/** Éléments en ligne : gras, italique, code, liens, retours à la ligne. */
export function enLigne(texte: string, cle = "t"): ReactNode[] {
  const noeuds: ReactNode[] = []
  let dernier = 0
  let rang = 0
  for (const correspondance of texte.matchAll(EN_LIGNE)) {
    const [jeton] = correspondance
    const position = correspondance.index ?? 0
    if (position > dernier) noeuds.push(texte.slice(dernier, position))
    const k = `${cle}-${rang}`
    rang += 1
    if (correspondance[1]) {
      noeuds.push(
        <code key={k} className="tabular rounded-[4px] bg-surface-sunk px-1 py-0.5 text-[0.9em]">
          {jeton.slice(1, -1)}
        </code>
      )
    } else if (correspondance[2]) {
      noeuds.push(<strong key={k}>{enLigne(jeton.slice(2, -2), k)}</strong>)
    } else if (correspondance[3]) {
      noeuds.push(<em key={k}>{enLigne(jeton.slice(1, -1), k)}</em>)
    } else if (correspondance[4]) {
      const lien = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(jeton)!
      const url = lienSur(lien[2]!)
      noeuds.push(
        url ? (
          <a
            key={k}
            href={url}
            className="font-semibold text-accent-ink underline"
            {...(url.startsWith("http") ? { target: "_blank", rel: "noreferrer noopener" } : {})}
          >
            {enLigne(lien[1]!, k)}
          </a>
        ) : (
          <Fragment key={k}>{lien[1]}</Fragment>
        )
      )
    } else {
      noeuds.push(<br key={k} />)
    }
    dernier = position + jeton.length
  }
  if (dernier < texte.length) noeuds.push(texte.slice(dernier))
  return noeuds
}

function Liste({ elements, ordonnee, cle }: { elements: ElementListe[]; ordonnee: boolean; cle: string }) {
  const Balise = ordonnee ? "ol" : "ul"
  return (
    <Balise className={ordonnee ? "grid list-decimal gap-1 pl-6" : "grid list-disc gap-1 pl-6"}>
      {elements.map((element, index) => (
        <li key={`${cle}-${index}`} className="pl-1">
          {enLigne(element.texte, `${cle}-${index}`)}
          {element.enfants ? <Liste elements={element.enfants.elements} ordonnee={element.enfants.ordonnee} cle={`${cle}-${index}-e`} /> : null}
        </li>
      ))}
    </Balise>
  )
}

/** Corps d'une section d'étude. */
export function Markdown({ texte }: { texte: string }) {
  const blocs = analyserMarkdown(texte)
  return (
    <div className="grid gap-3 text-[15px] leading-relaxed">
      {blocs.map((bloc, index) => {
        const cle = `b${index}`
        switch (bloc.type) {
          case "titre": {
            const Balise = bloc.niveau <= 3 ? "h4" : "h5"
            return (
              <Balise key={cle} className="pt-1 text-[15.5px] font-bold">
                {enLigne(bloc.texte, cle)}
              </Balise>
            )
          }
          case "paragraphe":
            return (
              <p key={cle}>
                {bloc.lignes.map((ligne, rang) => (
                  <Fragment key={`${cle}-${rang}`}>
                    {rang > 0 ? (/\s{2}$/.test(bloc.lignes[rang - 1]!) ? <br /> : " ") : null}
                    {enLigne(ligne.trim(), `${cle}-${rang}`)}
                  </Fragment>
                ))}
              </p>
            )
          case "liste":
            return <Liste key={cle} elements={bloc.elements} ordonnee={bloc.ordonnee} cle={cle} />
          case "tableau":
            return (
              <div key={cle} className="relative overflow-x-auto rounded-md border border-line">
                <table className="w-full border-collapse text-[14px]">
                  <thead>
                    <tr>
                      {bloc.entete.map((cellule, rang) => (
                        <th key={rang} scope="col" className="bg-surface-sunk px-3 py-2 text-left text-[12.5px] font-semibold text-ink-muted">
                          {enLigne(cellule, `${cle}-h${rang}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bloc.lignes.map((ligne, rangLigne) => (
                      <tr key={rangLigne} className="border-t border-line">
                        {bloc.entete.map((_entete, rang) => (
                          <td key={rang} className="px-3 py-2 align-top">
                            {enLigne(ligne[rang] ?? "", `${cle}-${rangLigne}-${rang}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case "citation":
            return (
              <blockquote key={cle} className="border-l-[3px] border-line-strong pl-4 text-ink-muted">
                {enLigne(bloc.lignes.join(" "), cle)}
              </blockquote>
            )
          case "code":
            return (
              <pre key={cle} className="tabular overflow-x-auto rounded-md border border-line bg-surface-sunk p-3 text-[12.5px] leading-snug">
                {bloc.texte}
              </pre>
            )
          case "filet":
            return <hr key={cle} className="border-line" />
        }
      })}
    </div>
  )
}
