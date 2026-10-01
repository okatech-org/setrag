// Portail agent — petites fonctions de gabarit partagées par les écrans.
// Les icônes pointent directement dans le sprite (shared/icones.js) :
// elles restent valables quand un écran se redessine après une action.

export const ic = (nom, classe = "") => `<svg class="ic ${classe}" aria-hidden="true"><use href="#i-${nom}"/></svg>`

/** 48750 → « 48 750 » (espace fine insécable, comme l'app). */
export const nb = (n) => Math.round(n).toLocaleString("fr-FR")
export const xaf = (n) => `${nb(n)} XAF`
/** Montant signé pour les écarts et remboursements. */
export const signe = (n) => (n > 0 ? `+${nb(n)}` : n < 0 ? `−${nb(-n)}` : "0")

const TAGS = {
  ok: ["tag-ok", "circle-check"],
  retard: ["tag-retard", "clock-alert"],
  veille: ["tag-retard", "triangle-alert"],
  annule: ["tag-annule", "circle-x"],
  danger: ["tag-annule", "octagon-x"],
  info: ["tag-info", "info"],
  neutre: ["tag-neutre", null],
  accent: ["tag-accent", null],
  marque: ["tag-marque", null],
  attente: ["tag-neutre", "hourglass"],
  brouillon: ["tag-neutre", "square-pen"],
  bloque: ["tag-retard", "lock"],
}
/** Pastille : toujours une icône ou un mot, jamais la couleur seule. */
export const tag = (genre, texte, icone) => {
  const [classe, defaut] = TAGS[genre] ?? TAGS.neutre
  const i = icone === undefined ? defaut : icone
  return `<span class="tag ${classe}">${i ? ic(i) : ""}${texte}</span>`
}

/** En-tête d'écran : surtitre, titre, chapô, actions à droite. */
export const tete = ({ sur, titre, texte, actions = "" }) => `
  <header class="ag-tete">
    <div>${sur ? `<span class="sur">${sur}</span>` : ""}<h1>${titre}</h1>${texte ? `<p>${texte}</p>` : ""}</div>
    ${actions ? `<div class="actions">${actions}</div>` : ""}
  </header>`

export const btn = (texte, { genre = "secondaire", icone, aller, attr = "", taille = "" } = {}) =>
  `<button class="btn btn-${genre} ${taille}" ${aller ? `data-aller="${aller}"` : ""} ${attr}>${icone ? ic(icone) : ""}${texte}</button>`

/** Indicateur chiffré. `evol` : [sens, texte] avec sens hausse | baisse | veille | neutre. */
export const kpi = ({ libelle, icone, valeur, unite, evol, voie, fort }) => `
  <div class="kpi${fort ? " fort" : ""}">
    <span>${icone ? ic(icone) : ""}${libelle}</span>
    <b>${valeur}${unite ? `<small>${unite}</small>` : ""}</b>
    ${voie !== undefined ? `<span class="voie${fort ? " sur-encre" : ""}"><span class="ruban" style="--p:${voie}"></span></span>` : ""}
    ${evol ? `<em class="${evol[0]}">${evol[0] === "hausse" ? ic("arrow-up-right") : evol[0] === "baisse" ? ic("arrow-down-right") : evol[0] === "veille" ? ic("triangle-alert") : ""}${evol[1]}</em>` : ""}
  </div>`

export const kpis = (liste, n = liste.length) => `<div class="kpis" style="--n:${n}">${liste.map(kpi).join("")}</div>`

export const panneau = ({ titre, icone, sous, fin = "", corps, pied, brut = false, classe = "" }) => `
  <section class="panneau ${classe}">
    ${titre ? `<header class="panneau-tete"><h3>${icone ? ic(icone) : ""}${titre}</h3>${sous ? `<small>${sous}</small>` : ""}${fin ? `<div class="fin">${fin}</div>` : ""}</header>` : ""}
    ${brut ? corps : `<div class="panneau-corps">${corps}</div>`}
    ${pied ? `<footer class="panneau-pied">${pied}</footer>` : ""}
  </section>`

/** Tableau dense. `cols` : [libellé, classe?] ; `lignes` : tableaux de cellules HTML ou { cellules, attr, classe }. */
export const table = (cols, lignes, { classe = "", pied } = {}) => `
  <table class="t ${classe}">
    <thead><tr>${cols.map((c) => (Array.isArray(c) ? `<th class="${c[1]}">${c[0]}</th>` : `<th>${c}</th>`)).join("")}</tr></thead>
    <tbody>${lignes
      .map((l) => {
        const cellules = Array.isArray(l) ? l : l.cellules
        const attr = Array.isArray(l) ? "" : l.attr ?? ""
        const cl = Array.isArray(l) ? "" : l.classe ?? ""
        return `<tr class="${cl}" ${attr}>${cellules.map((c, i) => {
          const col = cols[i]
          const cc = Array.isArray(col) ? col[1] : ""
          return `<td class="${cc}">${c}</td>`
        }).join("")}</tr>`
      })
      .join("")}</tbody>
    ${pied ? `<tfoot><tr class="total">${pied.map((c, i) => `<td class="${Array.isArray(cols[i]) ? cols[i][1] : ""}">${c}</td>`).join("")}</tr></tfoot>` : ""}
  </table>`

/** Champ de formulaire figé (maquette) : libellé, valeur, aide. */
export const champ = (libelle, valeur, { icone, aide, suffixe, classe = "", indice, id } = {}) => `
  <label class="champ ${classe}">
    <span class="champ-libelle">${libelle}</span>
    <span class="saisie${classe.includes("select") ? " select" : ""}" ${id ? `id="${id}"` : ""}>${icone ? ic(icone) : ""}${indice ? `<span class="indice">${indice}</span>` : `<span>${valeur}</span>`}${suffixe ? `<span class="suffixe">${suffixe}</span>` : ""}</span>
    ${aide ? `<span class="champ-aide">${aide}</span>` : ""}
  </label>`

export const segment = (options, choisi = 0, attr = "") => `
  <div class="segment" data-glisse="span:not(.indicateur)" ${attr}>${options
    .map((o, i) => `<span aria-pressed="${i === choisi}">${o}</span>`)
    .join("")}<span class="indicateur"></span></div>`

export const onglets = (options, choisi = 0) => `
  <nav class="nav ag-onglets" data-glisse="a">${options
    .map((o, i) => `<a ${i === choisi ? 'aria-current="page"' : ""}>${o}</a>`)
    .join("")}<span class="indicateur"></span></nav>`

export const voie = (p, classe = "") => `<span class="voie ${classe}"><span class="ruban" style="--p:${p}"></span></span>`

export const interrupteur = (on) => `<span class="interrupteur${on ? " on" : ""}" role="switch" aria-checked="${on}" tabindex="0"></span>`
