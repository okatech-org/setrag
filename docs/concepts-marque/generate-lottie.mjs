// Génère les animations Lottie de la page à partir de la géométrie du « S ».
//   bun generate-lottie.mjs
// Les fichiers sortent dans ./lottie. Les calques portent des noms stables
// (« train », « rails », « traverses », « ruban ») : lottie-react-native peut
// les recolorer à l'exécution via `colorFilters`, pour suivre le thème.

import { mkdirSync, writeFileSync } from "node:fs"
import {
  GARES, GARES_MAJEURES, LONGUEUR_LIGNE, MARQUE, S_SEGMENTS,
  arcTable, offsetPoints, oklchToRgb, pointAt,
} from "./geo.js"

const T = arcTable(S_SEGMENTS)
const rgb = (key) => oklchToRgb(...MARQUE[key])
const BLANC = [1, 1, 1]
const TRAIT_CLAIR = oklchToRgb(0.84, 0.014, 257) // --c-line-strong

/* --- Primitives du format -------------------------------------------------- */
const fixe = (k) => ({ a: 0, k })
const EASE = { i: 0.2, o: 0.75 } // proche de --ease
const LINEAIRE = { i: 1, o: 0 }

/** Propriété animée. `kfs` = [[frame, valeur], …] ; valeur scalaire ou tableau. */
function anime(kfs, ease = EASE) {
  return {
    a: 1,
    k: kfs.map(([t, v], idx) => {
      const s = Array.isArray(v) ? v : [v]
      if (idx === kfs.length - 1) return { t, s }
      const dim = s.length
      return {
        t, s,
        i: { x: Array(dim).fill(ease.i), y: Array(dim).fill(1) },
        o: { x: Array(dim).fill(ease.o), y: Array(dim).fill(0) },
      }
    }),
  }
}

const transformGroupe = (extra = {}) => ({
  ty: "tr", p: fixe([0, 0]), a: fixe([0, 0]), s: fixe([100, 100]),
  r: fixe(0), o: fixe(100), sk: fixe(0), sa: fixe(0), ...extra,
})
const groupe = (nm, items, tr) => ({ ty: "gr", nm, np: items.length, it: [...items, tr ?? transformGroupe()] })

const trait = (c, w, { lc = 2, tirets, opacite = 100, nm = "trait" } = {}) => ({
  ty: "st", nm, c: fixe([...c, 1]), o: fixe(opacite), w: fixe(w), lc, lj: 2, ml: 4,
  ...(tirets && {
    d: [
      { n: "d", nm: "tiret", v: fixe(tirets[0]) },
      { n: "g", nm: "espace", v: fixe(tirets[1]) },
      { n: "o", nm: "décalage", v: fixe(0) },
    ],
  }),
})
const remplissage = (c, nm = "fond") => ({ ty: "fl", nm, c: fixe([...c, 1]), o: fixe(100), r: 1 })
const decoupe = (s, e) => ({ ty: "tm", nm: "découpe", s, e, o: fixe(0), m: 1 })

const calque = (ind, nm, shapes, op, ks = {}) => ({
  ddd: 0, ind, ty: 4, nm, sr: 1, ao: 0, ip: 0, op, st: 0, bm: 0, shapes,
  ks: { o: fixe(100), r: fixe(0), p: fixe([0, 0, 0]), a: fixe([0, 0, 0]), s: fixe([100, 100, 100]), ...ks },
})

const document = (nm, w, h, op, layers) => ({
  v: "5.12.2", fr: 60, ip: 0, op, w, h, nm, ddd: 0, assets: [], markers: [], layers,
})

/* --- Tracés ----------------------------------------------------------------- */
/** Le « S » exact (ou tout tracé en Bézier cubiques), projeté dans le canevas. */
function traceS(k, dx, dy, segments = S_SEGMENTS) {
  const P = ([x, y]) => [x * k + dx, y * k + dy]
  const v = [], i = [], o = []
  segments.forEach(([p0, c1, c2, p3], idx) => {
    const a = P(p0), b = P(c1), c = P(c2), d = P(p3)
    if (idx === 0) { v.push(a); i.push([0, 0]) }
    o.push([b[0] - a[0], b[1] - a[1]])
    v.push(d); i.push([c[0] - d[0], c[1] - d[1]])
  })
  o.push([0, 0])
  return { ty: "sh", nm: "tracé", ks: fixe({ i, o, v, c: false }) }
}

/** Rail : polyligne parallèle au « S ». */
function traceRail(ecart, k, dx, dy) {
  const v = offsetPoints(T, ecart, 140).map(([x, y]) => [x * k + dx, y * k + dy])
  const zero = v.map(() => [0, 0])
  return { ty: "sh", nm: "rail", ks: fixe({ i: zero, o: zero, v, c: false }) }
}

