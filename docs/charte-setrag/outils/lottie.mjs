// Génère les animations Lottie de la charte à partir de la géométrie du logo.
//   bun outils/lottie.mjs
//
// Le geste est toujours le même : le ruban (vert → jaune → bleu) glisse sur les
// rails. Les calques portent des noms stables — « traverses », « rails »,
// « ruban », « mot », « signature » — pour que lottie-react-native puisse les
// recolorer (`colorFilters`) sans second fichier.

import { mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { S_SEGMENTS, arcTable, etapesOklch, offsetPoints, pointAt } from "../shared/geo.js"
import { LOGO } from "../shared/logo-geom.js"
import { COULEURS, THEMES } from "../shared/marque.js"

const T = arcTable(S_SEGMENTS)
const LS = T.length
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
const LIGNE = rgb("#C9D1DC") // --c-line-strong, rails neutres des chargements
const LIGNE_CLAIRE = rgb("#E1E6ED") // --c-line, traverses

/* --- Primitives du format -------------------------------------------------- */
const fixe = (k) => ({ a: 0, k })
const EASE = { i: 0.2, o: 0.8 } // --ease
const LINEAIRE = { i: 1, o: 0 }

function anime(kfs, ease = EASE) {
  return {
    a: 1,
    k: kfs.map(([t, v], idx) => {
      const s = Array.isArray(v) ? v : [v]
      if (idx === kfs.length - 1) return { t, s }
      const dim = s.length
      return { t, s, i: { x: Array(dim).fill(ease.i), y: Array(dim).fill(1) }, o: { x: Array(dim).fill(ease.o), y: Array(dim).fill(0) } }
    }),
  }
}
const transformGroupe = () => ({ ty: "tr", p: fixe([0, 0]), a: fixe([0, 0]), s: fixe([100, 100]), r: fixe(0), o: fixe(100), sk: fixe(0), sa: fixe(0) })
const groupe = (nm, items) => ({ ty: "gr", nm, np: items.length, it: [...items, transformGroupe()] })
const trait = (c, w, { lc = 2, tirets, opacite = 100, nm = "trait" } = {}) => ({
  ty: "st", nm, c: fixe([...c, 1]), o: fixe(opacite), w: typeof w === "number" ? fixe(w) : w, lc, lj: 2, ml: 4,
  ...(tirets && { d: [{ n: "d", nm: "tiret", v: fixe(tirets[0]) }, { n: "g", nm: "espace", v: fixe(tirets[1]) }, { n: "o", nm: "décalage", v: fixe(0) }] }),
})
const remplissage = (c, nm = "fond") => ({ ty: "fl", nm, c: fixe([...c, 1]), o: fixe(100), r: 1 })
const decoupe = (s, e) => ({ ty: "tm", nm: "découpe", s, e, o: fixe(0), m: 1 })
const calque = (ind, nm, shapes, op, ks = {}, ip = 0) => ({
  ddd: 0, ind, ty: 4, nm, sr: 1, ao: 0, ip, op, st: 0, bm: 0, shapes,
  ks: { o: fixe(100), r: fixe(0), p: fixe([0, 0, 0]), a: fixe([0, 0, 0]), s: fixe([100, 100, 100]), ...ks },
})
const doc = (nm, w, h, op, layers) => ({ v: "5.12.2", fr: 60, ip: 0, op, w: Math.round(w), h: Math.round(h), nm, ddd: 0, assets: [], markers: [], layers })

/** Dégradé du ruban, étapes oklch, au format Lottie [offset, r, g, b, …]. */
const gradient = (hexes) => {
  const etapes = etapesOklch(hexes)
  return { p: etapes.length, k: fixe(etapes.flatMap(([o, h]) => [o, ...rgb(h)])) }
}

/* --- Tracés ------------------------------------------------------------------ */
function traceBezier(segments, P, nm = "tracé") {
  const v = [], i = [], o = []
  segments.forEach(([p0, c1, c2, p3], idx) => {
    const a = P(p0), b = P(c1), c = P(c2), d = P(p3)
    if (idx === 0) { v.push(a); i.push([0, 0]) }
    o.push([b[0] - a[0], b[1] - a[1]])
    v.push(d); i.push([c[0] - d[0], c[1] - d[1]])
  })
  o.push([0, 0])
  return { ty: "sh", nm, ks: fixe({ i, o, v, c: false }) }
}
function traceRail(ecart, P) {
  const v = offsetPoints(T, ecart, 140).map(P)
  const zero = v.map(() => [0, 0])
  return { ty: "sh", nm: "rail", ks: fixe({ i: zero, o: zero, v, c: false }) }
}
function traceContour(c, P) {
  // Contour fermé : sommets = extrémités des segments, poignées relatives.
  const n = (c.length - 2) / 6
  const pts = [[c[0], c[1]]], c1 = [], c2 = []
  for (let j = 0; j < n; j++) {
    const b = 2 + j * 6
    c1.push([c[b], c[b + 1]]); c2.push([c[b + 2], c[b + 3]]); pts.push([c[b + 4], c[b + 5]])
  }
  // Le dernier point rejoint le premier : on le fusionne.
  const ferme = Math.hypot(pts[n][0] - pts[0][0], pts[n][1] - pts[0][1]) < 0.01
  const m = ferme ? n : n + 1
  const v = [], i = [], o = []
  for (let j = 0; j < m; j++) {
    const pj = P(pts[j])
    v.push(pj)
    const sortant = j < n ? P(c1[j]) : pj
    o.push([sortant[0] - pj[0], sortant[1] - pj[1]])
    const avant = j === 0 ? (ferme ? n - 1 : -1) : j - 1
    const entrant = avant >= 0 ? P(c2[avant]) : pj
    i.push([entrant[0] - pj[0], entrant[1] - pj[1]])
  }
  return { ty: "sh", nm: "contour", ks: fixe({ i, o, v, c: true }) }
}

/** La voie qui se pose : traverses puis rails, révélés par découpe. */
function voie(P, k, t, op, { debut = 0, duree = 40 } = {}) {
  return [
    calque(90, "traverses", [
      groupe("traverses", [traceBezier(S_SEGMENTS, P), trait(rgb(t.traverse), 12 * k, { lc: 1, tirets: [1.8 * k, 2.9 * k], opacite: t.opacite * 100 })]),
      decoupe(fixe(0), anime([[debut, 0], [debut + duree, 100]])),
    ], op),
    calque(80, "rails", [
      groupe("rails", [traceRail(-3.3, P), traceRail(3.3, P), trait(rgb(t.rail), 1.5 * k)]),
      decoupe(fixe(0), anime([[debut + 6, 0], [debut + duree + 6, 100]])),
    ], op),
  ]
}

/* --- Le ruban qui glisse ------------------------------------------------------ */
const lisse = (p) => { p = Math.min(Math.max(p, 0), 1); return p * p * (3 - 2 * p) }
/** Hermite cubique par morceaux : [[t, position, vitesse], …]. */
function hermite(points) {
  return (t) => {
    if (t <= points[0][0]) return points[0][1]
    for (let j = 0; j < points.length - 1; j++) {
      const [t0, p0, v0] = points[j], [t1, p1, v1] = points[j + 1]
      if (t <= t1) {
        const h = t1 - t0, s = (t - t0) / h
        const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2
        return h00 * p0 + h10 * h * v0 + h01 * p1 + h11 * h * v1
      }
    }
    return points[points.length - 1][1]
  }
}
/** Minimum adouci : la queue du ruban se pose sans à-coup. */
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - (h * h * k) / 4 }

