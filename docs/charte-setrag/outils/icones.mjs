// Construit le sprite d'icônes des maquettes à partir de Lucide, la bibliothèque
// déjà utilisée par packages/ui (lucide-react) et l'app mobile
// (lucide-react-native) : les maquettes montrent les vraies icônes du produit.
//   bun outils/icones.mjs
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const NOMS = `search ticket clock user train-front train-track armchair luggage credit-card smartphone check
circle-check arrow-left-right arrow-right arrow-left arrow-up-down calendar calendar-days map-pin bell bell-ring
share-2 download info triangle-alert sliders-horizontal chevron-right chevron-left chevron-down chevron-up x plus
minus wifi-off wifi sun wallet refresh-cw house route lock phone mail settings log-out users baby shield-check dog
package moon globe list map star timer hourglass scan-line badge-percent receipt file-text circle-help languages
accessibility snowflake utensils navigation ellipsis copy external-link eye pencil trash-2 circle-x circle-alert
id-card signal battery-full circle-user-round clock-alert qr-code history rotate-ccw calendar-clock message-square
mic mic-off arrow-up maximize-2 minimize-2 keyboard headset phone-call square-pen square bell-plus`
  .split(/\s+/)
  .filter(Boolean)

const racine = fileURLToPath(new URL("../../../node_modules/lucide-react/dist/esm/icons/", import.meta.url))
const symboles = []
for (const nom of NOMS) {
  // Certains fichiers ne sont que des alias : on suit l'import jusqu'à l'icône.
  let mod = await import(`${racine}${nom}.mjs`)
  if (!mod.__iconNode) {
    const source = await Bun.file(`${racine}${nom}.mjs`).text()
    const cible = source.match(/from ['"]\.\/([\w-]+)\.mjs['"]/)?.[1]
    mod = await import(`${racine}${cible}.mjs`)
  }
  const corps = mod.__iconNode
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ")}/>`)
    .join("")
  symboles.push(`<symbol id="i-${nom}" viewBox="0 0 24 24">${corps}</symbol>`)
}
const sortie = fileURLToPath(new URL("../shared/icones.js", import.meta.url))
writeFileSync(
  sortie,
  `// Généré par outils/icones.mjs depuis lucide-react (ISC) — ne pas modifier à la main.\n` +
    `export const SPRITE = ${JSON.stringify(`<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${symboles.join("")}</svg>`)}\n`,
)
console.log(`${NOMS.length} icônes → shared/icones.js`)
