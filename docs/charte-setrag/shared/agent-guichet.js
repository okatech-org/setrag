// Portail agent — écrans du guichet (portail de vente, CDC § 8 : 8 écrans).
// Chaque écran est un gabarit ; la vente en cours vit dans `vente` et les
// fonctions `maj*` redessinent seulement ce qui dépend d'elle.
import { AUJOURDHUI, BLOQUEES_V4, CATEGORIES, CLASSES, DEMAIN, DESSERTES, MOYENS, OCCUPEES_V4, OPERATIONS, VOITURES } from "./agent-data.js"
import { btn, champ, ic, interrupteur, kpis, nb, panneau, signe, table, tag, tete, voie, xaf } from "./agent-outils.js"

/* ============================================================ État de vente === */
const NOMS = [["NZÉ", "Aimée"], ["NZÉ", "Joël"], ["NZÉ", "Rose"], ["OYONO", "Martin"], ["IBINGA", "Carine"], ["NGOUA", "Fabrice"]]
export const vente = {
  desserte: "E201",
  classe: "p2",
  compte: { adulte: 1, enfant: 1, militaire: 0 },
  voiture: 4,
  places: ["12A", "12B"],
  actif: 0,
  moyen: "especes",
  recu: "50000",
}
const desserte = () => DESSERTES.find((d) => d.id === vente.desserte)
const prixClasse = () => desserte().classes[vente.classe]?.prix ?? 0
/** Voyageurs dans l'ordre de saisie : adultes, enfants, militaires. */
export function voyageurs() {
  const l = []
  for (const cat of ["adulte", "enfant", "militaire"]) for (let i = 0; i < vente.compte[cat]; i++) l.push(cat)
  return l.map((cat, i) => ({ cat, nom: NOMS[i % NOMS.length], prix: Math.round((prixClasse() * (1 - CATEGORIES[cat].remise)) / 50) * 50 }))
}
export const total = () => voyageurs().reduce((s, v) => s + v.prix, 0)
const resume = () => {
  const d = desserte()
  const n = voyageurs().length
  return `${DEMAIN} · <span class="tabular">${d.dep} → ${d.arr}</span> · ${n} voyageur${n > 1 ? "s" : ""}`
}

/* ============================================================== Pièces === */
const etapes = (i) => `
  <ol class="etapes" style="--n:4" data-p="${i / 3}"><span class="ruban" style="--p:${i / 3}"></span>
    ${["Trajet", "Places", "Voyageurs", "Encaissement"].map((e, k) => `<li class="etape${k < i ? " faite" : k === i ? " ici" : ""}"><span class="gare"></span>${e}</li>`).join("")}
  </ol>`

const tunnel = (titre, i, texte) => `
  <div class="tunnel-tete">
    <div class="ag-tete"><div><span class="sur">Guichet · vente de billet</span><h1>${titre}</h1>${texte ? `<p>${texte}</p>` : ""}</div></div>
    ${etapes(i)}
  </div>`

const barre = (suite, libelle, touche = "Entrée", retour) => `
  <div class="barre-vente">
    ${retour ? btn("Retour", { genre: "fantome", icone: "arrow-left", aller: retour }) : ""}
    <div class="info"><b data-v="titre"></b><span data-v="resume"></span></div>
    <div class="total">Total<b data-v="total"></b></div>
    <button class="btn btn-primaire btn-lg" data-aller="${suite}" data-v="suite">${libelle}<kbd>${touche}</kbd></button>
  </div>`

