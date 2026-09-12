# SETRAG — design system voyage

Charte de la plateforme SETRAG, importée du projet Claude Design
« SETRAG Design System » (`f60a756a-ca30-4f1a-a4fb-72f6d205633a`), v1.1.0.

Référence vivante : `/design-system` sur la billetterie (`bun run dev:billetterie`).

## Principes

1. **L'heure d'abord, le prix ensuite, le reste en gris.** La hiérarchie d'une
   carte de résultat ne se discute pas : heure en mono 25 px, prix en 25 px
   gras, contexte en 13 px `ink-muted`.
2. **Hauteur d'action minimale 44 px**, 8 px d'écart entre deux cibles.
3. **Un seul bouton `primary` par écran** — celui qui fait avancer le voyage.
4. **Aucune information portée par la couleur seule** : un retard porte toujours
   un libellé chiffré (« +12 min »), une suppression toujours un mot.
5. **Ton concret.** « Votre train partira 12 min plus tard. Votre place est
   conservée. » plutôt que « Incident d'exploitation ».
6. **L'anneau de focus (3 px) n'est jamais supprimé**, et reste à l'extérieur.

## Tokens

`packages/ui/src/styles/tokens.css` est la source de vérité — copie fidèle du
`tokens.css` du projet Claude Design. Ne pas y modifier une valeur sans la
répercuter côté design.

| Famille    | Exemples                                              |
| ---------- | ----------------------------------------------------- |
| Neutres    | `--c-canvas`, `--c-surface`, `--c-line`, `--c-ink`     |
| Accents    | `--c-accent` (bleu logo, teinte 257), `--c-second` (acier 248) |
| Sémantique | `--c-success`, `--c-warning`, `--c-danger`, `--c-info` |
| Typo       | `--t-display` … `--t-caption`, `--t-time`              |
| Espacement | `--s-1` (4) … `--s-20` (80), base 4                    |
| Rayons     | `--r-xs` 4 · `--r-sm` 8 · `--r-md` 12 · `--r-lg` 20 · `--r-pill` |
| Mouvement  | `--ease`, `--dur-fast|base|slow` (120/200/320 ms)      |

Polices : **Schibsted Grotesk** (UI) et **IBM Plex Mono** (chiffres), servies
localement via `@fontsource`, jamais par CDN.

### Utilisation dans le code

`globals.css` expose ces tokens de trois façons :

```tsx
<p className="text-h2">Titre</p>                    {/* échelle typographique */}
<span className="tabular text-time">07:42</span>     {/* chiffres alignés */}
<div className="bg-surface text-ink-muted border-line rounded-lg" />
```

Les variables shadcn (`--primary`, `--background`, `--border`…) sont branchées
sur les tokens SETRAG : les composants du registre shadcn héritent de la charte
sans réécriture.

**Mode sombre** : `[data-theme="dark"]` uniquement — jamais `.dark`, qu'un hôte
en thème sombre poserait pour sa propre interface. `[data-theme="light"]` force
le clair. Les applications configurent next-themes avec `attribute="data-theme"`.

## Composants

### Primitives — `@workspace/ui/components/*`

| Composant                     | Notes                                                     |
| ----------------------------- | --------------------------------------------------------- |
| `button`                      | pill · `sm` 36 / `md` 44 / `lg` 52 · primary, secondary, ghost, danger · état `loading` avec barre indéterminée |
| `field`                       | `Field` + `Input` / `Textarea` / `SelectNative`, liens ARIA et message d'erreur écrits |
| `choice`                      | `Checkbox`, `Radio`, `Switch` — libellé inclus dans la cible tactile |
| `tag`                         | pastilles de statut et filtres retirables                  |
| `inline-message`              | messages en ligne (info/succès/alerte/erreur) + `ToastBar` |
| `stepper`                     | progression du tunnel                                      |
| `empty-state`                 | `EmptyState` (avec porte de sortie) et `SkeletonLines`      |
| `segmented-control`           | choix exclusif en pastilles — créneau, type de trajet     |
| `filter-group`                | `FilterGroup`, `RangeFilter` (curseur de prix), `ResultsToolbar` |
| `avatar`                      | initiales sur pastille acier, ou photo                    |
| `app-header`                  | marque, navigation, compte                                |
| `theme-scope`                 | épingle un thème sur une sous-arborescence (voir plus bas) |
| `card`, `dialog`, `select`, `separator`, `skeleton`, `table`, `tabs`, `badge` | registre shadcn, à la charte |

### Métier — `@workspace/ui/voyage/*`

