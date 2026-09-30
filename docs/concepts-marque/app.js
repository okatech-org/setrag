import {
  GARES, GARES_MAJEURES, LONGUEUR_LIGNE, MARQUE, SITE, S_SEGMENTS,
  arcTable, hexToOklch, offsetPoints, oklchToRgb, pointAt, pointsD, rgbToHex, segmentsD,
} from "./geo.js"

const T = arcTable(S_SEGMENTS)
const S = segmentsD(S_SEGMENTS)
const VB = "12 1 76 98"
const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches
let uid = 0
const nid = (p) => `${p}${++uid}`
const railsD = (ecart) => [pointsD(offsetPoints(T, -ecart)), pointsD(offsetPoints(T, ecart))]

/* ---------------------------------------------------------------------------
   Symboles — tous dessinés dans la boîte 100 × 100 du « S ».
   `petit` : version icône / favicon, traits épaissis et détails retirés.
   --------------------------------------------------------------------------- */
const trait = (d, style) => `<path d="${d}" style="fill:none;${style}"/>`

function voie({ petit, rail = "var(--brand-orange)", traverse = rail, opacite = 0.5 } = {}) {
  const [g, d] = railsD(petit ? 5 : 3.3)
  const r = `stroke:${rail};stroke-width:${petit ? 4 : 1.5};stroke-linecap:round;stroke-linejoin:round`
  return (
    trait(S, `stroke:${traverse};stroke-opacity:${opacite};stroke-width:${petit ? 19 : 12};stroke-dasharray:${petit ? "3.6 3.4" : "1.8 2.9"}`) +
    trait(g, r) + trait(d, r)
  )
}

/** `segment` : [km départ, km arrivée] — surligne un trajet, le reste passe en gris. */
function ligne({ petit, couleur = "var(--c-accent)", point = "#fff", contour = couleur, segment } = {}) {
  const w = `stroke-width:${petit ? 15 : 9};stroke-linecap:round`
  const [de, a] = (segment ?? [0, LONGUEUR_LIGNE]).map((km) => km / LONGUEUR_LIGNE)
  let out = segment
    ? trait(S, `stroke:var(--c-line-strong);${w}`) +
      `<path d="${S}" pathLength="1" style="fill:none;stroke:${couleur};${w};stroke-dasharray:${a - de} 2;stroke-dashoffset:${-de}"/>`
    : trait(S, `stroke:${couleur};${w}`)
  for (const [nom, km] of GARES) {
    const majeure = GARES_MAJEURES.includes(nom)
    const terminus = km === 0 || km === LONGUEUR_LIGNE
    if (petit && !terminus) continue
    const p = pointAt(T, km / LONGUEUR_LIGNE)
    const r = petit ? 5.5 : majeure ? 3.8 : 1.6
    const f = km / LONGUEUR_LIGNE
    const teinte = segment && (f < de || f > a) ? "var(--c-line-strong)" : contour
    const bord = majeure || petit ? `stroke:${teinte};stroke-width:${petit ? 3.4 : 2.4};` : ""
    out += `<circle class="gare" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${r}" style="${bord}fill:${point};--d:${(km / LONGUEUR_LIGNE).toFixed(3)}"/>`
  }
  return out
}

// Décalage positif = côté haut au départ du S : le vert y est, comme en haut du drapeau.
function tricolore({ petit, couleurs = ["var(--brand-bleu)", "var(--brand-jaune)", "var(--brand-vert)"] } = {}) {
  const e = petit ? 6 : 4.1
  return [-e, 0, e]
    .map((d, i) => trait(d ? pointsD(offsetPoints(T, d)) : S, `stroke:${couleurs[i]};stroke-width:${petit ? 6.2 : 4.2};stroke-linejoin:round`))
    .join("")
}

function traverses({ petit } = {}) {
  const g = nid("g")
  return (
    `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="6" x2="0" y2="95">` +
    `<stop offset="0" style="stop-color:var(--brand-vert)"/><stop offset=".5" style="stop-color:var(--brand-jaune)"/>` +
    `<stop offset="1" style="stop-color:var(--brand-bleu)"/></linearGradient></defs>` +
    trait(S, `stroke:url(#${g});stroke-width:${petit ? 22 : 16};stroke-dasharray:${petit ? "5.2 3.8" : "2.4 2.6"}`)
  )
}