/* ================================================================ Écrans === */
export const ECRANS_GUICHET = [
  /* --------------------------------------------------------- Connexion --- */
  {
    route: "/connexion", titre: "Connexion", plein: true, pour: "vendeur chef admin",
    rendu: () => `
      <div class="ag-connexion">
        <div class="marque">
          <div class="lottie" data-lottie="logo-anime" aria-label="Logo SETRAG animé"></div>
          <p>Portail agent · vente, gestion et supervision</p>
        </div>
        <div class="forme">
          <div><span class="doc-sur">Espace réservé au personnel</span><h1>Ouvrir une session</h1></div>
          <div class="poste">${ic("store")}<span><b>Gare d'Owendo · guichet 2</b>Poste reconnu · imprimante TM-T20 prête</span></div>
          <button class="btn btn-primaire btn-lg btn-bloc" data-aller="/vente/ouverture">${ic("shield-check")}Se connecter avec le compte Eramet</button>
          <p class="champ-aide">Authentification unique Entra ID, second facteur obligatoire. Le compte suit l'annuaire : un départ désactive l'accès le jour même.</p>
          <div class="ou">ou, si l'annuaire ne répond pas</div>
          ${champ("Matricule ou e-mail", "nadege.moussavou@setrag.ga", { icone: "user" })}
          <button class="btn btn-secondaire btn-bloc" data-aller="/vente/ouverture">${ic("mail")}Recevoir un code à usage unique</button>
        </div>
      </div>`,
  },

  /* -------------------------------------------------- Ouverture de caisse --- */
  {
    route: "/vente/ouverture", titre: "Ouverture de caisse", groupe: "Guichet", menu: "/vente/caisse", pour: "vendeur chef",
    rendu: () => `
      ${tete({ sur: `Guichet · ${AUJOURDHUI}`, titre: "Ouvrir la caisse", texte: "Rien ne se vend tant que la caisse n'est pas ouverte : le fonds compté ici est le point de départ du rapprochement du soir." })}
      <div class="g-lat">
        ${panneau({
          titre: "Fonds de caisse", icone: "banknote", sous: "Compté devant le chef de gare",
          corps: `
            <table class="billetage">
              ${[[10000, 3], [5000, 2], [2000, 4], [1000, 2], [500, 0], [100, 0]].map(([c, q]) => `<tr><td>${nb(c)}</td><td><span class="qte"><button aria-label="Retirer">${ic("minus")}</button><output>${q}</output><button aria-label="Ajouter">${ic("plus")}</button></span></td><td>${nb(c * q)}</td></tr>`).join("")}
            </table>
            <div class="recap-total"><span>Fonds d'ouverture</span><span class="tabular">50 000 XAF</span></div>`,
        })}
        <div class="pile">
          ${panneau({
            titre: "Poste", icone: "store",
            corps: `<dl class="fiche"><dt>Point de vente</dt><dd>Gare d'Owendo</dd><dt>Guichet</dt><dd>2 · voyageurs</dd><dt>Journée comptable</dt><dd class="mono">01/10/2026</dd><dt>Vendeuse</dt><dd>N. Moussavou · V-101</dd><dt>Témoin</dt><dd>S. Ndong Obiang · G-044</dd></dl>`,
          })}
          ${panneau({
            titre: "Carnet de secours", icone: "file-text",
            corps: `<p class="doc-note">Billets pré-imprimés remis avec la caisse, pour vendre si le réseau tombe.</p><dl class="fiche"><dt>Carnet</dt><dd class="mono">0042</dd><dt>Souches</dt><dd class="mono">004201 → 004250</dd><dt>Déjà utilisées</dt><dd class="mono">0</dd></dl>`,
          })}
          <button class="btn btn-primaire btn-lg btn-bloc" data-aller="/vente" data-toast="Caisse ouverte · fonds de 50 000 XAF">${ic("lock-open")}Ouvrir la caisse</button>
        </div>
      </div>`,
  },

  /* ----------------------------------------------------- Accueil vendeur --- */
  {
    route: "/vente", titre: "Accueil", groupe: "Guichet", pour: "vendeur chef",
    rendu: () => `
      ${tete({ sur: `Guichet 2 · Gare d'Owendo · ${AUJOURDHUI}`, titre: "Bonjour Nadège", texte: "Caisse ouverte à 06:30 avec 50 000 XAF. Les chiffres se mettent à jour à chaque vente.", actions: btn("Rechercher une opération", { icone: "search", aller: "/vente/operations" }) })}
      <div class="bandeau-trafic arrondi">${ic("triangle-alert")}<span><b>Express 207 : départ à 14:30 au lieu de 14:05.</b> Prévenez les voyageurs au guichet ; les billets restent valables.</span></div>
      <div class="raccourcis">
        <a class="raccourci principal" data-aller="/vente/billet">${ic("ticket")}<b>Vendre un billet</b><small>Trajet, places, voyageurs, encaissement</small><kbd>B</kbd></a>
        <a class="raccourci" data-aller="/vente/bagage">${ic("luggage")}<b>Bagage</b><small>Rattaché à un billet, 0 à 30 kg</small><kbd>G</kbd></a>
        <a class="raccourci" data-aller="/vente/colis">${ic("package")}<b>Colis express</b><small>Jusqu'à 100 kg, tarif par zone</small><kbd>C</kbd></a>
        <a class="raccourci" data-aller="/vente/operations">${ic("rotate-ccw")}<b>Après-vente</b><small>Duplicata, annulation, remboursement</small><kbd>R</kbd></a>
      </div>
      ${kpis([
        { libelle: "Encaissé aujourd'hui", icone: "coins", valeur: "653 300", unite: "XAF", evol: ["neutre", "19 opérations"], fort: true },
        { libelle: "Billets émis", icone: "ticket", valeur: "21", evol: ["neutre", "dont 4 enfants"] },
        { libelle: "Espèces attendues", icone: "banknote", valeur: "432 750", unite: "XAF", evol: ["neutre", "fonds compris"] },
        { libelle: "Remboursements", icone: "rotate-ccw", valeur: "1", evol: ["neutre", "−29 250 XAF"] },
      ])}
      <div class="g-2">
        <div class="tableau">
          <div class="tableau-tete">${ic("train-front")}<b>Prochains départs d'Owendo</b><span class="horloge">13:18</span></div>
          <table>
            <thead><tr><th>Départ</th><th>Destination</th><th>2e</th><th>1re</th><th>État</th></tr></thead>
            <tbody>
              <tr><td class="h">14:05</td><td class="dest"><b>Franceville</b><small>Express 207</small></td><td class="q">112</td><td class="q">40</td><td><span class="tag tag-retard">${ic("clock-alert")}14:30</span></td></tr>
              <tr><td class="h">16:30</td><td class="dest"><b>Ndjolé</b><small>Autorail 115</small></td><td class="q">38</td><td class="q">9</td><td><span class="tag tag-ok">${ic("circle-check")}À l'heure</span></td></tr>
              <tr><td class="h">18:10</td><td class="dest"><b>Franceville</b><small>Omnibus 403 · toutes gares</small></td><td class="q">12</td><td class="q">3</td><td><span class="tag tag-ok">${ic("circle-check")}À l'heure</span></td></tr>
            </tbody>
          </table>
        </div>
        ${panneau({
          titre: "Dernières opérations", icone: "history", fin: `<a data-aller="/vente/operations">Tout voir</a>`, brut: true,
          corps: table(["N°", "Produit", ["Montant", "num"], ["Heure", "num"]], OPERATIONS.slice(0, 5).map((o) => ({ cellules: [`<span class="mono">${o.n}</span>`, `${o.produit}<small>${o.qui}</small>`, signe(o.montant), o.h], classe: "cliquable", attr: `data-aller="/vente/operations"` }))),
        })}
      </div>`,
  },

  /* ------------------------------------------------------ Vente : trajet --- */
  {
    route: "/vente/billet", titre: "Vendre un billet", sousTitre: "Trajet", groupe: "Guichet", pour: "vendeur chef", flux: true,
    rendu: () => `
      ${tunnel("Vendre un billet", 0)}
      <div class="recherche-guichet">
        ${champ("De", "Owendo", { icone: "map-pin" })}
        ${champ("À", "Franceville", { icone: "map-pin" })}
        ${champ("Date de départ", `${DEMAIN} 2026`, { icone: "calendar" })}
        <div class="champ"><span class="champ-libelle">Voyageurs</span>
          <div class="categories">
            ${[["adulte", "Adultes", "Adulte"], ["enfant", "Enfants 4–11 ans", "Enfant"], ["militaire", "Militaires", "Militaire"]].map(([c, l, u]) => `
              <span class="saisie" title="${l}"><span>${l}</span><span class="compteur"><button data-compte="${c}:-1" aria-label="Retirer : ${u.toLowerCase()}">${ic("minus")}</button><output data-v="n-${c}">0</output><button data-compte="${c}:1" aria-label="Ajouter : ${u.toLowerCase()}">${ic("plus")}</button></span></span>`).join("")}
          </div>
        </div>
        ${btn("Rechercher", { icone: "search" })}
      </div>
      <div class="dessertes" id="vt-dessertes"></div>
      <p class="doc-note">${ic("info")} Prix par adulte, taxes comprises. Enfant de 4 à 11 ans : −50 %. Les places restantes se lisent en direct ; une place choisie est tenue 15 minutes.</p>
      ${barre("/vente/billet/places", "Choisir les places")}`,
  },

  /* ------------------------------------------------------ Vente : places --- */
  {
    route: "/vente/billet/places", titre: "Vendre un billet", sousTitre: "Places", groupe: "Guichet", menu: "/vente/billet", pour: "vendeur chef", flux: true,
    rendu: () => `
      ${tunnel("Choisir les places", 1)}
      <div class="voitures" id="vt-voitures"></div>
      <div class="plan-tete">${ic("arrow-left")}Vers la locomotive<span>Queue du train</span>${ic("arrow-right")}</div>
      <div class="plan-voiture"><div class="sieges" id="vt-sieges"></div></div>
      <div class="legende">
        <span><span class="siege"></span>Libre</span>
        <span><span class="siege choisie">1</span>Choisie, avec le rang du voyageur</span>
        <span><span class="siege occupee">7</span>Vendue</span>
        <span><span class="siege bloquee">${ic("lock")}</span>Bloquée par la gestion</span>
      </div>
      <div class="g-lat">
        ${panneau({ titre: "Affectation", icone: "armchair", sous: "Choisissez le voyageur, puis sa place", fin: btn("Placer côte à côte", { icone: "users", taille: "btn-sm", attr: 'data-action="auto"' }), corps: `<div class="affectations" id="vt-affect"></div>` })}
        <div class="tenue">${ic("timer")}Places tenues encore <b data-rebours="14:32">14:32</b></div>
      </div>
      ${barre("/vente/billet/voyageurs", "Saisir les voyageurs", "Entrée", "/vente/billet")}`,
  },

  /* --------------------------------------------------- Vente : voyageurs --- */
  {
    route: "/vente/billet/voyageurs", titre: "Vendre un billet", sousTitre: "Voyageurs", groupe: "Guichet", menu: "/vente/billet", pour: "vendeur chef", flux: true,
    rendu: () => `
      ${tunnel("Voyageurs", 2, "Nom tel qu'il figure sur la pièce d'identité : le contrôleur le compare à bord. Le téléphone reçoit le billet par SMS.")}
      <div class="g-lat">
        <section class="panneau" id="vt-pax"></section>
        <div class="pile">
          ${panneau({
            titre: "Options", icone: "sliders-horizontal", brut: true,
            corps: `<div class="reglages">
              <div class="reglage"><span><b>Billet par SMS</b><small>Au numéro du premier voyageur</small></span>${interrupteur(true)}</div>
              <div class="reglage"><span><b>Imprimer au guichet</b><small>Un billet 80 mm par voyageur</small></span>${interrupteur(true)}</div>
              <div class="reglage"><span><b>Client conventionné</b><small>Facturer à une entreprise</small></span>${interrupteur(false)}</div>
            </div>`,
          })}
          <div class="tenue">${ic("timer")}Places tenues encore <b data-rebours="12:05">12:05</b></div>
        </div>
      </div>
      ${barre("/vente/encaissement", "Passer à l'encaissement", "Entrée", "/vente/billet/places")}`,
  },

  /* ------------------------------------------------------- Encaissement --- */
  {
    route: "/vente/encaissement", titre: "Vendre un billet", sousTitre: "Encaissement", groupe: "Guichet", menu: "/vente/billet", pour: "vendeur chef", flux: true,
    rendu: () => `
      ${tunnel("Encaissement", 3)}
      <div class="g-lat">
        <div class="pile">
          <div class="moyens-g" role="radiogroup" aria-label="Moyen de paiement" id="vt-moyens">
            ${MOYENS.map((m) => `<div class="moyen" role="radio" tabindex="0" aria-checked="${m.id === vente.moyen}" data-moyen="${m.id}"><span class="radio"></span><span>${m.libelle}<small>${m.aide}</small></span><kbd>${m.touche}</kbd></div>`).join("")}
          </div>
          <div id="vt-zone"></div>
        </div>
        <div class="recap" id="vt-recap"></div>
      </div>
      <div class="barre-vente">
        ${btn("Retour", { genre: "fantome", icone: "arrow-left", aller: "/vente/billet/voyageurs" })}
        <div class="info"><b data-v="titre"></b><span data-v="resume"></span></div>
        <div class="total">Total<b data-v="total"></b></div>
        <button class="btn btn-primaire btn-lg" data-action="encaisser" data-v="encaisser"></button>
      </div>`,
  },

  /* ------------------------------------------------------- Confirmation --- */
  {
    route: "/vente/confirmation", titre: "Vendre un billet", sousTitre: "Billets émis", groupe: "Guichet", menu: "/vente/billet", pour: "vendeur chef",
    rendu: () => `
      <div class="g-lat">
        <div class="pile">
          <div class="s-succes"><span class="rond">${ic("check")}</span><div><h2>Vente enregistrée</h2><p><span class="tabular">V-OWE-4821</span> · <span data-v="n-billets"></span> · caisse mise à jour</p></div></div>
          ${panneau({ titre: "Billets", icone: "ticket", brut: true, corps: `<div id="vt-billets"></div>` })}
          <div class="g-2" id="vt-confirm-recap"></div>
          <div class="s-actions">
            <button class="btn btn-primaire btn-lg" data-action="nouvelle">${ic("plus")}Nouvelle vente<kbd>N</kbd></button>
            ${btn("Ajouter un bagage", { icone: "luggage", aller: "/vente/bagage" })}
            ${btn("Renvoyer par SMS", { genre: "fantome", icone: "send" })}
          </div>
        </div>
        <div class="pile">
          <div class="imprimante">${ic("printer")}Imprimante TM-T20 · billet 1 sur <span data-v="n-voy"></span></div>
          <div class="ticket-therm" id="vt-ticket">
            <span data-logo="compact" data-theme="mono-encre"></span>
            <div id="vt-ticket-corps"></div>
          </div>
          ${btn("Réimprimer", { icone: "printer", attr: 'data-action="reimprimer"' })}
        </div>
      </div>`,
  },

  /* ------------------------------------------------------------- Bagage --- */
  {
    route: "/vente/bagage", titre: "Bagage", groupe: "Guichet", pour: "vendeur chef",
    rendu: () => `
      ${tete({ sur: "Guichet · bagage accompagné", titre: "Enregistrer un bagage", texte: "Un bagage suit un billet : on part du billet, on pèse, on étiquette. Au-delà de 30 kg, c'est un colis express." })}
      <div class="g-lat">
        <div class="pile">
          ${panneau({
            titre: "Billet du voyageur", icone: "ticket",
            corps: `<div class="filtres-l"><span class="saisie sm large focus mono">${ic("scan-line")}<span>B-4821-1</span></span>${btn("Scanner", { icone: "qr-code" })}</div>
              <div class="affectation"><span class="rang">1</span><span><b>NZÉ Aimée</b><small class="doc-note">Express 201 · ${DEMAIN} · Owendo → Franceville · V4 12A</small></span><span class="place">${tag("ok", "Valide")}</span></div>`,
          })}
          ${panneau({
            titre: "Pesée", icone: "weight",
            corps: `<div class="champs3">
                ${champ("Nombre de pièces", "2", { icone: "luggage" })}
                ${champ("Poids total", "23,5", { icone: "weight", suffixe: "kg", classe: "", aide: "Balance du guichet · lue automatiquement" })}
                ${champ("Nature", "Valise, sac", { classe: "select" })}
              </div>
              <div class="option">${ic("info")}<span><b>Franchise : 0 kg</b><small>Tout bagage enregistré en soute est payant (CDC, tarif bagages).</small></span></div>`,
          })}
        </div>
        <div class="pile">
          <div class="recap">
            <div class="recap-tete"><b>Owendo → Franceville</b><span>669 km · tranche 200 km et plus</span></div>
            <div class="recap-corps">
              <div class="recap-l"><span>Frais d'enregistrement</span><span class="tabular">700 XAF HT</span></div>
              <div class="recap-l"><span>Transport · 23,5 kg × 669 km</span><span class="tabular">2 040 XAF HT</span></div>
              <div class="recap-l"><span>TVA 18 %</span><span class="tabular">493 XAF</span></div>
              <div class="recap-total"><span>Total</span><span class="tabular">3 233 XAF</span></div>
            </div>
          </div>
          <div class="ticket-therm">
            <div class="c"><b>BAGAGE · OWE → FCV</b></div>
            <div class="gros">BG-4821-1</div>
            <div class="code" data-aztec="23"></div>
            <div class="l"><span>Express 201</span><span>${DEMAIN}</span></div>
            <div class="l"><span>2 pièces</span><span>23,5 kg</span></div>
            <div class="petit">Étiquette à poser sur la poignée · 1/2</div>
          </div>
          <button class="btn btn-primaire btn-lg btn-bloc" data-aller="/vente" data-toast="Bagage BG-4821-1 enregistré · 3 233 XAF">${ic("printer")}Encaisser et étiqueter</button>
        </div>
      </div>`,
  },

  /* -------------------------------------------------------------- Colis --- */
  {
    route: "/vente/colis", titre: "Colis express", groupe: "Guichet", pour: "vendeur chef",
    rendu: () => `
      ${tete({ sur: "Guichet · messagerie", titre: "Expédier un colis", texte: "Colis jusqu'à 100 kg, tarifé par zone de distance et palier de 10 kg. Le destinataire est prévenu par SMS à l'arrivée." })}
      <div class="g-lat">
        <div class="pile">
          ${panneau({ titre: "Expéditeur", icone: "user", corps: `<div class="champs3">${champ("Nom ou raison sociale", "Ets Mouloungui")}${champ("Téléphone", "+241 66 21 40 18", { icone: "phone" })}${champ("Pièce", "CNI 1-0457-221")}</div>` })}
          ${panneau({ titre: "Destinataire", icone: "map-pin", corps: `<div class="champs3">${champ("Nom", "Clémence Moukagni")}${champ("Téléphone", "+241 77 58 03 11", { icone: "phone" })}${champ("Gare d'arrivée", "Moanda", { classe: "select" })}</div>` })}
          ${panneau({
            titre: "Colis", icone: "package",
            corps: `<div class="champs3">${champ("Poids", "18", { icone: "weight", suffixe: "kg", aide: "Palier 10–20 kg" })}${champ("Contenu déclaré", "Pièces détachées", { classe: "select" })}${champ("Valeur déclarée", "150 000", { suffixe: "XAF", aide: "Sert au calcul de l'indemnité" })}</div>
              <div class="filtres-l"><span class="puce" aria-pressed="true">${ic("check")}Fragile</span><span class="puce" aria-pressed="false">Denrées</span><span class="puce" aria-pressed="false">Contre remboursement</span></div>`,
          })}
        </div>
        <div class="pile">
          <div class="recap">
            <div class="recap-tete"><b>Owendo → Moanda</b><span>619 km · zone 600–699 km · Omnibus 403</span></div>
            <div class="recap-corps">
              <div class="recap-l"><span>Palier 10–20 kg, zone 7</span><span class="tabular">7 800 XAF HT</span></div>
              <div class="recap-l"><span>Option fragile</span><span class="tabular">500 XAF HT</span></div>
              <div class="recap-l"><span>TVA 18 %</span><span class="tabular">1 494 XAF</span></div>
              <div class="recap-total"><span>Total</span><span class="tabular">9 794 XAF</span></div>
            </div>
          </div>
          <div class="option">${ic("clock")}<span><b>Disponible à Moanda</b><small>${DEMAIN} vers 04:40 · retrait sur pièce d'identité</small></span></div>
          <button class="btn btn-primaire btn-lg btn-bloc" data-aller="/vente" data-toast="Colis CX-2210 enregistré · 9 794 XAF">${ic("printer")}Encaisser et étiqueter</button>
        </div>
      </div>`,
  },

  /* -------------------------------------------------------- Après-vente --- */
  {
    route: "/vente/operations", titre: "Après-vente", groupe: "Guichet", pour: "vendeur chef",
    rendu: () => `
      ${tete({ sur: "Guichet · opérations", titre: "Après-vente", texte: "Retrouver une opération par numéro, nom ou téléphone. Un billet contrôlé à bord ne s'annule plus et ne se rembourse plus au guichet." })}
      <div class="filtres-l">
        <span class="saisie sm large">${ic("search")}<span class="indice">N° de vente, de billet, nom ou téléphone</span></span>
        <span class="saisie sm select">${ic("calendar")}<span>Aujourd'hui</span></span>
        <span class="puce" aria-pressed="true">Tous</span><span class="puce" aria-pressed="false">Billets</span><span class="puce" aria-pressed="false">Bagages</span><span class="puce" aria-pressed="false">Colis</span><span class="puce" aria-pressed="false">Remboursements</span>
      </div>
      <section class="panneau" id="vt-ops"></section>`,
  },

  /* ---------------------------------------------------- Ventes manuelles --- */
  {
    route: "/vente/manuelles", titre: "Ventes manuelles", groupe: "Guichet", pour: "vendeur chef",
    rendu: () => `
      ${tete({ sur: "Guichet · mode dégradé", titre: "Ressaisir les ventes papier", texte: "Pendant la coupure, chaque billet vendu sur souche pré-imprimée garde son numéro. On le ressaisit ici : il reçoit un numéro système, sans être réimprimé." })}
      ${kpis([
        { libelle: "Coupure réseau", icone: "wifi-off", valeur: "09:12 → 10:04", evol: ["neutre", "52 minutes"] },
        { libelle: "Souches utilisées", icone: "file-text", valeur: "6", unite: "/ 50", evol: ["neutre", "carnet 0042"] },
        { libelle: "Ressaisies", icone: "check-check", valeur: "4", unite: "/ 6", voie: 4 / 6 },
        { libelle: "Encaissé sur papier", icone: "banknote", valeur: "171 500", unite: "XAF" },
      ])}
      <div class="g-lat">
        ${panneau({
          titre: "Souches du carnet 0042", icone: "list-ordered", brut: true,
          corps: table(["Souche", "Heure papier", "Desserte", "Trajet · classe", ["Montant", "num"], "État"], [
            ["<span class='mono'>004201</span>", "<span class='mono'>09:18</span>", "Express 207 · 1er oct.", "Owendo → Booué · 2e", "23 000", `${tag("ok", "Ressaisie")}<small class="mono">B-4796-1</small>`],
            ["<span class='mono'>004202</span>", "<span class='mono'>09:26</span>", "Express 207 · 1er oct.", "Owendo → Franceville · 1re", "48 000", `${tag("ok", "Ressaisie")}<small class="mono">B-4797-1</small>`],
            ["<span class='mono'>004203</span>", "<span class='mono'>09:31</span>", "Omnibus 403 · 1er oct.", "Owendo → Ndjolé · 2e", "7 500", `${tag("ok", "Ressaisie")}<small class="mono">B-4798-1</small>`],
            ["<span class='mono'>004204</span>", "<span class='mono'>09:40</span>", "Express 201 · 2 oct.", "Owendo → Franceville · 2e", "32 500", `${tag("ok", "Ressaisie")}<small class="mono">B-4799-1</small>`],
            { cellules: ["<span class='mono'>004205</span>", "<span class='mono'>09:47</span>", "Express 201 · 2 oct.", "Owendo → Franceville · 2e", "32 500", tag("attente", "À ressaisir")], classe: "on" },
            ["<span class='mono'>004206</span>", "<span class='mono'>09:58</span>", "Express 201 · 2 oct.", "Owendo → Lastourville · 2e", "28 000", tag("attente", "À ressaisir")],
          ]),
        })}
        ${panneau({
          titre: "Souche 004205", icone: "square-pen",
          corps: `
            ${champ("Desserte", "Express 201 · ven. 2 oct. · 07:40", { classe: "select" })}
            <div class="champs2">${champ("De", "Owendo", { classe: "select" })}${champ("À", "Franceville", { classe: "select" })}</div>
            <div class="champs2">${champ("Classe", "2e classe", { classe: "select" })}${champ("Montant perçu", "32 500", { suffixe: "XAF" })}</div>
            ${champ("Voyageur", "ESSONO Blaise")}
            <div class="option">${ic("armchair")}<span><b>Place attribuée : V5 · 3C</b><small>La première place libre, pour que la place ne soit pas revendue.</small></span></div>
            <button class="btn btn-primaire btn-bloc" data-toast="Souche 004205 ressaisie · billet B-4822-1">${ic("check")}Enregistrer la ressaisie</button>`,
        })}
      </div>`,
  },

  /* --------------------------------------------------- Clôture de caisse --- */
  {
    route: "/vente/caisse", titre: "Caisse", groupe: "Guichet", pour: "vendeur chef",
    rendu: () => `
      ${tete({ sur: `Guichet 2 · journée du ${AUJOURDHUI}`, titre: "Clôturer la caisse", texte: "Le système connaît ce qui doit être en caisse ; vous comptez ce qui y est. Tout écart se justifie par écrit avant la clôture.", actions: btn("Imprimer l'état de caisse", { icone: "printer" }) })}
      ${kpis([
        { libelle: "Fonds d'ouverture", icone: "lock-open", valeur: "50 000", unite: "XAF" },
        { libelle: "Encaissements", icone: "arrow-down-to-line", valeur: "653 300", unite: "XAF", evol: ["neutre", "19 opérations"] },
        { libelle: "Remboursements", icone: "rotate-ccw", valeur: "−29 250", unite: "XAF", evol: ["neutre", "R-OWE-0041"] },
        { libelle: "Espèces attendues", icone: "banknote", valeur: "432 750", unite: "XAF", fort: true },
      ])}
      <div class="g-lat">
        <div class="pile">
          ${panneau({
            titre: "Par moyen de paiement", icone: "wallet", brut: true,
            corps: table(["Moyen", ["Opérations", "num"], ["Attendu", "num"], ["Constaté", "num"], "Source"], [
              ["Espèces", "11", "432 750", `<span data-v="compte-especes">432 250</span>`, "Comptage du billetage"],
              ["Airtel Money", "4", "143 000", "143 000", `${tag("ok", "Relevé opérateur")}`],
              ["Moov Money", "2", "23 500", "23 500", `${tag("ok", "Relevé opérateur")}`],
              ["Carte bancaire", "1", "65 000", "65 000", `${tag("ok", "Ticket TPE")}`],
              ["En compte", "1", "9 800", "9 800", "Bon n° 2026-118"],
            ]),
          })}
          ${panneau({
            titre: "Justification de l'écart", icone: "square-pen", sous: "Obligatoire dès 1 XAF d'écart",
            corps: `<label class="champ"><span class="saisie zone-texte" id="vt-justif"><span class="indice">Ex. : pièce de 500 XAF rendue en trop à 11:58 (V-OWE-4817).</span></span></label>`,
          })}
        </div>
        <div class="pile">
          ${panneau({
            titre: "Billetage", icone: "banknote", sous: "Espèces comptées",
            corps: `<table class="billetage" id="vt-billetage"></table><div class="recap-total"><span>Total compté</span><span class="tabular" data-v="compte-total"></span></div>`,
          })}
          <div id="vt-ecart"></div>
          <button class="btn btn-primaire btn-lg btn-bloc" data-action="cloturer">${ic("lock")}Clôturer la caisse</button>
        </div>
      </div>`,
  },
]

/* ================================================================ Dynamique === */
let aller = () => {}
let toast = () => {}

function majBarres() {
  const d = desserte()
  const n = voyageurs().length
  document.querySelectorAll("[data-v='titre']").forEach((el) => (el.textContent = `${d.train} · ${CLASSES[vente.classe]}`))
  document.querySelectorAll("[data-v='resume']").forEach((el) => (el.innerHTML = resume()))
  document.querySelectorAll("[data-v='total']").forEach((el) => (el.textContent = xaf(total())))
  for (const c of ["adulte", "enfant", "militaire"]) document.querySelectorAll(`[data-v='n-${c}']`).forEach((el) => (el.textContent = vente.compte[c]))
  document.querySelectorAll("[data-v='n-voy']").forEach((el) => (el.textContent = n))
  document.querySelectorAll("[data-v='n-billets']").forEach((el) => (el.textContent = `${n} billet${n > 1 ? "s" : ""}`))
  const places = vente.places.filter(Boolean).length
  document.querySelectorAll("[data-aller='/vente/billet/voyageurs'][data-v='suite']").forEach((b) => (b.disabled = places < n))
}

function majDessertes() {
  const el = document.getElementById("vt-dessertes")
  if (!el) return
  el.innerHTML = DESSERTES.map((d) => {
    const cases = ["p2", "p1", "vip"].map((c) => {
      const k = d.classes[c]
      if (!k) return `<div class="case-classe vide"><b>${CLASSES[c]}</b><small>${d.annulee ? "—" : "Pas de voiture"}</small></div>`
      const choisi = vente.desserte === d.id && vente.classe === c
      return `<button class="case-classe" aria-pressed="${choisi}" data-classe="${d.id}:${c}" ${k.reste < vata() ? "disabled" : ""}>
        <b>${CLASSES[c]}</b><span class="prix">${nb(k.prix)}</span>
        <small>${k.reste <= 10 ? `${ic("triangle-alert")}Plus que ` : ""}<span class="tabular">${k.reste}</span> place${k.reste > 1 ? "s" : ""} libre${k.reste > 1 ? "s" : ""}</small></button>`
    }).join("")
    return `<article class="desserte${d.annulee ? " annulee" : ""}">
      <div class="desserte-info"><div class="heures">${d.dep}${voie(vente.desserte === d.id ? 1 : 0)}${d.arr}${d.plus1 ? "<sup>+1</sup>" : ""}</div>
      <div class="meta">${tag("neutre", d.train, "train-front")}${tag(...d.etat)}<span>${d.duree} · ${d.arrets}</span></div></div>
      ${cases}</article>`
  }).join("")
}
const vata = () => voyageurs().length

function majVoitures() {
  const el = document.getElementById("vt-voitures")
  if (!el) return
  el.innerHTML = VOITURES.map((v) => {
    const dispo = v.classe === vente.classe && v.libres > 0
    const aide = v.classe !== vente.classe ? CLASSES[v.classe] : v.libres ? `${v.libres} libres` : "Complète"
    return `<button class="voiture-b" aria-pressed="${vente.voiture === v.n}" data-voiture="${v.n}" ${dispo ? "" : "disabled"}>Voiture ${v.n}<small>${aide}</small></button>`
  }).join("")
}

function majSieges() {
  const el = document.getElementById("vt-sieges")
  if (!el) return
  const v = VOITURES.find((x) => x.n === vente.voiture)
  let o = ""
  for (let r = 1; r <= v.rangs; r++) {
    for (const l of ["A", "B", "_", "C", "D"]) {
      if (l === "_") { o += `<span class="allee">${r}</span>`; continue }
      const p = `${r}${l}`
      const rang = vente.places.indexOf(p)
      if (rang >= 0) o += `<button class="siege choisie" data-place="${p}" aria-label="Place ${p}, voyageur ${rang + 1}">${rang + 1}</button>`
      else if (BLOQUEES_V4[p]) o += `<button class="siege bloquee" disabled aria-label="Place ${p}, bloquée : ${BLOQUEES_V4[p]}" title="${BLOQUEES_V4[p]}">${ic("lock")}</button>`
      else if (OCCUPEES_V4.has(p)) o += `<button class="siege occupee" disabled aria-label="Place ${p}, vendue">${p}</button>`
      else o += `<button class="siege" data-place="${p}" aria-label="Place ${p}, libre">${p}</button>`
    }
  }
  el.innerHTML = o
  const a = document.getElementById("vt-affect")
  if (a) {
    a.innerHTML = voyageurs().map((vy, i) => {
      const p = vente.places[i]
      const actif = i === vente.actif
      return `<button class="affectation${p ? "" : " attente"}" data-actif="${i}" style="${actif ? "border-color:var(--c-accent);box-shadow:inset 0 0 0 1px var(--c-accent)" : ""};background:none;text-align:left;cursor:pointer">
        <span class="rang">${i + 1}</span><span><b>${CATEGORIES[vy.cat].libelle}</b><small>${actif ? (p ? "Cliquez une autre place pour changer" : "Choisissez sa place") : "Cliquez pour placer ce voyageur"}</small></span>
        <span class="place">${p ? `V${vente.voiture} · ${p}` : "—"}</span></button>`
    }).join("")
  }
  majBarres()
}

function majPax() {
  const el = document.getElementById("vt-pax")
  if (!el) return
  el.innerHTML = `<header class="panneau-tete"><h3>${ic("users")}${voyageurs().length} voyageurs</h3><small>${desserte().train} · ${CLASSES[vente.classe]}</small></header>` +
    voyageurs().map((vy, i) => `
      <div class="pax">
        <span class="rang">${i + 1}</span>
        ${champ("Nom", vy.nom[0])}
        ${champ("Prénom", vy.nom[1])}
        <label class="champ"><span class="champ-libelle">Catégorie</span><span class="saisie select"><select data-cat="${i}">${Object.entries(CATEGORIES).filter(([k]) => k !== "groupe10").map(([k, c]) => `<option value="${k}" ${k === vy.cat ? "selected" : ""}>${c.libelle}</option>`).join("")}</select></span></label>
        ${i === 0 ? champ("Téléphone", "+241 77 12 34 56", { icone: "phone" }) : champ("Téléphone", "", { icone: "phone", indice: "Facultatif" })}
        <div class="pax-sous">${ic("armchair")}V${vente.voiture} · ${vente.places[i] ?? "sans place"}
          ${vy.cat === "enfant" ? tag("info", "−50 % · âge à vérifier sur pièce") : vy.cat === "militaire" ? tag("info", "−10 % · ordre de mission à présenter") : ""}
          <span class="tabular" style="margin-left:auto;color:var(--c-ink);font-weight:600">${xaf(vy.prix)}</span></div>
      </div>`).join("")
  majBarres()
}

function recapHtml() {
  const d = desserte()
  const t = total()
  const ht = Math.round(t / 1.18)
  return `
    <div class="recap-tete"><b>Owendo → Franceville</b><span>${DEMAIN} · ${d.dep} → ${d.arr} · ${d.train} · ${CLASSES[vente.classe]}</span></div>
    <div class="recap-corps">
      ${voyageurs().map((v, i) => `<div class="recap-l"><span>${v.nom[1]} ${v.nom[0]} · ${CATEGORIES[v.cat].libelle}${CATEGORIES[v.cat].remise ? ` −${CATEGORIES[v.cat].remise * 100} %` : ""}<br><small class="tabular">V${vente.voiture} · ${vente.places[i] ?? "—"}</small></span><span class="tabular">${nb(v.prix)}</span></div>`).join("")}
      <div class="recap-l"><span>Montant HT</span><span class="tabular">${nb(ht)}</span></div>
      <div class="recap-l"><span>TVA 18 %</span><span class="tabular">${nb(t - ht)}</span></div>
      <div class="recap-l"><span>CSS 0 %</span><span class="tabular">0</span></div>
      <div class="recap-total"><span>Total TTC</span><span class="tabular">${xaf(t)}</span></div>
    </div>`
}

function majEncaissement() {
  const r = document.getElementById("vt-recap")
  if (!r) return
  r.innerHTML = recapHtml()
  const z = document.getElementById("vt-zone")
  const t = total()
  const recu = +vente.recu || 0
  const m = MOYENS.find((x) => x.id === vente.moyen)
  if (vente.moyen === "especes") {
    const rendu = recu - t
    z.innerHTML = panneau({
      titre: "Espèces", icone: "banknote",
      corps: `
        <div class="coupures">${[["Montant exact", t], ["50 000", 50000], ["60 000", 60000], ["100 000", 100000]].map(([l, v]) => `<button data-recu="${v}">${l}</button>`).join("")}</div>
        <div class="g-2" style="align-items:stretch">
          <div class="rendu" style="grid-template-columns:1fr">
            <div><span>Reçu du client</span><b>${nb(recu)}</b></div>
            <div class="monnaie${rendu < 0 ? " manque" : ""}"><span>${rendu < 0 ? "Il manque" : "À rendre"}</span><b>${nb(Math.abs(rendu))}</b></div>
          </div>
          <div class="pave">${["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "⌫"].map((k) => `<button data-touche="${k}" class="${k === "⌫" ? "fonc" : ""}" aria-label="${k === "⌫" ? "Effacer" : k}">${k}</button>`).join("")}</div>
        </div>`,
    })
  } else if (vente.moyen === "airtel" || vente.moyen === "moov") {
    z.innerHTML = panneau({ titre: m.libelle, icone: "smartphone", corps: `${champ("Numéro du payeur", vente.moyen === "airtel" ? "+241 77 12 34 56" : "+241 62 40 19 88", { icone: "phone", aide: "Le client valide avec son code secret. La vente attend 3 minutes au plus, puis la place est relâchée." })}<div class="option">${ic("refresh-cw")}<span><b>3 tentatives au plus</b><small>Paramétrage réseau · au-delà, proposer un autre moyen</small></span></div>` })
  } else if (vente.moyen === "carte") {
    z.innerHTML = panneau({ titre: "Carte bancaire", icone: "credit-card", corps: `<div class="option">${ic("send")}<span><b>Montant envoyé au TPE : ${xaf(t)}</b><small>Le client présente sa carte Visa ou Mastercard. Le ticket TPE sert au rapprochement du soir.</small></span></div>` })
  } else if (vente.moyen === "clickpay") {
    z.innerHTML = panneau({ titre: "Click&Pay", icone: "send", corps: `${champ("Envoyer le lien au", "+241 77 12 34 56", { icone: "phone" })}<p class="doc-note">Le client paie depuis son téléphone ; la vente se confirme d'elle-même.</p>` })
  } else {
    z.innerHTML = panneau({ titre: "En compte", icone: "building-2", corps: `<div class="champs2">${champ("Client conventionné", "COMILOG · missions", { classe: "select" })}${champ("Bon de commande", "BC-2026-0412")}</div><p class="doc-note">Facturé en fin de mois. Plafond restant : 1 250 000 XAF.</p>` })
  }
  const b = document.querySelector("[data-v='encaisser']")
  const court = vente.moyen === "especes" && recu < t
  b.disabled = court
  b.innerHTML = `${ic(m.icone)}${court ? "Montant reçu insuffisant" : vente.moyen === "airtel" || vente.moyen === "moov" ? `Envoyer la demande · ${xaf(t)}` : `Encaisser ${xaf(t)}`}<kbd>Entrée</kbd>`
  majBarres()
}

