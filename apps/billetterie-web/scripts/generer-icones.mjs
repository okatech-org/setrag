/**
 * Fabrique les icônes de l'application installable à partir du logo SETRAG.
 *
 * Le logo est un ensemble horizontal — la marque, le nom, la baseline. Rien de
 * tout cela n'est lisible dans un carré de 48 px sur un écran d'accueil. Seul
 * le « S » ferroviaire l'est : c'est la partie de la marque que le script
 * découpe, sur une pastille blanche posée sur le bleu SETRAG.
 *
 * Le découpage est automatique et non un recadrage à la main : on part des
 * pixels franchement rouges (le rail), on les dilate de quelques pixels pour
 * récupérer l'ombre et les traverses blanches, puis on efface tout le reste.
 * Le nom et la barre dégradée du logo, qui touchent le bas du « S », tombent
 * ainsi d'eux-mêmes — un recadrage rectangulaire en gardait toujours un bout.
 *
 * Relancer après toute modification du logo :
 *
 *   bun run icones
 */

import { mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const LOGO = path.join(RACINE, "public", "setrag-logo.png")
const DESTINATION = path.join(RACINE, "public", "icons")

/** Bleu du logo, celui de `--c-accent` et de la barre système. */
const BLEU = "#0F52A0"

/** Zone du logo qui contient le « S », nom et baseline exclus autant que possible. */
const DECOUPE = { left: 40, top: 42, width: 202, height: 358 }

/** Rayon de dilatation du masque rouge, en pixels du logo d'origine. */
const DILATATION = 6

/**
 * Isole le « S » ferroviaire, fond transparent.
 */
async function marque() {
  const { data, info } = await sharp(LOGO)
    .extract(DECOUPE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info

  const rouge = new Uint8Array(width * height)
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * channels
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    if (r > 110 && r - g > 50 && r - b > 50) rouge[pixel] = 1
  }

  const garde = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!rouge[y * width + x]) continue
      for (let dy = -DILATATION; dy <= DILATATION; dy += 1) {
        for (let dx = -DILATATION; dx <= DILATATION; dx += 1) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          garde[ny * width + nx] = 1
        }
      }
    }
  }

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * channels
    if (!garde[pixel]) {
      data[index + 3] = 0
      continue
    }
    // Le fond blanc du logo disparaît, mais pas les traverses : elles sont
    // entourées de rouge, donc dans la zone gardée, et le blanc pur du fond
    // est le seul à être effacé — la nuance suffit à distinguer les deux.
    const [r, g, b] = [data[index], data[index + 1], data[index + 2]]
    if (r > 245 && g > 245 && b > 245) data[index + 3] = 0
  }

  return sharp(data, { raw: { width, height, channels } })
    .png()
    .trim({ threshold: 5 })
    .toBuffer()
}

/**
 * Compose une icône carrée : pastille blanche sur fond bleu, « S » centré.
 *
 * `partPastille` et `partMarque` sont des fractions du côté. Les icônes
 * masquables les réduisent : Android rogne jusqu'à 20 % de chaque bord, et ce
 * qui dépasse de la zone sûre disparaît sous le masque du constructeur.
 */
async function composer(source, { taille, partPastille, partMarque, fichier }) {
  const hauteur = Math.round(taille * partMarque)
  const marqueRedimensionnee = await sharp(source)
    .resize({ height: hauteur })
    .png()
    .toBuffer()
  const { width: largeur } = await sharp(marqueRedimensionnee).metadata()
  const rayon = Math.round(taille * partPastille)
  const pastille = Buffer.from(
    `<svg width="${taille}" height="${taille}">` +
      `<circle cx="${taille / 2}" cy="${taille / 2}" r="${rayon}" fill="#ffffff"/></svg>`
  )

  await sharp({
    create: { width: taille, height: taille, channels: 4, background: BLEU },
  })
    .composite([
      { input: pastille },
      {
        input: marqueRedimensionnee,
        left: Math.round((taille - largeur) / 2),
        top: Math.round((taille - hauteur) / 2),
      },
    ])
    .png()
    .toFile(path.join(DESTINATION, fichier))
}

const source = await marque()
await mkdir(DESTINATION, { recursive: true })

await Promise.all([
  composer(source, {
    taille: 192,
    partPastille: 0.42,
    partMarque: 0.58,
    fichier: "icon-192.png",
  }),
  composer(source, {
    taille: 512,
    partPastille: 0.42,
    partMarque: 0.58,
    fichier: "icon-512.png",
  }),
  composer(source, {
    taille: 512,
    partPastille: 0.34,
    partMarque: 0.46,
    fichier: "icon-maskable-512.png",
  }),
  // iOS ne connaît ni `purpose` ni les masques : il arrondit lui-même les
  // angles d'une icône pleine, qui doit donc porter le fond jusqu'au bord.
  composer(source, {
    taille: 180,
    partPastille: 0.42,
    partMarque: 0.58,
    fichier: "apple-touch-icon.png",
  }),
])

console.log(`Icônes écrites dans ${path.relative(RACINE, DESTINATION)}`)
