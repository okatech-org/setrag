// Génère src/marque/traces.ts — tous les tracés du logo SETRAG, précalculés —
// et les fichiers livrables de src/marque/svg/ (logos, icône d'app).
//   bun scripts/marque/generer.mjs
//
// Source unique de la géométrie : geo.mjs (le S) et logo-geom.mjs (le mot et
// la signature, extraits de Schibsted Grotesk 800 italique par glyphes.mjs).
// Les composants React ne calculent rien : ils posent ces chaînes dans du SVG.

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { S_SEGMENTS, arcTable, etapesOklch, offsetPoints, pointsD, segmentsD } from "./geo.mjs"
import { LOGO } from "./logo-geom.mjs"
import { COULEURS, contoursD, iconeApp, logo } from "./marque.mjs"

const T = arcTable(S_SEGMENTS)
const rails = (ecart) => [pointsD(offsetPoints(T, -ecart)), pointsD(offsetPoints(T, ecart))]
const etapes = (hexes) => etapesOklch(hexes).map(([o, c]) => [Number(o.toFixed(3)), c])

const traces = {
  s: segmentsD(S_SEGMENTS),
  rails: rails(3.3),
  railsPetit: rails(5),
  lettres: LOGO.mot.lettres.map((l) => contoursD(l.contours)),
  signature: contoursD(LOGO.signature.contours),
  ruban: LOGO.ruban,
  degrades: {
    clair: etapes([COULEURS.vert, COULEURS.jaune, COULEURS.bleu]),
    sombre: etapes([COULEURS.vert, COULEURS.jaune, COULEURS.bleuClair]),
    blanc: etapes([COULEURS.vert, COULEURS.jaune, COULEURS.blanc]),
  },
}

const sortie = fileURLToPath(new URL("../../src/marque/traces.ts", import.meta.url))
const corps = Object.entries(traces)
  .map(([nom, valeur]) => `export const ${nom.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()} = ${JSON.stringify(valeur)} as const`)
  .join("\n\n")
writeFileSync(
  sortie,
  `// Généré par scripts/marque/generer.mjs — ne pas modifier à la main.\n` +
    `// Tracés du logo SETRAG dans le repère du S (boîte 100 × 100).\n\n${corps}\n`,
)
console.log(`src/marque/traces.ts — ${(corps.length / 1024).toFixed(1)} Ko`)

// Fichiers livrables : téléchargés depuis la page /charte, rastérisés pour les
// icônes de la PWA et de l'app mobile.
const dossierSvg = fileURLToPath(new URL("../../src/marque/svg/", import.meta.url))
mkdirSync(dossierSvg, { recursive: true })
const fichiers = {
  "setrag-logo.svg": logo({ variante: "complet" }),
  "setrag-logo-compact.svg": logo({ variante: "compact" }),
  "setrag-logo-negatif.svg": logo({ variante: "complet", theme: "negatif" }),
  "setrag-logo-sur-bleu.svg": logo({ variante: "complet", theme: "sur-bleu" }),
  "setrag-logo-mono-encre.svg": logo({ variante: "complet", theme: "mono-encre" }),
  "setrag-logo-mono-blanc.svg": logo({ variante: "complet", theme: "mono-blanc" }),
  "setrag-symbole.svg": logo({ variante: "symbole", titre: "SETRAG" }),
  "setrag-symbole-ruban.svg": logo({ variante: "symbole-ruban", titre: "SETRAG" }),
  "setrag-icone-app.svg": iconeApp(),
  "setrag-icone-app-sombre.svg": iconeApp({ fond: COULEURS.encre, theme: "negatif" }),
}
for (const [nom, svg] of Object.entries(fichiers)) writeFileSync(dossierSvg + nom, svg + "\n")
console.log(`src/marque/svg/ — ${Object.keys(fichiers).length} fichiers`)

// Le ruban du design system mobile : mêmes étapes, React Native ne sachant
// pas interpoler en oklch. Portage, pas seconde source de vérité.
const sortieMobile = fileURLToPath(new URL("../../../mobile-ui/src/tokens/ruban.ts", import.meta.url))
writeFileSync(
  sortieMobile,
  `// Généré par packages/ui/scripts/marque/generer.mjs — ne pas modifier à la main.\n` +
    `// Le ruban (vert → jaune → bleu, bleu en tête), interpolé en oklch puis converti\n` +
    `// en sRGB : à passer tel quel à un LinearGradient (locations, colors).\n\n` +
    `export const RUBAN = ${JSON.stringify(traces.degrades)} as const\n`,
)
console.log("packages/mobile-ui/src/tokens/ruban.ts")

// Les logos de l'app mobile : SVG autonomes, posés tels quels par SvgXml. Les
// classes et variables CSS des animations web n'ont pas cours en React Native.
const pourMobile = (svg) => svg.replace(/ class="[^"]*"/g, "").replace(/ style="[^"]*"/g, "")
const logosMobile = {
  compact: logo({ variante: "compact" }),
  compactNegatif: logo({ variante: "compact", theme: "negatif" }),
  symboleRuban: logo({ variante: "symbole-ruban", titre: "SETRAG" }),
  symboleMonoEncre: logo({ variante: "symbole", theme: "mono-encre", titre: "" }),
  symboleMonoBlanc: logo({ variante: "symbole", theme: "mono-blanc", titre: "" }),
}
// Le signe de Ruban : le S seul, sans rails, tracé par le composant SigneRuban.
// React Native ne connaît pas pathLength : la longueur du S est précalculée.
const signeMobile =
  `export const S = ${JSON.stringify(traces.s)}\n\n` +
  `/** Longueur du S, pour les pointillés animés (pathLength n'existe pas en natif). */\n` +
  `export const S_LONGUEUR = ${T.length.toFixed(2)}`
const sortieLogos = fileURLToPath(new URL("../../../mobile-ui/src/marque/logos.ts", import.meta.url))
mkdirSync(dirname(sortieLogos), { recursive: true })
writeFileSync(
  sortieLogos,
  `// Généré par packages/ui/scripts/marque/generer.mjs — ne pas modifier à la main.\n` +
    `// Logos SETRAG en SVG autonome, pour SvgXml (react-native-svg).\n\n` +
    Object.entries(logosMobile)
      .map(([nom, svg]) => `export const ${nom.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()} = ${JSON.stringify(pourMobile(svg))}`)
      .join("\n\n") +
    `\n\n${signeMobile}\n`,
)
console.log("packages/mobile-ui/src/marque/logos.ts")
