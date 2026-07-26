import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"
import { encodeAztec } from "./aztecRender"

/**
 * Composition du billet imprimable.
 *
 * Format A5 paysage : c'est le plus grand billet qui tienne dans une poche
 * plié en deux, et il s'imprime sans réglage sur une A4 domestique. Le
 * symbole Aztec occupe un quart de la surface — un contrôleur doit pouvoir le
 * scanner sur un écran de téléphone terni, pas seulement sur du papier neuf.
 *
 * Les couleurs sont celles de la charte SETRAG, converties en sRGB depuis
 * `packages/ui/src/styles/tokens.css`. Ce fichier n'est pas une seconde
 * source de vérité : toute évolution part du CSS.
 */

const A5_PAYSAGE: [number, number] = [595.28, 419.53]

const ENCRE = rgb(0x13 / 255, 0x1b / 255, 0x26 / 255)
const ENCRE_ATTENUEE = rgb(0x5c / 255, 0x64 / 255, 0x6f / 255)
const ENCRE_PALE = rgb(0x83 / 255, 0x8a / 255, 0x93 / 255)
const ACCENT = rgb(0x0f / 255, 0x50 / 255, 0xa0 / 255)
const ACCENT_DOUX = rgb(0xe2 / 255, 0xf0 / 255, 0xff / 255)
const LIGNE = rgb(0xdb / 255, 0xe0 / 255, 0xe8 / 255)
const BLANC = rgb(1, 1, 1)
const ALERTE = rgb(0xd1 / 255, 0xad / 255, 0x32 / 255)

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
  readonly serviceClass: string
  readonly coachLabel?: string
  readonly seatLabel?: string
  readonly priceTtc: number
  readonly saleNumber: string
  readonly status: string
  /** Vrai si le déploiement signe encore avec la clé du dépôt. */
  readonly isDemoKey: boolean
}

