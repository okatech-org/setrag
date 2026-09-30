// Génère convex/lib/walletImages.ts — les images du pass Apple Wallet, en PNG
// base64 : l'icône d'application et le logo compact en négatif.
//
//   cd packages/backend && bun run ressources
//
// Relancer après toute modification du logo (packages/ui/scripts/marque/).
//
// Les images partent de la géométrie unique du logo — `logo()` et
// `iconeApp()` de packages/ui/scripts/marque/marque.mjs, les fonctions qui
// écrivent aussi src/marque/svg/ —, rastérisées par sharp comme les icônes de
// la billetterie. Apple exige des PNG, embarqués dans le .pkpass : ils sont
// donc fabriqués ici, pas à la volée dans une action.

import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

import { iconeApp, logo } from "../../ui/scripts/marque/marque.mjs"

// Icône : le S et son ruban sur fond blanc (notifications, écran verrouillé).
const icone = Buffer.from(iconeApp({ taille: 512 }))
// Logo : compact (sans signature), négatif — il se pose sur le fond encre du
// pass. Cadre 245 × 110 : 50 points de haut en font 111 de large, sous la
// limite de 160 × 50 fixée par Apple.
const logoNegatif = Buffer.from(logo({ variante: "compact", theme: "negatif", titre: "" }))

const rasteriser = async (svg, hauteur) =>
  (await sharp(svg, { density: 72 * Math.ceil(hauteur / 50) * 4 }).resize({ height: hauteur }).png().toBuffer()).toString("base64")

const images = {
  "icon.png": await rasteriser(icone, 29),
  "icon@2x.png": await rasteriser(icone, 58),
  "icon@3x.png": await rasteriser(icone, 87),
  "logo.png": await rasteriser(logoNegatif, 50),
  "logo@2x.png": await rasteriser(logoNegatif, 100),
  "logo@3x.png": await rasteriser(logoNegatif, 150),
}

const sortie = fileURLToPath(new URL("../convex/lib/walletImages.ts", import.meta.url))
writeFileSync(
  sortie,
  `// Généré par scripts/generer-images-wallet.mjs — ne pas modifier à la main.\n` +
    `// Images du pass Apple Wallet (PNG en base64), rastérisées depuis le logo SETRAG.\n\n` +
    `export const IMAGES_WALLET = {\n` +
    Object.entries(images)
      .map(([nom, base64]) => `  "${nom}": "${base64}",`)
      .join("\n") +
    `\n} as const\n`,
)
const total = Object.values(images).reduce((t, b) => t + (b.length * 3) / 4, 0)
console.log(`convex/lib/walletImages.ts — ${Object.keys(images).length} images, ${(total / 1024).toFixed(1)} Ko`)
