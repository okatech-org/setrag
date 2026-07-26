/**
 * Rastérisation d'un symbole Aztec — logique pure.
 *
 * L'encodeur Aztec lui-même est celui de bwip-js, portage de BWIPP : il n'y a
 * aucune raison de réécrire une spécification aussi fournie. Mais bwip-js ne
 * rend qu'un canvas ou un SVG, et ni l'un ni l'autre ne s'embarque tel quel
 * dans un PDF :
 *
 *  — le canvas n'existe pas dans le runtime Convex ;
 *  — le chemin SVG se remplit en `evenodd`, règle que `pdf-lib` ne sait pas
 *    appliquer. Dessiné en remplissage non nul, le symbole aurait ses trous
 *    bouchés et deviendrait illisible.
 *
 * Ce module fait donc la conversion manquante : il reçoit les polygones émis
 * par bwip-js et en reconstitue la grille de modules, qui se dessine ensuite
 * en rectangles — vectoriels, exacts, et sans dépendance graphique.
 *
 * Repère : celui de bwip-js, hérité de PostScript — origine en bas à gauche.
 * C'est aussi celui du PDF, ce qui évite toute inversion.
 */

/** Polygone rectiligne fermé, tel que bwip-js l'émet. */
export type Polygon = ReadonlyArray<readonly [number, number]>

/** Grille de modules, indexée `[ligne depuis le bas][colonne depuis la gauche]`. */
export interface AztecMatrix {
  readonly columns: number
  readonly rows: number
  readonly modules: ReadonlyArray<ReadonlyArray<boolean>>
}

/**
 * Reconstitue la grille de modules à partir des polygones.
 *
 * Le test appliqué au centre de chaque module est le lancer de rayon à parité
 * — exactement la règle `evenodd` du SVG. Les centres tombent au demi-module,
 * donc jamais sur une arête : aucun cas dégénéré à traiter.
 */
export function rasterize(
  polygons: readonly Polygon[],
  width: number,
  height: number,
  moduleSize: number,
): AztecMatrix {
  if (moduleSize <= 0) {
    throw new Error(`Taille de module invalide : ${moduleSize}`)
  }
  if (width % moduleSize !== 0 || height % moduleSize !== 0) {
    throw new Error(
      `Symbole non aligné sur la grille : ${width}×${height} pour un module ` +
        `de ${moduleSize}`,
    )
  }

  const columns = width / moduleSize
  const rows = height / moduleSize
  const modules: boolean[][] = []

  for (let row = 0; row < rows; row += 1) {
    const y = (row + 0.5) * moduleSize
    const line: boolean[] = []
    for (let col = 0; col < columns; col += 1) {
      line.push(covers(polygons, (col + 0.5) * moduleSize, y))
    }
    modules.push(line)
  }

  return { columns, rows, modules }
}

/** Vrai si le point est encré selon la règle de parité. */
function covers(polygons: readonly Polygon[], x: number, y: number): boolean {
  let crossings = 0
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i += 1) {
      const [x1, y1] = polygon[i]!
      const [x2, y2] = polygon[(i + 1) % polygon.length]!
      // Arête franchissant l'ordonnée du rayon, bornes traitées une seule
      // fois pour ne pas compter deux fois un sommet.
      if (y1 > y !== y2 > y) {
        const crossX = x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)
        if (crossX > x) crossings += 1
      }
    }
  }
  return crossings % 2 === 1
}

/** Suite horizontale de modules encrés, dans une ligne donnée. */
export interface Run {
  readonly row: number
  readonly col: number
  readonly length: number
}

/**
 * Regroupe les modules encrés en segments horizontaux.
 *
 * Un symbole de 49 modules de côté compte près de 1 200 cases noires ; les
 * fusionner divise par trois le nombre d'opérateurs du PDF, et surtout évite
 * les liserés blancs que le lissage d'un lecteur PDF peut faire apparaître
 * entre deux rectangles jointifs.
 */
export function mergeRuns(matrix: AztecMatrix): Run[] {
  const runs: Run[] = []
  for (let row = 0; row < matrix.rows; row += 1) {
    const line = matrix.modules[row]!
    let start = -1
    for (let col = 0; col <= matrix.columns; col += 1) {
      const inked = col < matrix.columns && line[col] === true
      if (inked && start === -1) start = col
      if (!inked && start !== -1) {
        runs.push({ row, col: start, length: col - start })
        start = -1
      }
    }
  }
  return runs
}

/** Nombre de modules encrés — utile pour vérifier qu'un symbole n'est pas vide. */
export function inkedCount(matrix: AztecMatrix): number {
  return matrix.modules.reduce(
    (total, line) => total + line.filter(Boolean).length,
    0,
  )
}