/** Voiture de train vue de dessus, posée sur le tracé à la fraction `f`. */
function voiture(f, { tete, couleur, k = 1 }) {
  const p = pointAt(T, f)
  const a = (Math.atan2(p.tan[1], p.tan[0]) * 180) / Math.PI
  return (
    `<g class="car" data-f="${f}" transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${a.toFixed(1)})"><g transform="scale(${k})">` +
    `<rect x="-3.3" y="-4.4" width="6.6" height="8.8" rx="${tete ? 2.6 : 1.4}" style="fill:${couleur}"/>` +
    `<rect x="-2.3" y="-1" width="4.6" height="2" rx=".6" style="fill:#fff;opacity:.9"/>` +
    (tete ? `<circle cx="2.2" cy="0" r="1.1" style="fill:var(--brand-jaune)"/>` : "") +
    `</g></g>`
  )
}

function convoi({ petit, rail, traverse, opacite, train = "var(--brand-bleu)", position = 0.6 } = {}) {
  const n = petit ? 1 : 3
  let cars = ""
  for (let i = n - 1; i >= 0; i--) cars += voiture(position - i * 0.062, { tete: i === 0, couleur: train, k: petit ? 1.9 : 1.3 })
  return voie({ petit, rail, traverse, opacite }) + `<g class="convoi">${cars}</g>`
}

function blason({ petit, fond = "var(--brand-bleu)", interieur = "#fff" } = {}) {
  const inner = `<g transform="translate(22 ${petit ? 21.7 : 18.7}) scale(.56)">${voie({ petit: true })}</g>`
  if (petit) return `<circle cx="50" cy="50" r="49" style="fill:${fond}"/><circle cx="50" cy="50" r="40" style="fill:${interieur}"/>${inner}`
  const haut = nid("h"), bas = nid("b"), ruban = nid("r")
  const texte = (id, t) =>
    `<text style="font:700 6.1px var(--font-ui);letter-spacing:.9px;fill:#fff"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${t}</textPath></text>`
  return (
    `<defs><path id="${haut}" d="M9 50 A41 41 0 0 1 91 50"/><path id="${bas}" d="M6.5 50 A43.5 43.5 0 0 0 93.5 50"/>` +
    `<linearGradient id="${ruban}"><stop offset="0" style="stop-color:var(--brand-vert)"/><stop offset=".5" style="stop-color:var(--brand-jaune)"/><stop offset="1" style="stop-color:var(--brand-bleu)"/></linearGradient></defs>` +
    `<circle cx="50" cy="50" r="49.5" style="fill:${fond}"/><circle cx="50" cy="50" r="36.5" style="fill:${interieur}"/>` +
    `<g class="anneau">${texte(haut, "SOCIÉTÉ D’EXPLOITATION")}${texte(bas, "DU TRANSGABONAIS")}` +
    `<circle cx="6.8" cy="50" r="1.3" style="fill:var(--brand-jaune)"/><circle cx="93.2" cy="50" r="1.3" style="fill:var(--brand-jaune)"/></g>` +
    inner +
    `<rect x="30" y="77" width="40" height="3.4" rx="1.7" style="fill:url(#${ruban})"/>`
  )
}

const SYMBOLES = { voie, ligne, tricolore, traverses, convoi, blason }

/** SVG autonome. `revele` ajoute un masque qui dessine le « S » d'un bout à l'autre. */
function svg(nom, opts = {}, { classe = "", label = "", revele = false } = {}) {
  const vb = nom === "blason" ? "0 0 100 100" : opts.vb ?? VB
  let corps = SYMBOLES[nom](opts)
  if (revele && nom !== "blason") {
    const m = nid("m")
    corps =
      `<defs><mask id="${m}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140">` +
      `<path class="reveal" d="${S}" pathLength="1" style="fill:none;stroke:#fff;stroke-width:34;stroke-dasharray:1 1"/></mask></defs>` +
      `<g mask="url(#${m})">${corps}</g>`
  }
  const a11y = label ? `role="img" aria-label="${label}"` : `aria-hidden="true"`
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${classe}" viewBox="${vb}" ${a11y}>${corps}</svg>`
}

