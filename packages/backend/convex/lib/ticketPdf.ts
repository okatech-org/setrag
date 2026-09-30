import { PDFDocument, type PDFPage } from "pdf-lib"
import { encodeAztec, type AztecSymbol } from "./aztecRender"
import {
  COULEURS,
  TONS,
  contourBillet,
  dessinerIcone,
  dessinerLogo,
  dessinerVoie,
  largeurLogo,
  rectangleArrondi,
  type NomIcone,
  type Ton,
} from "./pdfMarque"
import {
  arriveeLendemain,
  classeCourte,
  dateBillet,
  formatPrix,
  nomTrain,
  titreValable,
} from "./libellesBillet"
import { chargerPolices, type Polices } from "./polices"

/**
 * Le billet imprimable : le billet du site (`packages/ui/src/components/
 * voyage/billet.tsx`), mis en page pour le papier.
 *
 * Même objet — logo compact, heures en mono, la voie et le ruban entre le
 * départ et l'arrivée, les cases voiture · place · classe, le code Aztec —,
 * mais à plat : format A5 paysage, le plus grand billet qui tienne dans une
 * poche plié en deux et qui s'imprime sans réglage sur une A4 domestique. Le
 * code passe sur un talon à droite, séparé du corps par la découpe, qui est
 * une voie (comme sur le site) bordée de ses deux encoches.
 *
 * Une différence voulue : le billet du site est encre, celui-ci est blanc,
 * cerné d'un filet. Il est fait pour être imprimé — chez soi comme au
 * guichet —, et un fond plein viderait les cartouches et baverait au laser.
 *
 * Ce que le papier ajoute : la date complète, le nom du voyageur en clair
 * (le titre est nominatif), le prix, les mentions légales, et un bandeau
 * « TITRE NON VALABLE » en tête de page pour tout statut autre que valide
 * ou utilisé — écrit en toutes lettres, jamais porté par la couleur seule.
 *
 * Couleurs et tracés : `pdfMarque.ts` ; polices : `polices.ts`.
 */

const A5_PAYSAGE: [number, number] = [595.28, 419.53]

/**
 * Mise en service de la mise en page actuelle (charte « la voie et le
 * ruban », billet blanc pour l'impression, heures de montée et de descente
 * du voyageur — 30 septembre 2026, 13 h 58 UTC). Un PDF rangé avant cette
 * date est refait à la demande suivante au lieu d'être resservi
 * (`documents.ts`). À avancer à chaque changement visible du billet.
 */
export const MISE_EN_PAGE_DU = Date.UTC(2026, 8, 30, 13, 58)

/** Données nécessaires à l'impression d'un billet. */
export interface TicketPrintData {
  readonly number: string
  readonly barcode: string
  readonly passenger: { readonly lastName: string; readonly firstName: string }
  readonly origin: { readonly code: string; readonly name: string }
  readonly destination: { readonly code: string; readonly name: string }
  readonly serviceDate: string
  readonly departureLabel: string
  readonly arrivalLabel: string
  readonly trainNumber: string
  /** Type du train (EXPRESS, OMNIBUS…) : « Express 201 » comme sur le site. */
  readonly trainType?: string
  readonly serviceClass: string
  readonly coachLabel?: string
  readonly seatLabel?: string
  readonly priceTtc: number
  readonly saleNumber: string
  readonly status: string
  /** Vrai si le déploiement signe encore avec la clé du dépôt. */
  readonly isDemoKey: boolean
}

/** Un billet seul. */
export async function renderTicketPdf(
  data: TicketPrintData,
): Promise<Uint8Array> {
  return await renderTicketsPdf([data], `Billet ${data.number}`)
}

/**
 * Plusieurs billets, une page chacun, dans un même document : les polices
 * n'y sont embarquées qu'une fois, pour tous.
 */
