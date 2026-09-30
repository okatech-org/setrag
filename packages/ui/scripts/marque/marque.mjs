// Le logo SETRAG — voie épurée — et ses déclinaisons, en SVG.
// Une seule géométrie (shared/geo.js + shared/logo-geom.js) sert au SVG, aux
// exports de logo/ et aux animations Lottie : le logo est identique partout.

import { S_SEGMENTS, arcTable, etapesOklch, offsetPoints, pointsD, segmentsD } from "./geo.mjs"
import { LOGO } from "./logo-geom.mjs"

const T = arcTable(S_SEGMENTS)
export const S_D = segmentsD(S_SEGMENTS)
const r2 = (n) => Math.round(n * 100) / 100

/** Contours cubiques → attribut `d`. */
export function contoursD(contours) {
  return contours
    .map((c) => {
      let d = `M${c[0]} ${c[1]}`
      let x = c[0], y = c[1]
      for (let i = 2; i < c.length; i += 6) {
        const [ax, ay, bx, by, nx, ny] = c.slice(i, i + 6)
        // Segment droit converti en cubique (poignées au tiers) : on réécrit un L.
        const droit = Math.abs(ax - (x + (nx - x) / 3)) < 0.02 && Math.abs(ay - (y + (ny - y) / 3)) < 0.02 &&
          Math.abs(bx - (x + (2 * (nx - x)) / 3)) < 0.02 && Math.abs(by - (y + (2 * (ny - y)) / 3)) < 0.02
        d += droit ? `L${nx} ${ny}` : `C${ax} ${ay} ${bx} ${by} ${nx} ${ny}`
        x = nx; y = ny
      }
      return d + "Z"
    })
    .join("")
}

export const MOT_D = LOGO.mot.lettres.map((l) => contoursD(l.contours))
export const SIGNATURE_D = contoursD(LOGO.signature.contours)

/* ---------------------------------------------------------------------------
   Palettes du logo. Les valeurs sont celles des tokens de marque ; elles sont
   écrites en clair pour que les SVG exportés restent autonomes.
   --------------------------------------------------------------------------- */
export const COULEURS = {
  orange: "#FA6414",
  bleu: "#0F50A0",
  bleuClair: "#8DB4EE", // bleu du ruban sur fond encre (--c-accent-on-ink)
  vert: "#029E60",
  jaune: "#FCDF49",
  encre: "#131B26",
  blanc: "#FFFFFF",
}

export const THEMES = {
  // Fond clair : la version de référence.
  couleur: { rail: COULEURS.orange, traverse: COULEURS.orange, opacite: 0.5, mot: COULEURS.bleu, signature: COULEURS.bleu, ruban: [COULEURS.vert, COULEURS.jaune, COULEURS.bleu] },
  // Fond encre ou photo sombre.
  negatif: { rail: COULEURS.orange, traverse: COULEURS.orange, opacite: 0.55, mot: COULEURS.blanc, signature: "#D9E2F0", ruban: [COULEURS.vert, COULEURS.jaune, COULEURS.bleuClair] },
  // Fond bleu SETRAG : l'orange y manque de contraste, le S passe en blanc.
  "sur-bleu": { rail: COULEURS.blanc, traverse: COULEURS.blanc, opacite: 0.45, mot: COULEURS.blanc, signature: "#D6E2F5", ruban: [COULEURS.vert, COULEURS.jaune, COULEURS.blanc] },
  // Une couleur : tampons, gravure, documents imprimés en noir.
  "mono-encre": { rail: COULEURS.encre, traverse: COULEURS.encre, opacite: 0.45, mot: COULEURS.encre, signature: COULEURS.encre, ruban: [COULEURS.encre] },
  "mono-blanc": { rail: COULEURS.blanc, traverse: COULEURS.blanc, opacite: 0.45, mot: COULEURS.blanc, signature: COULEURS.blanc, ruban: [COULEURS.blanc] },
}

/* ---------------------------------------------------------------------------
   Symbole : le S voie ferrée. `petit` épaissit tout pour les icônes et favicons.
   --------------------------------------------------------------------------- */