async function majConfirmation() {
  const vs = voyageurs()
  const d = desserte()
  const { aztec } = await import("./app.js")
  document.getElementById("vt-billets").innerHTML = table(["Billet", "Voyageur", "Place", ["Prix", "num"], "État"], vs.map((v, i) => [
    `<span class="mono">B-4821-${i + 1}</span>`, `${v.nom[1]} ${v.nom[0]}<small>${CATEGORIES[v.cat].libelle}</small>`, `<span class="mono">V${vente.voiture} · ${vente.places[i] ?? "—"}</span>`, nb(v.prix), i === 0 ? tag("ok", "Imprimé", "printer") : tag("attente", "En file"),
  ]))
  const m = MOYENS.find((x) => x.id === vente.moyen)
  const recu = +vente.recu || 0
  document.getElementById("vt-confirm-recap").innerHTML = `
    <div class="kpi"><span>${ic(m.icone)}${m.libelle}</span><b>${nb(total())}<small>XAF</small></b>${vente.moyen === "especes" ? `<em>Reçu ${nb(recu)} · rendu ${nb(recu - total())}</em>` : `<em>${vente.moyen === "compte" ? "Bon BC-2026-0412" : "Transaction AM-88213094"}</em>`}</div>
    <div class="kpi"><span>${ic("send")}SMS</span><b style="font-size:18px">+241 77 12 34 56</b><em class="hausse">${ic("check")}Billets envoyés</em></div>`
  const v = vs[0]
  document.getElementById("vt-ticket-corps").innerHTML = `
    <div style="display:grid;gap:10px">
      <div class="c">SETRAG · Transgabonais<br>Gare d'Owendo · guichet 2</div><hr>
      <div class="l"><b>${d.train}</b><span>${DEMAIN} 2026</span></div>
      <div class="gros">${d.dep} OWE → FCV ${d.arr}</div>
      <div class="l"><span>Voiture ${vente.voiture} · place ${vente.places[0] ?? "—"}</span><span>${CLASSES[vente.classe]}</span></div>
      <div class="l"><span>${v.nom[0]} ${v.nom[1]}</span><span>${CATEGORIES[v.cat].libelle}</span></div>
      <div class="code">${aztec(41)}</div>
      <div class="l"><span>B-4821-1</span><b>${xaf(v.prix)}</b></div>
      <div class="l"><span>dont TVA 18 %</span><span>${nb(v.prix - Math.round(v.prix / 1.18))}</span></div><hr>
      <div class="petit">V-OWE-4821 · ${AUJOURDHUI} 13:21 · V-101<br>Billet nominatif, valable sur ce train uniquement.</div>
    </div>`
  const t = document.getElementById("vt-ticket")
  t.classList.remove("imprime"); void t.offsetWidth; t.classList.add("imprime")
  majBarres()
}

