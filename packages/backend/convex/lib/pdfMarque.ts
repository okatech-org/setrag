import {
  LineCapStyle,
  PDFDict,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setGraphicsState,
  type Color,
  type PDFDocument,
  type PDFPage,
} from "pdf-lib"
import {
  DEGRADES,
  LETTRES,
  RAILS,
  RUBAN,
  S,
} from "@workspace/ui/marque/traces"

/**
 * La charte SETRAG (« la voie et le ruban ») dessinée dans un PDF : couleurs,
 * logo, voie, ruban, pastilles.
 *
 * Les couleurs sont la conversion sRGB des valeurs oklch de
 * `packages/ui/src/styles/tokens.css` (et de `marque.css` pour la voie et le
 * ruban), comme le fait `packages/mobile-ui` : pdf-lib ne lit pas l'oklch.
 * C'est un PORTAGE, pas une seconde source de vérité — toute évolution part
 * du CSS, puis se reporte ici.
 *
 * Le logo n'est pas redessiné : ses tracés viennent de
 * `@workspace/ui/marque/traces`, généré par
 * `packages/ui/scripts/marque/generer.mjs`, et sont posés tels quels en
 * vectoriel (`drawSvgPath`).
 */

const hex = (valeur: string): Color =>
  rgb(
    parseInt(valeur.slice(1, 3), 16) / 255,
    parseInt(valeur.slice(3, 5), 16) / 255,
    parseInt(valeur.slice(5, 7), 16) / 255,
  )

/** Étapes d'un dégradé : position (0 → 1) et couleur. */
export type Etapes = readonly (readonly [number, string])[]

export const COULEURS = {
  blanc: rgb(1, 1, 1),

  /* Marque — `:root` de tokens.css, indépendantes du thème. */
  /** --brand-encre · oklch(0.22 0.025 257) — fond du billet. */
  encre: hex("#131B26"),
  /** --brand-indigo · oklch(0.189 0.103 295.7) — titres éditoriaux (PDF, e-mails). */
  indigo: hex("#1A003B"),

  /* Le billet imprimé : les teintes du thème clair. Le billet du site est
     encre, mais un fond plein boit l'encre de l'imprimante et bave au
     laser : sur papier, le billet est blanc, cerné d'un filet. */
  /** Texte du billet · --c-ink oklch(0.22 0.025 257). */
  billetTexte: hex("#131B26"),
  /** Texte secondaire · --c-ink-muted oklch(0.5 0.02 257). */
  billetAttenue: hex("#5C646F"),
  /** --c-ink-faint · oklch(0.63 0.016 257). */
  billetPale: hex("#838A93"),
  /** --c-line · oklch(0.905 0.012 257). */
  billetFilet: hex("#DBE0E8"),
  /** Contour du billet et de ses encoches · --c-line-strong oklch(0.84 0.014 257). */
  billetContour: hex("#C5CBD4"),
  /** Légende du code · --c-ink-muted oklch(0.5 0.02 257). */
  legendeCode: hex("#5C646F"),
  /** Rails de `.voie` · --c-line-strong oklch(0.84 0.014 257). */
  voieRail: hex("#C5CBD4"),
  /** Traverses de `.voie` · --c-line oklch(0.905 0.012 257). */
  voieTraverse: hex("#DBE0E8"),

  /* Le papier : thème clair. */
  /** --c-ink · oklch(0.22 0.025 257). */
  texte: hex("#131B26"),
  /** --c-ink-muted · oklch(0.5 0.02 257). */
  attenue: hex("#5C646F"),
  /** --c-danger · oklch(0.55 0.18 25). */
  danger: hex("#C53637"),
  /** --c-danger-soft · oklch(0.96 0.025 25). */
  dangerDoux: hex("#FFECE9"),
  /** --c-danger-ink · oklch(0.45 0.17 25). */
  dangerEncre: hex("#9E141E"),
  /** --c-warning · oklch(0.76 0.14 92). */
  alerte: hex("#D1AD32"),
  /** --c-warning-soft · oklch(0.96 0.05 92). */
  alerteDoux: hex("#FEF2CC"),
  /** --c-warning-ink · oklch(0.45 0.1 92). */
  alerteEncre: hex("#695200"),
} as const

/**
 * Pastilles (`Tag`) du thème clair : fond `*-soft`, texte `*-ink`. Le
 * libellé porte toujours l'information, la teinte la renforce.
 */
