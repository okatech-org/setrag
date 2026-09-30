// Ruban, l'assistant SETRAG — le signe et ses états.
// Le signe est le ruban lui-même, posé en S, sans les rails : SETRAG pose la
// voie, Ruban roule dessus et accompagne le voyageur.

import { S_SEGMENTS, etapesOklch, segmentsD } from "./geo.js"
import { COULEURS } from "./marque.js"

export const NOM = "Ruban"
const S = segmentsD(S_SEGMENTS)
const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches
let uid = 0

/**
 * Le signe en SVG.
 * etat : repos · reflexion · ecoute · parole · hors-ligne
 * fond : clair (bleu SETRAG en tête) · sombre (bleu éclairci, lisible sur encre)
 */
export function signe({ etat = "repos", fond = "clair", titre = "" } = {}) {
  const id = `sg${++uid}`
  const fin = fond === "sombre" ? COULEURS.bleuClair : COULEURS.bleu
  // Le S descend de façon continue : un dégradé vertical suit donc le ruban.
  const stops = etapesOklch([COULEURS.vert, COULEURS.jaune, fin]).map(([o, c]) => `<stop offset="${o.toFixed(3)}" stop-color="${c}"/>`).join("")
  const a11y = titre ? `role="img" aria-label="${titre}"` : `aria-hidden="true"`
  return (
    `<svg class="signe" data-etat="${etat}" viewBox="8 -6 84 112" ${a11y}>` +
    `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2="97">${stops}</linearGradient></defs>` +
    `<path class="sg-piste" d="${S}" pathLength="1"/>` +
    `<path class="sg-ruban" d="${S}" pathLength="1" stroke="url(#${id})"/>` +
    `</svg>`
  )
}

/** Monte les signes déclarés par [data-signe="etat"] (+ data-fond, data-titre). */
export function monterSignes(racine = document) {
  racine.querySelectorAll("[data-signe]").forEach((el) => {
    el.innerHTML = signe({ etat: el.dataset.signe || "repos", fond: el.dataset.fond || "clair", titre: el.dataset.titre || "" })
  })
  animerVoix(racine)
}

/**
 * Écoute et parole : l'épaisseur du ruban suit le niveau de la voix. Ici la
 * voix est simulée ; dans l'app, c'est le niveau du micro (écoute) ou de la
 * synthèse vocale (parole), lissé sur 80 ms.
 */
const vivants = new Set()
const visibles = new WeakSet()
let io = null
let lance = false
const bruit = (t, k) => (Math.sin(t * 0.0071 + k) + Math.sin(t * 0.0133 + k * 2.1) * 0.6 + Math.sin(t * 0.0029 + k * 0.7) * 0.8) / 2.4
function boucle(t) {
  vivants.forEach((s) => {
    if (!s.isConnected) return vivants.delete(s)
    if (!visibles.has(s)) return
    const parole = s.dataset.etat === "parole"
    // Rafales de voix : l'enveloppe s'ouvre et se ferme comme des syllabes.
    const env = Math.max(0, Math.sin(t * (parole ? 0.0021 : 0.0016)) * 0.9 + 0.35)
    const niveau = Math.abs(bruit(t, parole ? 3 : 0)) * env
    const cible = 13 + niveau * (parole ? 7 : 6)
    const prec = +(s.dataset.w || 13)
    const w = prec + (cible - prec) * 0.18
    s.dataset.w = w.toFixed(2)
    s.style.setProperty("--w", w.toFixed(2))
  })
  requestAnimationFrame(boucle)
}
function animerVoix(racine) {
  io ??= new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? visibles.add(e.target) : visibles.delete(e.target))))
  racine.querySelectorAll(".signe[data-etat='ecoute'], .signe[data-etat='parole']").forEach((s) => {
    if (vivants.has(s)) return
    vivants.add(s)
    io.observe(s)
  })
  if (reduit || lance) return
  lance = true
  requestAnimationFrame(boucle)
}

/** Texte qui arrive au fil de l'eau, mot par mot, à vitesse de lecture. */
export function flux(el, { motsParSeconde = 14 } = {}) {
  const texte = el.dataset.texte ?? el.textContent
  el.dataset.texte = texte
  if (reduit) { el.textContent = texte; return }
  const mots = texte.split(/(\s+)/)
  el.textContent = ""
  let i = 0
  const pas = () => {
    if (i >= mots.length) return
    const span = document.createElement("span")
    span.className = "r-mot"
    span.textContent = mots[i++]
    el.append(span)
    setTimeout(pas, 1000 / motsParSeconde / (mots[i - 1].trim() ? 1 : 4))
  }
  pas()
}

monterSignes()
document.querySelectorAll("[data-flux]").forEach((el) => {
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { flux(el); io.disconnect() } }, { threshold: 0.6 })
  io.observe(el)
})
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-rejouer-flux]")
  if (b) flux(document.querySelector(b.dataset.rejouerFlux))
  // Changer l'état d'un signe de démonstration
  const c = e.target.closest("[data-changer-etat]")
  if (c) {
    const cible = document.querySelector(c.dataset.cible)
    cible.dataset.signe = c.dataset.changerEtat
    cible.innerHTML = signe({ etat: c.dataset.changerEtat, fond: cible.dataset.fond || "clair" })
    c.parentElement.querySelectorAll("[data-changer-etat]").forEach((x) => x.setAttribute("aria-pressed", String(x === c)))
    animerVoix(cible.parentElement)
  }
})