export async function renderTicketsPdf(
  tickets: readonly TicketPrintData[],
  titre = "Billets SETRAG",
): Promise<Uint8Array> {
  if (tickets.length === 0) throw new Error("Aucun billet à imprimer")
  // Le symbole d'abord : sans code-barres, rien ne doit sortir.
  const symboles = tickets.map((ticket) => encodeAztec(ticket.barcode))

  const doc = await PDFDocument.create()
  doc.setTitle(titre)
  doc.setLanguage("fr-FR")
  doc.setProducer("SETRAG — billettique")
  doc.setCreator("SETRAG")

  const polices = await chargerPolices(doc, tickets.flatMap(textesVariables))
  tickets.forEach((ticket, i) => {
    composer(doc, doc.addPage(A5_PAYSAGE), polices, ticket, symboles[i]!, {
      rang: i + 1,
      total: tickets.length,
    })
  })
  return await doc.save()
}

/** Tout le texte venu des données : c'est lui qui peut sortir du Latin-1. */
function textesVariables(t: TicketPrintData): string[] {
  return [
    t.number,
    t.passenger.firstName,
    t.passenger.lastName,
    t.origin.code,
    t.origin.name,
    t.destination.code,
    t.destination.name,
    t.trainNumber,
    t.serviceClass,
    t.coachLabel ?? "",
    t.seatLabel ?? "",
    t.saleNumber,
    t.status,
  ]
}

/* ─────────────────────────── Vocabulaire ──────────────────────────────── */

/** Les pastilles de `PastilleBillet` (statut.tsx) : même mot, même ton. */
const STATUTS: Record<string, { libelle: string; ton: Ton; icone: NomIcone }> =
  {
    en_attente: { libelle: "Paiement en attente", ton: "info", icone: "sablier" },
    valide: { libelle: "Valide", ton: "succes", icone: "coche" },
    utilise: { libelle: "Utilisé", ton: "neutre", icone: "drapeau" },
    annule: { libelle: "Annulé", ton: "danger", icone: "interdit" },
    rembourse: { libelle: "Remboursé", ton: "neutre", icone: "retour" },
    expire: { libelle: "Expiré", ton: "neutre", icone: "minuteur" },
  }

/** Un titre éteint ne se présente plus au contrôle (`etatBillet`, site). */
const ETEINTS = new Set(["utilise", "annule", "rembourse", "expire"])

/* ─────────────────────────── Mise en page ─────────────────────────────── */

const [LARGEUR, HAUTEUR] = A5_PAYSAGE
const MARGE = 28
/** Bandeau de tête (titre ou avertissement), au-dessus du billet. */
const TETE = { haut: HAUTEUR - 24, hauteur: 30 }
/** Le billet : cerné d'un filet, arrondi comme `rounded-lg` (20 px). */
const CARTE = {
  x: MARGE,
  bas: 58,
  haut: TETE.haut - TETE.hauteur - 10,
  largeur: LARGEUR - 2 * MARGE,
  rayon: 15,
}
/** Talon du code, à droite de la découpe. */
const TALON = 232
const DECOUPE = CARTE.x + CARTE.largeur - TALON
const MARGE_INTERNE = 22
/** Corps du billet, à gauche de la découpe. */
const CORPS = { x: CARTE.x + MARGE_INTERNE, fin: DECOUPE - MARGE_INTERNE }
/**
 * Cadre du code (196 points) : le symbole y occupe 172 points, soit
 * 6 cm, le reste est sa zone de repos. Une charge signée réelle (≈ 320
 * caractères) y donne des modules d'un millimètre, lisibles sur un papier
 * froissé comme sur un écran terni.
 */
const CADRE_CODE = 196
const COTE_CODE = 172

interface Contexte {
  doc: PDFDocument
  page: PDFPage
  p: Polices
  data: TicketPrintData
  /** Opacité du trajet : 1, ou 0,45 pour un titre éteint (comme le site). */
  trajet: number
}

