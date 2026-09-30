import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import { DEGRADES, LETTRES, RAILS, RAILS_PETIT, RUBAN, S, SIGNATURE } from "./traces"

/**
 * Le logo SETRAG — « voie épurée ».
 *
 * Le S est une voie ferrée (rails + traverses, orange du site
 * setrag.eramet.com), le mot est dessiné dans la police de l'interface
 * (Schibsted Grotesk 800 italique, converti en tracés : aucune dépendance à la
 * police), et le ruban vert → jaune → bleu souligne tout le nom, S compris —
 * la position où il se pose à la fin du logo animé.
 *
 * La taille se règle par la hauteur (`className="h-10"`) : la largeur suit le
 * cadre de la déclinaison.
 */

export type LogoVariante = "complet" | "compact" | "symbole" | "symbole-petit" | "symbole-ruban"
export type LogoTheme = "auto" | "couleur" | "negatif" | "sur-bleu" | "mono-encre" | "mono-blanc"

const CADRES: Record<LogoVariante, string> = {
  complet: "12 -1 245 125",
  compact: "12 -1 245 110",
  symbole: "12 1 76 98",
  "symbole-petit": "8 -3 84 106",
  "symbole-ruban": "8 1 84 110",
}

const ORANGE = "#FA6414"
const BLEU = "#0F50A0"
const ENCRE = "#131B26"
const BLANC = "#FFFFFF"

type Palette = {
  rail: string
  traverse: number
  mot: string
  signature: string
  /** Étapes du dégradé du ruban, ou couleur unie pour les versions mono. */
  ruban: readonly (readonly [number, string])[] | string
}

const PALETTES: Record<Exclude<LogoTheme, "auto">, Palette> = {
  couleur: { rail: ORANGE, traverse: 0.5, mot: BLEU, signature: BLEU, ruban: DEGRADES.clair },
  negatif: { rail: ORANGE, traverse: 0.55, mot: BLANC, signature: "#D9E2F0", ruban: DEGRADES.sombre },
  // Sur le bleu SETRAG, l'orange manque de contraste : le S passe en blanc.
  "sur-bleu": { rail: BLANC, traverse: 0.45, mot: BLANC, signature: "#D6E2F5", ruban: DEGRADES.blanc },
  "mono-encre": { rail: ENCRE, traverse: 0.45, mot: ENCRE, signature: ENCRE, ruban: ENCRE },
  "mono-blanc": { rail: BLANC, traverse: 0.45, mot: BLANC, signature: BLANC, ruban: BLANC },
}

export interface LogoProps extends Omit<React.ComponentProps<"svg">, "children"> {
  variante?: LogoVariante
  /** `auto` suit le thème de la page : couleur en clair, négatif en sombre. */
  theme?: LogoTheme
  /** Texte alternatif ; vide pour un logo décoratif. */
  title?: string
}

export function Logo({
  variante = "compact",
  theme = "auto",
  title = "SETRAG — Société d’Exploitation du Transgabonais",
  className,
  ...props
}: LogoProps) {
  // Les identifiants de React contiennent des caractères refusés dans url(#…).
  const id = `st${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  const auto = theme === "auto"
  const palette = PALETTES[auto ? "couleur" : theme]
  const petit = variante === "symbole-petit"
  const avecMot = variante === "complet" || variante === "compact"

  const rail = auto ? "var(--logo-rail)" : palette.rail
  const mot = auto ? "var(--logo-mot)" : palette.mot
  const signature = auto ? "var(--logo-signature)" : palette.signature
  const rails = petit ? RAILS_PETIT : RAILS

  const ruban = (x1: number, x2: number, y: number, e: number) => {
    const h = e / 2
    const geometrie = { x: x1 - h, y: y - h, width: x2 - x1 + e, height: e, rx: h }
    if (typeof palette.ruban === "string") return <rect {...geometrie} fill={palette.ruban} />
    const etapesTheme = palette.ruban
    // En thème automatique, deux rubans : la tête s'éclaircit en sombre.
    const versions = auto ? (["clair", "sombre"] as const) : ([null] as const)
    return versions.map((version) => {
      const etapes = version ? DEGRADES[version] : etapesTheme
      const gid = `${id}-ruban-${version ?? "x"}`
      return (
        <g key={gid} className={version ? `logo-ruban-${version}` : undefined}>
          <defs>
            <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={x1} y1={0} x2={x2} y2={0}>
              {etapes.map(([offset, couleur]) => (
                <stop key={offset} offset={offset} stopColor={couleur} />
              ))}
            </linearGradient>
          </defs>
          <rect {...geometrie} fill={`url(#${gid})`} />
        </g>
      )
    })
  }

  return (
    <svg
      viewBox={CADRES[variante]}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      className={cn("block h-10 w-auto shrink-0", auto && "logo-auto", className)}
      {...props}
    >
      <path
        d={S}
        fill="none"
        stroke={rail}
        strokeOpacity={palette.traverse}
        strokeWidth={petit ? 19 : 12}
        strokeDasharray={petit ? "3.6 3.4" : "1.8 2.9"}
      />
      {rails.map((d) => (
        <path
          key={d.slice(0, 24)}
          d={d}
          fill="none"
          stroke={rail}
          strokeWidth={petit ? 4 : 1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {avecMot && (
        <>
          {ruban(RUBAN.x1, RUBAN.x2, RUBAN.y, RUBAN.epaisseur)}
          <g fill={mot}>
            {LETTRES.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          {variante === "complet" && <path d={SIGNATURE} fill={signature} />}
        </>
      )}
      {variante === "symbole-ruban" && ruban(24, 76, 106, 4.2)}
    </svg>
  )
}
