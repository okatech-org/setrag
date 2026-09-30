import fontkit from "@pdf-lib/fontkit"
import {
  setCharacterSpacing,
  type Color,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
} from "pdf-lib"
import { POLICES } from "./policesDonnees"

/**
 * Typographie des documents PDF : les polices de la charte (Schibsted
 * Grotesk pour le texte, IBM Plex Mono pour les heures, codes et références)
 * et l'écriture d'un texte quelconque avec elles.
 *
 * Chaque graisse existe en deux coupes (voir `scripts/generer-polices.mjs`) :
 * « latin » couvre le français et le Latin-1 ; « étendu » ajoute le Latin
 * étendu (Ł, Ş, Ă, Ő…). Un caractère est dessiné dans la première coupe qui
 * le connaît. La coupe étendue n'est embarquée que si le document en a
 * besoin, ce qui garde le billet courant léger.
 *
 * Filet de sécurité pour ce qu'aucune coupe ne connaît (écriture arabe,
 * idéogrammes, caractères de commande) : on retire les signes diacritiques
 * si cela suffit, sinon on imprime « ? ». Mieux vaut un caractère remplacé
 * qu'un billet non délivré — et jamais un glyphe vide que personne ne verrait.
 */

export type StylePolice = keyof typeof POLICES

type Coupe = "latin" | "etendu"
const COUPES: readonly Coupe[] = ["latin", "etendu"]

/* ─────────────────────────── Données des polices ──────────────────────── */

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
const VALEURS = new Uint8Array(128)
for (let i = 0; i < ALPHABET.length; i += 1) VALEURS[ALPHABET.charCodeAt(i)] = i

/**
 * Décodage base64 sans `atob` ni `Buffer` : le module sert aussi bien le
 * runtime Convex que le runtime Node, et les tests en environnement edge.
 */
function depuisBase64(texte: string): Uint8Array {
  const bourrage = texte.endsWith("==") ? 2 : texte.endsWith("=") ? 1 : 0
  const longueur = (texte.length / 4) * 3 - bourrage
  const sortie = new Uint8Array(longueur)
  let j = 0
  for (let i = 0; i < texte.length; i += 4) {
    const n =
      (VALEURS[texte.charCodeAt(i)]! << 18) |
      (VALEURS[texte.charCodeAt(i + 1)]! << 12) |
      (VALEURS[texte.charCodeAt(i + 2)]! << 6) |
      VALEURS[texte.charCodeAt(i + 3)]!
    if (j < longueur) sortie[j++] = (n >> 16) & 0xff
    if (j < longueur) sortie[j++] = (n >> 8) & 0xff
    if (j < longueur) sortie[j++] = n & 0xff
  }
  return sortie
}

type Fonte = ReturnType<typeof fontkit.create>

/** Octets et table des caractères, décodés une fois par instance. */
const cache = new Map<string, { octets: Uint8Array; fonte: Fonte }>()

function charger(style: StylePolice, coupe: Coupe) {
  const cle = `${style}:${coupe}`
  let entree = cache.get(cle)
  if (!entree) {
    const octets = depuisBase64(POLICES[style][coupe])
    entree = { octets, fonte: fontkit.create(octets) }
    cache.set(cle, entree)
  }
  return entree
}

/* ─────────────────────────── Couverture ───────────────────────────────── */

/** Plage des caractères de commande : rien d'imprimable. */
function commande(code: number): boolean {
  return code < 0x20 || (code >= 0x7f && code <= 0x9f)
}

function connu(style: StylePolice, coupe: Coupe, code: number): boolean {
  return !commande(code) && charger(style, coupe).fonte.hasGlyphForCodePoint(code)
}

/** Première coupe qui connaît le caractère, ou `null`. */
function coupeDe(style: StylePolice, caractere: string): Coupe | null {
  const code = caractere.codePointAt(0)!
  return COUPES.find((coupe) => connu(style, coupe, code)) ?? null
}

/**
 * Texte réécrit avec les seuls caractères que la police sait dessiner, et
 * la coupe à employer pour chacun.
 */
function preparer(
  style: StylePolice,
  texte: string,
): { caractere: string; coupe: Coupe }[] {
  const sortie: { caractere: string; coupe: Coupe }[] = []
  for (const caractere of texte.normalize("NFC")) {
    const coupe = coupeDe(style, caractere)
    if (coupe) {
      sortie.push({ caractere, coupe })
      continue
    }
    // Signe diacritique isolé, que NFC n'a pas su composer : on le laisse
    // tomber, la lettre qui le porte reste.
    if (/\p{M}/u.test(caractere)) continue
    // Espace absente (fine, insécable étroite…) : une espace ordinaire.
    if (/\p{Zs}/u.test(caractere)) {
      sortie.push({ caractere: " ", coupe: "latin" })
      continue
    }
    // Lettre accentuée inconnue : la lettre de base, si la police l'a.
    const base = [...caractere.normalize("NFD").replace(/\p{M}/gu, "")]
    const coupes = base.map((c) => coupeDe(style, c))
    if (base.length > 0 && coupes.every((c) => c !== null)) {
      base.forEach((c, i) => sortie.push({ caractere: c, coupe: coupes[i]! }))
      continue
    }
    sortie.push({ caractere: "?", coupe: "latin" })
  }
  return sortie
}

