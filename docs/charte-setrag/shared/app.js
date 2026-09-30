// Charte SETRAG — montage des pages : logos, icônes, codes, Lottie et démos.
import { GARES, GARES_MAJEURES, LONGUEUR_LIGNE, S_SEGMENTS, arcTable, pointAt } from "./geo.js"
import { SPRITE } from "./icones.js"
import { S_D, iconeApp, logo, symbole } from "./marque.js"

const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches
const T = arcTable(S_SEGMENTS)

/* --------------------------------------------------------------- Icônes --- */
document.body.insertAdjacentHTML("afterbegin", SPRITE)
const icone = (nom, classe = "ic") => `<svg class="${classe}" aria-hidden="true"><use href="#i-${nom}"/></svg>`
function monterIcones(racine = document) {
  racine.querySelectorAll("i[data-i]").forEach((el) => {
    el.outerHTML = icone(el.dataset.i, `ic ${el.className}`.trim())
  })
}

/* ---------------------------------------------------------------- Logos --- */
function monterLogos(racine = document) {
  racine.querySelectorAll("[data-logo]").forEach((el) => {
    const variante = el.dataset.logo || "complet"
    const theme = el.dataset.theme || "couleur"
    el.innerHTML = variante === "icone"
      ? iconeApp({ taille: "100%", fond: el.dataset.fond || "#FFFFFF", theme })
      : logo({ variante, theme, titre: el.dataset.titre ?? (variante.startsWith("symbole") ? "SETRAG" : undefined) })
  })
  // Le S gris, rame à quai en haut : illustration des états vides et d'attente.
  racine.querySelectorAll("[data-s-attente]").forEach((el) => {
    const g = `sa${Math.random().toString(36).slice(2, 7)}`
    el.innerHTML =
      `<svg viewBox="12 1 76 98" aria-hidden="true"><defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="79" y1="0" x2="52" y2="0">` +
      `<stop offset="0" stop-color="#029E60"/><stop offset=".5" stop-color="#FCDF49"/><stop offset="1" stop-color="#0F50A0"/></linearGradient></defs>` +
      symbole({ rail: "var(--c-line-strong)", traverse: "var(--c-line-strong)", opacite: 0.55 }) +
      `<path d="${S_D}" pathLength="1" fill="none" stroke="url(#${g})" stroke-width="8.4" stroke-linecap="round" stroke-dasharray="0.13 2" stroke-dashoffset="-0.02"/></svg>`
  })
}

/* ------------------------------------------------------------ Code Aztec --- */
// Les billets hors ligne portent un code Aztec : cible au centre, données autour.
export function aztec(graine = 7, n = 31) {
  let s = graine
  const alea = () => (s = (s * 16807) % 2147483647) / 2147483647
  const c = (n - 1) / 2
  let d = ""
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const r = Math.max(Math.abs(x - c), Math.abs(y - c))
      let noir
      if (r <= 6) noir = r % 2 === 0
      else if (r === 7) noir = (Math.abs(x - c) === 7 && Math.abs(y - c) >= 6) || (Math.abs(y - c) === 7 && Math.abs(x - c) === 7) ? true : alea() < 0.5
      else if (x === c || y === c) noir = (x + y) % 2 === 0
      else noir = alea() < 0.5
      if (noir) d += `M${x} ${y}h1v1h-1z`
    }
  return `<svg viewBox="-1 -1 ${n + 2} ${n + 2}" role="img" aria-label="Code Aztec du billet (fictif)"><path d="${d}" fill="currentColor"/></svg>`
}