export const TONS = {
  /** success · oklch(0.95 0.03 146) / oklch(0.4 0.12 146) */
  succes: { fond: hex("#E2F4E3"), texte: hex("#045819") },
  /** info · oklch(0.95 0.03 205) / oklch(0.42 0.09 205) */
  info: { fond: hex("#D8F5F8"), texte: hex("#005A64") },
  /** danger · oklch(0.96 0.025 25) / oklch(0.45 0.17 25) */
  danger: { fond: hex("#FFECE9"), texte: hex("#9E141E") },
  /** neutral · --c-surface-sunk oklch(0.965 0.008 257) / --c-ink-muted oklch(0.5 0.02 257) */
  neutre: { fond: hex("#F0F4F9"), texte: hex("#5C646F") },
} as const

export type Ton = keyof typeof TONS

/* ─────────────────────────── Formes ───────────────────────────────────── */

/** Rectangle aux coins arrondis, en tracé PDF (origine en bas à gauche). */
function cheminArrondi(
  x: number,
  y: number,
  largeur: number,
  hauteur: number,
  rayon: number,
): PDFOperator[] {
  const r = Math.min(rayon, largeur / 2, hauteur / 2)
  const k = 0.5523 * r
  const d = x + largeur
  const h = y + hauteur
  return [
    moveTo(x + r, y),
    lineTo(d - r, y),
    appendBezierCurve(d - r + k, y, d, y + r - k, d, y + r),
    lineTo(d, h - r),
    appendBezierCurve(d, h - r + k, d - r + k, h, d - r, h),
    lineTo(x + r, h),
    appendBezierCurve(x + r - k, h, x, h - r + k, x, h - r),
    lineTo(x, y + r),
    appendBezierCurve(x, y + r - k, x + r - k, y, x + r, y),
    closePath(),
  ]
}

/** Même rectangle arrondi, en chemin SVG relatif à son coin haut gauche. */
function svgArrondi(largeur: number, hauteur: number, rayon: number): string {
  const r = Math.min(rayon, largeur / 2, hauteur / 2)
  return (
    `M${r} 0H${largeur - r}A${r} ${r} 0 0 1 ${largeur} ${r}` +
    `V${hauteur - r}A${r} ${r} 0 0 1 ${largeur - r} ${hauteur}` +
    `H${r}A${r} ${r} 0 0 1 0 ${hauteur - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`
  )
}

export function rectangleArrondi(
  page: PDFPage,
  o: {
    x: number
    y: number
    largeur: number
    hauteur: number
    rayon: number
    couleur: Color
    opacite?: number
  },
): void {
  page.drawSvgPath(svgArrondi(o.largeur, o.hauteur, o.rayon), {
    x: o.x,
    y: o.y + o.hauteur,
    color: o.couleur,
    opacity: o.opacite,
  })
}

/**
 * Le contour du billet, avec ses deux encoches en demi-cercle au droit de la
 * découpe — la forme du billet du site, dessinée au trait : rien à remplir,
 * donc rien à imprimer que le filet.
 */
export function contourBillet(
  page: PDFPage,
  o: {
    x: number
    bas: number
    largeur: number
    hauteur: number
    rayon: number
    /** Abscisse des encoches sur la page, et leur rayon. */
    encoche: { x: number; rayon: number }
    couleur: Color
  },
): void {
  const { largeur: l, hauteur: h, rayon: r } = o
  const e = o.encoche.x - o.x
  const re = o.encoche.rayon
  // Repère SVG : origine au coin haut gauche, y vers le bas. Les encoches
  // mordent dans le billet (arcs parcourus dans le sens direct).
  const chemin =
    `M${r} 0H${e - re}A${re} ${re} 0 0 0 ${e + re} 0H${l - r}` +
    `A${r} ${r} 0 0 1 ${l} ${r}V${h - r}A${r} ${r} 0 0 1 ${l - r} ${h}` +
    `H${e + re}A${re} ${re} 0 0 0 ${e - re} ${h}H${r}` +
    `A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`
  page.drawSvgPath(chemin, {
    x: o.x,
    y: o.bas + h,
    borderColor: o.couleur,
    borderWidth: 1,
  })
}

/* ─────────────────────────── Dégradé ──────────────────────────────────── */

/**
 * Remplit une forme d'un dégradé horizontal, en vrai dégradé PDF (ombrage
 * axial, fonctions de raccord) : pas de bandes à l'impression, et quelques
 * octets seulement. pdf-lib n'expose pas les ombrages ; on les écrit à la
 * main dans les ressources de la page.
 */
