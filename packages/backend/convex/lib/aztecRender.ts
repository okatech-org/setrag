import {
  render,
  type DrawingContext,
  type RenderOptions,
} from "bwip-js/browser"
import { mergeRuns, rasterize, type Polygon, type Run } from "../model/aztec"

/**
 * Encodage d'un texte en symbole Aztec, rendu sous forme de grille.
 *
 * L'encodeur est celui de bwip-js — portage de BWIPP, la référence libre en
 * matière de codes-barres. On lui retire seulement sa sortie graphique : au
 * lieu d'un canvas ou d'un SVG, on capte les polygones qu'il produit et on en
 * reconstitue la grille de modules, qui se dessine ensuite en rectangles dans
 * le PDF. Voir `model/aztec.ts` pour le détail de ce choix.
 *
 * Le build `browser` est retenu délibérément : il ne dépend d'aucune API
 * Node, ce qui laisse ce module utilisable des deux côtés.
 */

/** Symbole prêt à dessiner. */
export interface AztecSymbol {
  /** Côté du symbole, en modules. */
  readonly columns: number
  readonly rows: number
  /** Segments horizontaux encrés, à dessiner en rectangles. */
  readonly runs: readonly Run[]
}

/**
 * Aztec « plein » plutôt que compact.
 *
 * La variante compacte plafonne à quelques dizaines d'octets ; nos titres
 * signés en font près de deux cents. bwip-js choisit de lui-même la taille du
 * symbole en fonction de la charge.
 */
const SYMBOLOGY = "azteccode"

/**
 * Taux de correction d'erreur, en pourcentage.
 *
 * Le défaut de la spécification est 23 %. On monte à 30 % : un billet vit
 * dans une poche, se froisse et se salit, et un contrôle raté coûte plus
 * cher que les quelques modules supplémentaires que cela ajoute.
 */
const ERROR_CORRECTION_PCT = 30

/**
 * Les typages de bwip-js ne décrivent que les options communes à toutes les
 * symbologies ; celles propres à chacune, comme `eclevel`, passent bien au
 * moteur BWIPP mais n'y figurent pas. On les déclare ici plutôt que de
 * neutraliser le typage de l'appel entier.
 */
type AztecOptions = RenderOptions & { eclevel?: string }

export function encodeAztec(text: string): AztecSymbol {
  let width = 0
  let height = 0
  const polygons: Polygon[] = []

  const capture: DrawingContext<void> = {
    scale: () => null,
    measure: () => ({ width: 0, ascent: 0, descent: 0 }),
    init: (w, h) => {
      width = w
      height = h
    },
    line: () => {},
    polygon: (pts) => {
      polygons.push(pts)
    },
    hexagon: () => {},
    ellipse: () => {},
    fill: () => {},
    text: () => {},
    end: () => {},
  }

  const options: AztecOptions = {
    bcid: SYMBOLOGY,
    text,
    scale: 1,
    includetext: false,
    eclevel: String(ERROR_CORRECTION_PCT),
  }
  render(options, capture)

  if (width === 0 || polygons.length === 0) {
    throw new Error("Encodage Aztec vide : symbole non produit")
  }

  // À l'échelle 1, bwip-js émet deux unités par module.
  const matrix = rasterize(polygons, width, height, 2)
  return {
    columns: matrix.columns,
    rows: matrix.rows,
    runs: mergeRuns(matrix),
  }
}