/* --- Opérations et après-vente --- */
function majOps() {
  const el = document.getElementById("vt-ops")
  if (!el) return
  el.innerHTML = table(["N°", "Heure", "Produit", "Desserte · trajet", "Client", "Moyen", ["Montant", "num"], "État"], OPERATIONS.map((o, i) => ({
    cellules: [`<span class="mono">${o.n}</span>`, `<span class="mono">${o.h}</span>`, o.produit, `${o.desserte}<small>${o.trajet}</small>`, o.qui, o.moyen, signe(o.montant), tag(...o.etat)],
    classe: "cliquable", attr: `data-op="${i}" tabindex="0"`,
  })))
}

function tiroirOp(i) {
  const o = OPERATIONS[i]
  const billet = o.produit === "Billet"
  const bloque = o.controle
  return `
    <div class="dialogue" role="dialog" aria-label="Opération ${o.n}">
      <div class="dialogue-tete"><div><h3 class="tabular">${o.n}</h3><p>${o.produit} · ${o.desserte}</p></div><button class="btn btn-fantome btn-icone" data-fermer aria-label="Fermer">${ic("x")}</button></div>
      <div class="dialogue-corps" style="align-content:start">
        <div>${tag(...o.etat)}</div>
        <dl class="fiche">
          <dt>Client</dt><dd>${o.qui}</dd><dt>Trajet</dt><dd>${o.trajet}</dd>${o.place ? `<dt>Place</dt><dd class="mono">${o.place}</dd>` : ""}
          <dt>Montant</dt><dd class="mono">${xaf(o.montant)}</dd><dt>Moyen</dt><dd>${o.moyen}</dd><dt>Vendu par</dt><dd>N. Moussavou · V-101</dd>
        </dl>
        <h4 class="champ-libelle">Historique</h4>
        <ol class="chrono">
          <li><time>${o.h}</time><div><b>${o.montant < 0 ? "Remboursement" : "Vente"} enregistrée</b><small>Guichet 2 · Gare d'Owendo</small></div></li>
          ${o.montant > 0 && billet ? `<li><time>${o.h}</time><div><b>Billet imprimé et envoyé par SMS</b><small>Imprimante TM-T20</small></div></li>` : ""}
          ${bloque ? `<li><time>07:52</time><div><b>Contrôlé à bord</b><small>Express 201 · terminal CT-07 · entre Owendo et Ntoum</small></div></li>` : ""}
        </ol>
        ${bloque ? `<div class="tenue" style="background:var(--c-info-soft);color:var(--c-info-ink)">${ic("lock")}Contrôlé à bord : ni annulation ni remboursement au guichet. Réclamation au service clients.</div>` : ""}
      </div>
      <div class="dialogue-pied">
        ${billet ? btn("Duplicata", { icone: "copy", attr: `data-action="duplicata" data-op="${i}" ${o.montant < 0 ? "disabled" : ""}` }) : ""}
        ${billet && o.remboursable ? `<button class="btn btn-danger" data-action="rembourser" data-op="${i}">${ic("rotate-ccw")}Rembourser</button>` : billet ? `<button class="btn btn-danger" disabled>${ic("rotate-ccw")}Rembourser</button>` : ""}
      </div>
    </div>`
}

