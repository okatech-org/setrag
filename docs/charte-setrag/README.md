# Charte SETRAG

Charte graphique et maquettes de la plateforme : logo « voie épurée », ruban
vert-jaune-bleu qui glisse sur la voie, écrans web et mobile, widgets et
activité en direct, système de mouvement, et Ruban, l'assistant (nom à
valider avec SETRAG ; il se change dans `shared/assistant.js`).

Pages statiques, sans build. Les ouvrir via un serveur local (les modules ES et
les fichiers Lottie ne se chargent pas en `file://`) :

```bash
cd docs && python3 -m http.server 4747
# http://localhost:4747/charte-setrag/        — ajouter ?sombre pour le thème sombre
```

| Page              | Contenu                                                        |
| ----------------- | -------------------------------------------------------------- |
| `index.html`      | Concept, logo animé et statique, couleurs, typographie, tokens |
| `mouvement.html`  | Principes, durées, courbes, catalogue des animations, Lottie   |
| `composants.html` | Composants et leurs états, noms dans `packages/ui`             |
| `web.html`        | Billetterie web, routes réelles de `apps/billetterie-web`      |
| `mobile.html`     | App voyageur, 18 écrans dont 3 en thème sombre                 |
| `agent.html`      | Portail agent, prototype navigable : guichet (13 écrans) et gestion (16) |
| `widgets.html`    | Widgets iOS et Android, activité en direct, Wallet, alertes    |
| `assistant.html`  | Ruban, l'assistant : identité, fenêtre web, feuille mobile, voix |

## Livrables

- `logo/` — SVG du logo : complet, compact, négatif, sur bleu, monochromes,
  symbole, icône d'app.
- `lottie/` — logo animé (clair, sombre, compact), symbole animé, chargements,
  signe de Ruban (réflexion, apparition).

## Régénérer

Tout part de la même géométrie : `shared/geo.js` (le S) et
`shared/logo-geom.js` (le mot, tracé depuis Schibsted Grotesk 800 italique).

```bash
cd docs/charte-setrag
# 1. Contours du mot et de la signature (opentype.js hors du dépôt)
mkdir -p /tmp/fonttools && (cd /tmp/fonttools && bun add opentype.js@1.3.4)
OPENTYPE=/tmp/fonttools/node_modules/opentype.js/dist/opentype.module.js bun outils/glyphes.mjs
# 2. SVG du logo, animations, icônes Lucide
bun outils/exports.mjs
bun outils/lottie.mjs
bun outils/icones.mjs
```

Les tokens de marque et de mouvement (`--brand-*`, `--dur-glisse`,
`--ease-glisse`…), proposés ici dans `shared/base.css`, sont désormais reportés
dans `packages/ui/src/styles/tokens.css` et `marque.css`. La géométrie du logo et
les animations Lottie de production se génèrent depuis `packages/ui/scripts/marque/`
(`generer.mjs`, `lottie.mjs`) ; la référence vivante est la page `/charte` de la
billetterie. La marque reste à faire valider par SETRAG.