function composer(
  doc: PDFDocument,
  page: PDFPage,
  p: Polices,
  data: TicketPrintData,
  symbole: AztecSymbol,
  rang: { rang: number; total: number },
): void {
  const c: Contexte = {
    doc,
    page,
    p,
    data,
    trajet: ETEINTS.has(data.status) ? 0.45 : 1,
  }
  const valable = titreValable(data.status)

  if (valable) titre(c)
  else avertissement(c)

  fond(c)
  entete(c)
  trajet(c)
  cases(c)
  voyageur(c)
  talon(c, symbole, rang, valable)
  mentions(c)
}

/* ─────────────────────────── Blocs ────────────────────────────────────── */

/** Titre éditorial du document, en indigo (charte : titres des PDF). */
function titre({ page, p }: Contexte): void {
  const ligne = TETE.haut - TETE.hauteur / 2 - 5
  p.ecrire(page, "Billet de transport", {
    x: MARGE,
    y: ligne,
    style: "demi",
    taille: 15,
    couleur: COULEURS.indigo,
  })
  p.ecrire(page, "Société d’Exploitation du Transgabonais", {
    x: LARGEUR - MARGE,
    y: ligne + 1,
    style: "moyen",
    taille: 9,
    couleur: COULEURS.attenue,
    alignement: "droite",
  })
}

/**
 * Bandeau d'avertissement : un titre non réglé, annulé ou expiré ne doit
 * jamais passer pour un billet valable, même imprimé. Il prend la place du
 * titre — ce document n'est pas un billet de transport. Forme de
 * `InlineMessage` : fond doux, filet de 3 points à gauche, icône et phrase.
 */
function avertissement({ page, p, data }: Contexte): void {
  const bas = TETE.haut - TETE.hauteur
  rectangleArrondi(page, {
    x: MARGE,
    y: bas,
    largeur: LARGEUR - 2 * MARGE,
    hauteur: TETE.hauteur,
    rayon: 6,
    couleur: COULEURS.dangerDoux,
  })
  page.drawRectangle({
    x: MARGE,
    y: bas,
    width: 3,
    height: TETE.hauteur,
    color: COULEURS.danger,
  })
  dessinerIcone(page, "alerte", {
    x: MARGE + 14,
    haut: bas + TETE.hauteur / 2 + 7,
    taille: 14,
    couleur: COULEURS.dangerEncre,
  })

  const ligne = bas + TETE.hauteur / 2 - 4
  const debut = MARGE + 36
  const avance = p.ecrire(page, "TITRE NON VALABLE", {
    x: debut,
    y: ligne,
    style: "demi",
    taille: 11,
    couleur: COULEURS.dangerEncre,
  })
  const libelle = STATUTS[data.status]?.libelle ?? `statut ${data.status}`
  const suite = p.ajuster(
    ` — ${libelle}. Ce document ne permet pas de voyager.`,
    "moyen",
    10,
    LARGEUR - MARGE - 12 - debut - avance,
    8,
  )
  p.ecrire(page, suite.texte, {
    x: debut + avance,
    y: ligne,
    style: "moyen",
    taille: suite.taille,
    couleur: COULEURS.dangerEncre,
  })
}

/** Contour, encoches et découpe : le billet au trait, sans aplat. */
function fond({ doc, page }: Contexte): void {
  const hauteur = CARTE.haut - CARTE.bas
  contourBillet(page, {
    x: CARTE.x,
    bas: CARTE.bas,
    largeur: CARTE.largeur,
    hauteur,
    rayon: CARTE.rayon,
    encoche: { x: DECOUPE, rayon: 10 },
    couleur: COULEURS.billetContour,
  })
  // La découpe : une voie vide, qui remplace les pointillés.
  dessinerVoie(doc, page, {
    x: DECOUPE - 7,
    y: CARTE.bas + 16,
    longueur: hauteur - 32,
    sens: "vertical",
  })
}

