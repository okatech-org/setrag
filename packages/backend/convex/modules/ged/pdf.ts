import { PDFDocument } from "pdf-lib"

import { COULEURS, dessinerLogo, dessinerVoie } from "../../lib/pdfMarque"
import { chargerPolices, type Polices } from "../../lib/polices"

/**
 * Pièce GED au format PDF, aux couleurs de la charte : en-tête avec logo,
 * référence en mono, corps en paragraphes, pied de page portant la mention
 * de démonstration. Sert au seed, qui dépose ainsi de vrais fichiers.
 */
export interface PiecePdf {
  reference: string
  titre: string
  surtitre: string
  date: string
  emetteur: string
  destinataire?: string
  paragraphes: readonly string[]
  signature?: string
  mention: string
}

const A4: [number, number] = [595.28, 841.89]
const MARGE = 56
const LARGEUR_TEXTE = A4[0] - MARGE * 2

function couper(polices: Polices, texte: string, taille: number, largeur: number): string[] {
  const mots = texte.split(/\s+/).filter(Boolean)
  const lignes: string[] = []
  let ligne = ""
  for (const mot of mots) {
    const essai = ligne ? `${ligne} ${mot}` : mot
    if (polices.largeur(essai, "texte", taille) <= largeur) {
      ligne = essai
    } else {
      if (ligne) lignes.push(ligne)
      ligne = mot
    }
  }
  if (ligne) lignes.push(ligne)
  return lignes
}

export async function genererPiecePdf(piece: PiecePdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`${piece.reference} — ${piece.titre}`)
  doc.setAuthor("SETRAG — GED")
  doc.setSubject(piece.surtitre)
  doc.setCreator("SETRAG GED (démonstration)")
  const polices = await chargerPolices(doc, [
    piece.reference,
    piece.titre,
    piece.surtitre,
    piece.emetteur,
    piece.destinataire ?? "",
    ...piece.paragraphes,
    piece.signature ?? "",
    piece.mention,
  ])

  let page = doc.addPage(A4)
  let y = A4[1] - MARGE
  dessinerLogo(doc, page, { x: MARGE, haut: y, hauteur: 34 })
  polices.ecrire(page, piece.reference, {
    x: A4[0] - MARGE,
    y: y - 14,
    style: "mono",
    taille: 10,
    couleur: COULEURS.billetAttenue,
    alignement: "droite",
  })
  polices.ecrire(page, piece.date, {
    x: A4[0] - MARGE,
    y: y - 28,
    style: "mono",
    taille: 10,
    couleur: COULEURS.billetAttenue,
    alignement: "droite",
  })
  y -= 64
  dessinerVoie(doc, page, { x: MARGE, y, longueur: LARGEUR_TEXTE, sens: "horizontal", rempli: 1 })
  y -= 28
  polices.ecrire(page, piece.surtitre.toUpperCase(), {
    x: MARGE,
    y,
    style: "demi",
    taille: 9.5,
    couleur: COULEURS.billetAttenue,
    interlettrage: 0.8,
  })
  y -= 22
  for (const ligne of couper(polices, piece.titre, 17, LARGEUR_TEXTE)) {
    polices.ecrire(page, ligne, { x: MARGE, y, style: "demi", taille: 17, couleur: COULEURS.indigo })
    y -= 22
  }
  y -= 6
  const entetes = [
    ["Émetteur", piece.emetteur],
    ...(piece.destinataire ? [["Destinataire", piece.destinataire]] : []),
  ] as const
  for (const [libelle, valeur] of entetes) {
    polices.ecrire(page, libelle, { x: MARGE, y, style: "moyen", taille: 10, couleur: COULEURS.billetAttenue })
    polices.ecrire(page, valeur, { x: MARGE + 90, y, style: "texte", taille: 10.5, couleur: COULEURS.billetTexte })
    y -= 16
  }
  y -= 12

  const piedDePage = (cible: typeof page) => {
    for (const [index, ligne] of couper(polices, piece.mention, 8.5, LARGEUR_TEXTE).entries()) {
      polices.ecrire(cible, ligne, {
        x: MARGE,
        y: 40 - index * 11,
        style: "texte",
        taille: 8.5,
        couleur: COULEURS.billetAttenue,
      })
    }
  }

  for (const paragraphe of piece.paragraphes) {
    for (const ligne of couper(polices, paragraphe, 11, LARGEUR_TEXTE)) {
      if (y < 90) {
        piedDePage(page)
        page = doc.addPage(A4)
        y = A4[1] - MARGE
      }
      polices.ecrire(page, ligne, { x: MARGE, y, style: "texte", taille: 11, couleur: COULEURS.billetTexte })
      y -= 16
    }
    y -= 8
  }
  if (piece.signature) {
    y -= 18
    polices.ecrire(page, piece.signature, {
      x: A4[0] - MARGE,
      y,
      style: "demi",
      taille: 11,
      couleur: COULEURS.billetTexte,
      alignement: "droite",
    })
  }
  piedDePage(page)
  return await doc.save()
}
