// Écrit les fichiers de logo livrables dans logo/.
//   bun outils/exports.mjs
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { COULEURS, iconeApp, logo } from "../shared/marque.js"

const dossier = fileURLToPath(new URL("../logo/", import.meta.url))
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
for (const [nom, svg] of Object.entries(fichiers)) {
  writeFileSync(dossier + nom, svg + "\n")
  console.log(`logo/${nom} — ${(svg.length / 1024).toFixed(1)} Ko`)
}
