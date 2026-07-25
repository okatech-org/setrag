# design-sync — notes du dépôt SETRAG

Projet cible : **SETRAG Billetterie** — https://claude.ai/design/p/05dbdc0c-c466-4b3a-9744-18c6b29e2c76
Shape : `package` (aucun Storybook dans le dépôt).
Source amont : projet Claude Design `f60a756a-…`, fichier **SETRAG Design
System.dc.html** (anciennement « Cadence »).

## Historique des versions de la charte

- **v1.1.0** — palette redérivée du logo : accent bleu `#0F52A0`
  (oklch teinte 257), neutres teintés 257, `second` passé de l'orange à un
  acier désaturé (248), sémantiques réaccordées (success 146, warning 92,
  info 205). Aucune spécification de composant n'a bougé : le diff amont ne
  portait que sur les couleurs, le branding (logo, v1.1.0) et le nom de
  l'animation (`cadence-slide` → `setrag-slide`). Le logo est versionné dans
  `packages/ui/src/assets/setrag-logo.png` et les `public/` des apps web.
- **v1.0.0** — « Cadence », accent teal 168.

**Méthode de resynchro amont** : récupérer `tokens.css` + `tokens.json` du
projet source, puis diffusion. Pour savoir si les composants ont changé,
neutraliser les couleurs avant de comparer les deux `.dc.html` — sinon le diff
est noyé sous les changements de teinte :

```sh
python3 - <<'EOF'
import re,difflib
norm=lambda p: [l.strip() for l in re.sub(r'#[0-9a-fA-F]{3,8}|oklch\([^)]*\)','C',open(p).read()).split('\n')]
print('\n'.join(l for l in difflib.unified_diff(norm('ancien.html'),norm('nouveau.html'),lineterm='',n=0) if l[:1] in '+-'))
EOF
```

## Ce qu'il a fallu mettre en place (première synchro)

- **`packages/ui` n'avait ni barrel ni build.** Ajoutés pour cette synchro, et
  utiles au-delà :
  - `src/index.ts` — barrel de tous les composants ; c'est l'entrée du bundle
    (`--entry ./packages/ui/src/index.ts`). Les applications continuent
    d'importer par chemin (`@workspace/ui/components/*`), rien n'a changé pour
    elles.
  - `tsconfig.build.json` + script `build` — `tsc --emitDeclarationOnly` produit
    `dist/*.d.ts`. **Sans ces déclarations le converter trouve 0 composant**
    (`[ZERO_MATCH]`) : il lit les `.d.ts`, pas les sources.
- **Le CSS doit être compilé avant chaque synchro.** Le paquet livre du Tailwind
  source (`@import "tailwindcss"`) ; `cfg.cssEntry` pointe sur `dist/styles.css`
  produit par le CLI Tailwind. `cfg.buildCmd` fait exactement ça.
- **Polices.** Les familles viennent de `@fontsource` dans `node_modules` :
  `cfg.extraFonts` liste les CSS à moissonner. `@fontsource-variable/...`
  déclare la famille « Schibsted Grotesk **Variable** », pas « Schibsted
  Grotesk » — le token `--font-ui` cite les deux, il a donc fallu ajouter
  `@fontsource/schibsted-grotesk` (statique) pour éteindre `[FONT_MISSING]`.
- **`cardMode: "column"`** sur les composants larges (`TripResultCard`,
  `TripSearchBar`, `CheckoutSummary`, `PriceCalendar`, `Ticket`,
  `TrafficBanner`, `Stepper`, `ToastBar`) : sans ça ils se replient dans une
  cellule de grille étroite et deviennent illisibles.

## Vérification des rendus — sans Playwright

Playwright n'est pas installé sur cette machine et l'utilisateur ne souhaite pas
l'installer (Claude Code a un navigateur intégré). Conséquence :
`package-validate.mjs` tourne avec `--no-render-check`, et **le driver
(`resync.mjs`) sort en échec sur la seule étape validate** pour cette raison —
ce n'est pas un défaut du bundle.