function remplirDegrade(
  doc: PDFDocument,
  page: PDFPage,
  etapes: Etapes,
  x0: number,
  x1: number,
  forme: PDFOperator[],
  opacite?: number,
): void {
  const ctx = doc.context
  const composantes = (couleur: string) => [
    parseInt(couleur.slice(1, 3), 16) / 255,
    parseInt(couleur.slice(3, 5), 16) / 255,
    parseInt(couleur.slice(5, 7), 16) / 255,
  ]
  const fonctions = etapes.slice(1).map(([, couleur], i) =>
    ctx.obj({
      FunctionType: 2,
      Domain: [0, 1],
      C0: composantes(etapes[i]![1]),
      C1: composantes(couleur),
      N: 1,
    }),
  )
  const ombrage = ctx.register(
    ctx.obj({
      ShadingType: 2,
      ColorSpace: "DeviceRGB",
      Coords: [x0, 0, x1, 0],
      Extend: [true, true],
      Function: ctx.obj({
        FunctionType: 3,
        Domain: [0, 1],
        Functions: fonctions,
        Bounds: etapes.slice(1, -1).map(([position]) => position),
        Encode: fonctions.flatMap(() => [0, 1]),
      }),
    }),
  )

  const { Resources } = page.node.normalizedEntries()
  let ombrages = Resources.lookupMaybe(PDFName.of("Shading"), PDFDict)
  if (!ombrages) {
    ombrages = ctx.obj({})
    Resources.set(PDFName.of("Shading"), ombrages)
  }
  const cle = PDFName.of(`Ruban${ombrages.keys().length}`)
  ombrages.set(cle, ombrage)

  const transparence =
    opacite === undefined
      ? []
      : [
          setGraphicsState(
            page.node.newExtGState(
              "GS",
              ctx.obj({ Type: "ExtGState", ca: opacite, CA: opacite }),
            ),
          ),
        ]

  page.pushOperators(
    pushGraphicsState(),
    ...transparence,
    ...forme,
    clip(),
    endPath(),
    PDFOperator.of(PDFOperatorNames.ShadingFill, [cle]),
    popGraphicsState(),
  )
}

/* ─────────────────────────── Logo ─────────────────────────────────────── */

/**
 * Palette « couleur » du logo (`PALETTES.couleur` de
 * `packages/ui/src/marque/logo.tsx`) : le logo posé sur le papier.
 */
const LOGO_COULEUR = {
  rail: hex("#FA6414"),
  traverse: 0.5,
  mot: hex("#0F50A0"),
  ruban: DEGRADES.clair,
} as const

/** Cadre de la déclinaison « compact » dans le repère du S (logo.tsx). */
const CADRE_COMPACT = [12, -1, 245, 110] as const

/** Largeur du logo compact pour une hauteur donnée. */
export function largeurLogo(hauteur: number): number {
  return (hauteur * CADRE_COMPACT[2]) / CADRE_COMPACT[3]
}

/**
 * Le logo SETRAG compact, en couleur — celui de l'en-tête du billet.
 * `x`, `haut` : coin haut gauche du cadre.
 */
export function dessinerLogo(
  doc: PDFDocument,
  page: PDFPage,
  o: { x: number; haut: number; hauteur: number },
): void {
  const [cx, cy, , ch] = CADRE_COMPACT
  const e = o.hauteur / ch
  // Un point (sx, sy) du SVG tombe en (ox + sx·e, oy − sy·e) sur la page.
  const ox = o.x - cx * e
  const oy = o.haut + cy * e
  const trace = { x: ox, y: oy, scale: e }

  // Les traverses : le S en trait épais, pointillé.
  page.drawSvgPath(S, {
    ...trace,
    borderColor: LOGO_COULEUR.rail,
    borderOpacity: LOGO_COULEUR.traverse,
    borderWidth: 12,
    borderDashArray: [1.8, 2.9],
  })
  for (const rail of RAILS) {
    page.drawSvgPath(rail, {
      ...trace,
      borderColor: LOGO_COULEUR.rail,
      borderWidth: 1.5,
      borderLineCap: LineCapStyle.Round,
    })
  }

  // Le ruban souligne tout le nom, S compris.
  const h = RUBAN.epaisseur / 2
  const gauche = ox + (RUBAN.x1 - h) * e
  const bas = oy - (RUBAN.y + h) * e
  remplirDegrade(
    doc,
    page,
    LOGO_COULEUR.ruban,
    ox + RUBAN.x1 * e,
    ox + RUBAN.x2 * e,
    cheminArrondi(
      gauche,
      bas,
      (RUBAN.x2 - RUBAN.x1 + RUBAN.epaisseur) * e,
      RUBAN.epaisseur * e,
      h * e,
    ),
  )

  for (const lettre of LETTRES) {
    page.drawSvgPath(lettre, { ...trace, color: LOGO_COULEUR.mot })
  }
}