/**
 * Calque « ruban » : il entre par le haut du S, suit les rails, sort au pied,
 * fait demi-tour et se couche sur l'axe du ruban, de `x1` à `x2`.
 * Renvoie aussi `passage(x)` : l'instant où la tête franchit l'abscisse x.
 */
function rubanQuiGlisse({ P, k, t, op, entree, sortie, pose, x1, x2, y, epaisseur, rame = 34 }) {
  const boucle = [[21, 95], [11.2, 96.8], [11.4, y], [x1, y]]
  const barre = [[x1, y], [x1 + (x2 - x1) / 3, y], [x1 + (2 * (x2 - x1)) / 3, y], [x2, y]]
  const parcours = [...S_SEGMENTS, boucle, barre]
  const table = arcTable(parcours)
  const L = table.length
  const LB = arcTable([barre]).length
  const Lpose = L - LB
  // Tête : traverse le S en (sortie − entree) images, puis file sous le mot.
  const tete = hermite([[entree, 0, 0], [sortie, LS, 4.2], [pose, L, 0]])
  const etat = (tt) => {
    const h = tete(tt)
    const q = Math.max(0, smin(h - rame, Lpose, 14))
    return [Math.min(q, Lpose), Math.max(h, q + 0.05)]
  }
  const images = []
  for (let tt = entree; tt < pose; tt += 2) images.push(tt)
  images.push(pose)
  const Pl = (len) => { const p = pointAt(table, len / L); return P([p.x, p.y]) }
  const debutAffinage = images.find((tt) => etat(tt)[1] > LS - 18) ?? sortie
  const finAffinage = images.find((tt) => etat(tt)[0] > LS) ?? pose
  const couche = calque(70, "ruban", [
    groupe("ruban", [
      traceBezier(parcours, P),
      {
        ty: "gs", nm: "ruban", o: fixe(100), lc: 2, lj: 2, ml: 4, t: 1,
        w: anime([[debutAffinage, 8.4 * k], [finAffinage, epaisseur * k]]),
        s: anime(images.map((tt) => [tt, Pl(etat(tt)[0])]), LINEAIRE),
        e: anime(images.map((tt) => [tt, Pl(etat(tt)[1])]), LINEAIRE),
        g: gradient(t.ruban),
      },
    ]),
    decoupe(
      anime(images.map((tt) => [tt, (100 * etat(tt)[0]) / L]), LINEAIRE),
      anime(images.map((tt) => [tt, (100 * etat(tt)[1]) / L]), LINEAIRE),
    ),
  ], op, {}, entree)
  const passage = (x) => {
    const cible = Lpose + (x - x1)
    for (let tt = entree; tt <= pose; tt += 0.5) if (tete(tt) >= cible) return tt
    return pose
  }
  return { couche, passage }
}