/* ---------------------------------------------------------------------------
   Logos — les six pistes.
   --------------------------------------------------------------------------- */
const LOGOS = [
  {
    cle: "voie", lettre: "A", nom: "Voie épurée", reco: "Recommandé",
    pitch: "Le logo actuel, redessiné en aplats : mêmes rails, mêmes traverses, même tracé. Plus de relief ni de dégradé, une seule couleur pour le S : l'orange du site setrag.eramet.com, qui est aussi celui de la capture.",
    plus: ["La reconnaissance est intacte : c'est le même logo, nettoyé", "Tient à 32 px ; à 16 px on lit encore un S, les rails se fondent", "Une seule couleur pour le S, fixée en token"],
    moins: ["Évolution discrète : ne crée pas d'effet « nouvelle marque »"],
    icone: { fond: "var(--c-surface)", opts: {}, ruban: true },
  },
  {
    cle: "ligne", lettre: "B", nom: "La ligne",
    pitch: "Le S devient le plan de la ligne : un trait continu, Owendo en haut, Franceville en bas, et les 23 gares placées à leur point kilométrique réel. Le logo dit ce que fait l'entreprise.",
    plus: ["Meilleure lisibilité à 16 px de toute la série", "Se prolonge directement en plan de ligne, suivi de train, horaires", "Les gares sont exactes : un argument de sérieux"],
    moins: ["Perd les rails et les traverses, donc un peu de la mémoire du logo actuel"],
    icone: { fond: "var(--brand-bleu)", opts: { couleur: "#fff", point: "var(--brand-bleu)", contour: "#fff" } },
  },
  {
    cle: "tricolore", lettre: "C", nom: "Tricolore",
    pitch: "Les trois couleurs du ruban remontent dans le S : trois voies parallèles vert, jaune, bleu. Le drapeau gabonais devient la lettre.",
    plus: ["Identité nationale immédiate", "Fusionne les deux signatures du logo (S et ruban) en une seule"],
    moins: ["Le jaune disparaît sur fond blanc (1,3:1) : à réserver aux fonds foncés ou colorés", "On lit moins une voie ferrée que des pistes"],
    icone: { fond: "var(--brand-encre)", opts: {} },
  },
  {
    cle: "traverses", lettre: "D", nom: "Traverses",
    pitch: "On ne garde que les traverses, en dégradé du ruban. Le S devient un rythme, proche d'un code-barres : il rappelle le billet et le QR code.",
    plus: ["Très graphique, se décline en motif (fonds, bordures de billet)", "Animation naturelle : la voie se pose traverse par traverse"],
    moins: ["Lecture « voie ferrée » plus abstraite", "Le jaune pâle faiblit sur blanc"],
    icone: { fond: "var(--c-surface)", opts: {} },
  },
  {
    cle: "convoi", lettre: "E", nom: "Le convoi",
    pitch: "La voie épurée, avec un train qui l’emprunte. En statique il est posé dans la diagonale du S ; animé, il le parcourt de bout en bout.",
    plus: ["Le plus narratif : on voit le train", "Excellent en animation (démarrage, chargement)"],
    moins: ["Plus chargé : le train disparaît sous 32 px", "Deux couleurs vives à côté du bleu du mot"],
    icone: { fond: "var(--brand-bleu)", opts: { rail: "#fff", traverse: "#fff", opacite: 0.45, train: "var(--brand-orange)", position: 0.5 } },
  },
  {
    cle: "blason", lettre: "F", nom: "Blason",
    pitch: "Un écusson de compagnie ferroviaire : le S au centre, le nom de la société en couronne, le ruban en bas. Pour les uniformes, la livrée des voitures, les tampons et les documents officiels.",
    plus: ["Registre institutionnel, patrimonial", "La version icône est l'icône actuelle, en propre"],
    moins: ["Texte illisible sous 64 px : ne remplace pas le logo principal", "Registre moins « numérique »"],
    icone: { fond: "var(--brand-bleu)", opts: { fond: "var(--brand-bleu)" }, sansTuile: true },
  },
]