| Composant           | Rôle                                                          |
| ------------------- | ------------------------------------------------------------- |
| `trip-search-bar`   | recherche : type de trajet, gares, dates, voyageurs. Les champs sont injectés par l'app |
| `price-calendar`    | prix par jour, meilleur prix mis en avant automatiquement      |
| `traffic-banner`    | info trafic / travaux                                          |
| `trip-result-card`  | résultat de recherche — états `default`, `selected`, `cancelled` |
| `ticket`            | billet fond encre, QR fourni par l'app, 5 états                |
| `checkout-summary`  | récapitulatif, moyens de paiement, total                       |
| `boarding-pass`     | carte d'embarquement — compte à rebours, voiture/place/quai, QR |
| `wallet-pass`       | aperçu de la carte Apple Wallet / Google Wallet                |

Les montants sont formatés en XAF par `@workspace/ui/lib/format`
(`formatPrice`, `formatTime`, `formatDuration`, `spellTime`).

## Mobile — `@workspace/mobile-ui`

Le portage React Native suit les mêmes valeurs. React Native ne lisant pas
`oklch()`, les couleurs sont converties en sRGB hexadécimal depuis les valeurs
oklch de référence : `packages/mobile-ui/src/tokens/index.ts` est un portage,
pas une seconde source de vérité. Toute évolution part de `tokens.css`.

| Entrée                              | Contenu                                                    |
| ----------------------------------- | ---------------------------------------------------------- |
| `@workspace/mobile-ui/tokens`       | `colors` (clair/sombre), `typography`, `spacing`, `radius`, `controlHeight`, `shadows`, `motion` |
| `@workspace/mobile-ui/fonts`        | `useSetragFonts()` — charge Schibsted Grotesk et IBM Plex Mono |
| `@workspace/mobile-ui/components`   | `Screen`, `Text`, `Button`, `Card`, `Tag`, `Badge`, `Avatar`, `Separator`, `Field`/`Input`/`Textarea`, `Checkbox`/`Radio`/`RadioGroup`/`Switch`, `SegmentedControl`, `Stepper`, `EmptyState`/`SkeletonLines`, `InlineMessage`, `ToastBar`, `useTheme` |
| `@workspace/mobile-ui/voyage`       | `TripSearchBar`, `TripResultCard`, `PriceCalendar`, `TrafficBanner`, `Ticket`, `BoardingPass`, `WalletPass`, `CheckoutSummary` |

Les huit composants métier sont à parité avec le web. Référence vivante :
l'écran `design-system` de l'application mobile (`apps/voyageur-mobile`), qui
monte chaque composant — s'il cesse de compiler ou de rendre, l'écran le montre.

Ce qui reste web-seulement, à dessein : `AppHeader` (le mobile a sa barre
d'onglets), `Tabs`, `FilterGroup`/`RangeFilter`/`ResultsToolbar` (les filtres
mobiles passent par une feuille modale, pas une colonne latérale) et les
composants du registre shadcn (`Dialog`, `Select`, `Table`).

`useSetragFonts()` s'appelle à la racine (`app/_layout.tsx`) et l'écran de
démarrage reste affiché tant que les familles ne sont pas prêtes — sinon la
typographie retombe une fraction de seconde sur la police système.

Les libellés d'accessibilité annoncent les heures en clair
(`accessibilityLabel` construit avec `spellTime`), comme sur le web.

Équivalences de nommage :

| Web (Tailwind)          | Mobile (`useTheme()`)          |
| ----------------------- | ------------------------------ |
| `bg-surface`            | `theme.colors.surface`         |
| `text-ink-muted`        | `<Text tone="muted">`          |
| `text-h2`               | `<Text variant="h2">`          |
| `.tabular` + `text-time`| `<Text variant="time">`        |
| `rounded-lg`            | `theme.radius.lg`              |
| `gap-s-6`               | `theme.spacing[6]`             |

## Cartes de wallet

`WalletPass` **n'émet pas** le pass : celui-ci est signé côté serveur — `.pkpass`
avec un certificat Pass Type ID pour Apple, objet REST pour Google. Le composant
en restitue le rendu, pour valider la charte avant émission et montrer au
voyageur ce qu'il ajoute.

Le mapping vit dans `@workspace/shared/wallet` :

| Fonction                     | Produit                                              |
| ---------------------------- | ---------------------------------------------------- |
| `buildApplePass(ticket, …)`  | le `pass.json` complet — type `boardingPass`, `transitType: PKTransitTypeTrain` |
| `buildGoogleWalletObject(…)` | le `TransitObject` Google Wallet                      |
| `toWalletPreview(ticket)`    | les champs de l'aperçu `WalletPass`                   |

Contraintes de plateforme reprises dans les types, et à ne pas dépasser sous
peine de troncature silencieuse côté téléphone : **3 champs d'en-tête,
2 principaux, 4 secondaires, 5 auxiliaires**. Les deux bornes du trajet
occupent les champs principaux — c'est ce qu'affiche l'écran verrouillé.