/* --- 1. Logo animé ------------------------------------------------------------ */
function logoAnime(theme = "couleur", { avecSignature = true } = {}) {
  const t = THEMES[theme]
  const k = 4
  const [bx, by, bw, bh] = [6, -2, 254, avecSignature ? 126 : 111]
  const P = ([x, y]) => [(x - bx) * k, (y - by) * k]
  const op = 200
  const { couche, passage } = rubanQuiGlisse({
    P, k, t, op, entree: 34, sortie: 96, pose: 146,
    x1: LOGO.ruban.x1, x2: LOGO.ruban.x2, y: LOGO.ruban.y, epaisseur: LOGO.ruban.epaisseur,
  })
  // Chaque lettre se lève quand la tête du ruban passe sous elle.
  const lettres = LOGO.mot.lettres.map((l, i) => {
    const t0 = Math.round(passage(l.boite[0] + 6))
    return calque(10 + i, `mot ${l.c}`, [
      groupe(l.c, [...l.contours.map((c) => traceContour(c, P)), remplissage(rgb(t.mot), "mot")]),
    ], op, {
      o: anime([[t0, 0], [t0 + 12, 100]]),
      p: anime([[t0, [0, 5 * k, 0]], [t0 + 18, [0, 0, 0]]]),
    }, t0)
  })
  const layers = [...lettres, couche, ...voie(P, k, t, op)]
  if (avecSignature) {
    layers.unshift(calque(5, "signature", [
      groupe("signature", [...LOGO.signature.contours.map((c) => traceContour(c, P)), remplissage(rgb(t.signature), "signature")]),
    ], op, { o: anime([[150, 0], [170, 100]]), p: anime([[150, [0, 2.5 * k, 0]], [172, [0, 0, 0]]]) }, 150))
  }
  return doc(`SETRAG — logo animé (${theme})`, bw * k, bh * k, op, layers)
}