/** En-tête : logo, train, pastille d'état. */
function entete({ doc, page, p, data }: Contexte): void {
  const haut = CARTE.haut - 20
  const hauteurLogo = 22
  const milieu = haut - hauteurLogo / 2
  dessinerLogo(doc, page, { x: CORPS.x, haut, hauteur: hauteurLogo })

  const statut = STATUTS[data.status] ?? {
    libelle: data.status,
    ton: "neutre",
    icone: "alerte",
  }
  const largeurPastille = pastille(page, p, statut, CORPS.fin, milieu)

  const debut = CORPS.x + largeurLogo(hauteurLogo) + 10
  const train = p.ajuster(
    nomTrain(data.trainType, data.trainNumber),
    "demi",
    11.5,
    CORPS.fin - largeurPastille - 10 - debut,
    9,
  )
  p.ecrire(page, train.texte, {
    x: debut,
    y: milieu - 4,
    style: "demi",
    taille: train.taille,
    couleur: COULEURS.billetAttenue,
  })
}

/**
 * Pastille (`Tag`) : 20 points de haut, icône en tête, libellé demi-gras.
 * Posée par son bord droit ; rend sa largeur.
 */
function pastille(
  page: PDFPage,
  p: Polices,
  statut: { libelle: string; ton: Ton; icone: NomIcone },
  droite: number,
  milieu: number,
): number {
  const ton = TONS[statut.ton]
  const taille = 9.5
  const icone = 10.5
  const largeur = 8 + icone + 4 + p.largeur(statut.libelle, "demi", taille) + 9
  const x = droite - largeur
  rectangleArrondi(page, {
    x,
    y: milieu - 10,
    largeur,
    hauteur: 20,
    rayon: 10,
    couleur: ton.fond,
  })
  dessinerIcone(page, statut.icone, {
    x: x + 8,
    haut: milieu + icone / 2,
    taille: icone,
    couleur: ton.texte,
  })
  p.ecrire(page, statut.libelle, {
    x: x + 8 + icone + 4,
    y: milieu - 3.3,
    style: "demi",
    taille,
    couleur: ton.texte,
  })
  return largeur
}

/** Heures en mono 26, comme le site ; leur capitale sert à centrer le milieu. */
const TAILLE_HEURE = 26
const CAPITALE_HEURE = TAILLE_HEURE * 0.7
/** Ligne de base des heures, et de ce qui s'aligne sur elles. */
const HEURES = CARTE.haut - 20 - 22 - 30 - CAPITALE_HEURE
const GARES = HEURES - 18

/** Départ, arrivée, et entre les deux la date posée sur la voie pleine. */
function trajet({ doc, page, p, data, trajet: opacite }: Contexte): void {
  const tailleHeure = TAILLE_HEURE
  const depart = data.departureLabel
  const arrivee = data.arrivalLabel
  const lDepart = p.largeur(depart, "monoDemi", tailleHeure)
  const lArrivee = p.largeur(arrivee, "monoDemi", tailleHeure)

  p.ecrire(page, depart, {
    x: CORPS.x,
    y: HEURES,
    style: "monoDemi",
    taille: tailleHeure,
    couleur: COULEURS.billetTexte,
    opacite,
  })
  p.ecrire(page, arrivee, {
    x: CORPS.fin,
    y: HEURES,
    style: "monoDemi",
    taille: tailleHeure,
    couleur: COULEURS.billetTexte,
    opacite,
    alignement: "droite",
  })

  // Gares : le nom, puis son code en mono — la moitié de la largeur chacune.
  const moitie = (CORPS.fin - CORPS.x) / 2 - 6
  gare(page, p, data.origin, CORPS.x, moitie, "gauche", opacite)
  gare(page, p, data.destination, CORPS.fin, moitie, "droite", opacite)

  // Milieu : la date au-dessus de la voie, que le ruban remplit.
  const debut = CORPS.x + lDepart + 12
  const fin = CORPS.fin - lArrivee - 12
  const centre = (HEURES + CAPITALE_HEURE + GARES - 3) / 2
  dessinerVoie(doc, page, {
    x: debut,
    y: centre - 11,
    longueur: fin - debut,
    sens: "horizontal",
    rempli: 1,
    opacite,
  })
  // Arrivée le lendemain : « (+1 j) », comme le site.
  const lendemain = arriveeLendemain(depart, arrivee) ? " (+1 j)" : ""
  // La date peut déborder la voie, jamais toucher les heures.
  const date = p.ajuster(
    `${dateBillet(data.serviceDate)}${lendemain}`,
    "mono",
    8.5,
    fin - debut + 12,
    6.5,
  )
  p.ecrire(page, date.texte, {
    x: (debut + fin) / 2,
    y: centre + 8,
    style: "mono",
    taille: date.taille,
    couleur: COULEURS.billetAttenue,
    opacite,
    alignement: "centre",
  })
}

