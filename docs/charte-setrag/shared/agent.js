// Portail agent — prototype navigable : cadre, menu, routeur, raccourcis.
// Chargé AVANT shared/app.js : on pose tout le prototype dans la page, puis
// app.js monte logos, codes Aztec, schéma de ligne, rubans qui glissent et Lottie
// comme sur les autres pages de la charte.
import { AUJOURDHUI, HEURE, PROFILS } from "./agent-data.js"
import { ECRANS_GESTION, monterGestion } from "./agent-gestion.js"
import { ECRANS_GUICHET, entrerGuichet, monterGuichet, toucheGuichet } from "./agent-guichet.js"
import { ic } from "./agent-outils.js"

const ECRANS = [...ECRANS_GUICHET, ...ECRANS_GESTION]
const parRoute = new Map(ECRANS.map((e) => [e.route, e]))

/* Menu latéral : groupes et entrées, dans l'ordre du portail actuel. */
const MENU = [
  ["Guichet", [["/vente", "Accueil", "house"], ["/vente/billet", "Vendre un billet", "ticket", "B"], ["/vente/bagage", "Bagage", "luggage", "G"], ["/vente/colis", "Colis express", "package", "C"], ["/vente/operations", "Après-vente", "rotate-ccw", "R"], ["/vente/manuelles", "Ventes manuelles", "file-text", null, 2], ["/vente/caisse", "Caisse", "calculator"]]],
  ["Pilotage", [["/gestion/tableau-de-bord", "Tableau de bord", "layout-dashboard"]]],
  ["Exploitation", [["/gestion/livrets", "Livrets horaires", "book-open", null, 1], ["/gestion/trains", "Trains et voitures", "train-front"], ["/gestion/places", "Places et quotas", "armchair"]]],
  ["Commercial", [["/gestion/tarifs", "Tarifs", "tags", null, 1], ["/gestion/yield", "Yield", "trending-up"], ["/gestion/points-de-vente", "Points de vente", "store"], ["/gestion/voyageurs", "Voyageurs", "users"]]],
  ["Finances", [["/gestion/recettes", "Recettes", "hand-coins", null, 3], ["/gestion/comptabilite", "Comptabilité", "file-spreadsheet", null, 1], ["/gestion/rapports", "Rapports", "chart-column"]]],
  ["Supervision", [["/gestion/incidents", "Incidents et PV", "triangle-alert"], ["/gestion/utilisateurs", "Utilisateurs", "user-cog"], ["/gestion/audit", "Journal d'audit", "history"], ["/gestion/parametrage", "Paramétrage", "sliders-horizontal"], ["/gestion/integrations", "Intégrations", "plug"]]],
]
const pourDe = (route) => parRoute.get(route)?.pour ?? ""
const union = (routes) => [...new Set(routes.flatMap((r) => pourDe(r).split(" ")))].join(" ")

function menuHtml() {
  return MENU.map(([g, items]) => `
    <div class="ag-groupe" data-pour="${union(items.map((i) => i[0]))}">
      <h4>${g}</h4>
      ${items.map(([r, l, i, k, n]) => `<a href="#${r}" data-aller="${r}" data-menu="${r}" data-pour="${pourDe(r)}">${ic(i)}${l}${k ? `<kbd>${k}</kbd>` : n ? `<span class="compte" aria-label="${n} en attente">${n}</span>` : ""}</a>`).join("")}
    </div>`).join("") + `<span class="indicateur"></span>`
}