/* ------------------------------------------------- Ruban qui glisse (UI) --- */
/** Place l'indicateur d'un groupe sur l'élément courant ; le suit au clic. */
function monterGlisses(racine = document) {
  racine.querySelectorAll("[data-glisse]").forEach((groupe) => {
    const sel = groupe.dataset.glisse
    const ind = groupe.querySelector(":scope > .indicateur")
    if (!ind) return
    const items = [...groupe.querySelectorAll(`:scope > ${sel}`)]
    const attr = items.some((i) => i.hasAttribute("aria-pressed")) ? "aria-pressed" : "aria-current"
    const fixe = groupe.classList.contains("onglets-m")
    const placer = (item, instant) => {
      if (!item) return
      if (instant) ind.style.transition = "none"
      const x = item.offsetLeft + (fixe ? (item.offsetWidth - ind.offsetWidth) / 2 : groupe.classList.contains("nav") ? 14 : 0)
      ind.style.setProperty("--x", `${x}px`)
      if (!fixe) ind.style.setProperty("--w", `${groupe.classList.contains("nav") ? item.offsetWidth - 28 : item.offsetWidth}px`)
      if (instant) { void ind.offsetWidth; ind.style.transition = "" }
    }
    const courant = () => items.find((i) => i.getAttribute(attr) === "true" || (attr === "aria-current" && i.hasAttribute("aria-current")))
    placer(courant(), true)
    new ResizeObserver(() => placer(courant(), true)).observe(groupe)
    items.forEach((item) =>
      item.addEventListener("click", (e) => {
        e.preventDefault()
        items.forEach((i) => (attr === "aria-current" ? i.removeAttribute("aria-current") : i.setAttribute("aria-pressed", "false")))
        item.setAttribute(attr, attr === "aria-current" ? "page" : "true")
        placer(item)
      }),
    )
  })
}