function lockup(cle, { taille = 48, compact = false, revele = false, mot = "ETRAG" } = {}) {
  const logo = LOGOS.find((l) => l.cle === cle)
  const plein = cle === "blason"
  return (
    `<span class="lockup${plein ? " lockup-blason" : ""}" style="--fs:${taille}px" role="img" aria-label="SETRAG — Société d’Exploitation du Transgabonais">` +
    svg(cle, logo?.lockupOpts ?? {}, { classe: "lk-sym", revele }) +
    `<span class="lk-txt"><span class="lk-wm">${plein ? "SETRAG" : mot}</span><span class="lk-ruban"></span>` +
    (compact ? "" : `<span class="lk-tag">Société d’Exploitation du Transgabonais</span>`) +
    `</span></span>`
  )
}

function tuile(logo, px) {
  const { fond, opts, ruban, sansTuile } = logo.icone
  const inner = svg(logo.cle, { ...opts, petit: true }, { classe: "tuile-sym" })
  return (
    `<span class="tuile${sansTuile ? " tuile-ronde" : ""}" style="--px:${px}px;background:${fond}">${inner}` +
    (ruban ? `<span class="tuile-ruban"></span>` : "") +
    `</span>`
  )
}

/* ---------------------------------------------------------------------------
   Rendu à taille réelle (16/32 px) : on rastérise le SVG dans un canvas,
   puis on l'agrandit sans lissage pour montrer les vrais pixels.
   --------------------------------------------------------------------------- */
function versHex(v) {
  const m = v.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
  return m ? rgbToHex(oklchToRgb(+m[1], +m[2], +m[3])) : v
}
function resoudre(markup) {
  const cs = getComputedStyle(document.documentElement)
  return markup.replace(/var\((--[\w-]+)\)/g, (_, n) => versHex(cs.getPropertyValue(n).trim()))
}

async function rastériser(canvas, markup, px, fond) {
  canvas.width = canvas.height = px
  const ctx = canvas.getContext("2d")
  if (fond) {
    ctx.fillStyle = versHex(getComputedStyle(document.documentElement).getPropertyValue(fond.slice(4, -1)).trim() || fond)
    const r = px * 0.22
    ctx.beginPath(); ctx.roundRect(0, 0, px, px, r); ctx.fill()
  }
  const img = new Image()
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(resoudre(markup))
  await img.decode()
  const pad = fond ? px * 0.1 : 0
  ctx.drawImage(img, pad, pad, px - 2 * pad, px - 2 * pad)
}

async function faviconActuel(canvas, px) {
  canvas.width = canvas.height = px
  const img = new Image()
  img.src = "img/icone-actuelle.png"
  await img.decode()
  const ctx = canvas.getContext("2d")
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(img, 0, 0, px, px)
}

/* ---------------------------------------------------------------------------
   Animations SVG : révélation du tracé, gares, train.
   --------------------------------------------------------------------------- */
function rejouer(el) {
  el.classList.remove("is-playing")
  void el.offsetWidth
  el.classList.add("is-playing")
  el.querySelectorAll(".convoi").forEach((c) => rouler(c, { boucle: false }))
}

const trains = new WeakMap()
/** Fait parcourir le « S » aux voitures d'un groupe `.convoi`. */
function rouler(groupe, { boucle = true, duree = 3600 } = {}) {
  cancelAnimationFrame(trains.get(groupe))
  const cars = [...groupe.querySelectorAll(".car")]
  const n = cars.length
  const initial = cars.map((c) => +c.dataset.f)
  const t0 = performance.now()
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
  const pas = (now) => {
    let t = (now - t0) / duree
    if (t >= 1 && !boucle) {
      cars.forEach((c, i) => placer(c, initial[i]))
      return
    }
    t %= 1
    const tete = -0.05 + 1.2 * (boucle ? t : ease(t))
    cars.forEach((c, i) => placer(c, tete - (n - 1 - i) * 0.05))
    trains.set(groupe, requestAnimationFrame(pas))
  }
  trains.set(groupe, requestAnimationFrame(pas))
}
function placer(car, f) {
  const visible = f >= 0 && f <= 1
  const p = pointAt(T, f)
  const a = (Math.atan2(p.tan[1], p.tan[0]) * 180) / Math.PI
  car.setAttribute("transform", `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${a.toFixed(1)})`)
  car.style.opacity = visible ? 1 : 0
}