function cadreHtml() {
  const p = PROFILS.vendeur
  return `
  <div class="ag" data-role="vendeur" id="ag">
    <aside class="ag-lat">
      <div class="ag-lat-marque"><span data-logo="compact" data-titre="SETRAG · portail agent"></span><small>Agent</small></div>
      <nav class="ag-menu" aria-label="Menu du portail">${menuHtml()}</nav>
      <div class="ag-lat-pied"><b data-p="poste">${p.poste}</b><span class="direct">En ligne · synchronisé</span><span class="coupe">${ic("wifi-off")}Hors réseau · mode dégradé</span><span>Portail agent · v2.0 · maquette</span></div>
    </aside>
    <div class="ag-corps">
      <header class="ag-haut">
        <nav class="fil" aria-label="Fil d'Ariane" id="ag-fil"></nav>
        <span class="recherche-g">${ic("search")}Billet, vente, voyageur, train</span>
        <div class="droite">
          <a class="pastille-caisse" data-aller="/vente/caisse" data-pour="vendeur chef">${ic("lock-open")}Caisse ouverte<span class="tabular">653 300</span></a>
          <span class="horloge-l">${AUJOURDHUI}<b>${HEURE}</b></span>
          <span class="profil"><span class="avatar" data-p="initiales">${p.initiales}</span><span><span data-p="nom">${p.nom}</span><small data-p="role">${p.role} · ${p.matricule}</small></span></span>
        </div>
        <span class="filet"></span>
      </header>
      <div class="hors-ligne">${ic("wifi-off")}<span><b>Réseau coupé depuis 13:18.</b> Vente sur billets pré-imprimés (carnet 0042) ; la caisse et les ventes seront ressaisies au retour du réseau.</span><a data-aller="/vente/manuelles">Ventes manuelles</a></div>
      <main class="ag-page" id="ag-page">
        ${ECRANS.map((e) => `<section class="ag-ecran${e.flux ? " flux" : ""}" data-route="${e.route}" hidden>${e.rendu()}</section>`).join("")}
      </main>
    </div>
    <div class="voile" id="ag-voile" hidden></div>
    <div class="ag-toast" id="ag-toast" hidden><div class="toast">${ic("circle-check")}<span></span></div></div>
  </div>`
}

function planHtml() {
  const bloc = (titre, sous, ecrans) => `
    <section><h3>${ic(titre === "Guichet" ? "ticket" : "layout-dashboard")}${titre}<small>${sous}</small></h3>
    <ol>${ecrans.filter((e) => !e.cache).map((e, i) => `<li><a href="#${e.route}" data-aller="${e.route}" data-plan="${e.route}"><span class="n">${String(i + 1).padStart(2, "0")}</span>${e.sousTitre && e.sousTitre !== e.titre ? `${e.titre.replace("Vendre un billet", "Billet")} · ${e.sousTitre}` : e.titre}</a></li>`).join("")}</ol></section>`
  return bloc("Guichet", `portail de vente · ${ECRANS_GUICHET.length} écrans`, ECRANS_GUICHET) + bloc("Gestion", `portail de gestion · ${ECRANS_GESTION.length} écrans`, ECRANS_GESTION)
}

/* ============================================================ Montage === */
const racine = document.getElementById("ag-app")
const plan = document.getElementById("ag-plan")
racine.innerHTML = cadreHtml()
plan.innerHTML = planHtml()
const ag = document.getElementById("ag")
const page = document.getElementById("ag-page")
const voile = document.getElementById("ag-voile")
const url = document.getElementById("ag-url")
const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches

let courant = null
let pEtapes = 0

/* --- Toast et recouvrements --- */
let minuterie
function toast(texte) {
  const t = document.getElementById("ag-toast")
  t.querySelector("span").textContent = texte
  t.hidden = false
  t.style.animation = "none"; void t.offsetWidth; t.style.animation = ""
  clearTimeout(minuterie)
  minuterie = setTimeout(() => (t.hidden = true), 3400)
}
function ouvrir(html, tiroir = false) {
  voile.innerHTML = html
  voile.classList.toggle("tiroir", tiroir)
  voile.hidden = false
  voile.querySelector("[data-fermer], button")?.focus({ preventScroll: true })
}
function fermer() { voile.hidden = true; voile.innerHTML = "" }