Deux réglages qui font la différence à l'usage :

- `relevantDate` (Apple) fait remonter le pass sur l'écran verrouillé à
  l'approche du départ ;
- `locations` déclenche la même remontée à proximité de la gare.

Le `serialNumber` est la référence du billet : réémettre le même numéro **met à
jour** le pass déjà installé au lieu d'en créer un second — c'est le mécanisme
à utiliser pour un changement de quai ou un retard.

Reste à faire côté serveur : certificat Apple, signature du `.pkpass`, images
(`logo.png`, `icon.png` et leurs `@2x`), et le service web de mise à jour.

## Accessibilité

- Contrastes vérifiés à la source : `ink/canvas` 14,2:1 · `ink-muted/canvas`
  6,9:1 · `blanc/accent` 4,8:1. `ink-faint` réservé au texte ≥ 18 px.
- Les heures sont annoncées en clair aux lecteurs d'écran (`spellTime` produit
  « 7 heures 42 » dans un `sr-only`, l'affichage visuel restant « 07:42 »).
- Ordre de tabulation attendu : recherche → filtres → résultats → panier.
- `prefers-reduced-motion` coupe tout mouvement décoratif ; les barres de
  progression (`data-motion="progress"`) sont conservées.

## Tableaux de bord

Règles posées en construisant l’espace Direction générale
(`apps/agent-web/src/components/direction/`), à reprendre pour tout futur
écran de pilotage.

- **Chiffres de tête.** Le chiffre seul en `text-time` (IBM Plex Mono,
  25 px) ; l’unité va à part, sur un `text-mono-label`. **Ne jamais combiner
  `.tabular` à `text-h*`, `text-small` ou `text-caption`** : `.tabular` est
  déclarée en couche `base`, alors que les utilitaires de l’échelle
  typographique sont des raccourcis `font: …` posés en couche `utilities` —
  ce raccourci réinitialise la famille de police, et la combinaison retombe
  en Schibsted Grotesk au lieu d’IBM Plex Mono. Dans une cellule de tableau,
  la valeur reste `font-mono tabular-nums`.
- **Largeur d’une cellule de chiffre.** « 12 345 678 FCFA » à 25 px mono
  occupe environ 225 px, quand une cellule de grille à quatre colonnes sur
  1280 px n’en fait que 156. Le chiffre seul tient dans la cellule ;
  l’unité part sur un `span` séparé. Grille par défaut `md:grid-cols-2`,
  quatre colonnes seulement à partir de `2xl`.
- **Provenance.** Chaque valeur porte l’un des six états
  `ExecutiveSourceState` — Chargement, Opérationnel, Synthétique · non
  officiel, Aucune donnée, Non accessible, Non raccordé — rendus par
  `ProvenanceTag` (`apps/agent-web/src/components/direction/provenance.tsx`).
  Un mot par état, jamais la teinte seule ; une valeur synthétique n’est
  jamais agrégée à une valeur opérationnelle.
- **Graphiques.** HTML/SVG maison, jamais de librairie de graphiques —
  `recharts` reste installé mais inutilisé. Une série se rend en barres CSS,
  couleur unique `bg-accent-base`, sans palette. Chaque graphique est doublé
  d’une table alternative repliée dans un `<details>`
  (« Voir le tableau : … »), avec un `<caption>`. `--c-warning` ne porte
  jamais seul un trait ou un contour : les contours passent par
  `warning-ink`.
- **Grilles et points de rupture.** `sm` 480 · `md` 768 · `lg` 1024
  (bascule tiroir / carte latérale) · `xl` 1280 (passage à deux colonnes) ·
  `2xl` 1536. Contenu borné à `max-w-7xl`. Le tri des variantes se fait en
  CSS (`sm:`, `md:`…), jamais par une mesure de largeur en JavaScript.
  `ink-faint` reste réservé au texte ≥ 18 px.
- **Interdits repérés dans le dépôt.** `bg-surface-raised`, `bg-danger-base`,
  `text-ink-subtle`, `bg-background-muted` : ces classes n’existent pas dans
  `tokens.css`/`globals.css`, malgré leur présence dans plusieurs pages.
  Aucune couleur hexadécimale en dur. Sur le focus, `outline-none` combiné à
  `ring-2` n’apporte rien : l’anneau global de 3 px (`:focus-visible`)
  suffit déjà.

## Faire évoluer la charte

Les composants shadcn s'ajoutent depuis `packages/ui` et héritent des tokens :

```bash
cd packages/ui && bunx shadcn@latest add <composant>
```

⚠️ Le CLI écrase les fichiers de même nom : `button.tsx` est une implémentation
SETRAG, ne pas le régénérer sans réappliquer les variantes.