function gare(
  page: PDFPage,
  p: Polices,
  station: { code: string; name: string },
  x: number,
  largeurMax: number,
  alignement: "gauche" | "droite",
  opacite: number,
): void {
  const code = station.code.trim()
  const lCode = code ? p.largeur(code, "mono", 8.5) + 5 : 0
  const nom = p.ajuster(station.name, "moyen", 11, largeurMax - lCode, 8.5)
  const lNom = p.largeur(nom.texte, "moyen", nom.taille)
  const debut = alignement === "gauche" ? x : x - lNom - lCode
  p.ecrire(page, nom.texte, {
    x: debut,
    y: GARES,
    style: "moyen",
    taille: nom.taille,
    couleur: COULEURS.billetAttenue,
    opacite,
  })
  if (code) {
    p.ecrire(page, code, {
      x: debut + lNom + 5,
      y: GARES,
      style: "mono",
      taille: 8.5,
      couleur: COULEURS.billetPale,
      opacite,
    })
  }
}

const FILET_HAUT = GARES - 20
const CASES = FILET_HAUT - 21

/** Cases du bas du billet : voiture, place, classe. */
function cases({ page, p, data }: Contexte): void {
  filet(page, FILET_HAUT)
  const liste = [
    ...(data.coachLabel ? [["Voiture", data.coachLabel]] : []),
    ["Place", data.seatLabel || "Libre"],
    ["Classe", classeCourte(data.serviceClass)],
  ] as const
  const colonne = (CORPS.fin - CORPS.x) / liste.length
  liste.forEach(([libelle, valeur], i) => {
    const x = CORPS.x + i * colonne
    p.ecrire(page, libelle, {
      x,
      y: CASES,
      style: "moyen",
      taille: 9,
      couleur: COULEURS.billetAttenue,
    })
    const v = p.ajuster(valeur, "monoDemi", 17, colonne - 8, 11)
    p.ecrire(page, v.texte, {
      x,
      y: CASES - 20,
      style: "monoDemi",
      taille: v.taille,
      couleur: COULEURS.billetTexte,
    })
  })
}

function filet(page: PDFPage, y: number): void {
  page.drawRectangle({
    x: CORPS.x,
    y,
    width: CORPS.fin - CORPS.x,
    height: 0.75,
    color: COULEURS.billetFilet,
  })
}

/**
 * Le nom tel qu'il s'imprime : une ligne si possible, sinon le prénom et le
 * nom sur deux lignes, à la même taille. Le titre est nominatif et se
 * confronte à une pièce d'identité : on réduit le corps avant de couper, et
 * l'ellipse n'est qu'un dernier recours.
 */