/* --- 1. Écran de démarrage : la voie se pose, le ruban la parcourt ---------- */
// Le ruban suit le S, sort au bout (en bas à gauche), fait demi-tour sous la
// voie et se pose à l'horizontale. Un seul tracé : S, puis boucle, puis barre.
const BOUCLE = [[21, 95], [10.2, 97.2], [11, 108], [22, 108]]
const BARRE = [[22, 108], [40.7, 108], [59.3, 108], [78, 108]]

function splash() {
  const W = 512, k = 3.9, dx = 256 - 50 * k, dy = 20
  const op = 180, entree = 58, pose = 150
  const traverses = calque(3, "traverses", [
    groupe("traverses", [traceS(k, dx, dy), trait(rgb("orange"), 12 * k, { lc: 1, tirets: [1.8 * k, 2.9 * k], opacite: 50 })]),
    decoupe(fixe(0), anime([[0, 0], [55, 100]])),
  ], op)
  const rails = calque(2, "rails", [
    groupe("rails", [traceRail(-3.3, k, dx, dy), traceRail(3.3, k, dx, dy), trait(rgb("orange"), 1.5 * k)]),
    decoupe(fixe(0), anime([[12, 0], [64, 100]])),
  ], op)

  // Positions en longueur de tracé. La queue `u` part avant le début du S (le
  // ruban en sort progressivement) et s'arrête au début de la barre ; le ruban
  // mesure LONGUEUR_RAME sur les rails puis s'étire à la longueur de la barre.
  const parcours = [...S_SEGMENTS, BOUCLE, BARRE]
  const table = arcTable(parcours)
  const L = table.length
  const LB = arcTable([BARRE]).length
  const Lpose = L - LB
  const LONGUEUR_RAME = 34
  const lisse = (p) => { p = Math.min(Math.max(p, 0), 1); return p * p * (3 - 2 * p) }
  const doux = (p) => { p = Math.min(Math.max(p, 0), 1); return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2 }
  const etat = (t) => {
    const u = -LONGUEUR_RAME + (Lpose + LONGUEUR_RAME) * doux((t - entree) / (pose - entree))
    const l = LONGUEUR_RAME + (LB - LONGUEUR_RAME) * lisse((u - (Lpose - 45)) / 45)
    return [Math.min(Math.max(u, 0), L), Math.min(Math.max(u + l, 0), L)]
  }
  const images = []
  for (let t = entree; t < pose; t += 2) images.push(t)
  images.push(pose)
  const P = (len) => { const p = pointAt(table, len / L); return [p.x * k + dx, p.y * k + dy] }
  for (const t of images) { const [q, h] = etat(t); if (h < q) throw new Error(`ruban inversé à ${t}`) }
  // Sur les rails, le ruban a le gabarit d'un train (8,4 d'épaisseur) ; il
  // s'affine pendant qu'il sort du S, jusqu'à l'épaisseur du ruban posé.
  const LS = arcTable(S_SEGMENTS).length
  const sortie = images.find((t) => etat(t)[1] > LS - 4)
  const sorti = images.find((t) => etat(t)[0] > LS)

  // Le dégradé suit la corde queue → tête : exact une fois le ruban posé.
  const ruban = calque(1, "ruban", [
    groupe("ruban", [
      traceS(k, dx, dy, parcours),
      {
        ty: "gs", nm: "ruban", o: fixe(100), lc: 2, lj: 2, ml: 4, t: 1,
        w: anime([[sortie, 8.4 * k], [sorti, 2.8 * k]]),
        s: anime(images.map((t) => [t, P(etat(t)[0])]), LINEAIRE),
        e: anime(images.map((t) => { const [q, h] = etat(t); return [t, P(Math.max(h, q + 0.05))] }), LINEAIRE),
        g: { p: 3, k: fixe([0, ...rgb("vert"), 0.5, ...rgb("jaune"), 1, ...rgb("bleu")]) },
      },
    ]),
    decoupe(
      anime(images.map((t) => [t, (100 * etat(t)[0]) / L]), LINEAIRE),
      anime(images.map((t) => [t, (100 * etat(t)[1]) / L]), LINEAIRE),
    ),
  ], op)
  ruban.ip = entree
  return document("SETRAG — démarrage", W, W, op, [ruban, rails, traverses])
}