Les 35 aperçus ont été vérifiés au navigateur intégré, sur `.review.html` servi
en local : aucune racine vide, aucune carte plancher, `--c-accent` résolu
partout, Schibsted Grotesk chargée sur les 35, IBM Plex Mono présente sur les 5
composants qui affichent heures et montants. Contrôle visuel détaillé sur
Button, Field, TripResultCard et Ticket.

Pour retrouver ce mode opératoire :

```sh
node .ds-sync/storybook/http-serve.mjs ./ds-bundle   # sert le bundle
# puis ouvrir http://127.0.0.1:<port>/.review.html dans le navigateur intégré
```

## Avertissements connus (ne pas rechasser)

- `[TOKENS_MISSING]` — `--radix-select-*` et `--tw`. Radix pose ces variables à
  l'exécution ; `--tw` est interne à Tailwind. Attendu.
- `[RENDER_SKIPPED]` — conséquence directe du choix ci-dessus.

## Piège du thème — corrigé, ne pas réintroduire

La première version des tokens faisait réagir le mode sombre à `.dark` **et**
`[data-theme="dark"]`, pour next-themes. Le panneau claude.ai/design est en
thème sombre et pose `.dark` : le design system basculait avec lui, alors que
la carte d'aperçu force `background:#fff` en dur. Résultat — texte clair sur
fond blanc, cases à cocher noires, champs sombres.

Trois garde-fous depuis :

1. `tokens.css` ne réagit **qu'à** `[data-theme="dark"]`, comme la source
   SETRAG. **Ne jamais y rajouter `.dark`.**
2. `[data-theme="light"]` remet explicitement le mode clair : n'importe quel
   conteneur peut forcer le clair sous un hôte sombre.
3. `ThemeScope` (exporté, exclu de la liste des composants via
   `componentSrcMap`) est le `cfg.provider` : il enveloppe chaque aperçu dans
   `data-theme="light"`. Les cartes ne dépendent donc plus du thème de l'hôte.

Les applications Next pilotent le thème par `attribute="data-theme"` dans
next-themes — pas `class`.

Test de non-régression : servir le bundle, ouvrir `.review.html`, forcer
`documentElement.classList.add('dark')` **et** `setAttribute('data-theme','dark')`
dans chaque iframe, puis vérifier que `--c-ink` reste `oklch(0.22 …)` et
`--c-surface` `#ffffff` dans les 35 cartes.

## Ombres — ce que la source autorise

La source SETRAG ne met d'ombre que sur : la barre de recherche (`--sh-md`),
le billet et le toast (`--sh-lg`), et la carte de résultat au survol. Les
panneaux sont `border: 1px solid`, **sans ombre**. `card.tsx` et le déclencheur
de `select.tsx` arrivaient du registre shadcn avec `shadow-xs` : retiré.

## Risques pour la prochaine synchro

- **Le CSS peut silencieusement se vider.** Tailwind ne génère que les classes
  vues dans les sources scannées (`@source` de `globals.css`). Si le scan change
  ou qu'une application sort du périmètre, des utilitaires disparaissent du
  `styles.css` livré sans qu'aucune validation ne le signale. Après un
  changement de `globals.css`, re-vérifier les classes citées dans
  `conventions.md` (la liste « garanties ») contre le CSS construit.
- **`conventions.md` énumère des noms de classes réels** : toute suppression
  d'utilitaire dans le design system doit s'y répercuter, sinon l'agent de
  design écrira du vocabulaire mort.
- **Les aperçus figent des horodatages** (`Date.UTC(2026, 7, 7, …)`). Volontaire
  — une capture doit être reproductible. Ne pas les remplacer par `Date.now()`.
- **`dist/` de `packages/ui` est gitignoré** : sur un clone neuf, lancer
  `bun run build --filter=@workspace/ui` (ou `cfg.buildCmd`) avant le converter,
  sinon `[NO_DIST]` / `[ZERO_MATCH]`.
- **Le mobile (`packages/mobile-ui`) n'est pas synchronisé.** Décision de
  l'utilisateur : claude.ai/design construit du React web, les composants React
  Native n'y rendraient pas sans `react-native-web`.
