// Géométrie et couleurs partagées entre la page (navigateur) et le
// générateur Lottie (Bun). Aucune dépendance : le même fichier tourne des
// deux côtés.

/* ---------------------------------------------------------------------------
   Le « S » voie ferrée, redessiné en courbes de Bézier cubiques dans une
   boîte 100 × 100. Il reprend le tracé du logo actuel : départ en haut à
   droite, panse gauche, diagonale, panse droite, sortie en bas à gauche.
   --------------------------------------------------------------------------- */
export const S_SEGMENTS = [
  [[79, 6], [58, 10], [25, 15], [25, 33]],
  [[25, 33], [25, 52], [75, 48], [75, 67]],
  [[75, 67], [75, 85], [45, 90], [21, 95]],
]

/** Gares du Transgabonais et leur point kilométrique (référentiel du dépôt). */
export const GARES = [
  ["Owendo", 0], ["Ntoum", 35], ["Andem", 57], ["Mbel", 85], ["Oyan", 118],
  ["Abanga", 148], ["Ndjolé", 182], ["Alembé", 202], ["Otoumbi", 226],
  ["Bissouma", 244], ["Ayem", 267], ["Lopé", 290], ["Offoué", 312],
  ["Booué", 338], ["Ivindo", 375], ["Mouyabi", 411], ["Milolé", 448],
  ["Lastourville", 484], ["Doumé", 514], ["Lifouta", 549],
  ["Mboungou Badouma", 584], ["Moanda", 619], ["Franceville", 669],
]
export const GARES_MAJEURES = ["Owendo", "Ndjolé", "Booué", "Lastourville", "Franceville"]
export const LONGUEUR_LIGNE = 669

const cubic = ([p0, c1, c2, p3], t) => {
  const u = 1 - t
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0],
    a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1],
  ]
}

const cubicTangent = ([p0, c1, c2, p3], t) => {
  const u = 1 - t
  const x = 3 * u * u * (c1[0] - p0[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (p3[0] - c2[0])
  const y = 3 * u * u * (c1[1] - p0[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (p3[1] - c2[1])
  const n = Math.hypot(x, y) || 1
  return [x / n, y / n]
}

/**
 * Table d'échantillonnage à abscisse curviligne : permet de placer un point à
 * une fraction exacte de la longueur (gares au kilomètre, train, traverses).
 */
export function arcTable(segments, perSegment = 240) {
  const pts = []
  let len = 0
  let prev = null
  segments.forEach((seg, si) => {
    for (let i = si === 0 ? 0 : 1; i <= perSegment; i++) {
      const t = i / perSegment
      const p = cubic(seg, t)
      if (prev) len += Math.hypot(p[0] - prev[0], p[1] - prev[1])
      pts.push({ x: p[0], y: p[1], tan: cubicTangent(seg, t), s: len })
      prev = p
    }
  })
  return { pts, length: len }
}

/** Point et tangente à la fraction `f` (0 → 1) de la longueur. */
export function pointAt(table, f) {
  const target = Math.min(Math.max(f, 0), 1) * table.length
  const { pts } = table
  let lo = 0, hi = pts.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (pts[mid].s < target) lo = mid
    else hi = mid
  }
  const a = pts[lo], b = pts[hi]
  const k = b.s === a.s ? 0 : (target - a.s) / (b.s - a.s)
  const tx = a.tan[0] + (b.tan[0] - a.tan[0]) * k
  const ty = a.tan[1] + (b.tan[1] - a.tan[1]) * k
  const n = Math.hypot(tx, ty) || 1
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, tan: [tx / n, ty / n] }
}

/** Polyligne parallèle au tracé, décalée de `d` le long de la normale. */
export function offsetPoints(table, d, count = 120) {
  const out = []
  for (let i = 0; i <= count; i++) {
    const p = pointAt(table, i / count)
    out.push([p.x - p.tan[1] * d, p.y + p.tan[0] * d])
  }
  return out
}

const r2 = (n) => Math.round(n * 100) / 100

export function segmentsD(segments, k = 1, dx = 0, dy = 0) {
  const P = (p) => `${r2(p[0] * k + dx)} ${r2(p[1] * k + dy)}`
  let d = `M${P(segments[0][0])}`
  for (const [, c1, c2, p3] of segments) d += ` C${P(c1)} ${P(c2)} ${P(p3)}`
  return d
}

export function pointsD(points, k = 1, dx = 0, dy = 0) {
  return points.map((p, i) => `${i ? "L" : "M"}${r2(p[0] * k + dx)} ${r2(p[1] * k + dy)}`).join(" ")
}

/* ---------------------------------------------------------------------------
   Couleurs : conversion oklch ↔ sRGB, pour afficher l'équivalent hexadécimal
   (portage mobile) et pour écrire les couleurs Lottie (RVB 0–1).
   --------------------------------------------------------------------------- */
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const clamp01 = (c) => Math.min(1, Math.max(0, c))

export function oklchToRgb(L, C, H) {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h), b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => clamp01(toGamma(c)))
}