function dialogueRemboursement(i) {
  const o = OPERATIONS[i]
  const penalite = Math.round(o.montant * 0.1)
  return `
    <div class="dialogue" role="dialog" aria-label="Rembourser ${o.n}">
      <div class="dialogue-tete"><div><h3>Rembourser le billet</h3><p><span class="tabular">${o.n}</span> · ${o.qui} · ${o.trajet}</p></div><button class="btn btn-fantome btn-icone" data-fermer aria-label="Fermer">${ic("x")}</button></div>
      <div class="dialogue-corps">
        ${champ("Motif", "Voyage annulé par le client", { classe: "select" })}
        <div class="recap"><div class="recap-corps">
          <div class="recap-l"><span>Prix payé</span><span class="tabular">${nb(o.montant)}</span></div>
          <div class="recap-l"><span>Pénalité 10 % · départ dans plus de 2 h</span><span class="tabular">−${nb(penalite)}</span></div>
          <div class="recap-total"><span>À rendre en espèces</span><span class="tabular">${xaf(o.montant - penalite)}</span></div>
        </div></div>
        <div class="option">${ic("armchair")}<span><b>La place ${o.place} repart à la vente</b><small>Dès la validation, pour tous les canaux.</small></span></div>
      </div>
      <div class="dialogue-pied">${btn("Annuler", { genre: "fantome", attr: "data-fermer" })}<button class="btn btn-primaire" data-action="confirmer-remb" data-op="${i}">${ic("rotate-ccw")}Rembourser ${xaf(o.montant - penalite)}</button></div>
    </div>`
}