/* --- 2. Symbole animé : S + ruban sous le S (icône, écrans carrés) ------------ */
function symboleAnime(theme = "couleur") {
  const t = THEMES[theme]
  const k = 4
  const [bx, by, bw, bh] = [4, -2, 92, 114]
  const P = ([x, y]) => [(x - bx) * k, (y - by) * k]
  const op = 170
  const { couche } = rubanQuiGlisse({ P, k, t, op, entree: 34, sortie: 96, pose: 140, x1: 24, x2: 76, y: 106, epaisseur: 4.2 })
  return doc(`SETRAG — symbole animé (${theme})`, bw * k, bh * k, op, [couche, ...voie(P, k, t, op)])
}

/* --- 3. Chargement : le ruban glisse sur une voie droite, en boucle ----------- */
function chargementVoie() {
  const W = 240, H = 40, op = 96
  const gauche = 6, droite = W - 6
  const ligne = [[gauche, H / 2], [gauche + (droite - gauche) / 3, H / 2], [gauche + (2 * (droite - gauche)) / 3, H / 2], [droite, H / 2]]
  const id = ([x, y]) => [x, y]
  const rail = (dy) => ({ ty: "sh", nm: "rail", ks: fixe({ i: [[0, 0], [0, 0]], o: [[0, 0], [0, 0]], v: [[gauche, H / 2 + dy], [droite, H / 2 + dy]], c: false }) })
  const voieDroite = calque(2, "voie", [
    groupe("traverses", [traceBezier([ligne], id), trait(LIGNE_CLAIRE, 18, { lc: 1, tirets: [3, 6], nm: "traverses" })]),
    groupe("rails", [rail(-5), rail(5), trait(LIGNE, 2, { nm: "rails" })]),
  ], op)
  const ruban = calque(1, "ruban", [
    groupe("ruban", [
      traceBezier([ligne], id),
      { ty: "gs", nm: "ruban", o: fixe(100), w: fixe(9), lc: 2, lj: 2, ml: 4, t: 1, s: fixe([gauche, H / 2]), e: fixe([droite, H / 2]), g: gradient(THEMES.couleur.ruban) },
    ]),
    // La rame entre à gauche, traverse, sort à droite : 1,6 s, départ et arrivée en douceur.
    decoupe(anime([[10, 0], [op - 2, 100]], { i: 0.35, o: 0.55 }), anime([[0, 0], [op - 12, 100]], { i: 0.35, o: 0.55 })),
  ], op)
  return doc("SETRAG — chargement (voie)", W, H, op, [ruban, voieDroite])
}

