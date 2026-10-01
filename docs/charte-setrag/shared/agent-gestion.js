// Portail agent — écrans de gestion (portail de gestion, CDC § 8 : 15 écrans,
// plus le journal d'audit). Lecture dense, décisions explicites, un seul
// bouton principal par écran : celui de la décision attendue.
import { AUJOURDHUI } from "./agent-data.js"
import { btn, champ, ic, interrupteur, kpis, nb, onglets, panneau, segment, table, tag, tete, voie } from "./agent-outils.js"

const CHEF = "chef admin"
const ADMIN = "admin"
const m = (s) => `<span class="mono">${s}</span>`

/* ------------------------------------------------------------- Graphiques --- */
const RECETTES_14J = [5.1, 6.4, 7.9, 6.2, 5.8, 5.4, 6.1, 5.3, 6.6, 8.2, 6.4, 5.9, 5.6, 6.7]
const JOURS_14 = ["18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "1er"]
const barres = (valeurs, etiquettes, unite) => {
  const max = Math.max(...valeurs) * 1.1
  return `<div class="barres" style="--n:${valeurs.length}" role="img" aria-label="Recette nette par jour, en millions de XAF">${valeurs.map((v, i) => `<div class="${i === valeurs.length - 1 ? "ici" : ""}" style="--v:${v / max}" title="${etiquettes[i]} : ${String(v).replace(".", ",")} ${unite}"><b>${String(v).replace(".", ",")}</b></div>`).join("")}</div>
    <div class="barres-axe" style="--n:${valeurs.length}">${etiquettes.map((e) => `<span>${e}</span>`).join("")}</div>`
}

/** Courbe de prix d'un train selon l'anticipation (yield) : base en pointillé, prix appliqué en trait plein. */
function courbeYield() {
  const pts = [[60, 26100], [45, 26100], [30, 26100], [21, 29000], [14, 29000], [7, 32500], [3, 32500], [1, 34800], [0, 34800]]
  const W = 640, H = 220, g = 44, x = (j) => g + ((60 - j) / 60) * (W - g - 16), y = (p) => H - 28 - ((p - 22000) / 14000) * (H - 50)
  const d = pts.map(([j, p], i) => `${i ? "L" : "M"}${x(j).toFixed(1)} ${y(p).toFixed(1)}`).join(" ")
  let o = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Prix de l'Express 201 en 2e classe selon le nombre de jours avant le départ">`
  for (const p of [24000, 28000, 32000, 36000]) o += `<line class="grillage" x1="${g}" x2="${W - 16}" y1="${y(p)}" y2="${y(p)}"/><text class="axe" x="${g - 8}" y="${y(p) + 4}" text-anchor="end">${p / 1000}k</text>`
  for (const j of [60, 45, 30, 21, 14, 7, 1]) o += `<text class="axe" x="${x(j)}" y="${H - 8}" text-anchor="middle">J−${j}</text>`
  o += `<path class="zone" d="${d} L${x(0)} ${y(22000)} L${x(60)} ${y(22000)} Z" opacity=".6"/>`
  o += `<line class="base" x1="${g}" x2="${W - 16}" y1="${y(29000)}" y2="${y(29000)}"/><text class="axe" x="${W - 16}" y="${y(29000) - 6}" text-anchor="end">Tarif de base 29 000</text>`
  o += `<path class="trace" d="${d}"/>`
  o += `<circle class="pt" cx="${x(1)}" cy="${y(34800)}" r="5"/><text class="etiq" x="${x(1) - 8}" y="${y(34800) - 10}" text-anchor="end">Aujourd'hui · 34 800</text>`
  return `<div class="courbe">${o}</svg></div>`
}

/** Occupation d'une circulation : une ligne de cases par voiture. */
function occupation() {
  const v = [
    ["V1", "VIP", 24, 18, [2, 3], 0],
    ["V2", "1re classe", 48, 24, [], 4],
    ["V3", "2e classe", 64, 46, [], 0],
    ["V4", "2e classe", 64, 29, [0, 1, 62, 63], 0],
    ["V5", "2e classe", 64, 23, [], 8],
    ["V6", "2e classe", 64, 64, [], 0],
  ]
  return `<div class="occupation">${v.map(([n, c, tot, vend, bloq, quota]) => {
    let cases = ""
    for (let i = 0; i < tot; i++) cases += `<i class="${bloq.includes(i) ? "b" : i >= tot - quota ? "q" : i < vend ? "o" : ""}"></i>`
    return `<div class="v"><span><b>${n}</b><small>${c}</small></span><div class="cases" style="grid-template-columns:repeat(${tot > 32 ? 32 : tot}, 1fr)">${cases}</div><span>${vend} / ${tot}</span></div>`
  }).join("")}</div>
  <div class="legende" style="margin-top:var(--s-2)">
    <span><i style="width:14px;height:14px;border-radius:2px;background:var(--c-accent-line)"></i>Vendue</span>
    <span><i style="width:14px;height:14px;border-radius:2px;border:1px solid var(--c-line);background:var(--c-surface-sunk)"></i>Libre</span>
    <span><i style="width:14px;height:14px;border-radius:2px;background:repeating-linear-gradient(135deg,var(--c-warning-soft) 0 3px,var(--c-warning) 3px 4px)"></i>Bloquée (hachures)</span>
    <span><i style="width:14px;height:14px;border-radius:2px;border:1px solid var(--c-second);background:var(--c-second-soft)"></i>Quota agence</span>
  </div>`
}

const cycle = (etapes, ici) => `<div class="cycle">${etapes.map((e, i) => `${i ? `<i class="${i <= ici ? "fait" : ""}"></i>` : ""}<span class="${i < ici ? "fait" : i === ici ? "ici" : ""}">${e}</span>`).join("")}</div>`

/* ================================================================= Écrans === */
export const ECRANS_GESTION = [
  /* --------------------------------------------------- Tableau de bord --- */
  {
    route: "/gestion/tableau-de-bord", titre: "Tableau de bord", groupe: "Pilotage", pour: CHEF,
    rendu: () => `
      ${tete({ sur: `Réseau · ${AUJOURDHUI} · 13:18`, titre: "Tableau de bord", texte: "Chiffres consolidés des 22 gares, des agences et de la vente en ligne. Mis à jour en continu ; la comptabilité fait foi après clôture.", actions: segment(["Aujourd'hui", "7 jours", "30 jours", "Année"], 2) })}
      ${kpis([
        { libelle: "Recette nette · 30 j", icone: "coins", valeur: "184,6", unite: "M XAF", evol: ["hausse", "+6,2 % sur 30 j glissants"], fort: true },
        { libelle: "Billets vendus", icone: "ticket", valeur: "11 842", evol: ["hausse", "+3,8 %"] },
        { libelle: "Remplissage moyen", icone: "armchair", valeur: "71 %", voie: 0.71, evol: ["neutre", "objectif 75 %"] },
        { libelle: "Écarts de caisse", icone: "hand-coins", valeur: "3", unite: "à justifier", evol: ["veille", "−4 250 XAF au total"] },
      ])}
      ${panneau({
        titre: "Trains en circulation", icone: "route", sous: "Position estimée · COTRAF", fin: `${tag("ok", "4 à l'heure")}${tag("retard", "1 en retard")}`,
        corps: `<div class="ligne-schema" data-schema-ligne data-segment="" data-trains="96|E 201|ok|>;338|O 404|retard|<;470|E 202|ok|<;600|A 116|ok|<;35|O 403|ok|>"></div>`,
      })}
      <div class="g-lat">
        ${panneau({
          titre: "Recette nette par jour", icone: "chart-column", sous: "millions de XAF · 14 derniers jours", fin: `<a data-aller="/gestion/recettes">Détail des recettes</a>`,
          corps: barres(RECETTES_14J, JOURS_14, "M XAF"),
        })}
        ${panneau({
          titre: "À décider", icone: "circle-alert", brut: true,
          corps: `<div class="alertes">
            <div class="alerte veille">${ic("book-open")}<span><b>Livret « Fêtes 2026 » à valider</b><small>Soumis hier par C. Mba · 18 trains</small></span>${btn("Ouvrir", { taille: "btn-sm", aller: "/gestion/livrets" })}</div>
            <div class="alerte veille">${ic("hand-coins")}<span><b>3 écarts de caisse</b><small>Owendo G2, Booué G1, Moanda G1</small></span>${btn("Voir", { taille: "btn-sm", aller: "/gestion/recettes" })}</div>
            <div class="alerte danger">${ic("plug")}<span><b>Déversement SAGE du 29/09 rejeté</b><small>Compte analytique inconnu · 2 pièces</small></span>${btn("Voir", { taille: "btn-sm", aller: "/gestion/comptabilite" })}</div>
            <div class="alerte info">${ic("tags")}<span><b>Grille tarifaire 2026-2 soumise</b><small>Autorail +3 % · en attente d'approbation</small></span>${btn("Voir", { taille: "btn-sm", aller: "/gestion/tarifs" })}</div>
          </div>`,
        })}
      </div>
      <div class="g-2">
        ${panneau({
          titre: "Remplissage des dessertes de demain", icone: "armchair", sous: DEMAIN_L,
          corps: `<ol class="remplissage">
            ${[["Express 201", "Owendo → Franceville", 0.66], ["Express 202", "Franceville → Owendo", 0.81], ["Express 207", "Owendo → Franceville", 0.52], ["Omnibus 403", "Owendo → Franceville", 0.95], ["Autorail 115", "Owendo → Ndjolé", 0.44]].map(([t, tr, p]) => `<li><span>${t}<small>${tr}</small></span>${voie(p)}<b>${Math.round(p * 100)} %</b></li>`).join("")}
          </ol>`,
        })}
        ${panneau({
          titre: "Ventes par canal", icone: "store", sous: "30 jours · part de la recette", brut: true,
          corps: table(["Canal", "Part", ["Recette", "num"], ["Évolution", "num"]], [
            ["Guichets de gare", `${voie(0.58)}58 %`, "107,1 M", "+1,2 %"],
            ["Billetterie en ligne", `${voie(0.27)}27 %`, "49,8 M", "+14,6 %"],
            ["Agences accréditées", `${voie(0.11)}11 %`, "20,3 M", "−2,1 %"],
            ["Vente à bord", `${voie(0.04)}4 %`, "7,4 M", "+0,4 %"],
          ]),
        })}
      </div>`,
  },

  /* ------------------------------------------------------------ Livrets --- */
  {
    route: "/gestion/livrets", titre: "Livrets horaires", groupe: "Exploitation", pour: ADMIN,
    rendu: () => `
      ${tete({ sur: "Exploitation", titre: "Livrets horaires", texte: "Un livret fixe les trains réguliers d'une période. Il passe par quatre états ; seul un livret actif ouvre des places à la vente.", actions: btn("Nouveau livret", { icone: "plus" }) })}
      <div class="g-lat-g">
        ${panneau({
          brut: true,
          corps: table(["Livret", "État"], [
            ["Service annuel 2026<small>01/01 → 31/12 · 14 trains</small>", tag("ok", "Actif")],
            ["Rentrée 2026<small>01/09 → 30/11 · 4 trains en plus</small>", tag("ok", "Actif")],
            { cellules: ["Fêtes de fin d'année 2026<small>18/12 → 04/01 · 18 trains</small>", `<span id="lv-etat">${tag("attente", "À valider")}</span>`], classe: "on cliquable" },
            ["Travaux Lopé · novembre<small>03/11 → 21/11 · 2 suppressions</small>", tag("brouillon", "Brouillon")],
            ["Été 2026<small>01/07 → 31/08</small>", tag("neutre", "Expiré", "history")],
          ]),
        })}
        <div class="pile">
          ${panneau({
            titre: "Fêtes de fin d'année 2026", icone: "book-open", sous: "LV-2026-04",
            fin: cycle(["Brouillon", "À valider", "Actif", "Expiré"], 1),
            corps: `
              ${onglets(["Circulations <span class='compte'>18</span>", "Itinéraire détaillé", "Historique"])}
              ${table(["Train", "Jours", ["Départ", "num"], ["Arrivée", "num"], "Parcours", "Composition"], [
                [m("Express 201"), "Tous les jours", "07:40", "19:25", "Owendo → Franceville", "6 voitures · 328 pl."],
                [m("Express 202"), "Tous les jours", "07:30", "19:10", "Franceville → Owendo", "6 voitures · 328 pl."],
                [m("Express 207"), "Tous les jours", "14:05", "01:55 +1", "Owendo → Franceville", "6 voitures · 328 pl."],
                [m("Express 211"), `${tag("accent", "Nouveau", "plus")} 22, 23, 30/12`, "09:00", "20:45", "Owendo → Franceville", "8 voitures · 456 pl."],
                [m("Omnibus 403"), "Lun, mer, ven", "18:10", "07:30 +1", "Owendo → Franceville", "7 voitures · 428 pl."],
                [m("Autorail 115"), "Tous les jours", "16:30", "19:05", "Owendo → Ndjolé", "2 caisses · 96 pl."],
              ])}
              <div class="option">${ic("info")}<span><b>Chevauchement avec « Service annuel 2026 »</b><small>Du 18/12 au 31/12, ce livret remplace le service annuel. Les billets déjà vendus restent valables.</small></span></div>`,
            pied: `<span>Soumis le 30/09 à 17:42 par <b>C. Mba</b> · A-007</span><div class="fin"><button class="btn btn-danger" data-action="rejeter-livret">${ic("x")}Rejeter</button><button class="btn btn-primaire" data-action="valider-livret">${ic("check")}Valider le livret</button></div>`,
          })}
        </div>
      </div>`,
  },

  /* ------------------------------------------------------------- Trains --- */
  {
    route: "/gestion/trains", titre: "Trains et voitures", groupe: "Exploitation", pour: ADMIN,
    rendu: () => `
      ${tete({ sur: "Exploitation · matériel voyageurs", titre: "Trains et voitures", texte: "La composition d'un train fixe les places vendables. Modifier une voiture après ouverture à la vente déplace les voyageurs concernés : l'outil le signale avant d'enregistrer.", actions: btn("Nouveau train", { icone: "plus" }) })}
      <div class="g-lat-g">
        ${panneau({
          brut: true,
          corps: table(["Train", ["Places", "num"]], [
            { cellules: ["Express 201<small>Express · Owendo → Franceville</small>", "328"], classe: "on cliquable" },
            ["Express 202<small>Express · Franceville → Owendo</small>", "328"],
            ["Express 207<small>Express · Owendo → Franceville</small>", "328"],
            ["Omnibus 403<small>Omnibus · toutes gares</small>", "428"],
            ["Omnibus 404<small>Omnibus · toutes gares</small>", "428"],
            ["Autorail 115<small>Autorail · Owendo → Ndjolé</small>", "96"],
            ["Spécial 901<small>Affrètement · sur demande</small>", "—"],
          ]),
        })}
        <div class="pile">
          ${panneau({
            titre: "Express 201", icone: "train-front", sous: "Composition en vigueur depuis le 01/09/2026", fin: btn("Modifier la composition", { icone: "square-pen", taille: "btn-sm" }),
            corps: `
              <div class="compo">
                <div><span class="caisse-v loco">${ic("train-front")}</span>CC 401</div>
                <div><span class="caisse-v vip">V1</span><b>VIP</b>24 places</div>
                <div><span class="caisse-v p1">V2</span><b>1re</b>48 places</div>
                <div><span class="caisse-v">V3</span><b>2e</b>64 places</div>
                <div class="ici"><span class="caisse-v">V4</span><b>2e</b>64 places</div>
                <div><span class="caisse-v">V5</span><b>2e</b>64 places</div>
                <div><span class="caisse-v">V6</span><b>2e</b>64 places</div>
              </div>
              ${kpis([{ libelle: "Places assises", valeur: "328" }, { libelle: "Places debout", valeur: "0", evol: ["neutre", "interdites en Express"] }, { libelle: "Accès mobilité réduite", valeur: "4", evol: ["neutre", "V4 · 1B, 1D"] }], 3)}`,
          })}
          ${panneau({
            titre: "Voiture 4", icone: "armchair", sous: "2e classe · série B-2208",
            corps: `<div class="champs3">${champ("Rangées", "16")}${champ("Colonnes", "4 · 2 + 2")}${champ("Numérotation", "1A → 16D")}</div>
              <div class="option">${ic("file-spreadsheet")}<span><b>Importer un plan de voiture</b><small>Fichier CSV : rangée, colonne, numéro, type de place.</small></span>${btn("Importer", { taille: "btn-sm", icone: "download" })}</div>`,
          })}
        </div>
      </div>`,
  },

  /* ------------------------------------------------------------- Places --- */
  {
    route: "/gestion/places", titre: "Places et quotas", groupe: "Exploitation", pour: CHEF,
    rendu: () => `
      ${tete({ sur: "Exploitation · inventaire", titre: "Places et quotas", texte: "Bloquer une place la retire de tous les canaux, avec un motif. Un quota réserve des places à une agence jusqu'à une date ; au-delà, elles reviennent à la vente générale." })}
      <div class="filtres-l">
        <span class="saisie sm select">${ic("train-front")}<span>Express 201</span></span>
        <span class="saisie sm select">${ic("calendar")}<span>Ven. 2 oct. 2026</span></span>
        <span class="puce" aria-pressed="true">Toutes classes</span><span class="puce" aria-pressed="false">VIP</span><span class="puce" aria-pressed="false">1re</span><span class="puce" aria-pressed="false">2e</span>
        <span style="margin-left:auto">${btn("Bloquer des places", { genre: "primaire", icone: "lock" })}</span>
      </div>
      ${kpis([
        { libelle: "Vendues", icone: "ticket", valeur: "204", unite: "/ 328", voie: 204 / 328 },
        { libelle: "Libres", icone: "armchair", valeur: "112" },
        { libelle: "Bloquées", icone: "lock", valeur: "6", evol: ["neutre", "3 motifs"] },
        { libelle: "En quota agence", icone: "store", valeur: "12", evol: ["neutre", "libérées le 01/10 à 18:00"] },
      ])}
      ${panneau({ titre: "Occupation par voiture", icone: "layers", corps: occupation() })}
      <div class="g-2">
        ${panneau({
          titre: "Blocages", icone: "lock", brut: true,
          corps: table(["Places", "Motif", "Par", "Jusqu'au"], [
            [m("V1 · 3A, 3B"), "Réservation protocole", "S. Ndong · G-044", m("02/10 07:00")],
            [m("V4 · 1B, 1D"), "Aide à la mobilité", "Automatique", "Départ"],
            [m("V4 · 16C, 16D"), "Maintenance · tablette", "Atelier Owendo", m("15/10")],
          ]),
        })}
        ${panneau({
          titre: "Quotas des agences", icone: "store", brut: true,
          corps: table(["Agence", "Classe", ["Quota", "num"], ["Vendues", "num"], "Libération"], [
            ["Agence Libreville Centre", "1re", "4", "3", m("01/10 18:00")],
            ["Agence Libreville Centre", "2e", "8", "8", tag("ok", "Épuisé")],
            ["Agence Port-Gentil", "2e", "4", "1", m("01/10 18:00")],
          ]),
        })}
      </div>`,
  },

  /* ------------------------------------------------------------- Tarifs --- */
  {
    route: "/gestion/tarifs", titre: "Tarifs", groupe: "Commercial", pour: ADMIN,
    rendu: () => `
      ${tete({ sur: "Commercial · tarification", titre: "Tarifs", texte: "Base kilométrique par type de train, tranche de distance et classe (XAF/km, HT). Une grille se crée en brouillon, s'approuve par un second administrateur, puis s'applique à une date.", actions: btn("Importer une grille", { icone: "file-spreadsheet" }) })}
      ${onglets(["Grille kilométrique", "Réductions", "Bagages et colis", "Abonnements", "Arrondis"])}
      <div class="g-lat">
        ${panneau({
          titre: "Grille 2026-2", icone: "tags", sous: "application au 01/11/2026", fin: cycle(["Brouillon", "Soumise", "Approuvée", "Active"], 1),
          brut: true,
          corps: table(["Train · tranche", ["VIP", "num"], ["1re classe", "num"], ["2e classe", "num"]], [
            ["Express · 0–99 km", "72,38", "60,10", "47,51"],
            ["Express · 100 km et plus", "62,16", "54,93", "43,42"],
            ["Omnibus · 0–99 km", "—", "46,93", "37,54"],
            ["Omnibus · 100 km et plus", "—", "42,89", "34,31"],
            { cellules: ["Autorail · 0–99 km", "—", `<span class="avant">60,10</span>61,90`, `<span class="avant">37,54</span>38,67`], classe: "grille-tarif" },
            { cellules: ["Autorail · 100 km et plus", "—", `<span class="avant">54,93</span>56,58`, `<span class="avant">34,31</span>35,34`], classe: "grille-tarif" },
          ]).replace(/<tr class="grille-tarif"([^>]*)>(.*?)<\/tr>/gs, (x) => x.replace(/<td class="num">(<span class="avant">)/g, '<td class="num edite">$1')),
          pied: `<span>${ic("square-pen")} 4 valeurs modifiées · soumise par <b>C. Mba</b> le 28/09</span><div class="fin"><button class="btn btn-danger">${ic("x")}Refuser</button><button class="btn btn-primaire" data-toast="Grille 2026-2 approuvée · active le 01/11/2026">${ic("badge-check")}Approuver la grille</button></div>`,
        })}
        <div class="pile">
          ${panneau({
            titre: "Simulateur", icone: "calculator",
            corps: `
              <div class="champs2">${champ("Trajet", "Owendo → Franceville", { classe: "select" })}${champ("Train", "Express · 2e", { classe: "select" })}</div>
              <div class="recap"><div class="recap-corps">
                <div class="recap-l"><span>669 km × 43,42</span><span class="tabular">29 048</span></div>
                <div class="recap-l"><span>Arrondi · 300 km et plus, à la centaine</span><span class="tabular">29 000</span></div>
                <div class="recap-l"><span>Yield · forte demande vendredi ×1,12</span><span class="tabular">32 480</span></div>
                <div class="recap-total"><span>Prix affiché</span><span class="tabular">32 500 XAF</span></div>
              </div></div>
              <p class="doc-note">Le prix vendu le vendredi 2 octobre, au guichet comme en ligne.</p>`,
          })}
          ${panneau({
            titre: "Réductions en vigueur", icone: "badge-percent", brut: true,
            corps: table(["Catégorie", ["Remise", "num"]], [["Enfant 4–11 ans", "−50 %"], ["Groupe 10–49", "−30 %"], ["Groupe 50 et plus", "−45 %"], ["Militaire, ordre de mission", "−10 %"], [`Étudiant ${tag("brouillon", "À définir")}`, "—"]]),
          })}
        </div>
      </div>`,
  },

  /* -------------------------------------------------------------- Yield --- */
  {
    route: "/gestion/yield", titre: "Yield management", groupe: "Commercial", pour: ADMIN,
    rendu: () => `
      ${tete({ sur: "Commercial · tarification dynamique", titre: "Yield management", texte: "Le prix suit l'anticipation, le remplissage et la période. Chaque règle a un plancher et un plafond ; le guichet et la vente en ligne appliquent le même prix au même instant.", actions: btn("Nouvelle règle", { icone: "plus" }) })}
      ${kpis([
        { libelle: "Recette par siège · 30 j", icone: "armchair", valeur: "18 420", unite: "XAF", evol: ["hausse", "+7,9 % depuis le yield"] },
        { libelle: "Remplissage moyen", icone: "users", valeur: "71 %", voie: 0.71 },
        { libelle: "Recette par trajet", icone: "route", valeur: "6,04", unite: "M XAF", evol: ["hausse", "+4,1 %"] },
        { libelle: "Règles actives", icone: "sliders-horizontal", valeur: "3", unite: "/ 5" },
      ])}
      <div class="g-lat">
        ${panneau({
          titre: "Express 201 · 2e classe · départ du 3 oct.", icone: "trending-up", sous: "prix selon les jours avant départ",
          corps: `${courbeYield()}<div class="legende"><span><i style="width:18px;height:3px;background:var(--c-accent)"></i>Prix appliqué</span><span><i style="width:18px;border-top:2px dashed var(--c-ink-faint)"></i>Tarif de base</span></div>`,
        })}
        ${panneau({
          titre: "Quotas tarifaires", icone: "layers", sous: "part des places",
          corps: `<ol class="remplissage">
            <li><span>Prix bas<small>−10 %, non remboursable</small></span>${voie(0.2)}<b>20 %</b></li>
            <li><span>Standard<small>tarif de la grille</small></span>${voie(0.6)}<b>60 %</b></li>
            <li><span>Flexible<small>+10 %, échangeable</small></span>${voie(0.2)}<b>20 %</b></li>
          </ol><p class="doc-note">Quand le quota « prix bas » est vendu, le prix passe au palier suivant, quel que soit le canal.</p>`,
        })}
      </div>
      ${panneau({
        titre: "Règles", icone: "sliders-horizontal", brut: true,
        corps: table(["Règle", "Déclencheur", ["Coefficient", "num"], "Plancher · plafond", "Trains", "État", ""], [
          ["Anticipation", "Départ dans plus de 30 jours", "×0,90", "−10 % · —", "Express", tag("ok", "Active"), interrupteur(true)],
          ["Forte demande vendredi", "Départ le vendredi", "×1,12", "— · +20 %", "Express", tag("ok", "Active"), interrupteur(true)],
          ["Remplissage élevé", "Plus de 85 % vendus", "×1,20", "— · +20 %", "Tous", tag("ok", "Active"), interrupteur(true)],
          ["Dernière minute", "Moins de 35 % vendus à J−1", "×0,85", "−15 % · —", "Omnibus", tag("info", "En test", "flag"), interrupteur(false)],
          ["Fêtes de fin d'année", "Du 18/12 au 04/01", "×1,15", "— · +20 %", "Tous", tag("attente", "Programmée"), interrupteur(false)],
        ]),
      })}`,
  },

  /* ----------------------------------------------------- Points de vente --- */
  {
    route: "/gestion/points-de-vente", titre: "Points de vente", groupe: "Commercial", pour: CHEF,
    rendu: () => `
      ${tete({ sur: "Commercial · réseau de vente", titre: "Points de vente", texte: "Gares, agences accréditées et canaux en ligne. Chaque point a ses guichets, ses vendeurs et, pour les agences, un quota de places.", actions: btn("Accréditer une agence", { icone: "plus" }) })}
      ${kpis([
        { libelle: "Gares", icone: "map-pin", valeur: "22", evol: ["neutre", "19 ouvertes à la vente"] },
        { libelle: "Postes de vente", icone: "store", valeur: "89", evol: ["neutre", "27 voyageurs · 19 bagages · 19 colis"] },
        { libelle: "Caisses ouvertes", icone: "lock-open", valeur: "31", evol: ["neutre", "à 13:18"] },
        { libelle: "Agences accréditées", icone: "building-2", valeur: "6" },
      ])}
      ${panneau({
        brut: true,
        corps: `<div style="padding:var(--s-3) var(--s-4) 0">${onglets(["Tous <span class='compte'>30</span>", "Gares <span class='compte'>22</span>", "Agences <span class='compte'>6</span>", "En ligne <span class='compte'>2</span>"])}</div>` +
          table(["Code", "Point de vente", "Type", ["Postes", "num"], ["Caisses ouvertes", "num"], ["Recette · mois", "num"], "État"], [
            [m("OWE"), "Gare d'Owendo<small>PK 0</small>", "Gare", "14", "6", "58,2 M", tag("ok", "Ouverte")],
            [m("NDJ"), "Gare de Ndjolé<small>PK 182</small>", "Gare", "5", "2", "9,4 M", tag("ok", "Ouverte")],
            [m("BOO"), "Gare de Booué<small>PK 338</small>", "Gare", "6", "3", "12,1 M", tag("veille", "Écart à justifier")],
            [m("LAS"), "Gare de Lastourville<small>PK 484</small>", "Gare", "5", "2", "8,8 M", tag("ok", "Ouverte")],
            [m("MOA"), "Gare de Moanda<small>PK 619</small>", "Gare", "6", "3", "14,6 M", tag("veille", "Écart à justifier")],
            [m("FCV"), "Gare de Franceville<small>PK 669</small>", "Gare", "9", "4", "21,9 M", tag("ok", "Ouverte")],
            [m("OFF"), "Halte d'Offoué<small>PK 312</small>", "Halte", "0", "—", "—", tag("neutre", "Vente à bord seulement")],
            [m("AG-LBV1"), "Agence Libreville Centre<small>Quota 12 places / train</small>", "Agence", "3", "2", "11,4 M", tag("ok", "Accréditée")],
            [m("AG-POG"), "Agence Port-Gentil<small>Quota 4 places / train</small>", "Agence", "1", "0", "2,2 M", tag("annule", "Suspendue")],
            [m("WEB"), "Billetterie en ligne<small>setrag.ga · app mobile</small>", "En ligne", "—", "—", "49,8 M", tag("ok", "Ouverte")],
          ]),
      })}`,
  },

  /* ---------------------------------------------------------- Voyageurs --- */
  {
    route: "/gestion/voyageurs", titre: "Voyageurs et manifeste", groupe: "Commercial", pour: CHEF,
    rendu: () => `
      ${tete({ sur: "Commercial · extraction", titre: "Voyageurs et manifeste", texte: "Liste nominative d'une circulation, pour l'équipe de bord, la sûreté ou une réclamation. Chaque extraction est journalisée : qui, quand, quel filtre." })}
      <div class="filtres-l">
        <span class="saisie sm select">${ic("train-front")}<span>Express 201</span></span>
        <span class="saisie sm select">${ic("calendar")}<span>Jeu. 1er oct. 2026</span></span>
        <span class="saisie sm select">${ic("map-pin")}<span>Toutes gares</span></span>
        <span class="saisie sm large">${ic("user-search")}<span class="indice">Nom, n° de billet, téléphone</span></span>
        ${btn("Exporter le manifeste", { genre: "primaire", icone: "download" })}
      </div>
      ${panneau({
        titre: "298 voyageurs", icone: "users", sous: "Express 201 · parti d'Owendo à 07:42", fin: `${tag("ok", "241 contrôlés")}${tag("attente", "57 à contrôler")}`, brut: true,
        corps: table(["Voyageur", "Billet", "Trajet", "Place", "Téléphone", "Nationalité", "Contrôle"], [
          ["BOUSSOUGOU Linda<small>Adulte</small>", m("B-4790-1"), "Owendo → Lastourville", m("V3 · 2A"), m("+241 77 •• •• 21"), "Gabonaise", tag("ok", "07:58")],
          ["ELLA NGUEMA Paul<small>Adulte</small>", m("B-4801-1"), "Owendo → Franceville", m("V2 · 7C"), m("+241 66 •• •• 04"), "Gabonaise", tag("ok", "08:03")],
          ["MBINA Rodrigue<small>Adulte · 1 bagage</small>", m("B-4805-1"), "Owendo → Franceville", m("V4 · 9B"), m("+241 74 •• •• 87"), "Gabonaise", tag("ok", "08:05")],
          ["NZIENGUI Sylvie<small>Adulte</small>", m("B-4809-1"), "Owendo → Franceville", m("V1 · 3A"), m("+241 77 •• •• 50"), "Camerounaise", tag("ok", "07:51")],
          ["OBAME Hervé<small>Adulte</small>", m("B-4812-1"), "Owendo → Ndjolé", m("V3 · 2B"), m("+241 62 •• •• 13"), "Gabonaise", tag("ok", "07:52")],
          ["OKOUMA Esther<small>Enfant 4–11 ans</small>", m("B-4812-2"), "Owendo → Ndjolé", m("V3 · 2C"), "—", "Gabonaise", tag("attente", "À contrôler")],
          ["TCHIBINDA Marc<small>Adulte · ressaisie papier</small>", m("B-4799-1"), "Owendo → Franceville", m("V5 · 3D"), m("+241 65 •• •• 72"), "Congolaise", tag("attente", "À contrôler")],
        ]),
        pied: `<span>${ic("lock")} Téléphones masqués : le numéro complet s'affiche sur demande motivée, tracée au journal.</span>`,
      })}`,
  },

  /* ----------------------------------------------------------- Recettes --- */
  {
    route: "/gestion/recettes", titre: "Contrôle des recettes", groupe: "Finances", pour: CHEF,
    rendu: () => `
      ${tete({ sur: `Finances · journée du ${AUJOURDHUI}`, titre: "Contrôle des recettes", texte: "Chaque caisse clôturée remonte ici : attendu, constaté, écart. Un écart se justifie par le vendeur et se vise par le chef de gare avant le déversement comptable.", actions: segment(["Aujourd'hui", "Hier", "7 jours"], 0) })}
      ${kpis([
        { libelle: "Recette du jour", icone: "coins", valeur: "6,71", unite: "M XAF", fort: true },
        { libelle: "Caisses clôturées", icone: "lock", valeur: "18", unite: "/ 31" },
        { libelle: "Écarts à justifier", icone: "hand-coins", valeur: "3", evol: ["veille", "−4 250 XAF"] },
        { libelle: "Remboursements", icone: "rotate-ccw", valeur: "7", evol: ["neutre", "−168 750 XAF"] },
      ])}
      <div class="g-lat">
        ${panneau({
          brut: true,
          corps: table(["Point de vente · poste", "Vendeur", ["Attendu", "num"], ["Constaté", "num"], ["Écart", "num"], "État"], [
            { cellules: ["Owendo · guichet 2", "N. Moussavou<small>V-101</small>", "432 750", "432 250", "−500", tag("veille", "À viser")], classe: "on cliquable" },
            ["Booué · guichet 1", "J. Koumba<small>V-212</small>", "288 000", "285 000", "−3 000", tag("veille", "À justifier")],
            ["Moanda · guichet 1", "A. Ogandaga<small>V-318</small>", "156 500", "155 750", "−750", tag("veille", "À justifier")],
            ["Owendo · guichet 1", "F. Nguema<small>V-104</small>", "512 000", "512 000", "0", tag("ok", "Juste")],
            ["Franceville · guichet 3", "P. Mabiala<small>V-402</small>", "398 500", "398 500", "0", tag("ok", "Juste")],
            ["Ndjolé · guichet 1", "R. Mouele<small>V-150</small>", "94 000", "94 000", "0", tag("ok", "Juste")],
            ["Owendo · bagages 1", "L. Mickala<small>V-120</small>", "—", "—", "—", tag("neutre", "Ouverte", "lock-open")],
          ]),
        })}
        ${panneau({
          titre: "Owendo · guichet 2", icone: "hand-coins", sous: "clôturée à 13:24",
          corps: `
            <div class="ecart manque">${ic("circle-alert")}<span><b>Manque en caisse</b>Espèces</span><span class="montant">−500</span></div>
            <div><span class="champ-libelle">Justification de la vendeuse</span><p class="doc-note" style="margin-top:6px">« Pièce de 500 XAF rendue en trop à 11:58 sur V-OWE-4817 (bagage), constaté au recomptage. »</p></div>
            <dl class="fiche"><dt>Fonds d'ouverture</dt><dd class="mono">50 000</dd><dt>Encaissé</dt><dd class="mono">653 300</dd><dt>Remboursé</dt><dd class="mono">−29 250</dd><dt>Remis au coffre</dt><dd class="mono">432 250</dd></dl>
            <button class="btn btn-primaire btn-bloc" data-toast="Écart visé · la caisse part au déversement comptable">${ic("badge-check")}Viser l'écart</button>
            ${btn("Demander un recomptage", { genre: "fantome", taille: "btn-bloc" })}`,
        })}
      </div>`,
  },

  /* -------------------------------------------------------- Comptabilité --- */
  {
    route: "/gestion/comptabilite", titre: "Comptabilité", groupe: "Finances", pour: ADMIN,
    rendu: () => `
      ${tete({ sur: "Finances · interface SAGE X3 V12", titre: "Comptabilité", texte: "Chaque journée comptable produit le journal des ventes (état V65), déversé la nuit dans SAGE X3. Une pièce rejetée se corrige ici, puis se rejoue." })}
      <div class="bandeau-trafic arrondi">${ic("triangle-alert")}<span><b>Déversement du 29/09 rejeté par SAGE.</b> 2 pièces portent un compte analytique inconnu (agence Port-Gentil, suspendue le 28/09).</span></div>
      <div class="g-lat">
        ${panneau({
          titre: "Déversements", icone: "database", brut: true,
          corps: table(["Journée", ["Pièces", "num"], ["Ventes TTC", "num"], ["Remboursements", "num"], "Déversé", "État"], [
            [m("30/09"), "1 284", "6 482 300", "−97 500", m("01/10 02:10"), tag("ok", "Intégré")],
            { cellules: [m("29/09"), "1 197", "5 941 800", "−58 500", m("30/09 02:10"), tag("danger", "Rejeté · 2 pièces")], classe: "on" },
            [m("28/09"), "1 342", "6 693 100", "−130 000", m("29/09 02:10"), tag("ok", "Intégré")],
            [m("27/09"), "1 611", "8 204 650", "−32 500", m("28/09 02:10"), tag("ok", "Intégré")],
            [m("26/09"), "1 256", "6 390 000", "−65 000", m("27/09 02:10"), tag("ok", "Intégré")],
          ]),
        })}
        ${panneau({
          titre: "Pièces rejetées · 29/09", icone: "file-check",
          corps: `
            <dl class="fiche"><dt>Pièce</dt><dd class="mono">VEN-260929-0412</dd><dt>Point de vente</dt><dd>AG-POG</dd><dt>Compte analytique</dt><dd class="mono" style="color:var(--c-danger-ink)">CC-AG-POG ✕</dd><dt>Montant TTC</dt><dd class="mono">32 500</dd></dl>
            ${champ("Rattacher au centre de coût", "CC-COM-LBV · agences Estuaire", { classe: "select", aide: "Correction tracée au journal, avec l'ancienne valeur." })}
            <button class="btn btn-primaire btn-bloc" data-toast="Déversement du 29/09 rejoué · 1 197 pièces intégrées">${ic("refresh-cw")}Corriger et rejouer le 29/09</button>`,
        })}
      </div>
      ${panneau({
        titre: "Journal des ventes V65 · 30/09 · extrait", icone: "file-spreadsheet", fin: btn("Télécharger", { taille: "btn-sm", icone: "download" }), brut: true,
        corps: table(["Journal", "N° pièce", "Date", "Site", "Point de vente", "Compte", ["HT", "num"], ["TVA", "num"], ["CSS", "num"], ["TTC", "num"]], [
          [m("VEN"), m("VEN-260930-0001"), m("30/09"), "OWE", "OWE-G2", m("706100"), "27 542", "4 958", "0", "32 500"],
          [m("VEN"), m("VEN-260930-0002"), m("30/09"), "OWE", "OWE-G2", m("706100"), "13 771", "2 479", "0", "16 250"],
          [m("VEN"), m("VEN-260930-0003"), m("30/09"), "OWE", "OWE-B1", m("706300"), "2 740", "493", "0", "3 233"],
          [m("VEN"), m("VEN-260930-0004"), m("30/09"), "FCV", "WEB", m("706100"), "40 678", "7 322", "0", "48 000"],
        ]),
      })}`,
  },

  /* ------------------------------------------------------------ Rapports --- */
  {
    route: "/gestion/rapports", titre: "Rapports", groupe: "Finances", pour: CHEF,
    rendu: () => `
      ${tete({ sur: "Finances · reporting", titre: "Rapports", texte: "Les six états du cahier des charges, à la demande ou programmés. Même filtre partout : période, point de vente, train, produit." })}
      <div class="g-3">
        ${[
          ["receipt", "Ventes", "Par vente et opération, HT, TVA, CSS, TTC, moyen, vendeur."],
          ["armchair", "Traçabilité des places", "Blocages et déblocages, par agent, horodatés."],
          ["ticket", "Places vendues", "Par train, voiture, place ; téléphone et nationalité."],
          ["rotate-ccw", "Remboursements", "Annulations et remboursements, pénalités retenues."],
          ["calculator", "État de caisse", "Par caisse : opérations, montants, poids, écarts."],
          ["users", "Extraction voyageurs", "Liste nominative filtrée, pour l'exploitation et la sûreté."],
        ].map(([i, t, d]) => `<div class="kpi" style="gap:var(--s-2)"><span>${ic(i)}${t}</span><p class="doc-note">${d}</p><div style="display:flex;gap:var(--s-2);margin-top:var(--s-1)">${btn("Générer", { taille: "btn-sm", icone: "download" })}${btn("Programmer", { genre: "fantome", taille: "btn-sm" })}</div></div>`).join("")}
      </div>
      ${panneau({
        titre: "Rapports programmés", icone: "calendar-clock", brut: true,
        corps: table(["Rapport", "Fréquence", "Format", "Destinataires", "Dernier envoi", "État"], [
          ["État de caisse consolidé", "Quotidienne · 06:00", "PDF", "Chefs de gare (19)", m("01/10 06:00"), tag("ok", "Envoyé")],
          ["Ventes par canal", "Hebdomadaire · lundi", "XLSX", "Direction commerciale", m("28/09 06:00"), tag("ok", "Envoyé")],
          ["Remboursements", "Mensuelle · le 1er", "XLSX", "Contrôle des recettes", m("01/10 06:00"), tag("ok", "Envoyé")],
          ["Remplissage et yield", "Hebdomadaire · lundi", "CSV", "Responsable KPI", m("28/09 06:00"), tag("veille", "1 destinataire en échec")],
        ]),
      })}`,
  },

  /* ----------------------------------------------------------- Incidents --- */
  {
    route: "/gestion/incidents", titre: "Incidents et PV", groupe: "Supervision", pour: CHEF,
    rendu: () => `
      ${tete({ sur: "Supervision · remontées du terrain", titre: "Incidents et procès-verbaux", texte: "Ce que les contrôleurs et les gares signalent. Un procès-verbal non payé à bord s'encaisse au guichet ; un incident se clôt avec une cause.", actions: btn("Déclarer un incident", { icone: "plus" }) })}
      ${onglets(["Incidents <span class='compte'>4</span>", "Procès-verbaux <span class='compte'>12</span>"])}
      <div class="g-lat">
        ${panneau({
          brut: true,
          corps: table(["Réf.", "Nature", "Train · lieu", "Signalé", "État"], [
            { cellules: [m("INC-2026-0081"), "Lecteur de billets indisponible", "Express 201 · V3", m("01/10 08:14"), tag("attente", "En cours")], classe: "on cliquable" },
            [m("INC-2026-0080"), "Retard · croisement à Booué", "Omnibus 404", m("01/10 06:40"), tag("retard", "+45 min")],
            [m("PV-2026-0142"), "Voyageur sans titre", "Express 201 · V5", m("01/10 08:31"), tag("veille", "À encaisser")],
            [m("PV-2026-0141"), "Surclassement 2e → 1re", "Express 202 · V2", m("30/09 17:05"), tag("ok", "Soldé")],
            [m("INC-2026-0079"), "Climatisation en panne", "Express 207 · V1", m("30/09 15:22"), tag("ok", "Clos")],
          ]),
        })}
        ${panneau({
          titre: "INC-2026-0081", icone: "triangle-alert", sous: "Lecteur de billets indisponible",
          corps: `
            <dl class="fiche"><dt>Train</dt><dd>Express 201 · 1er oct.</dd><dt>Lieu</dt><dd>Entre Ntoum et Andem</dd><dt>Signalé par</dt><dd>R. Nzamba · C-044</dd><dt>Gravité</dt><dd>${tag("retard", "Moyenne")}</dd></dl>
            <ol class="chrono">
              <li><time>08:14</time><div><b>Signalé depuis le terminal</b><small>Terminal CT-07 · caméra ne lit plus</small></div></li>
              <li><time>08:20</time><div><b>Bascule sur saisie manuelle</b><small>Le contrôle continue par numéro de billet</small></div></li>
              <li><time>09:02</time><div><b>Terminal de relève demandé</b><small>À remettre en gare de Ndjolé</small></div></li>
            </ol>
            ${champ("Cause", "", { classe: "select", indice: "À renseigner pour clore" })}
            <button class="btn btn-primaire btn-bloc">${ic("check")}Clore l'incident</button>`,
        })}
      </div>`,
  },

  /* --------------------------------------------------------- Utilisateurs --- */
  {
    route: "/gestion/utilisateurs", titre: "Utilisateurs et droits", groupe: "Supervision", pour: ADMIN,
    rendu: () => `
      ${tete({ sur: "Supervision · habilitations", titre: "Utilisateurs et droits", texte: "Les comptes viennent de l'annuaire Eramet (Entra ID). Ici, on attribue un rôle et un point de vente ; les droits découlent du rôle, séparés en consulter, créer, valider, supprimer.", actions: btn("Inviter un utilisateur", { genre: "primaire", icone: "plus" }) })}
      ${onglets(["Comptes <span class='compte'>112</span>", "Matrice des droits", "Rôles <span class='compte'>14</span>"])}
      ${panneau({
        brut: true,
        corps: table(["Utilisateur", "Rôle", "Rattachement", "Second facteur", "Dernier accès", "État"], [
          [`<span style="display:flex;gap:10px;align-items:center"><span class="avatar">NM</span><span>Nadège Moussavou<small>V-101 · nadege.moussavou@setrag.ga</small></span></span>`, "Vendeuse guichet", "Owendo · guichet 2", tag("ok", "Application"), m("01/10 13:18"), tag("ok", "Actif")],
          [`<span style="display:flex;gap:10px;align-items:center"><span class="avatar">SN</span><span>Serge Ndong Obiang<small>G-044</small></span></span>`, "Chef de gare", "Owendo", tag("ok", "Clé FIDO2"), m("01/10 12:51"), tag("ok", "Actif")],
          [`<span style="display:flex;gap:10px;align-items:center"><span class="avatar">JK</span><span>Jean Koumba<small>V-212</small></span></span>`, "Vendeur guichet", "Booué · guichet 1", tag("ok", "SMS"), m("01/10 11:02"), tag("ok", "Actif")],
          [`<span style="display:flex;gap:10px;align-items:center"><span class="avatar">AE</span><span>Agence Libreville Centre<small>AG-LBV1 · 3 comptes</small></span></span>`, "Vendeur agence", "AG-LBV1", tag("ok", "Application"), m("01/10 09:47"), tag("ok", "Actif")],
          [`<span style="display:flex;gap:10px;align-items:center"><span class="avatar">GM</span><span>Guy Mapangou<small>V-133</small></span></span>`, "Vendeur guichet", "Owendo · bagages 1", tag("veille", "Non enrôlé"), m("—"), tag("attente", "Invité")],
          [`<span style="display:flex;gap:10px;align-items:center"><span class="avatar">PB</span><span>Patrice Bibang<small>V-098</small></span></span>`, "Vendeur guichet", "Lastourville", "—", m("12/09 18:30"), tag("annule", "Désactivé · annuaire")],
        ]),
      })}
      ${panneau({
        titre: "Matrice des droits · extrait", icone: "shield-check", brut: true,
        corps: `<table class="t matrice"><thead><tr><th>Ressource</th><th>Vendeur</th><th>Chef de gare</th><th>Contrôle recettes</th><th>Admin. fonctionnel</th></tr></thead><tbody>
          ${[
            ["Vendre, encaisser", "o", "o", "n", "n"],
            ["Rembourser", ["p", "ses ventes, avant départ"], "o", "n", "n"],
            ["Viser un écart de caisse", "n", "o", "o", "n"],
            ["Bloquer des places", "n", ["p", "sa gare"], "n", "o"],
            ["Créer une grille tarifaire", "n", "n", "n", "o"],
            ["Approuver une grille tarifaire", "n", "n", "n", ["p", "pas la sienne"]],
            ["Modifier un contrôle à bord", "n", "n", "n", "n"],
          ].map(([r, ...c]) => `<tr><td>${r}</td>${c.map((x) => { const [k, note] = Array.isArray(x) ? x : [x]; return `<td class="${k === "o" ? "oui" : k === "p" ? "partiel" : "non"}">${k === "o" ? `${ic("check")}<span class="sr">Oui</span>` : k === "p" ? `${ic("circle-dot")}<small>${note}</small>` : `${ic("minus")}<span class="sr">Non</span>`}</td>` }).join("")}</tr>`).join("")}
        </tbody></table>`,
        pied: `<span>${ic("lock")} « Modifier un contrôle à bord » n'est accordé à aucun rôle : un contrôle enregistré ne se modifie jamais.</span>`,
      })}`,
  },

  /* ------------------------------------------------------ Journal d'audit --- */
  {
    route: "/gestion/audit", titre: "Journal d'audit", groupe: "Supervision", pour: CHEF,
    rendu: () => `
      ${tete({ sur: "Supervision · traçabilité", titre: "Journal d'audit", texte: "Toute action sensible : qui, quand, depuis quel poste, avant et après. Le journal ne s'efface pas ; il part aussi vers le SIEM du groupe.", actions: btn("Exporter", { icone: "download" }) })}
      <div class="filtres-l">
        <span class="saisie sm large">${ic("search")}<span class="indice">Agent, matricule, objet (billet, tarif, place…)</span></span>
        <span class="saisie sm select">${ic("calendar")}<span>Aujourd'hui</span></span>
        <span class="puce" aria-pressed="true">Toutes actions</span><span class="puce" aria-pressed="false">Ventes</span><span class="puce" aria-pressed="false">Caisse</span><span class="puce" aria-pressed="false">Places</span><span class="puce" aria-pressed="false">Référentiels</span><span class="puce" aria-pressed="false">Droits</span>
      </div>
      ${panneau({
        brut: true,
        corps: table(["Horodatage", "Agent", "Action", "Objet", "Poste", "Détail"], [
          [m("01/10 13:24:07"), "N. Moussavou · V-101", "Clôture de caisse", m("CAISSE-OWE-G2-261001"), m("OWE-G2"), "Écart −500 XAF, justifié"],
          [m("01/10 13:21:40"), "N. Moussavou · V-101", "Vente", m("V-OWE-4821"), m("OWE-G2"), "2 billets · 48 750 XAF · espèces"],
          [m("01/10 11:20:13"), "N. Moussavou · V-101", "Remboursement", m("R-OWE-0041"), m("OWE-G2"), "29 250 XAF · pénalité 10 %"],
          [m("01/10 10:51:02"), "S. Ndong · G-044", "Blocage de places", m("E201 02/10 V1 3A-3B"), m("OWE-SUP"), "Réservation protocole"],
          [m("01/10 10:05:44"), "N. Moussavou · V-101", "Ressaisie papier", m("Souche 004204"), m("OWE-G2"), "→ B-4799-1"],
          [m("01/10 09:12:00"), "Système", "Bascule mode dégradé", m("OWE-G2"), m("—"), "Réseau perdu · carnet 0042"],
          [m("30/09 17:42:19"), "C. Mba · A-007", "Soumission livret", m("LV-2026-04"), m("SIEGE-12"), "Fêtes de fin d'année 2026"],
          [m("30/09 16:03:55"), "C. Mba · A-007", "Modification grille", m("TAR-2026-2"), m("SIEGE-12"), "Autorail 1re 0–99 km : 60,10 → 61,90"],
        ]),
      })}`,
  },

  /* ---------------------------------------------------------- Paramétrage --- */
  {
    route: "/gestion/parametrage", titre: "Paramétrage", groupe: "Supervision", pour: ADMIN,
    rendu: () => `
      ${tete({ sur: "Supervision · réglages", titre: "Paramétrage", texte: "Taxes, délais et règles appliqués par tous les canaux. Toute modification prend effet à une date et reste au journal d'audit." })}
      ${onglets(["Vente", "Taxes", "Remboursement", "Sécurité", "Impression", "Notifications"])}
      <div class="g-2">
        ${panneau({
          titre: "Vente et taxes", icone: "receipt", brut: true,
          corps: `<div class="reglages">
            <div class="reglage"><span><b>TVA</b><small>Billets, bagages, colis</small></span><span class="saisie sm" style="width:120px"><span class="tabular">18</span><span class="suffixe">%</span></span></div>
            <div class="reglage"><span><b>CSS · contribution spéciale de solidarité</b><small>Voyageurs exonérés, fret assujetti</small></span><span class="saisie sm" style="width:120px"><span class="tabular">0</span><span class="suffixe">%</span></span></div>
            <div class="reglage"><span><b>Tenue d'une place choisie</b><small>Avant encaissement, tous canaux</small></span><span class="saisie sm" style="width:120px"><span class="tabular">15</span><span class="suffixe">min</span></span></div>
            <div class="reglage"><span><b>Ouverture de la vente</b><small>Avant le départ</small></span><span class="saisie sm" style="width:120px"><span class="tabular">90</span><span class="suffixe">jours</span></span></div>
            <div class="reglage"><span><b>Tentatives de paiement mobile</b><small>Airtel Money, Moov Money</small></span><span class="saisie sm" style="width:120px"><span class="tabular">3</span></span></div>
          </div>`,
        })}
        ${panneau({
          titre: "Remboursement", icone: "rotate-ccw", brut: true,
          corps: `<div class="reglages">
            <div class="reglage"><span><b>Plus de 2 h avant le départ</b><small>Pénalité retenue</small></span><span class="saisie sm" style="width:120px"><span class="tabular">10</span><span class="suffixe">%</span></span></div>
            <div class="reglage"><span><b>Moins de 2 h avant le départ</b><small>Pénalité retenue</small></span><span class="saisie sm" style="width:120px"><span class="tabular">25</span><span class="suffixe">%</span></span></div>
            <div class="reglage"><span><b>Après le départ</b><small>Sauf train supprimé ou retard de plus de 2 h</small></span><span class="saisie sm" style="width:120px"><span>Aucun</span></span></div>
            <div class="reglage"><span><b>Billet contrôlé à bord</b><small>Invariant, non modifiable</small></span>${tag("neutre", "Jamais remboursé au guichet", "lock")}</div>
            <div class="reglage"><span><b>Motifs proposés</b><small>Liste au choix du vendeur</small></span>${btn("Modifier la liste", { taille: "btn-sm", icone: "square-pen" })}</div>
          </div>`,
        })}
        ${panneau({
          titre: "Sécurité", icone: "shield-check", brut: true,
          corps: `<div class="reglages">
            <div class="reglage"><span><b>Connexion par l'annuaire Eramet</b><small>Entra ID, SAML 2 ou OIDC</small></span>${interrupteur(true)}</div>
            <div class="reglage"><span><b>Second facteur obligatoire</b><small>Application, clé FIDO2 ou SMS</small></span>${interrupteur(true)}</div>
            <div class="reglage"><span><b>Code à usage unique en secours</b><small>Si l'annuaire ne répond pas</small></span>${interrupteur(true)}</div>
            <div class="reglage"><span><b>Session inactive</b><small>Verrouillage du poste</small></span><span class="saisie sm" style="width:120px"><span class="tabular">10</span><span class="suffixe">min</span></span></div>
          </div>`,
        })}
        ${panneau({
          titre: "Impression", icone: "printer", brut: true,
          corps: `<div class="reglages">
            <div class="reglage"><span><b>Billet de guichet</b><small>Thermique 80 mm · code Aztec signé</small></span>${btn("Aperçu", { taille: "btn-sm", aller: "/vente/confirmation" })}</div>
            <div class="reglage"><span><b>Étiquette bagage</b><small>Thermique 80 mm · 2 volets</small></span>${btn("Aperçu", { taille: "btn-sm", aller: "/vente/bagage" })}</div>
            <div class="reglage"><span><b>Mention sur duplicata</b><small>Imprimée en tête du billet</small></span><span class="saisie sm" style="width:160px"><span class="tabular">DUPLICATA</span></span></div>
          </div>`,
        })}
      </div>
      <div class="barre-vente" style="margin:0;border-radius:var(--r-md);border:1px solid var(--c-line)"><div class="info"><b>2 modifications non enregistrées</b>Tenue d'une place : 10 → 15 min · Pénalité moins de 2 h : 20 → 25 %</div><span style="margin-left:auto">${champ("", "Effet au 01/11/2026", { icone: "calendar" }).replace('<span class="champ-libelle"></span>', "")}</span><button class="btn btn-primaire" data-toast="Paramètres enregistrés · effet au 01/11/2026">${ic("check")}Enregistrer</button></div>`,
  },

  /* --------------------------------------------------------- Intégrations --- */
  {
    route: "/gestion/integrations", titre: "Intégrations", groupe: "Supervision", pour: ADMIN,
    rendu: () => `
      ${tete({ sur: "Supervision · services raccordés", titre: "Intégrations", texte: "Paiement, comptabilité, annuaire, SMS, terminaux de bord. Un service dégradé n'arrête pas la vente : il bascule sur un mode de secours, affiché ici." })}
      ${panneau({
        brut: true,
        corps: table(["Service", "Usage", "Dernier échange", ["File d'attente", "num"], ["Disponibilité · 30 j", "num"], "État", ""], [
          [`<b>SAGE X3 V12</b>`, "Déversement comptable V65", m("01/10 02:10"), "0", "100 %", `<span class="pastille-etat ok">Opérationnel</span>`, btn("Journal", { taille: "btn-sm", aller: "/gestion/comptabilite" })],
          [`<b>Airtel Money</b>`, "Paiement guichet et en ligne", m("01/10 13:02"), "0", "99,7 %", `<span class="pastille-etat ok">Opérationnel</span>`, btn("Tester", { taille: "btn-sm" })],
          [`<b>Moov Money</b>`, "Paiement guichet et en ligne", m("01/10 12:58"), "3", "97,2 %", `<span class="pastille-etat degrade">Dégradé · lenteurs</span>`, btn("Tester", { taille: "btn-sm" })],
          [`<b>Click&amp;Pay</b>`, "Lien de paiement, cartes", m("01/10 12:44"), "0", "99,9 %", `<span class="pastille-etat ok">Opérationnel</span>`, btn("Tester", { taille: "btn-sm" })],
          [`<b>Entra ID</b>`, "Connexion unique, annuaire", m("01/10 13:18"), "—", "100 %", `<span class="pastille-etat ok">Opérationnel</span>`, ""],
          [`<b>Passerelle SMS</b>`, "Billets, alertes voyageurs", m("01/10 13:21"), "12", "99,1 %", `<span class="pastille-etat ok">Opérationnel</span>`, ""],
          [`<b>Terminaux de bord</b>`, "Contrôle, synchronisation", m("01/10 13:10"), "47", "—", `<span class="pastille-etat degrade">3 terminaux hors réseau</span>`, btn("Voir", { taille: "btn-sm" })],
          [`<b>SIEM Eramet</b>`, "Journal d'audit", m("01/10 13:24"), "0", "100 %", `<span class="pastille-etat ok">Opérationnel</span>`, ""],
        ]),
        pied: `<span>${ic("info")} Les formes des pastilles (rond, triangle, carré) disent l'état autant que leur couleur.</span>`,
      })}`,
  },
]

const DEMAIN_L = "Ven. 2 oct."

/* ================================================================= Montage === */
export function monterGestion(racine, { toast }) {
  racine.addEventListener("click", (e) => {
    const a = e.target.closest("[data-action]")?.dataset.action
    if (a === "valider-livret") {
      document.getElementById("lv-etat").innerHTML = tag("ok", "Actif")
      e.target.closest(".panneau").querySelector(".cycle").outerHTML = cycle(["Brouillon", "À valider", "Actif", "Expiré"], 2)
      toast("Livret « Fêtes 2026 » validé · places ouvertes à la vente")
    } else if (a === "rejeter-livret") toast("Livret renvoyé en brouillon · motif demandé à l'auteur")
  })
}