/* ---------------------------------------------------------------------------
   Pièces de maquette.
   --------------------------------------------------------------------------- */
function qr(graine = 7, n = 25) {
  let s = graine
  const alea = () => (s = (s * 16807) % 2147483647) / 2147483647
  const zone = (x, y) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9)
  let modules = ""
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) if (!zone(x, y) && alea() < 0.48) modules += `M${x} ${y}h1v1h-1z`
  const reperes = [[0, 0], [n - 7, 0], [0, n - 7]]
    .map(([x, y]) => `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`)
    .join("")
  return `<svg class="qr" viewBox="-2 -2 ${n + 4} ${n + 4}" role="img" aria-label="QR code du billet (fictif)"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" rx="2" fill="#fff"/><path d="${modules}${reperes}" fill="#131B26" fill-rule="evenodd"/></svg>`
}

/** Schéma horizontal de la ligne, gares au kilomètre, segment surligné. */
function schemaLigne(el) {
  const W = 960, x = (km) => 36 + (km / LONGUEUR_LIGNE) * (W - 72), y = 64
  const [de, a] = [0, 338]
  let out = `<svg viewBox="0 0 ${W} 132" role="img" aria-label="Ligne du Transgabonais, d'Owendo à Franceville ; trajet sélectionné d'Owendo à Booué">`
  out += `<line x1="${x(0)}" y1="${y}" x2="${x(LONGUEUR_LIGNE)}" y2="${y}" style="stroke:var(--c-line-strong);stroke-width:8;stroke-linecap:round"/>`
  out += `<line class="c3-seg" x1="${x(de)}" y1="${y}" x2="${x(a)}" y2="${y}" style="stroke:var(--c-accent);stroke-width:8;stroke-linecap:round"/>`
  GARES.forEach(([nom, km], i) => {
    const maj = GARES_MAJEURES.includes(nom)
    const dans = km >= de && km <= a
    const c = dans ? "var(--c-accent)" : "var(--c-line-strong)"
    out += maj
      ? `<circle cx="${x(km)}" cy="${y}" r="8" style="fill:var(--c-surface);stroke:${c};stroke-width:3.5"/>`
      : `<circle cx="${x(km)}" cy="${y}" r="2.6" style="fill:var(--c-surface)"/>`
    if (maj) {
      const haut = i % 2 === 0
      out += `<text x="${x(km)}" y="${haut ? 36 : 100}" text-anchor="middle" style="font:600 14px var(--font-ui);fill:var(--c-ink)">${nom}</text>`
      out += `<text x="${x(km)}" y="${haut ? 20 : 118}" text-anchor="middle" style="font:400 12px var(--font-mono);fill:var(--c-ink-muted)">PK ${km}</text>`
    }
  })
  el.innerHTML = out + "</svg>"
}

const contraste = (a, b) => {
  const lum = (h) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return ((x + 0.05) / (y + 0.05)).toFixed(1).replace(".", ",")
}

function couleursSite(el) {
  el.innerHTML = SITE.map(([nom, hex, usage]) => {
    const [l, c, h] = hexToOklch(hex)
    return `<figure class="swatch swatch-site"><span class="swatch-color" style="background:${hex}"></span><figcaption><b>${nom}</b><span class="tabular">${hex} · oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})</span><span class="swatch-use">${usage}</span></figcaption></figure>`
  }).join("")
}