/**
 * Ce que la police imprimera réellement pour ce texte — utile aux tests et
 * pour savoir si un nom a été altéré.
 */
export function texteImprimable(style: StylePolice, texte: string): string {
  return preparer(style, texte)
    .map((p) => p.caractere)
    .join("")
}

/** Vrai si l'un des textes demande la coupe étendue dans l'un des styles. */
export function demandeCoupeEtendue(
  styles: readonly StylePolice[],
  textes: readonly string[],
): boolean {
  return styles.some((style) =>
    textes.some((texte) =>
      preparer(style, texte).some((p) => p.coupe === "etendu"),
    ),
  )
}

/* ─────────────────────────── Jeu de polices ───────────────────────────── */

export interface Polices {
  /** Largeur du texte, en points. */
  largeur(
    texte: string,
    style: StylePolice,
    taille: number,
    interlettrage?: number,
  ): number
  /** Écrit le texte, la ligne de base en `y`. Rend la largeur écrite. */
  ecrire(page: PDFPage, texte: string, options: OptionsTexte): number
  /**
   * Taille à laquelle le texte tient dans `largeurMax`, entre `taille` et
   * `tailleMin` ; en dessous, le texte est coupé d'une ellipse.
   */
  ajuster(
    texte: string,
    style: StylePolice,
    taille: number,
    largeurMax: number,
    tailleMin?: number,
  ): { texte: string; taille: number }
}

export interface OptionsTexte {
  x: number
  y: number
  style: StylePolice
  taille: number
  couleur: Color
  opacite?: number
  /** Espacement supplémentaire entre les lettres, en points. */
  interlettrage?: number
  /** Position de `x` par rapport au texte. */
  alignement?: "gauche" | "centre" | "droite"
}

/**
 * Embarque les polices dans le document. `textes` : tout le texte variable
 * du document (noms, gares…), pour décider s'il faut la coupe étendue.
 */
export async function chargerPolices(
  doc: PDFDocument,
  textes: readonly string[],
): Promise<Polices> {
  doc.registerFontkit(fontkit)
  const styles = Object.keys(POLICES) as StylePolice[]
  const coupes: readonly Coupe[] = demandeCoupeEtendue(styles, textes)
    ? COUPES
    : ["latin"]

  const fontes = new Map<string, PDFFont>()
  for (const style of styles) {
    for (const coupe of coupes) {
      const police = await doc.embedFont(charger(style, coupe).octets, {
        subset: true,
      })
      fontes.set(`${style}:${coupe}`, police)
    }
  }

  /** Découpe le texte en tronçons d'une même coupe. */
  const troncons = (texte: string, style: StylePolice) => {
    const sortie: { police: PDFFont; texte: string; lettres: number }[] = []
    for (const { caractere, coupe } of preparer(style, texte)) {
      // La coupe étendue n'est chargée que si un texte connu l'exigeait ; un
      // texte imprévu retombe sur « ? » plutôt que d'échouer.
      const police = fontes.get(`${style}:${coupe}`)
      const car = police ? caractere : "?"
      const cible = police ?? fontes.get(`${style}:latin`)!
      const dernier = sortie[sortie.length - 1]
      if (dernier && dernier.police === cible) {
        dernier.texte += car
        dernier.lettres += 1
      } else sortie.push({ police: cible, texte: car, lettres: 1 })
    }
    return sortie
  }

  const largeur: Polices["largeur"] = (texte, style, taille, interlettrage = 0) => {
    let total = 0
    let lettres = 0
    for (const t of troncons(texte, style)) {
      total += t.police.widthOfTextAtSize(t.texte, taille)
      lettres += t.lettres
    }
    return total + interlettrage * Math.max(0, lettres - 1)
  }

  return {
    largeur,
    ecrire(page, texte, options) {
      const interlettrage = options.interlettrage ?? 0
      const total = largeur(texte, options.style, options.taille, interlettrage)
      let x =
        options.alignement === "droite"
          ? options.x - total
          : options.alignement === "centre"
            ? options.x - total / 2
            : options.x
      // L'espacement des caractères fait partie de l'état graphique : posé
      // avant `drawText`, il vaut à l'intérieur de son bloc q … Q.
      if (interlettrage !== 0) page.pushOperators(setCharacterSpacing(interlettrage))
      for (const t of troncons(texte, options.style)) {
        page.drawText(t.texte, {
          x,
          y: options.y,
          font: t.police,
          size: options.taille,
          color: options.couleur,
          opacity: options.opacite,
        })
        x +=
          t.police.widthOfTextAtSize(t.texte, options.taille) +
          interlettrage * t.lettres
      }
      if (interlettrage !== 0) page.pushOperators(setCharacterSpacing(0))
      return total
    },
    ajuster(texte, style, taille, largeurMax, tailleMin = taille) {
      for (let t = taille; t >= tailleMin; t -= 0.5) {
        if (largeur(texte, style, t) <= largeurMax) return { texte, taille: t }
      }
      const lettres = [...texte]
      while (lettres.length > 1) {
        lettres.pop()
        const coupe = `${lettres.join("").trimEnd()}…`
        if (largeur(coupe, style, tailleMin) <= largeurMax) {
          return { texte: coupe, taille: tailleMin }
        }
      }
      return { texte: "…", taille: tailleMin }
    },
  }
}
