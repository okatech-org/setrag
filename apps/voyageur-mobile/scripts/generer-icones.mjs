/**
 * Icône et écran de démarrage de l'app, rastérisés depuis les SVG du design
 * system (`packages/ui/src/marque/svg`, générés par scripts/marque/generer.mjs).
 * Rien ne se dessine ici : relancer après toute modification du logo.
 *
 *   bun run icones
 *
 * Puis `bunx expo prebuild --clean` : les icônes natives sont copiées au prebuild.
 */

import path from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SOURCE = path.join(RACINE, "..", "..", "packages", "ui", "src", "marque", "svg")
const ASSETS = path.join(RACINE, "assets")
const BLANC = "#ffffff"

const svg = (nom) => sharp(path.join(SOURCE, nom), { density: 384 })

/** iOS refuse toute transparence dans l'icône : fond blanc aplati. */
await svg("setrag-icone-app.svg").resize(1024, 1024).flatten({ background: BLANC }).png().toFile(path.join(ASSETS, "icon.png"))

/**
 * Icône adaptative Android : le système découpe le premier plan en cercle ou
 * en goutte. Le symbole tient dans la zone sûre (66 % du cadre) ; le fond blanc
 * est posé par `adaptiveIcon.backgroundColor`.
 */
const interieur = Math.round(1024 * 0.62)
const symbole = await svg("setrag-symbole-ruban.svg").resize({ height: interieur }).png().toBuffer()
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: symbole, gravity: "center" }])
  .png()
  .toFile(path.join(ASSETS, "adaptive-icon.png"))

/** Démarrage : fond blanc, rien d'autre que le logo complet. */
await svg("setrag-logo.svg").resize({ width: 1200 }).png().toFile(path.join(ASSETS, "splash.png"))

console.log("assets/icon.png, assets/adaptive-icon.png et assets/splash.png à jour")