function palette(el) {
  const items = [
    ["Bleu SETRAG", "--c-accent (existant)", MARQUE.bleu, "Le mot ETRAG, l'interface. Le bleu du site (#0E4D94) et celui du drapeau ont la même teinte."],
    ["Orange SETRAG", "--brand-orange (site)", MARQUE.orange, "Le S. Repris du site, où il colore liens et titres."],
    ["Jaune SETRAG", "--brand-jaune (site)", MARQUE.jaune, "Le ruban, et le texte ou les pastilles posés sur le bleu."],
    ["Vert Gabon", "--brand-vert (drapeau)", MARQUE.vert, "Ruban uniquement."],
    ["Indigo", "--brand-indigo (site)", MARQUE.indigo, "Titres éditoriaux : e-mails, PDF, pages institutionnelles."],
  ]
  el.innerHTML =
    items
      .map(([nom, token, [l, c, h], usage]) => {
        const hex = rgbToHex(oklchToRgb(l, c, h))
        return `<figure class="swatch"><span class="swatch-color" style="background:oklch(${l} ${c} ${h})"></span><figcaption><b>${nom}</b><code>${token}</code><span class="tabular">oklch(${l} ${c} ${h}) · ${hex}</span><span class="swatch-use">${usage}</span></figcaption></figure>`
      })
      .join("") +
    `<figure class="swatch swatch-ruban"><span class="swatch-color" style="background:var(--brand-ruban)"></span><figcaption><b>Ruban</b><code>--brand-ruban</code><span class="swatch-use">Vert → jaune → bleu SETRAG. Décor seulement : ne porte jamais une information.</span></figcaption></figure>`
}

function associations(el) {
  const combos = [
    ["#0E4D94", "#FCDF49", "Info trafic", "Jaune sur bleu", "Le bandeau d'information du site. Lisible pour tout texte (AA)."],
    ["#FCDF49", "#0E4D94", "Meilleur prix", "Bleu sur jaune", "Les boutons du site. Chez nous : pastilles de mise en avant, pas le bouton principal."],
    ["#FFFFFF", "#FA6414", "Actualités", "Orange sur blanc", "Suffit pour un gros titre (3:1), pas pour du texte courant (4,5:1)."],
    ["#FFFFFF", "#1A003B", "Owendo", "Indigo sur blanc", "Titres éditoriaux, contraste maximal."],
  ]
  el.innerHTML = combos.map(([fond, texte, exemple, nom, note]) =>
    `<div class="combo"><span class="combo-demo" style="background:${fond};color:${texte}">${exemple}</span><div><b>${nom} · <span class="tabular">${contraste(fond, texte)}:1</span></b><p>${note}</p></div></div>`
  ).join("")
}

/* ---------------------------------------------------------------------------
   Montage.
   --------------------------------------------------------------------------- */
function monter() {
  document.querySelectorAll("[data-lockup]").forEach((el) => {
    const d = el.dataset
    el.innerHTML = lockup(d.lockup, { taille: +(d.size ?? 48), compact: "compact" in d })
  })
  document.querySelectorAll("[data-sym]").forEach((el) => {
    const d = el.dataset
    const opts = d.opts ? JSON.parse(d.opts) : {}
    el.innerHTML = svg(d.sym, { ...opts, petit: "small" in d }, { classe: d.class ?? "", label: d.label ?? "", revele: "reveal" in d })
    if ("train" in d) el.querySelectorAll(".convoi").forEach((c) => !reduit && rouler(c, { boucle: true, duree: +(d.train || 5200) }))
  })
  document.querySelectorAll("[data-qr]").forEach((el) => (el.innerHTML = qr(+el.dataset.qr || 7)))
  document.querySelectorAll("[data-tuile]").forEach((el) => {
    el.innerHTML = tuile(LOGOS.find((l) => l.cle === el.dataset.tuile), +(el.dataset.px ?? 60))
  })
  schemaLigne(document.getElementById("c3-ligne"))
  palette(document.getElementById("palette"))
  couleursSite(document.getElementById("site-couleurs"))
  associations(document.getElementById("associations"))
  monterLogos()
  monterFaviconsActuels()
}