function lignesDuNom(
  p: Polices,
  prenom: string,
  nom: string,
  /** Largeur de la première ligne (à côté du prix), puis des suivantes. */
  largeurs: readonly [number, number],
): { texte: string; taille: number }[] {
  const [premiere, suivante] = largeurs
  const complet = `${prenom.trim()} ${nom.trim()}`.trim()
  const une = p.ajuster(complet, "demi", 14, premiere, 11)
  if (une.texte === complet || !prenom.trim() || !nom.trim()) {
    return [p.ajuster(complet, "demi", 14, premiere, 8)]
  }
  const taille = Math.min(
    p.ajuster(prenom.trim(), "demi", 12, premiere, 8).taille,
    p.ajuster(nom.trim(), "demi", 12, suivante, 8).taille,
  )
  return [
    p.ajuster(prenom.trim(), "demi", taille, premiere, taille),
    p.ajuster(nom.trim(), "demi", taille, suivante, taille),
  ]
}

/** Pied du billet : le voyageur (titre nominatif), le prix, le numéro. */
function voyageur({ page, p, data }: Contexte): void {
  const numero = CARTE.bas + 20
  const prix = formatPrix(data.priceTtc)
  const lPrix = p.largeur(prix, "monoDemi", 13)
  const lignes = lignesDuNom(p, data.passenger.firstName, data.passenger.lastName, [
    CORPS.fin - CORPS.x - lPrix - 16,
    CORPS.fin - CORPS.x,
  ])
  // Les lignes du nom s'empilent au-dessus du numéro ; le libellé et le
  // filet montent d'autant.
  const interligne = (lignes[0]?.taille ?? 14) + 3
  const derniere = numero + 26
  const premiere = derniere + interligne * (lignes.length - 1)
  const libelle = premiere + 16
  filet(page, libelle + 16)

  p.ecrire(page, "Voyageur", {
    x: CORPS.x,
    y: libelle,
    style: "moyen",
    taille: 9,
    couleur: COULEURS.billetAttenue,
  })
  lignes.forEach((ligne, i) => {
    p.ecrire(page, ligne.texte, {
      x: CORPS.x,
      y: premiere - i * interligne,
      style: "demi",
      taille: ligne.taille,
      couleur: COULEURS.billetTexte,
    })
  })
  p.ecrire(page, "Prix TTC", {
    x: CORPS.fin,
    y: libelle,
    style: "moyen",
    taille: 9,
    couleur: COULEURS.billetAttenue,
    alignement: "droite",
  })
  p.ecrire(page, prix, {
    x: CORPS.fin,
    y: premiere,
    style: "monoDemi",
    taille: 13,
    couleur: COULEURS.billetTexte,
    alignement: "droite",
  })

  const avance = p.ecrire(page, "Billet ", {
    x: CORPS.x,
    y: numero,
    style: "moyen",
    taille: 8.5,
    couleur: COULEURS.billetAttenue,
  })
  p.ecrire(page, data.number, {
    x: CORPS.x + avance,
    y: numero,
    style: "mono",
    taille: 8.5,
    couleur: COULEURS.billetAttenue,
  })
}

/**
 * Le talon : le code Aztec, la référence de vente dessous. Le symbole garde
 * toute sa netteté — jamais éteint, même pour un titre utilisé : c'est au
 * lecteur de dire s'il est encore valable.
 */