/* ---------------------------------------------------------------- Démos --- */
function monterDemos() {
  // Choix d'un trajet : le ruban remplit la voie entre les deux heures.
  document.querySelectorAll("[data-demo='trajets']").forEach((liste) => {
    liste.addEventListener("click", (e) => {
      const t = e.target.closest(".trajet:not(.annule)")
      if (!t) return
      liste.querySelectorAll(".trajet").forEach((x) => x !== t && x.classList.remove("choisi"))
      t.classList.toggle("choisi")
    })
  })
  // Groupes de choix (classes, moyens de paiement)
  document.querySelectorAll("[role='radiogroup']").forEach((g) => {
    g.addEventListener("click", (e) => {
      const o = e.target.closest("[role='radio']")
      if (!o) return
      g.querySelectorAll("[role='radio']").forEach((x) => x.setAttribute("aria-checked", String(x === o)))
    })
  })
  // Étapes du tunnel
  document.querySelectorAll("[data-demo='etapes']").forEach((bloc) => {
    const et = bloc.querySelector(".etapes")
    const n = +getComputedStyle(et).getPropertyValue("--n") || 4
    let i = +(bloc.dataset.depart ?? 2)
    const maj = () => {
      et.querySelector(".ruban").style.setProperty("--p", String(i / (n - 1)))
      et.querySelectorAll(".etape").forEach((e, k) => { e.classList.toggle("faite", k < i); e.classList.toggle("ici", k === i) })
    }
    maj()
    bloc.querySelector("[data-suivant]")?.addEventListener("click", () => { i = i >= n - 1 ? 0 : i + 1; maj() })
  })
  // Émission du billet : le ruban traverse la découpe
  document.querySelectorAll("[data-demo='emission']").forEach((b) => {
    const billet = b.closest("[data-billet]")?.querySelector(".billet") ?? document.querySelector(b.dataset.cible)
    const jouer = () => { billet.classList.remove("emis"); void billet.offsetWidth; requestAnimationFrame(() => billet.classList.add("emis")) }
    b.addEventListener("click", jouer)
  })
  document.querySelectorAll(".billet[data-emission-auto]").forEach((billet) => {
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setTimeout(() => billet.classList.add("emis"), reduit ? 0 : 500); io.disconnect() }
    }, { threshold: 0.6 })
    io.observe(billet)
  })
  // Bouton en attente (2,4 s)
  document.querySelectorAll("[data-demo='en-cours']").forEach((b) =>
    b.addEventListener("click", () => { b.classList.add("en-cours"); setTimeout(() => b.classList.remove("en-cours"), 2400) }),
  )
  // Inverser départ et arrivée
  document.querySelectorAll(".inverser").forEach((b) =>
    b.addEventListener("click", () => {
      b.classList.toggle("tourne")
      const bloc = b.closest(".recherche-gares")
      const [a, c] = bloc.querySelectorAll(".bloc-champ b")
      setTimeout(() => ([a.textContent, c.textContent] = [c.textContent, a.textContent]), 140)
    }),
  )
  // Position estimée du train : la rame avance d'un cran toutes les 3 s.
  document.querySelectorAll(".arrets[data-rame]").forEach((a) => {
    const rame = a.querySelector(".rame")
    const pas = (a.dataset.rame || "").split(",").map(Number)
    let k = 0
    const placer = () => rame.style.setProperty("--y", `${pas[k]}px`)
    placer()
    if (!reduit && pas.length > 1) setInterval(() => { k = (k + 1) % pas.length; placer() }, 3000)
  })
  // Comptes à rebours (réservation tenue, départ)
  document.querySelectorAll("[data-rebours]").forEach((el) => {
    let [m, s] = el.dataset.rebours.split(":").map(Number)
    let total = m * 60 + s
    const aff = () => (el.textContent = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`)
    aff()
    setInterval(() => { total = Math.max(0, total - 1); aff() }, 1000)
  })
}

/* ----------------------------------------------- Schéma de ligne (web) --- */
/** Ligne horizontale Owendo → Franceville, trajet surligné par le ruban. */
function schemaLigne(el) {
  const avecSegment = el.dataset.segment !== ""
  const [de, a] = (el.dataset.segment || "0,338").split(",").map(Number)
  // Trains en circulation : « km|libellé|état|sens » séparés par « ; ». Chacun est une rame de ruban.
  const trains = (el.dataset.trains || "").split(";").filter(Boolean).map((t) => {
    const [km, nom, etat, sens] = t.split("|")
    return { km: +km, nom, etat, sens: sens || ">" }
  })
  const W = 1000, x = (km) => 30 + (km / LONGUEUR_LIGNE) * (W - 60), y = 58
  const id = `sl${Math.random().toString(36).slice(2, 7)}`
  let o = `<svg viewBox="0 0 ${W} 124" role="img" aria-label="Ligne du Transgabonais, d'Owendo à Franceville">`
  o += `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x(de)}" y1="0" x2="${x(a)}" y2="0"><stop offset="0" stop-color="#029E60"/><stop offset=".5" stop-color="#FCDF49"/><stop offset=".75" stop-color="#00A6A0"/><stop offset="1" stop-color="#0F50A0"/></linearGradient></defs>`
  // Voie : rails + traverses, neutres
  o += `<line x1="${x(0)}" y1="${y - 4}" x2="${x(LONGUEUR_LIGNE)}" y2="${y - 4}" stroke="var(--c-line-strong)" stroke-width="1.5"/>`
  o += `<line x1="${x(0)}" y1="${y + 4}" x2="${x(LONGUEUR_LIGNE)}" y2="${y + 4}" stroke="var(--c-line-strong)" stroke-width="1.5"/>`
  o += `<line x1="${x(0)}" y1="${y}" x2="${x(LONGUEUR_LIGNE)}" y2="${y}" stroke="var(--c-line)" stroke-width="13" stroke-dasharray="2 6"/>`
  // Le trajet choisi : le ruban posé sur la voie
  if (avecSegment) o += `<line class="sl-ruban" x1="${x(de)}" y1="${y}" x2="${x(a)}" y2="${y}" stroke="url(#${id})" stroke-width="7" stroke-linecap="round"/>`
  GARES.forEach(([nom, km], i) => {
    const maj = GARES_MAJEURES.includes(nom) || km === de || km === a
    const dans = avecSegment && km >= de && km <= a
    o += maj
      ? `<circle cx="${x(km)}" cy="${y}" r="7.5" fill="var(--c-surface)" stroke="${dans ? "var(--c-accent)" : "var(--c-line-strong)"}" stroke-width="3"/>`
      : `<circle cx="${x(km)}" cy="${y}" r="2.6" fill="var(--c-surface)" stroke="${dans ? "var(--c-accent)" : "var(--c-line-strong)"}" stroke-width="1.5"/>`
    if (maj) {
      const haut = i % 2 === 0
      // Les terminus s'alignent sur les bords : le nom ne sort pas du cadre.
      const ancre = km === 0 ? "start" : km === LONGUEUR_LIGNE ? "end" : "middle"
      const xt = x(km) + (km === 0 ? -8 : km === LONGUEUR_LIGNE ? 8 : 0)
      o += `<text x="${xt}" y="${haut ? 30 : 96}" text-anchor="${ancre}" style="font:600 14px var(--font-ui);fill:var(--c-ink)">${nom}</text>`
      o += `<text x="${xt}" y="${haut ? 14 : 113}" text-anchor="${ancre}" style="font:500 11.5px var(--font-mono);fill:var(--c-ink-muted)">PK ${km}</text>`
    }
  })
  trains.forEach((t, i) => {
    const gid = `${id}t${i}`
    const [c1, c2] = t.sens === ">" ? ["#029E60", "#0F50A0"] : ["#0F50A0", "#029E60"]
    const couleur = { ok: "var(--c-success-ink)", retard: "var(--c-warning-ink)", annule: "var(--c-danger-ink)" }[t.etat] ?? "var(--c-ink-muted)"
    o += `<defs><linearGradient id="${gid}" x1="0" x2="1"><stop offset="0" stop-color="${c1}"/><stop offset=".5" stop-color="#FCDF49"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>`
    o += `<rect class="sl-rame" x="${x(t.km) - 22}" y="${y - 5}" width="44" height="10" rx="5" fill="url(#${gid})" stroke="var(--c-surface)" stroke-width="2"/>`
    o += `<text x="${x(t.km)}" y="${y - 16}" text-anchor="middle" style="font:600 12px var(--font-mono);fill:${couleur}">${t.nom}</text>`
  })
  el.innerHTML = o + "</svg>"
}

/* ------------------------------------------------------------------ Lottie --- */
const lecteurs = new Map()
function monterLottie() {
  if (!window.lottie) return
  const io = new IntersectionObserver((entrees) => {
    for (const e of entrees) {
      const anim = lecteurs.get(e.target)
      if (!anim) continue
      if (e.isIntersecting && !reduit && !e.target.dataset.vu) { e.target.dataset.vu = "1"; anim.goToAndPlay(0, true) }
      if (!e.isIntersecting && e.target.hasAttribute("data-loop")) anim.pause()
      else if (e.isIntersecting && e.target.hasAttribute("data-loop") && !reduit) anim.play()
    }
  }, { threshold: 0.4 })
  document.querySelectorAll("[data-lottie]").forEach((el) => {
    const anim = lottie.loadAnimation({
      container: el, renderer: "svg", loop: el.hasAttribute("data-loop"), autoplay: false,
      path: `${el.dataset.base ?? ""}lottie/${el.dataset.lottie}.json`,
      rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
    })
    anim.addEventListener("DOMLoaded", () => { if (reduit) anim.goToAndStop(anim.totalFrames - 1, true) })
    lecteurs.set(el, anim)
    io.observe(el)
  })
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-rejouer]")
    if (!b) return
    const cible = document.querySelector(b.dataset.rejouer)
    lecteurs.get(cible)?.goToAndPlay(0, true)
  })
}

