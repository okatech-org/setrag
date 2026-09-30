// Génère convex/lib/policesDonnees.ts — les polices de la charte SETRAG,
// embarquées dans le bundle Convex pour composer le billet PDF.
//
//   cd packages/backend && bun run ressources
//
// Relancer après une montée de version des paquets @fontsource, ou pour
// ajouter une graisse (tableau STYLES ci-dessous ; convex/lib/polices.ts
// embarque tout ce que contient le module généré).
//
// Pourquoi un module en base64 : le bundler de Convex (esbuild) n'a pas de
// chargeur pour les fichiers binaires, et une police ne doit pas dépendre
// d'un appel réseau au moment d'imprimer un billet. Le texte base64 passe
// partout, dans le runtime Convex comme dans le runtime Node.
//
// Source : les mêmes paquets @fontsource que le web (packages/ui), en
// instances statiques — pdf-lib ne sait pas choisir une graisse dans une
// police variable. Chaque graisse existe en deux coupes, « latin » (Latin-1,
// ponctuation) et « latin-ext » (Latin étendu : Ł, Ş, Ă…) ; la seconde n'est
// embarquée dans un PDF que si un nom l'exige.
//
// Les fichiers WOFF sont reconvertis en TrueType nu : pdf-lib et fontkit
// traitent le TrueType de façon éprouvée, le WOFF beaucoup moins. pdf-lib
// en extrait ensuite, à chaque billet, le seul sous-ensemble des glyphes
// utilisés (`subset: true`) : le PDF reste léger.

import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { inflateSync } from "node:zlib"

import fontkit from "@pdf-lib/fontkit"

const require = createRequire(import.meta.url)

/** Clé du module → paquet @fontsource et graisse. */
const STYLES = [
  ["texte", "schibsted-grotesk", 400],
  ["moyen", "schibsted-grotesk", 500],
  ["demi", "schibsted-grotesk", 600],
  ["mono", "ibm-plex-mono", 400],
  ["monoDemi", "ibm-plex-mono", 600],
]
const COUPES = [
  ["latin", "latin"],
  ["etendu", "latin-ext"],
]

/** WOFF 1.0 → TrueType : on décompresse chaque table et on refait l'en-tête. */
function woffVersTtf(woff) {
  const dv = new DataView(woff.buffer, woff.byteOffset, woff.byteLength)
  if (dv.getUint32(0) !== 0x774f4646) throw new Error("Fichier non WOFF")
  const saveur = dv.getUint32(4)
  const nombre = dv.getUint16(12)

  const tables = []
  for (let i = 0; i < nombre; i += 1) {
    const o = 44 + i * 20
    const debut = dv.getUint32(o + 4)
    const compresse = dv.getUint32(o + 8)
    const longueur = dv.getUint32(o + 12)
    const brut = woff.subarray(debut, debut + compresse)
    const donnees = compresse < longueur ? inflateSync(brut) : brut
    if (donnees.length !== longueur) throw new Error("Table WOFF tronquée")
    tables.push({
      etiquette: dv.getUint32(o),
      somme: dv.getUint32(o + 16),
      donnees,
    })
  }

  const aligne = (n) => (n + 3) & ~3
  const entete = 12 + 16 * nombre
  const taille = tables.reduce((t, x) => t + aligne(x.donnees.length), entete)
  const ttf = new Uint8Array(taille)
  const sortie = new DataView(ttf.buffer)

  const selecteur = Math.floor(Math.log2(nombre))
  const plage = 2 ** selecteur * 16
  sortie.setUint32(0, saveur)
  sortie.setUint16(4, nombre)
  sortie.setUint16(6, plage)
  sortie.setUint16(8, selecteur)
  sortie.setUint16(10, nombre * 16 - plage)

  let position = entete
  tables.forEach((table, i) => {
    const o = 12 + i * 16
    sortie.setUint32(o, table.etiquette)
    sortie.setUint32(o + 4, table.somme)
    sortie.setUint32(o + 8, position)
    sortie.setUint32(o + 12, table.donnees.length)
    ttf.set(table.donnees, position)
    position += aligne(table.donnees.length)
  })
  return ttf
}

const version = (paquet) =>
  JSON.parse(readFileSync(require.resolve(`@fontsource/${paquet}/package.json`), "utf8")).version

const entrees = []
let total = 0
for (const [cle, paquet, graisse] of STYLES) {
  const coupes = []
  for (const [nom, sousEnsemble] of COUPES) {
    const chemin = require.resolve(`@fontsource/${paquet}/files/${paquet}-${sousEnsemble}-${graisse}-normal.woff`)
    const ttf = woffVersTtf(new Uint8Array(readFileSync(chemin)))
    // Contrôle : la police se relit, et c'est bien la graisse attendue.
    const police = fontkit.create(ttf)
    const poids = police["OS/2"].usWeightClass
    if (poids !== graisse) throw new Error(`${paquet} ${graisse} : graisse lue ${poids}`)
    total += ttf.length
    coupes.push(`${nom}: "${Buffer.from(ttf).toString("base64")}"`)
    console.log(`${cle.padEnd(9)} ${sousEnsemble.padEnd(9)} ${police.familyName} ${poids} — ${police.numGlyphs} glyphes, ${(ttf.length / 1024).toFixed(1)} Ko`)
  }
  entrees.push(`  /** ${paquet} ${graisse} (@fontsource ${version(paquet)}) */\n  ${cle}: {\n    ${coupes.join(",\n    ")},\n  }`)
}

const sortie = fileURLToPath(new URL("../convex/lib/policesDonnees.ts", import.meta.url))
writeFileSync(
  sortie,
  `// Généré par scripts/generer-polices.mjs — ne pas modifier à la main.\n` +
    `// Polices TrueType en base64 : Schibsted Grotesk et IBM Plex Mono, licence\n` +
    `// SIL Open Font License 1.1, issues des paquets @fontsource.\n\n` +
    `export const POLICES = {\n${entrees.join(",\n")},\n} as const\n`,
)
console.log(`convex/lib/policesDonnees.ts — ${(total / 1024).toFixed(0)} Ko de TrueType`)