export function symbole({ rail = COULEURS.orange, traverse = rail, opacite = 0.5, petit = false } = {}) {
  const g = pointsD(offsetPoints(T, petit ? -5 : -3.3))
  const d = pointsD(offsetPoints(T, petit ? 5 : 3.3))
  const r = `fill="none" stroke="${rail}" stroke-width="${petit ? 4 : 1.5}" stroke-linecap="round" stroke-linejoin="round"`
  return (
    `<g class="lg-voie">` +
    `<path class="lg-traverses" d="${S_D}" fill="none" stroke="${traverse}" stroke-opacity="${opacite}" stroke-width="${petit ? 19 : 12}" stroke-dasharray="${petit ? "3.6 3.4" : "1.8 2.9"}"/>` +
    `<path class="lg-rail" d="${g}" ${r}/><path class="lg-rail" d="${d}" ${r}/>` +
    `</g>`
  )
}

let uid = 0

function ruban(couleurs, x1 = LOGO.ruban.x1, x2 = LOGO.ruban.x2, y = LOGO.ruban.y, e = LOGO.ruban.epaisseur) {
  const h = e / 2
  if (couleurs.length === 1) return { defs: "", corps: `<rect class="lg-ruban" x="${x1 - h}" y="${y - h}" width="${r2(x2 - x1 + e)}" height="${e}" rx="${h}" fill="${couleurs[0]}"/>` }
  const id = `setrag-ruban-${++uid}`
  const stops = etapesOklch(couleurs).map(([o, c]) => `<stop offset="${o.toFixed(3)}" stop-color="${c}"/>`).join("")
  return {
    defs: `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="0" x2="${x2}" y2="0">${stops}</linearGradient>`,
    corps: `<rect class="lg-ruban" x="${x1 - h}" y="${y - h}" width="${r2(x2 - x1 + e)}" height="${e}" rx="${h}" fill="url(#${id})"/>`,
  }
}

/** Cadres des déclinaisons, dans le repère du S. */
export const CADRES = {
  complet: [12, -1, 245, 125],
  compact: [12, -1, 245, 110],
  symbole: [12, 1, 76, 98],
  "symbole-petit": [8, -3, 84, 106],
  "symbole-ruban": [8, 1, 84, 110],
}

/**
 * Logo en SVG autonome.
 * variante : complet (avec signature) · compact (sans) · symbole · symbole-ruban
 * theme    : couleur · negatif · sur-bleu · mono-encre · mono-blanc
 */
export function logo({ variante = "complet", theme = "couleur", titre = "SETRAG — Société d’Exploitation du Transgabonais", classe = "" } = {}) {
  const t = THEMES[theme]
  const [x, y, w, h] = CADRES[variante]
  const S = symbole({ rail: t.rail, traverse: t.traverse, opacite: variante === "symbole-petit" ? 0.6 : t.opacite, petit: variante === "symbole-petit" })
  let defs = "", corps = S
  if (variante === "complet" || variante === "compact") {
    const rb = ruban(t.ruban)
    defs += rb.defs
    corps += rb.corps
    corps += `<g class="lg-mot" fill="${t.mot}">${MOT_D.map((d, i) => `<path class="lg-lettre" style="--i:${i}" d="${d}"/>`).join("")}</g>`
    if (variante === "complet") corps += `<path class="lg-signature" d="${SIGNATURE_D}" fill="${t.signature}"/>`
  } else if (variante === "symbole-ruban") {
    const rb = ruban(t.ruban, 24, 76, 106, 4.2)
    defs += rb.defs
    corps += rb.corps
  }
  const a11y = titre ? `role="img" aria-label="${titre}"` : `aria-hidden="true"`
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${classe}" viewBox="${x} ${y} ${w} ${h}" ${a11y}>${defs ? `<defs>${defs}</defs>` : ""}${corps}</svg>`
}

/** Icône d'application : S + ruban sur fond blanc, format carré. */
export function iconeApp({ taille = 1024, fond = COULEURS.blanc, theme = "couleur" } = {}) {
  const t = THEMES[theme]
  const rb = ruban(t.ruban, 24, 76, 108, 5.4)
  // Le symbole, épaissi, centré dans une grille de 120 (marge de sécurité iOS/Android).
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="-10 -6 120 120" role="img" aria-label="SETRAG">` +
    `<defs>${rb.defs}</defs><rect x="-10" y="-6" width="120" height="120" fill="${fond}"/>` +
    `<g transform="translate(50 50) scale(.86) translate(-50 -50)">${symbole({ rail: t.rail, traverse: t.traverse, opacite: 0.55, petit: true })}</g>` +
    rb.corps +
    `</svg>`
  )
}