/* --- 2. Chargement : un train tourne sur le « S », en boucle ----------------- */
function chargement() {
  const W = 256, k = 2.3, dx = 128 - 50 * k, dy = 128 - 50.5 * k
  const op = 120
  const voie = calque(2, "voie", [
    groupe("traverses", [traceS(k, dx, dy), trait(TRAIT_CLAIR, 12 * k, { lc: 1, tirets: [1.8 * k, 2.9 * k], nm: "traverses" })]),
    groupe("rails", [traceRail(-3.3, k, dx, dy), traceRail(3.3, k, dx, dy), trait(TRAIT_CLAIR, 1.5 * k, { nm: "rails" })]),
  ], op)
  const train = calque(1, "train", [
    groupe("fenêtres", [traceS(k, dx, dy), trait(BLANC, 2 * k, { lc: 1, tirets: [2.4 * k, 1.3 * k], nm: "fenêtres" })]),
    groupe("caisse", [traceS(k, dx, dy), trait(rgb("bleu"), 8.4 * k, { nm: "caisse" })]),
    decoupe(anime([[18, 0], [110, 100]], LINEAIRE), anime([[0, 0], [92, 100]], LINEAIRE)),
  ], op)
  return document("SETRAG — chargement", W, W, op, [train, voie])
}

/* --- 3. Logo « Traverses » : la voie se pose traverse par traverse ------------ */
function traverses() {
  const W = 512, k = 4.3, dx = 256 - 50 * k, dy = 256 - 50.5 * k
  const op = 150
  const pose = calque(1, "traverses", [
    groupe("traverses", [
      traceS(k, dx, dy),
      {
        ty: "gs", nm: "traverses", o: fixe(100), w: fixe(16 * k), lc: 1, lj: 2, ml: 4, t: 1,
        s: fixe([W / 2, dy + 6 * k]), e: fixe([W / 2, dy + 95 * k]),
        g: { p: 3, k: fixe([0, ...rgb("vert"), 0.5, ...rgb("jaune"), 1, ...rgb("bleu")]) },
        d: [
          { n: "d", nm: "tiret", v: fixe(2.4 * k) },
          { n: "g", nm: "espace", v: fixe(2.6 * k) },
          { n: "o", nm: "décalage", v: fixe(0) },
        ],
      },
    ]),
    decoupe(fixe(0), anime([[0, 0], [100, 100]], { i: 0.3, o: 0.5 })),
  ], op)
  return document("SETRAG — traverses", W, W, op, [pose])
}

/* --- 4. Logo « Ligne » : la ligne se trace, les gares s'allument ------------- */
function ligne() {
  const W = 512, k = 4.3, dx = 256 - 50 * k, dy = 256 - 50.5 * k
  const op = 190, debut = 10, duree = 100
  const trace = calque(3, "ligne", [
    groupe("ligne", [traceS(k, dx, dy), trait(rgb("bleu"), 9 * k)]),
    decoupe(fixe(0), anime([[debut, 0], [debut + duree, 100]], LINEAIRE)),
  ], op)
  const rame = calque(2, "train", [
    groupe("train", [traceS(k, dx, dy), trait(rgb("orange"), 5.5 * k)]),
    decoupe(anime([[debut + duree + 12, 0], [op - 4, 100]], { i: 0.5, o: 0.5 }),
      anime([[debut + duree, 0], [op - 16, 100]], { i: 0.5, o: 0.5 })),
  ], op)
  const gares = GARES.map(([nom, km], idx) => {
    const p = pointAt(T, km / LONGUEUR_LIGNE)
    const x = p.x * k + dx, y = p.y * k + dy
    const majeure = GARES_MAJEURES.includes(nom)
    const d = (majeure ? 7.6 : 3.2) * k
    const t = Math.round(debut + (km / LONGUEUR_LIGNE) * duree)
    const items = [
      { ty: "el", nm: "point", d: 1, p: fixe([x, y]), s: fixe([d, d]) },
      ...(majeure ? [trait(rgb("bleu"), 2.4 * k, { nm: "contour" })] : []),
      remplissage(BLANC),
    ]
    return groupe(nom, items, transformGroupe({
      a: fixe([x, y]), p: fixe([x, y]),
      s: anime([[t, [0, 0]], [t + 8, [130, 130]], [t + 14, [100, 100]]]),
    }))
  })
  const points = calque(1, "gares", gares, op)
  return document("SETRAG — ligne", W, W, op, [points, rame, trace])
}

mkdirSync("lottie", { recursive: true })
for (const [nom, doc] of Object.entries({ splash: splash(), chargement: chargement(), traverses: traverses(), ligne: ligne() })) {
  const json = JSON.stringify(doc)
  writeFileSync(`lottie/setrag-${nom}.json`, json)
  console.log(`lottie/setrag-${nom}.json — ${(json.length / 1024).toFixed(1)} Ko`)
}