export function hexToOklch(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const C = Math.hypot(A, B)
  const H = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
  return [L, C, H]
}

export const rgbToHex = (rgb) =>
  "#" + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("").toUpperCase()

/**
 * Couleurs relevées dans le thème du site institutionnel setrag.eramet.com
 * (variables Avada `--primary_color`, `--button_*`, `--h1/h2_typography-color`).
 */
export const SITE = [
  ["Orange", "#FA6414", "Liens et titres des actualités. C'est l'orange du S sur la capture."],
  ["Jaune", "#FCDF49", "Fond des boutons, texte du bandeau d'information."],
  ["Bleu", "#0E4D94", "Bandeaux, texte des boutons, survol."],
  ["Indigo profond", "#1A003B", "Grands titres. Ce sont les lettres ETRAG de la capture."],
  ["Indigo", "#515793", "Titres de second niveau."],
  ["Anthracite", "#363839", "Pied de page."],
]

/** Palette de marque proposée, en oklch comme `tokens.css`. */
export const MARQUE = {
  bleu: [0.441, 0.144, 257], // --c-accent existant ; le bleu du site (#0E4D94) en est quasi identique
  orange: [0.686, 0.199, 42.3], // le « S » : orange du site (#FA6414)
  jaune: [0.902, 0.164, 97.9], // ruban et accents sur bleu : jaune des boutons du site (#FCDF49)
  vert: [0.615, 0.146, 157], // ruban : vert du drapeau gabonais (#009E60)
  indigo: [0.189, 0.103, 295.7], // titres éditoriaux : indigo du site (#1A003B)
  encre: [0.22, 0.025, 257], // --c-ink existant
}

/**
 * Étapes d'un dégradé interpolé en oklch (teinte par le chemin le plus court).
 * En sRGB, le passage du jaune au bleu traverse un gris terne ; en oklch il
 * reste vif. Sert au ruban du SVG, du CSS et du Lottie.
 */
export function etapesOklch(hexes, parIntervalle = 4) {
  if (hexes.length === 1) return [[0, hexes[0]]]
  const pts = hexes.map(hexToOklch)
  const out = []
  const n = hexes.length - 1
  for (let i = 0; i < n; i++) {
    const [l1, c1, h1] = pts[i], [l2, c2, h2] = pts[i + 1]
    let dh = h2 - h1
    if (dh > 180) dh -= 360
    if (dh < -180) dh += 360
    for (let j = 0; j < parIntervalle; j++) {
      const f = j / parIntervalle
      out.push([(i + f) / n, rgbToHex(oklchToRgb(l1 + (l2 - l1) * f, c1 + (c2 - c1) * f, (h1 + dh * f + 360) % 360))])
    }
  }
  out.push([1, hexes[n]])
  return out
}