/* --- Caisse --- */
const BILLETAGE = [[10000, 38], [5000, 8], [2000, 4], [1000, 3], [500, 2], [100, 2], [50, 1]]
const ATTENDU = 432750
function majCaisse() {
  const el = document.getElementById("vt-billetage")
  if (!el) return
  el.innerHTML = BILLETAGE.map(([c, q], i) => `<tr><td>${nb(c)}</td><td><span class="qte"><button data-billet="${i}:-1" aria-label="Retirer une coupure de ${nb(c)}">${ic("minus")}</button><output>${q}</output><button data-billet="${i}:1" aria-label="Ajouter une coupure de ${nb(c)}">${ic("plus")}</button></span></td><td>${nb(c * q)}</td></tr>`).join("")
  const compte = BILLETAGE.reduce((s, [c, q]) => s + c * q, 0)
  const e = compte - ATTENDU
  document.querySelectorAll("[data-v='compte-total'],[data-v='compte-especes']").forEach((x) => (x.textContent = nb(compte)))
  document.getElementById("vt-ecart").innerHTML = e === 0
    ? `<div class="ecart ok">${ic("circle-check")}<span><b>Caisse juste</b>Espèces comptées = espèces attendues</span><span class="montant">0</span></div>`
    : `<div class="ecart ${e < 0 ? "manque" : "surplus"}">${ic(e < 0 ? "circle-alert" : "triangle-alert")}<span><b>${e < 0 ? "Manque en caisse" : "Excédent en caisse"}</b>À justifier avant la clôture</span><span class="montant">${signe(e)}</span></div>`
  const b = document.querySelector("[data-action='cloturer']")
  b.dataset.ecart = e
}