/* --- Rôle affiché --- */
function choisirRole(role) {
  if (ag.dataset.role === role) return
  ag.dataset.role = role
  const p = PROFILS[role]
  ag.querySelector("[data-p='initiales']").textContent = p.initiales
  ag.querySelector("[data-p='nom']").textContent = p.nom
  ag.querySelector("[data-p='role']").textContent = `${p.role} · ${p.matricule}`
  ag.querySelector("[data-p='poste']").textContent = p.poste
  // Le sélecteur de rôle suit, même quand c'est un écran qui impose le rôle.
  const seg = document.getElementById("ag-roles")
  if (seg) {
    const choisi = seg.querySelector(`[data-role="${role}"]`)
    seg.querySelectorAll("[data-role]").forEach((s) => s.setAttribute("aria-pressed", String(s === choisi)))
    const ind = seg.querySelector(".indicateur")
    ind.style.setProperty("--x", `${choisi.offsetLeft}px`)
    ind.style.setProperty("--w", `${choisi.offsetWidth}px`)
  }
  placerIndicateur(true)
}

/* --- Ruban du menu --- */
function placerIndicateur(instant) {
  const menu = ag.querySelector(".ag-menu")
  const ind = menu.querySelector(".indicateur")
  const a = menu.querySelector("a[aria-current]")
  if (!a || !a.offsetParent) { ind.style.setProperty("--h", "0px"); return }
  if (instant) ind.style.transition = "none"
  ind.style.setProperty("--y", `${a.offsetTop + 8}px`)
  ind.style.setProperty("--h", `${a.offsetHeight - 16}px`)
  if (instant) { void ind.offsetWidth; ind.style.transition = "" }
  const haut = a.offsetTop - menu.scrollTop
  if (haut < 0 || haut > menu.clientHeight - a.offsetHeight) menu.scrollTo({ top: a.offsetTop - 80, behavior: reduit ? "auto" : "smooth" })
}