/* --- 4. Chargement plein écran : le ruban tourne sur le S ---------------------- */
function chargementS() {
  const k = 2.3, W = 256, H = 256
  const P = ([x, y]) => [x * k + (128 - 50 * k), y * k + (128 - 50.5 * k)]
  const op = 132
  const voieGrise = calque(2, "voie", [
    groupe("traverses", [traceBezier(S_SEGMENTS, P), trait(LIGNE_CLAIRE, 12 * k, { lc: 1, tirets: [1.8 * k, 2.9 * k], nm: "traverses" })]),
    groupe("rails", [traceRail(-3.3, P), traceRail(3.3, P), trait(LIGNE, 1.5 * k, { nm: "rails" })]),
  ], op)
  const images = []
  for (let tt = 0; tt <= op; tt += 3) images.push(tt)
  // Tête et queue à vitesse douce, 34 unités d'écart ; la rame entre et sort du S.
  const f = (tt) => -34 + (LS + 34) * lisse(tt / (op - 6))
  const pos = (len) => { const p = pointAt(T, Math.min(Math.max(len, 0), LS) / LS); return P([p.x, p.y]) }
  const ruban = calque(1, "ruban", [
    groupe("ruban", [
      traceBezier(S_SEGMENTS, P),
      {
        ty: "gs", nm: "ruban", o: fixe(100), w: fixe(8.4 * k), lc: 2, lj: 2, ml: 4, t: 1,
        s: anime(images.map((tt) => [tt, pos(f(tt))]), LINEAIRE),
        e: anime(images.map((tt) => [tt, pos(f(tt) + 34)]), LINEAIRE),
        g: gradient(THEMES.couleur.ruban),
      },
    ]),
    decoupe(
      anime(images.map((tt) => [tt, (100 * Math.max(f(tt), 0)) / LS]), LINEAIRE),
      anime(images.map((tt) => [tt, (100 * Math.min(Math.max(f(tt) + 34, 0.2), LS)) / LS]), LINEAIRE),
    ),
  ], op)
  return doc("SETRAG — chargement (S)", W, H, op, [ruban, voieGrise])
}

/* --- 5. Ruban, l'assistant : le signe (le ruban posé en S, sans rails) ------- */
// « reflexion » : une rame parcourt le S sur sa trace pâle, en boucle.
// « apparition » : le ruban se trace une fois, à la première ouverture.
// Écoute et parole suivent la voix en direct : elles se dessinent dans l'app
// (Skia / Reanimated), pas en Lottie.
function rubanSigne(mode) {
  const k = 4, [bx, by, bw, bh] = [8, -6, 84, 112]
  const P = ([x, y]) => [(x - bx) * k, (y - by) * k]
  const op = mode === "reflexion" ? 96 : 60
  const degrade = {
    ty: "gs", nm: "ruban", o: fixe(100), w: fixe(14 * k), lc: 2, lj: 2, ml: 4, t: 1,
    s: fixe([0, (4 - by) * k]), e: fixe([0, (97 - by) * k]), g: gradient(THEMES.negatif.ruban),
  }
  const ruban = calque(1, "ruban", [
    groupe("ruban", [traceBezier(S_SEGMENTS, P), degrade]),
    mode === "reflexion"
      ? decoupe(anime([[12, 0], [88, 100]], { i: 0.2, o: 0.45 }), anime([[0, 0], [76, 100]], { i: 0.2, o: 0.45 }))
      : decoupe(fixe(0), anime([[0, 0], [42, 100]], { i: 0.2, o: 0.45 })),
  ], op)
  const couches = [ruban]
  if (mode === "reflexion") {
    couches.push(calque(2, "piste", [groupe("piste", [traceBezier(S_SEGMENTS, P), trait([1, 1, 1], 14 * k, { opacite: 16, nm: "piste" })])], op))
  }
  return doc(`Ruban — ${mode}`, bw * k, bh * k, op, couches)
}

const dossier = fileURLToPath(new URL("../lottie/", import.meta.url))
mkdirSync(dossier, { recursive: true })
const sorties = {
  "logo-anime": logoAnime("couleur"),
  "logo-anime-negatif": logoAnime("negatif"),
  "logo-anime-compact": logoAnime("couleur", { avecSignature: false }),
  "symbole-anime": symboleAnime("couleur"),
  "chargement-voie": chargementVoie(),
  "chargement-s": chargementS(),
  "ruban-reflexion": rubanSigne("reflexion"),
  "ruban-apparition": rubanSigne("apparition"),
}
for (const [nom, d] of Object.entries(sorties)) {
  const json = JSON.stringify(d)
  writeFileSync(`${dossier}${nom}.json`, json)
  console.log(`lottie/${nom}.json — ${(json.length / 1024).toFixed(1)} Ko · ${(d.op / d.fr).toFixed(2)} s`)
}
