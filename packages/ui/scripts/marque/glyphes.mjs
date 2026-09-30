// Extrait les contours du mot « ETRAG » et de la signature depuis les polices de
// l'interface (Schibsted Grotesk), pour que le logo soit un dessin vectoriel
// autonome : même rendu en SVG et en Lottie, sans dépendre d'une police.
//
//   mkdir -p /tmp/fonttools && (cd /tmp/fonttools && bun add opentype.js@1.3.4)
//   OPENTYPE=/tmp/fonttools/node_modules/opentype.js/dist/opentype.module.js \
//     bun outils/glyphes.mjs
//
// Sortie : shared/logo-geom.js. Toutes les cotes sont dans le repère du « S »
// (boîte 100 × 100, voir shared/geo.js).

import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const opentype = (await import(process.env.OPENTYPE ?? "opentype.js")).default
const racine = fileURLToPath(new URL("../../../../", import.meta.url))
const police = (fichier) => {
  const b = readFileSync(`${racine}node_modules/@fontsource/schibsted-grotesk/files/${fichier}`)
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
}
const italique800 = police("schibsted-grotesk-latin-800-italic.woff")
const normal600 = police("schibsted-grotesk-latin-600-normal.woff")

/* --- Composition ------------------------------------------------------------ */
const HAUTEUR_CAPITALE = 36 // ETRAG : capitales de 36, le S en mesure 89
const BASE_MOT = 97 // ligne de base du mot, au niveau du pied du S
const DEBUT_MOT = 80 // attaque du E, contre la panse basse du S
const RUBAN_Y = 104 // axe du ruban, sous le mot et sous le S
const RUBAN_DEBUT = 22 // le ruban part sous le pied du S
const RUBAN_EPAISSEUR = 3.6
const ECART_SIGNATURE = 4.4

const taille = (f, capitale) => (capitale * f.unitsPerEm) / f.tables.os2.sCapHeight
const r2 = (n) => Math.round(n * 100) / 100

/** Convertit un chemin opentype en contours de Bézier cubiques absolus. */
function contours(chemin) {
  const out = []
  let cur = null, x = 0, y = 0, x0 = 0, y0 = 0
  const ligne = (nx, ny) => cur.push(r2(x + (nx - x) / 3), r2(y + (ny - y) / 3), r2(x + (2 * (nx - x)) / 3), r2(y + (2 * (ny - y)) / 3), r2(nx), r2(ny))
  for (const c of chemin.commands) {
    if (c.type === "M") {
      cur = [r2(c.x), r2(c.y)]
      out.push(cur)
      x = x0 = c.x; y = y0 = c.y
    } else if (c.type === "L") {
      ligne(c.x, c.y); x = c.x; y = c.y
    } else if (c.type === "Q") {
      cur.push(r2(x + (2 / 3) * (c.x1 - x)), r2(y + (2 / 3) * (c.y1 - y)), r2(c.x + (2 / 3) * (c.x1 - c.x)), r2(c.y + (2 / 3) * (c.y1 - c.y)), r2(c.x), r2(c.y))
      x = c.x; y = c.y
    } else if (c.type === "C") {
      cur.push(r2(c.x1), r2(c.y1), r2(c.x2), r2(c.y2), r2(c.x), r2(c.y))
      x = c.x; y = c.y
    } else if (c.type === "Z") {
      if (Math.hypot(x - x0, y - y0) > 0.01) ligne(x0, y0)
      x = x0; y = y0
    }
  }
  return out
}

const boite = (chemin) => {
  const b = chemin.getBoundingBox()
  return [r2(b.x1), r2(b.y1), r2(b.x2), r2(b.y2)]
}

// Le mot, lettre par lettre (le logo animé fait apparaître chaque lettre).
const tMot = taille(italique800, HAUTEUR_CAPITALE)
const lettres = []
let curseur = DEBUT_MOT
const glyphes = italique800.stringToGlyphs("ETRAG")
glyphes.forEach((g, i) => {
  const chemin = g.getPath(curseur, BASE_MOT, tMot)
  lettres.push({ c: "ETRAG"[i], boite: boite(chemin), contours: contours(chemin) })
  const suivant = glyphes[i + 1]
  const crenage = suivant ? italique800.getKerningValue(g, suivant) : 0
  curseur += ((g.advanceWidth + crenage) * tMot) / italique800.unitsPerEm
})
const finMot = Math.max(...lettres.map((l) => l.boite[2]))

// La signature s'étend exactement sur la longueur du ruban.
const texte = "Société d’Exploitation du Transgabonais"
const largeurRuban = finMot - RUBAN_DEBUT
const tSig = (largeurRuban * italique800.unitsPerEm) / normal600.getAdvanceWidth(texte, italique800.unitsPerEm)
const baseSig = r2(RUBAN_Y + RUBAN_EPAISSEUR / 2 + ECART_SIGNATURE + (tSig * normal600.tables.os2.sCapHeight) / normal600.unitsPerEm)
const cheminSig = normal600.getPath(texte, RUBAN_DEBUT, baseSig, tSig)
const signature = { boite: boite(cheminSig), contours: contours(cheminSig), taille: r2(tSig) }

const geom = {
  mot: { taille: r2(tMot), base: BASE_MOT, lettres },
  ruban: { y: RUBAN_Y, x1: RUBAN_DEBUT, x2: r2(finMot), epaisseur: RUBAN_EPAISSEUR },
  signature,
}

writeFileSync(
  fileURLToPath(new URL("./logo-geom.mjs", import.meta.url)),
  `// Généré par outils/glyphes.mjs — ne pas modifier à la main.\n` +
    `// Mot « ETRAG » : Schibsted Grotesk 800 italique ; signature : 600.\n` +
    `export const LOGO = ${JSON.stringify(geom)}\n`,
)
console.log(`mot ${DEBUT_MOT} → ${r2(finMot)}, signature ${signature.boite.join(" ")}, taille ${signature.taille}`)