function talon(
  { page, p, data }: Contexte,
  symbole: AztecSymbol,
  rang: { rang: number; total: number },
  valable: boolean,
): void {
  const module = COTE_CODE / symbole.columns
  // Zone de repos : au moins trois modules de blanc autour du symbole, faute
  // de quoi un lecteur peut ne pas en trouver les bords.
  const repos = Math.max(12, module * 3)
  const cote = CADRE_CODE - 2 * repos
  const pas = cote / symbole.columns

  const hauteurCadre = repos + cote + 8 + 9 + 12
  const hauteurTalon = hauteurCadre + 16 + 9
  const centre = (CARTE.haut + CARTE.bas) / 2
  const haut = centre + hauteurTalon / 2
  const gauche = DECOUPE + (TALON - CADRE_CODE) / 2
  // Le papier fait la zone de repos : rien d'autre ne s'imprime dans le
  // cadre du code que le symbole et sa légende.
  const bas = haut - hauteurCadre

  const x0 = gauche + repos
  const y0 = haut - repos - cote
  for (const run of symbole.runs) {
    page.drawRectangle({
      x: x0 + run.col * pas,
      y: y0 + run.row * pas,
      width: run.length * pas,
      height: pas,
      color: COULEURS.encre,
    })
  }

  // Référence de vente, lisible à l'œil : le recours quand le symbole est
  // illisible et qu'il faut retrouver la transaction à la main.
  const legende =
    rang.total > 1
      ? `${data.saleNumber} · ${rang.rang}/${rang.total}`
      : data.saleNumber
  // Interlettrage de 0,08 em, comme `tracking-[0.08em]` sur le site : il
  // compte dans la largeur disponible.
  let taille = 9
  while (
    taille > 6 &&
    p.largeur(legende, "mono", taille, taille * 0.08) > CADRE_CODE - 20
  ) {
    taille -= 0.25
  }
  p.ecrire(page, legende, {
    x: gauche + CADRE_CODE / 2,
    y: y0 - 8 - 6.5,
    style: "mono",
    taille,
    couleur: COULEURS.legendeCode,
    interlettrage: taille * 0.08,
    alignement: "centre",
  })

  // Le talon dit lui-même qu'un titre non valable ne se présente pas : le
  // bandeau de tête peut être découpé, pas cette phrase.
  p.ecrire(
    page,
    valable ? "Présenter ce code au contrôle" : "TITRE NON VALABLE",
    {
      x: gauche + CADRE_CODE / 2,
      y: bas - 16,
      style: valable ? "moyen" : "demi",
      taille: 9,
      couleur: valable ? COULEURS.billetAttenue : TONS.danger.texte,
      alignement: "centre",
    },
  )

  if (bas - 16 < CARTE.bas) {
    throw new Error("Composition du billet : le code-barres déborde du billet")
  }
}

/** Sous le billet : mentions légales et, en démonstration, l'avis de spécimen. */
function mentions({ page, p, data }: Contexte): void {
  const lignes = [
    "Billet nominatif et incessible. Une pièce d’identité peut être demandée au contrôle.",
    "Conserver ce titre jusqu’à la sortie de la gare de destination.",
  ]
  lignes.forEach((ligne, i) => {
    p.ecrire(page, ligne, {
      x: MARGE,
      y: 36 - i * 10,
      style: "texte",
      taille: 7.5,
      couleur: COULEURS.attenue,
    })
  })

  if (!data.isDemoKey) return
  // Un billet signé par la clé du dépôt n'a aucune valeur probante : il doit
  // le dire lui-même, sinon une démonstration finit par circuler.
  const avis = "SPÉCIMEN — signature de démonstration"
  const detail = "Ce billet n’a aucune valeur au contrôle."
  const largeur =
    Math.max(p.largeur(avis, "demi", 8), p.largeur(detail, "moyen", 7.5)) + 30
  const x = LARGEUR - MARGE - largeur
  rectangleArrondi(page, {
    x,
    y: 17,
    largeur,
    hauteur: 30,
    rayon: 5,
    couleur: COULEURS.alerteDoux,
  })
  page.drawRectangle({ x, y: 17, width: 3, height: 30, color: COULEURS.alerte })
  dessinerIcone(page, "alerte", {
    x: x + 9,
    haut: 38,
    taille: 10,
    couleur: COULEURS.alerteEncre,
  })
  p.ecrire(page, avis, {
    x: x + 23,
    y: 35,
    style: "demi",
    taille: 8,
    couleur: COULEURS.alerteEncre,
  })
  p.ecrire(page, detail, {
    x: x + 23,
    y: 24,
    style: "moyen",
    taille: 7.5,
    couleur: COULEURS.alerteEncre,
  })
}