/* ============================================================= Montage === */
export function monterGuichet(racine, fns) {
  aller = fns.aller
  toast = fns.toast
  majDessertes(); majVoitures(); majSieges(); majPax(); majEncaissement(); majOps(); majCaisse(); majBarres()

  racine.addEventListener("click", (e) => {
    const t = e.target
    const cl = t.closest("[data-classe]")
    if (cl) {
      const [d, c] = cl.dataset.classe.split(":")
      vente.desserte = d; vente.classe = c
      const v = VOITURES.find((x) => x.classe === c && x.libres > 0)
      if (v && v.n !== vente.voiture) { vente.voiture = v.n; vente.places = vente.places.map(() => null); vente.actif = 0 }
      majDessertes(); majVoitures(); majSieges(); majPax(); majEncaissement()
      return
    }
    const cpt = t.closest("[data-compte]")
    if (cpt) {
      const [c, d] = cpt.dataset.compte.split(":")
      const n = vente.compte[c] + +d
      const tot = voyageurs().length + +d
      if (n < 0 || tot < 1 || tot > 8) return
      vente.compte[c] = n
      vente.places = voyageurs().map((_, i) => vente.places[i] ?? null)
      vente.actif = Math.min(vente.actif, tot - 1)
      majDessertes(); majSieges(); majPax(); majEncaissement()
      return
    }
    const vo = t.closest("[data-voiture]")
    if (vo) { vente.voiture = +vo.dataset.voiture; vente.places = vente.places.map(() => null); vente.actif = 0; majVoitures(); majSieges(); majPax(); majEncaissement(); return }
    const pl = t.closest("[data-place]")
    if (pl) {
      const p = pl.dataset.place
      const k = vente.places.indexOf(p)
      if (k >= 0) { vente.places[k] = null; vente.actif = k }
      else {
        vente.places[vente.actif] = p
        const libre = vente.places.findIndex((x) => !x)
        vente.actif = libre >= 0 ? libre : vente.actif
      }
      majSieges(); majPax(); majEncaissement()
      return
    }
    const ac = t.closest("[data-actif]")
    if (ac) { vente.actif = +ac.dataset.actif; majSieges(); return }
    const mo = t.closest("[data-moyen]")
    if (mo) { vente.moyen = mo.dataset.moyen; majEncaissement(); return }
    const rc = t.closest("[data-recu]")
    if (rc) { vente.recu = rc.dataset.recu; majEncaissement(); return }
    const to = t.closest("[data-touche]")
    if (to) {
      const k = to.dataset.touche
      vente.recu = k === "⌫" ? vente.recu.slice(0, -1) : (vente.recu + k).replace(/^0+/, "").slice(0, 7)
      majEncaissement()
      return
    }
    const bi = t.closest("[data-billet]")
    if (bi) {
      const [i, d] = bi.dataset.billet.split(":").map(Number)
      BILLETAGE[i][1] = Math.max(0, BILLETAGE[i][1] + d)
      majCaisse()
      return
    }
    const op = t.closest("tr[data-op]")
    if (op) { fns.ouvrir(tiroirOp(+op.dataset.op), true); return }

    const act = t.closest("[data-action]")?.dataset.action
    if (!act) return
    if (act === "auto") {
      const libres = []
      for (let r = 1; r <= 16 && libres.length < voyageurs().length; r++) {
        const rang = ["A", "B", "C", "D"].map((l) => `${r}${l}`).filter((p) => !OCCUPEES_V4.has(p) && !BLOQUEES_V4[p])
        if (rang.length >= voyageurs().length) libres.push(...rang.slice(0, voyageurs().length))
      }
      vente.places = voyageurs().map((_, i) => libres[i] ?? null)
      majSieges(); majPax(); majEncaissement()
      toast("Voyageurs placés côte à côte")
    } else if (act === "encaisser") {
      if (vente.moyen === "airtel" || vente.moyen === "moov") {
        fns.ouvrir(`<div class="dialogue"><div class="attente-mobile"><span class="rond">${ic("smartphone")}</span><b>En attente du client</b><p>Demande de ${xaf(total())} envoyée sur ${MOYENS.find((m) => m.id === vente.moyen).libelle}. Le client valide avec son code secret.</p>${`<span class="voie attente"><span class="ruban"></span></span>`}<p class="tabular">Expire dans 02:54</p>${btn("Annuler la demande", { genre: "fantome", attr: "data-fermer" })}</div></div>`)
        setTimeout(() => { fns.fermer(); aller("/vente/confirmation") }, 2600)
      } else aller("/vente/confirmation")
    } else if (act === "nouvelle") {
      Object.assign(vente, { compte: { adulte: 1, enfant: 0, militaire: 0 }, places: [null], actif: 0, recu: "" })
      majDessertes(); majSieges(); majPax(); majEncaissement()
      aller("/vente/billet")
    } else if (act === "reimprimer") {
      const tk = document.getElementById("vt-ticket")
      tk.classList.remove("imprime"); void tk.offsetWidth; tk.classList.add("imprime")
    } else if (act === "duplicata") {
      fns.fermer(); toast("Duplicata imprimé · mention DUPLICATA, tracé au journal")
    } else if (act === "rembourser") {
      fns.ouvrir(dialogueRemboursement(+t.closest("[data-op]").dataset.op))
    } else if (act === "confirmer-remb") {
      const i = +t.closest("[data-op]").dataset.op
      OPERATIONS[i].etat = ["info", "Remboursé", "rotate-ccw"]
      OPERATIONS[i].remboursable = false
      majOps(); fns.fermer(); toast("Remboursement R-OWE-0042 enregistré · place remise en vente")
    } else if (act === "cloturer") {
      const e = +t.closest("[data-action]").dataset.ecart
      const j = document.getElementById("vt-justif")
      if (e !== 0 && !j.dataset.rempli) {
        j.classList.add("focus")
        j.closest(".champ").classList.add("erreur")
        if (!j.nextElementSibling) j.insertAdjacentHTML("afterend", `<span class="champ-aide">${ic("circle-alert")}Écart de ${signe(e)} XAF : justifiez-le, ou recomptez le billetage.</span>`)
        j.innerHTML = `<input value="" placeholder="Décrivez l'écart…" aria-label="Justification de l'écart">`
        j.querySelector("input").focus()
        j.querySelector("input").addEventListener("input", (ev) => { j.dataset.rempli = ev.target.value ? "1" : "" })
        return
      }
      fns.ouvrir(`<div class="dialogue"><div class="dialogue-tete"><div><h3>Caisse clôturée</h3><p>Journée du ${AUJOURDHUI} · guichet 2. L'état de caisse part au chef de gare pour visa.</p></div></div><div class="dialogue-corps"><div class="ecart ${e === 0 ? "ok" : "manque"}">${ic(e === 0 ? "circle-check" : "circle-alert")}<span><b>${e === 0 ? "Caisse juste" : "Écart justifié"}</b>Remis au coffre : ${xaf(BILLETAGE.reduce((s, [c, q]) => s + c * q, 0))}</span></div></div><div class="dialogue-pied">${btn("Fermer la session", { genre: "primaire", icone: "log-out", aller: "/connexion", attr: "data-fermer" })}</div></div>`)
    }
  })

  racine.addEventListener("change", (e) => {
    const s = e.target.closest("select[data-cat]")
    if (!s) return
    const vs = voyageurs().map((v) => v.cat)
    vs[+s.dataset.cat] = s.value
    vente.compte = { adulte: 0, enfant: 0, militaire: 0 }
    vs.forEach((c) => vente.compte[c]++)
    majDessertes(); majPax(); majEncaissement()
  })

  racine.addEventListener("keydown", (e) => {
    const op = e.target.closest?.("tr[data-op]")
    if (op && e.key === "Enter") fns.ouvrir(tiroirOp(+op.dataset.op), true)
  })
}

/** Appelé à l'entrée d'un écran du guichet. */
export function entrerGuichet(route) {
  if (route === "/vente/confirmation") majConfirmation()
  if (route === "/vente/encaissement") majEncaissement()
  if (route === "/vente/billet/places") majSieges()
  if (route === "/vente/billet/voyageurs") majPax()
}

/** Raccourcis clavier propres au tunnel (touches des moyens de paiement). */
export function toucheGuichet(route, k) {
  if (route === "/vente/encaissement") {
    const m = MOYENS.find((x) => x.touche === k.toUpperCase())
    if (m) { vente.moyen = m.id; document.querySelectorAll("#vt-moyens [role=radio]").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.moyen === m.id))); majEncaissement(); return true }
    if (/^[0-9]$/.test(k) && vente.moyen === "especes") { vente.recu = (vente.recu + k).replace(/^0+/, "").slice(0, 7); majEncaissement(); return true }
    if (k === "Backspace" && vente.moyen === "especes") { vente.recu = vente.recu.slice(0, -1); majEncaissement(); return true }
  }
  if (route === "/vente/confirmation" && k.toUpperCase() === "N") { document.querySelector("[data-action='nouvelle']")?.click(); return true }
  return false
}