export async function renderTicketPdf(
  data: TicketPrintData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Billet ${data.number}`)
  doc.setProducer("SETRAG — billettique")
  doc.setCreator("SETRAG")

  const page = doc.addPage(A5_PAYSAGE)
  const regulier = await doc.embedFont(StandardFonts.Helvetica)
  const gras = await doc.embedFont(StandardFonts.HelveticaBold)
  const mono = await doc.embedFont(StandardFonts.Courier)

  const [largeur, hauteur] = A5_PAYSAGE
  const marge = 28
  const colonneCode = 372

  entete(page, gras, regulier, largeur, hauteur, data)

  // Séparation entre le corps du billet et la zone du code-barres : une
  // ligne pointillée, qui indique aussi où plier ou détacher.
  pointilles(page, colonneCode - 16, marge, hauteur - 92)

  corps(page, gras, regulier, marge, hauteur - 92, colonneCode - 44, data)
  codeBarres(page, mono, regulier, colonneCode, marge, hauteur - 92, data)
  piedDePage(page, regulier, marge, largeur, data)

  return await doc.save()
}

/* ────────────────────────────── Blocs ──────────────────────────────────── */

function entete(
  page: PDFPage,
  gras: PDFFont,
  regulier: PDFFont,
  largeur: number,
  hauteur: number,
  data: TicketPrintData,
): void {
  page.drawRectangle({
    x: 0,
    y: hauteur - 64,
    width: largeur,
    height: 64,
    color: ACCENT,
  })
  page.drawText("SETRAG", {
    x: 28,
    y: hauteur - 38,
    size: 20,
    font: gras,
    color: BLANC,
  })
  page.drawText("Transgabonais", {
    // Position mesurée plutôt que devinée : le logotype et sa mention ne
    // doivent pas se chevaucher si l'un des deux change.
    x: 28 + gras.widthOfTextAtSize("SETRAG", 20) + 10,
    y: hauteur - 36,
    size: 11,
    font: regulier,
    color: rgb(0x85 / 255, 0xba / 255, 1),
  })

  const titre = "BILLET DE TRANSPORT"
  page.drawText(titre, {
    x: largeur - 28 - gras.widthOfTextAtSize(titre, 12),
    y: hauteur - 30,
    size: 12,
    font: gras,
    color: BLANC,
  })
  const numero = sanitize(data.number)
  page.drawText(numero, {
    x: largeur - 28 - regulier.widthOfTextAtSize(numero, 10),
    y: hauteur - 48,
    size: 10,
    font: regulier,
    color: rgb(0x85 / 255, 0xba / 255, 1),
  })

  // Bandeau d'avertissement : un titre non réglé ne doit jamais passer pour
  // un billet valable, même imprimé.
  if (data.status !== "valide" && data.status !== "utilise") {
    page.drawRectangle({
      x: 0,
      y: hauteur - 88,
      width: largeur,
      height: 24,
      color: ALERTE,
    })
    page.drawText(
      `TITRE NON VALABLE — statut : ${sanitize(data.status)}`.toUpperCase(),
      { x: 28, y: hauteur - 81, size: 10, font: gras, color: ENCRE },
    )
  }
}

function corps(
  page: PDFPage,
  gras: PDFFont,
  regulier: PDFFont,
  x: number,
  hautDeZone: number,
  largeur: number,
  data: TicketPrintData,
): void {
  let y = hautDeZone - 34

  // Trajet : la seule information qu'un voyageur cherche de loin.
  page.drawText(sanitize(data.origin.code), {
    x,
    y,
    size: 30,
    font: gras,
    color: ENCRE,
  })
  const largeurOrigine = gras.widthOfTextAtSize(sanitize(data.origin.code), 30)
  page.drawText(">", {
    x: x + largeurOrigine + 14,
    y: y + 6,
    size: 18,
    font: regulier,
    color: ACCENT,
  })
  page.drawText(sanitize(data.destination.code), {
    x: x + largeurOrigine + 40,
    y,
    size: 30,
    font: gras,
    color: ENCRE,
  })

  y -= 18
  page.drawText(
    `${sanitize(data.origin.name)} vers ${sanitize(data.destination.name)}`,
    { x, y, size: 10, font: regulier, color: ENCRE_ATTENUEE },
  )

  y -= 26
  page.drawLine({
    start: { x, y },
    end: { x: x + largeur, y },
    thickness: 1,
    color: LIGNE,
  })

  // Deux colonnes de champs : à gauche le voyage, à droite la place.
  y -= 24
  const colonne2 = x + largeur / 2
  const lignes: ReadonlyArray<readonly [string, string, string, string]> = [
    [
      "Date de circulation",
      data.serviceDate,
      "Train",
      data.trainNumber,
    ],
    ["Départ", data.departureLabel, "Arrivée prévue", data.arrivalLabel],
    [
      "Classe",
      data.serviceClass,
      "Place",
      data.seatLabel
        ? `${data.coachLabel ? `${data.coachLabel} · ` : ""}${data.seatLabel}`
        : "Sans place attribuée",
    ],
  ]

  for (const [g1, v1, g2, v2] of lignes) {
    champ(page, gras, regulier, x, y, g1, v1)
    champ(page, gras, regulier, colonne2, y, g2, v2)
    y -= 40
  }

  page.drawLine({
    start: { x, y: y + 14 },
    end: { x: x + largeur, y: y + 14 },
    thickness: 1,
    color: LIGNE,
  })

  y -= 10
  champ(
    page,
    gras,
    regulier,
    x,
    y,
    "Voyageur",
    `${data.passenger.lastName} ${data.passenger.firstName}`,
  )
  champ(
    page,
    gras,
    regulier,
    colonne2,
    y,
    "Prix TTC",
    `${formatXaf(data.priceTtc)} FCFA`,
  )
}

function champ(
  page: PDFPage,
  gras: PDFFont,
  regulier: PDFFont,
  x: number,
  y: number,
  intitule: string,
  valeur: string,
): void {
  page.drawText(sanitize(intitule).toUpperCase(), {
    x,
    y: y + 14,
    size: 7,
    font: regulier,
    color: ENCRE_PALE,
  })
  page.drawText(sanitize(valeur), {
    x,
    y,
    size: 12,
    font: gras,
    color: ENCRE,
  })
}

function codeBarres(
  page: PDFPage,
  mono: PDFFont,
  regulier: PDFFont,
  x: number,
  bas: number,
  hautDeZone: number,
  data: TicketPrintData,
): void {
  const symbol = encodeAztec(data.barcode)
  const cote = 186
  const module = cote / symbol.columns
  const gauche = x + 12
  const basSymbole = hautDeZone - 30 - cote

  // Zone de repos blanche : sans elle, un lecteur peut ne pas trouver les
  // bords du symbole.
  const repos = module * 3
  page.drawRectangle({
    x: gauche - repos,
    y: basSymbole - repos,
    width: cote + 2 * repos,
    height: cote + 2 * repos,
    color: BLANC,
  })

  for (const run of symbol.runs) {
    page.drawRectangle({
      x: gauche + run.col * module,
      y: basSymbole + run.row * module,
      width: run.length * module,
      height: module,
      color: ENCRE,
    })
  }

  const legende = "Présenter ce code au contrôle"
  page.drawText(legende, {
    x: gauche + (cote - regulier.widthOfTextAtSize(legende, 8)) / 2,
    y: basSymbole - 22,
    size: 8,
    font: regulier,
    color: ENCRE_ATTENUEE,
  })

  // Référence de vente, lisible à l'œil : c'est le recours quand le symbole
  // est illisible et qu'il faut retrouver la transaction à la main.
  page.drawRectangle({
    x: gauche - 6,
    y: basSymbole - 58,
    width: cote + 12,
    height: 26,
    color: ACCENT_DOUX,
  })
  const ref = sanitize(data.saleNumber)
  page.drawText(ref, {
    x: gauche + (cote - mono.widthOfTextAtSize(ref, 10)) / 2,
    y: basSymbole - 49,
    size: 10,
    font: mono,
    color: ACCENT,
  })

  if (basSymbole - 58 < bas) {
    throw new Error("Composition du billet : le code-barres déborde la page")
  }
}

function piedDePage(
  page: PDFPage,
  regulier: PDFFont,
  x: number,
  largeur: number,
  data: TicketPrintData,
): void {
  const mentions = [
    "Billet nominatif et incessible. Une pièce d'identité peut être demandée au contrôle.",
    "Conserver ce titre jusqu'à la sortie de la gare de destination.",
  ]
  let y = 40
  for (const ligne of mentions) {
    page.drawText(ligne, { x, y, size: 7, font: regulier, color: ENCRE_PALE })
    y -= 10
  }

  if (data.isDemoKey) {
    // Un billet signé par la clé du dépôt n'a aucune valeur probante : il
    // doit le dire lui-même, sinon une démonstration finit par circuler.
    const avis = "SPÉCIMEN — signature de démonstration, sans valeur"
    page.drawText(avis, {
      x: largeur - x - regulier.widthOfTextAtSize(avis, 8),
      y: 40,
      size: 8,
      font: regulier,
      color: ALERTE,
    })
  }
}

function pointilles(
  page: PDFPage,
  x: number,
  bas: number,
  haut: number,
): void {
  for (let y = bas; y < haut; y += 8) {
    page.drawLine({
      start: { x, y },
      end: { x, y: y + 4 },
      thickness: 1,
      color: LIGNE,
    })
  }
}

/* ─────────────────────────────── Utilitaires ───────────────────────────── */

/**
 * Réduit un texte à ce que les polices standard du PDF savent écrire.
 *
 * Les polices intégrées au format PDF n'encodent que le jeu WinAnsi. Un nom
 * portant un caractère hors de ce jeu ferait échouer toute la génération —
 * autant le translittérer que perdre le billet. Les accents français, eux,
 * sont dans WinAnsi et passent intacts.
 */
export function sanitize(text: string): string {
  return text
    .normalize("NFC")
    .split("")
    .map((c) => (encodable(c) ? c : translitere(c)))
    .join("")
}

/**
 * Caractères de WinAnsi situés hors de Latin-1.
 *
 * WinAnsi n'est pas Latin-1 : il occupe la plage 0x80–0x9F, laissée aux
 * caractères de commande par la norme, avec de la ponctuation typographique.
 * Confondre les deux ferait remplacer par un point d'interrogation le tiret
 * cadratin ou l'apostrophe courbe, qui s'impriment pourtant très bien.
 */
const WINANSI_HORS_LATIN1 = new Set(
  [
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
    0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
    0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
  ].map((code) => String.fromCharCode(code)),
)

function encodable(c: string): boolean {
  const code = c.charCodeAt(0)
  // La plage 0x00–0x1F et 0x7F–0x9F de Latin-1 ne porte rien d'imprimable.
  if (code >= 0x20 && code <= 0x7e) return true
  if (code >= 0xa0 && code <= 0xff) return true
  return WINANSI_HORS_LATIN1.has(c)
}

function translitere(c: string): string {
  const décomposé = c.normalize("NFD").replace(/[̀-ͯ]/g, "")
  return décomposé.length > 0 && encodable(décomposé[0]!) ? décomposé : "?"
}

/** Montant en francs CFA, groupé par milliers avec une espace fine. */
export function formatXaf(amount: number): string {
  return Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ")
}