/* ------------------------------------------------------ Barre et thème --- */
function monterBarre() {
  const nav = document.querySelector(".doc-barre nav")
  if (nav) {
    const ici = location.pathname.split("/").pop() || "index.html"
    const liens = [...nav.querySelectorAll("a")]
    liens.forEach((a) => a.getAttribute("href") === ici && a.setAttribute("aria-current", "page"))
    const ruban = document.createElement("span")
    ruban.className = "doc-ruban"
    nav.append(ruban)
    const placer = (a) => { if (!a) return; ruban.style.setProperty("--x", `${a.offsetLeft + 12}px`); ruban.style.setProperty("--w", `${a.offsetWidth - 24}px`) }
    const courant = () => nav.querySelector("[aria-current]")
    requestAnimationFrame(() => placer(courant()))
    liens.forEach((a) => { a.addEventListener("mouseenter", () => placer(a)); a.addEventListener("focus", () => placer(a)) })
    nav.addEventListener("mouseleave", () => placer(courant()))
  }
  const b = document.getElementById("theme")
  const appliquer = (sombre) => {
    document.documentElement.dataset.theme = sombre ? "dark" : "light"
    b?.setAttribute("aria-pressed", String(sombre))
    if (b) b.querySelector("span").textContent = sombre ? "Thème clair" : "Thème sombre"
  }
  // « ?sombre » ouvre la page directement en thème sombre (pratique pour partager un aperçu).
  if (new URLSearchParams(location.search).has("sombre")) appliquer(true)
  b?.addEventListener("click", () => appliquer(document.documentElement.dataset.theme !== "dark"))
}

monterLogos()
document.querySelectorAll("[data-aztec]").forEach((el) => (el.innerHTML = aztec(+el.dataset.aztec || 7)))
document.querySelectorAll("[data-schema-ligne]").forEach(schemaLigne)
monterIcones()
monterBarre()
monterGlisses()
monterDemos()
monterLottie()
window.dispatchEvent(new Event("charte:prete"))
