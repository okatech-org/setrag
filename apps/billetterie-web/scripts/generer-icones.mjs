/**
 * Prépare les fichiers de marque de la billetterie à partir de ceux du design
 * system (`packages/ui/src/marque/svg`, générés par scripts/marque/generer.mjs) :
 *
 * - les icônes de l'application installable (PNG), rastérisées depuis l'icône
 *   d'app — le S épaissi, qui reste lisible à 48 px ;
 * - les logos SVG téléchargeables depuis la page /charte ;
 * - le logo en PNG des e-mails envoyés au voyageur.
 *
 * Relancer après toute modification du logo :
 *
 *   bun run icones
 */

import { copyFile, mkdir, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SOURCE = path.join(RACINE, "..", "..", "packages", "ui", "src", "marque", "svg")
const ICONES = path.join(RACINE, "public", "icons")
const MARQUE = path.join(RACINE, "public", "marque")

const icone = path.join(SOURCE, "setrag-icone-app.svg")

async function rasteriser(taille, nom) {
  await sharp(icone, { density: 384 }).resize(taille, taille).png().toFile(path.join(ICONES, nom))
}

/**
 * Icône « maskable » : Android la découpe en cercle ou en goutte. Le symbole
 * doit tenir dans la zone sûre (cercle de 80 %), d'où la réduction à 72 %
 * sur un fond blanc plein.
 */
async function maskable(taille, nom) {
  const interieur = Math.round(taille * 0.72)
  const symbole = await sharp(icone, { density: 384 }).resize(interieur, interieur).png().toBuffer()
  await sharp({ create: { width: taille, height: taille, channels: 4, background: "#ffffff" } })
    .composite([{ input: symbole, gravity: "center" }])
    .png()
    .toFile(path.join(ICONES, nom))
}

await mkdir(ICONES, { recursive: true })
await mkdir(MARQUE, { recursive: true })

/**
 * Logo complet en PNG pour les e-mails : les messageries (Gmail en tête)
 * n'affichent pas le SVG. 600 px de large, affiché à 200 dans le message
 * (`packages/backend/convex/lib/courriels.ts`) : net sur un écran dense.
 */
async function logoCourriel() {
  await sharp(path.join(SOURCE, "setrag-logo.svg"), { density: 384 })
    .resize({ width: 600 })
    .png()
    .toFile(path.join(MARQUE, "setrag-logo.png"))
}

await rasteriser(192, "icon-192.png")
await rasteriser(512, "icon-512.png")
await rasteriser(180, "apple-touch-icon.png")
await maskable(512, "icon-maskable-512.png")
await logoCourriel()

for (const fichier of await readdir(SOURCE)) {
  if (fichier.endsWith(".svg")) await copyFile(path.join(SOURCE, fichier), path.join(MARQUE, fichier))
}

console.log("public/icons et public/marque à jour")
