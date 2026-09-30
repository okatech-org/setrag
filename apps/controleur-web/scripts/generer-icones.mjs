/**
 * Icônes du terminal installable (PNG), rastérisées depuis l'icône d'app du
 * design system (`packages/ui/src/marque/svg`, générée par
 * scripts/marque/generer.mjs) — le S épaissi, lisible à 48 px, comme la
 * billetterie.
 *
 * Relancer après toute modification du logo, depuis apps/controleur-web :
 *
 *   node scripts/generer-icones.mjs
 */

import { mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SOURCE = path.join(
  RACINE,
  "..",
  "..",
  "packages",
  "ui",
  "src",
  "marque",
  "svg"
)
const ICONES = path.join(RACINE, "public", "icons")

const icone = path.join(SOURCE, "setrag-icone-app.svg")

async function rasteriser(taille, nom) {
  await sharp(icone, { density: 384 })
    .resize(taille, taille)
    .png()
    .toFile(path.join(ICONES, nom))
}

/**
 * Icône « maskable » : Android la découpe en cercle ou en goutte. Le symbole
 * tient dans la zone sûre (cercle de 80 %), d'où la réduction à 72 % sur un
 * fond blanc plein.
 */
async function maskable(taille, nom) {
  const interieur = Math.round(taille * 0.72)
  const symbole = await sharp(icone, { density: 384 })
    .resize(interieur, interieur)
    .png()
    .toBuffer()
  await sharp({
    create: {
      width: taille,
      height: taille,
      channels: 4,
      background: "#ffffff",
    },
  })
    .composite([{ input: symbole, gravity: "center" }])
    .png()
    .toFile(path.join(ICONES, nom))
}

await mkdir(ICONES, { recursive: true })
await rasteriser(192, "icon-192.png")
await rasteriser(512, "icon-512.png")
await rasteriser(180, "apple-touch-icon.png")
await maskable(512, "icon-maskable-512.png")

console.log("public/icons à jour")