function monterLogos() {
  const grille = document.getElementById("logos-grille")
  grille.innerHTML = LOGOS.map((l) => `
    <article class="logo-card" id="logo-${l.cle}">
      <header class="logo-head">
        <span class="logo-lettre" aria-hidden="true">${l.lettre}</span>
        <h3>${l.nom}</h3>
        ${l.reco ? `<span class="pastille">${l.reco}</span>` : ""}
        <button class="btn btn-ghost btn-sm" data-animer="${l.cle}">Animer</button>
      </header>
      <div class="scene scene-clair" data-scene="${l.cle}">${lockup(l.cle, { taille: 46, revele: true })}</div>
      <div class="scene scene-sombre" data-theme="dark" data-scene="${l.cle}">${lockup(l.cle, { taille: 30, revele: true })}</div>
      <div class="formats">
        <figure>${tuile(l, 76)}<figcaption>Icône d'app</figcaption></figure>
        <figure>${tuile(l, 44)}<figcaption>Écran d'accueil</figcaption></figure>
        <figure><canvas class="px" data-fav="${l.cle}" data-px="32" style="--x:2"></canvas><figcaption>32 px réels</figcaption></figure>
        <figure><canvas class="px" data-fav="${l.cle}" data-px="16" style="--x:4"></canvas><figcaption>16 px réels</figcaption></figure>
      </div>
      <p class="logo-pitch">${l.pitch}</p>
      <div class="pour-contre">
        <ul class="plus">${l.plus.map((p) => `<li>${p}</li>`).join("")}</ul>
        <ul class="moins">${l.moins.map((p) => `<li>${p}</li>`).join("")}</ul>
      </div>
    </article>`).join("")

  grille.querySelectorAll("canvas[data-fav]").forEach((c) => {
    const l = LOGOS.find((x) => x.cle === c.dataset.fav)
    const px = +c.dataset.px
    const markup = svg(l.cle, { ...l.icone.opts, petit: true })
    rastériser(c, markup, px, l.icone.sansTuile ? null : l.icone.fond)
  })
  grille.addEventListener("click", (e) => {
    const b = e.target.closest("[data-animer]")
    if (!b) return
    b.closest(".logo-card").querySelectorAll("[data-scene]").forEach(rejouer)
  })
}

function monterFaviconsActuels() {
  document.querySelectorAll("canvas[data-actuel]").forEach((c) => faviconActuel(c, +c.dataset.actuel))
}

/* --- Lottie ------------------------------------------------------------------ */
const lecteurs = new Map()
/** Lance une animation Lottie depuis le début, et le texte d'écran qui l'accompagne. */
function jouer(el) {
  lecteurs.get(el)?.goToAndPlay(0, true)
  const ecran = el.closest(".splash-screen")
  if (ecran) rejouer(ecran)
}

function monterLottie() {
  const io = new IntersectionObserver((entrees) => {
    for (const e of entrees) {
      if (!e.isIntersecting || reduit || e.target.dataset.vu) continue
      e.target.dataset.vu = "1"
      jouer(e.target)
    }
  }, { threshold: 0.5 })

  document.querySelectorAll("[data-lottie]").forEach((el) => {
    const boucle = "loop" in el.dataset
    const anim = lottie.loadAnimation({
      container: el, renderer: "svg", loop: boucle, autoplay: false,
      path: `lottie/setrag-${el.dataset.lottie}.json`,
      rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
    })
    anim.addEventListener("DOMLoaded", () => {
      if (reduit) anim.goToAndStop(anim.totalFrames - 1, true)
    })
    lecteurs.set(el, anim)
    io.observe(el)
  })

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-rejouer]")
    if (b) jouer(document.querySelector(b.dataset.rejouer))
  })
}

/* --- Thème --------------------------------------------------------------------- */
function monterTheme() {
  const b = document.getElementById("theme")
  b.addEventListener("click", () => {
    const sombre = document.documentElement.dataset.theme !== "dark"
    document.documentElement.dataset.theme = sombre ? "dark" : "light"
    b.setAttribute("aria-pressed", String(sombre))
    b.textContent = sombre ? "Thème clair" : "Thème sombre"
  })
}

monter()
monterLottie()
monterTheme()