/* ─────────────────────────── La voie ──────────────────────────────────── */

/**
 * La voie (`.voie` de marque.css) : deux rails, des traverses, sur 14 unités
 * d'épaisseur. `rempli` (0 → 1) y pose le ruban — `pleine` sur le trajet du
 * billet, vide sur la découpe.
 */
export function dessinerVoie(
  doc: PDFDocument,
  page: PDFPage,
  o: {
    x: number
    y: number
    longueur: number
    sens: "horizontal" | "vertical"
    rempli?: number
    opacite?: number
  },
): void {
  const epaisseur = 14
  const horizontal = o.sens === "horizontal"
  // Repère local : `a` le long de la voie, `b` en travers (0 = bord haut,
  // ou bord gauche pour une voie verticale).
  const rect = (a: number, b: number, long: number, large: number) =>
    horizontal
      ? { x: o.x + a, y: o.y + epaisseur - b - large, width: long, height: large }
      : { x: o.x + b, y: o.y + o.longueur - a - long, width: large, height: long }

  for (let a = 0; a < o.longueur; a += 7) {
    page.drawRectangle({
      ...rect(a, 0, Math.min(2, o.longueur - a), epaisseur),
      color: COULEURS.voieTraverse,
      opacity: o.opacite,
    })
  }
  for (const b of [3, 9.5]) {
    page.drawRectangle({
      ...rect(0, b, o.longueur, 1.5),
      color: COULEURS.voieRail,
      opacity: o.opacite,
    })
  }

  if (o.rempli && o.rempli > 0 && horizontal) {
    const longueur = o.longueur * Math.min(1, o.rempli)
    const zone = rect(0, 3, longueur, 8)
    remplirDegrade(
      doc,
      page,
      DEGRADES.clair,
      zone.x,
      zone.x + o.longueur,
      cheminArrondi(zone.x, zone.y, zone.width, zone.height, 4),
      o.opacite,
    )
  }
}

/* ─────────────────────────── Icônes ───────────────────────────────────── */

/**
 * Icônes Lucide (licence ISC) de la charte, en tracés 24 × 24 — celles des
 * pastilles de `statut.tsx`. Les cercles sont réécrits en arcs.
 */
const CERCLE = "M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0"
export const ICONES = {
  /** CircleCheckIcon */
  coche: [CERCLE, "m9 12 2 2 4-4"],
  /** HourglassIcon */
  sablier: [
    "M5 22h14",
    "M5 2h14",
    "M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22",
    "M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2",
  ],
  /** FlagIcon */
  drapeau: [
    "M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528",
  ],
  /** BanIcon */
  interdit: [CERCLE, "M4.929 4.929 19.07 19.071"],
  /** RotateCcwIcon */
  retour: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5"],
  /** TimerOffIcon */
  minuteur: [
    "M10 2h4",
    "M4.6 11a8 8 0 0 0 1.7 8.7 8 8 0 0 0 8.7 1.7",
    "M7.4 7.4a8 8 0 0 1 10.3 1 8 8 0 0 1 .9 10.2",
    "m2 2 20 20",
    "M12 12v-2",
  ],
  /** TriangleAlertIcon */
  alerte: [
    "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
    "M12 9v4",
    "M12 17h.01",
  ],
} as const

export type NomIcone = keyof typeof ICONES

/** Icône au trait, `x`/`haut` : coin haut gauche. */
export function dessinerIcone(
  page: PDFPage,
  nom: NomIcone,
  o: { x: number; haut: number; taille: number; couleur: Color },
): void {
  for (const trace of ICONES[nom]) {
    page.drawSvgPath(trace, {
      x: o.x,
      y: o.haut,
      scale: o.taille / 24,
      borderColor: o.couleur,
      borderWidth: 2.2,
      borderLineCap: LineCapStyle.Round,
    })
  }
}