/* --- Routeur --- */
function afficher(route, { premier = false } = {}) {
  const e = parRoute.get(route)
  if (!e) return
  if (!e.pour.split(" ").includes(ag.dataset.role)) choisirRole(e.pour.split(" ")[0])
  fermer()
  ag.querySelectorAll(".ag-ecran").forEach((s) => (s.hidden = s.dataset.route !== route))
  const s = ag.querySelector(`.ag-ecran[data-route="${route}"]`)
  if (!premier && !reduit) { s.classList.remove("entre"); void s.offsetWidth; s.classList.add("entre") }
  ag.classList.toggle("plein", !!e.plein)
  url.textContent = `agent.setrag.ga${route}`
  document.getElementById("ag-fil").innerHTML = [e.groupe, e.titre, e.sousTitre].filter(Boolean).map((x, i, l) => (i === l.length - 1 ? `<b>${x}</b>` : `<span>${x}</span>${ic("chevron-right")}`)).join("")
  const m = e.menu ?? route
  ag.querySelectorAll(".ag-menu a").forEach((a) => (a.dataset.menu === m ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")))
  document.querySelectorAll("[data-plan]").forEach((a) => (a.dataset.plan === route ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")))
  page.scrollTop = 0
  placerIndicateur(premier)
  // Le filet de chargement traverse la barre du haut, une fois.
  const filet = ag.querySelector(".ag-haut .filet")
  if (!premier && !reduit) { filet.classList.add("actif"); setTimeout(() => filet.classList.remove("actif"), 520) }
  // Étapes du tunnel : le ruban part de l'étape quittée et glisse jusqu'à la nouvelle.
  const et = s.querySelector(".etapes[data-p]")
  if (et) {
    const r = et.querySelector(".ruban")
    const cible = +et.dataset.p
    r.style.transition = "none"; r.style.setProperty("--p", String(pEtapes)); void r.offsetWidth; r.style.transition = ""
    requestAnimationFrame(() => r.style.setProperty("--p", String(cible)))
    pEtapes = cible
  } else pEtapes = 0
  courant = route
  entrerGuichet(route)
}

function aller(route) {
  if (!parRoute.has(route)) return
  if (location.hash === `#${route}`) afficher(route)
  else location.hash = route
}
addEventListener("hashchange", () => {
  const r = decodeURIComponent(location.hash.slice(1))
  if (parRoute.has(r)) afficher(r)
})

/* --- Clics --- */
document.addEventListener("click", (e) => {
  const cible = e.target.closest("[data-aller], [data-toast], [data-fermer], .interrupteur, .puce, .t tr.cliquable, .s-table tr")
  if (!cible || !(ag.contains(cible) || plan.contains(cible))) return
  if (cible.matches(".interrupteur")) {
    const on = !cible.classList.contains("on")
    cible.classList.toggle("on", on); cible.setAttribute("aria-checked", String(on))
    return
  }
  if (cible.matches(".puce")) {
    const groupe = cible.parentElement
    if (groupe.classList.contains("filtres-l")) groupe.querySelectorAll(":scope > .puce").forEach((p) => p.setAttribute("aria-pressed", String(p === cible)))
    else cible.setAttribute("aria-pressed", String(cible.getAttribute("aria-pressed") !== "true"))
    return
  }
  if (cible.matches("tr") && !cible.dataset.aller) {
    cible.parentElement.querySelectorAll("tr").forEach((tr) => tr.classList.toggle("on", tr === cible))
    return
  }
  e.preventDefault()
  if (cible.hasAttribute("data-fermer") && !cible.dataset.aller) { fermer(); return }
  if (cible.dataset.aller) {
    if (plan.contains(cible)) document.getElementById("prototype").scrollIntoView({ behavior: reduit ? "auto" : "smooth", block: "start" })
    aller(cible.dataset.aller)
  }
  if (cible.dataset.toast) setTimeout(() => toast(cible.dataset.toast), cible.dataset.aller ? 260 : 0)
})
voile.addEventListener("click", (e) => { if (e.target === voile) fermer() })

/* --- Clavier : actif quand le pointeur ou le focus est dans le prototype --- */
const scene = document.getElementById("prototype")
let survol = false
scene.addEventListener("pointerenter", () => (survol = true))
scene.addEventListener("pointerleave", () => (survol = false))
const ROUTES_TOUCHES = { b: "/vente/billet", g: "/vente/bagage", c: "/vente/colis", r: "/vente/operations" }
document.addEventListener("keydown", (e) => {
  if (!(survol || scene.contains(document.activeElement))) return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === "Escape" && !voile.hidden) { fermer(); return }
  if (e.target.closest("input, select, textarea")) return
  if (!voile.hidden) return
  if (courant && toucheGuichet(courant, e.key)) { e.preventDefault(); return }
  if (e.key === "Enter" && !e.target.closest("button, a, [role=radio], tr")) {
    const b = ag.querySelector(`.ag-ecran[data-route="${courant}"] :is([data-v='suite'], [data-v='encaisser']):not(:disabled)`)
    if (b) { e.preventDefault(); b.click() }
    return
  }
  const r = ROUTES_TOUCHES[e.key.toLowerCase()]
  if (r && ag.dataset.role !== "admin" && !parRoute.get(courant)?.plein) { e.preventDefault(); aller(r) }
})

/* --- Commandes du prototype --- */
document.getElementById("ag-roles")?.addEventListener("click", (e) => {
  const s = e.target.closest("[data-role]")
  if (!s) return
  choisirRole(s.dataset.role)
  aller(PROFILS[s.dataset.role].accueil)
})
document.getElementById("ag-reseau")?.addEventListener("click", (e) => {
  const on = !ag.classList.contains("hors-reseau")
  ag.classList.toggle("hors-reseau", on)
  e.currentTarget.querySelector(".interrupteur").classList.toggle("on", on)
  e.currentTarget.setAttribute("aria-pressed", String(on))
  toast(on ? "Réseau coupé · le poste passe en mode dégradé" : "Réseau revenu · 2 ventes papier à ressaisir")
})
document.getElementById("ag-reinit")?.addEventListener("click", () => { location.hash = ""; location.reload() })
addEventListener("resize", () => placerIndicateur(true))

monterGuichet(ag, { aller, toast, ouvrir, fermer })
monterGestion(ag, { toast })

const depart = decodeURIComponent(location.hash.slice(1))
afficher(parRoute.has(depart) ? depart : "/vente", { premier: true })
if (parRoute.has(depart)) addEventListener("charte:prete", () => scene.scrollIntoView({ block: "start" }), { once: true })
// Les polices changent la hauteur des entrées du menu : on recale le ruban une fois chargées.
document.fonts?.ready.then(() => placerIndicateur(true))
