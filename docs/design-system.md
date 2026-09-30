# SETRAG — design system voyage

Charte « la voie et le ruban » : le logo est une voie ferrée, un ruban
vert → jaune → bleu (les couleurs du Gabon, le bleu en tête) glisse dessus pour
dire ce qui avance, ce qui est choisi, où l'on en est. C'est la seule chose
colorée qui bouge dans l'interface.

- **Référence vivante** : `/charte` sur la billetterie
  (`apps/billetterie-web/src/fonctionnalites/charte`) — concept, logo animé,
  couleurs, typographie, icônes, la voie et le ruban, le mouvement, les
  composants, Ruban l'assistant, le ton. `bun run dev:billetterie`.
- **Spécification statique** : `docs/charte-setrag/` — maquettes HTML sans
  build, à ouvrir via un serveur local (voir son `README.md`). Régénérée
  séparément de `packages/ui` ; c'est la source des maquettes visuelles, pas du
  code.

## Principes non négociables

1. **Hauteur d'action ≥ 44 px.** `Button` en taille `md` (par défaut) fait
   44 px ; les cases à cocher, radios et interrupteurs englobent leur libellé
   dans une cible de 44 px (`choice.tsx`).
2. **Un seul bouton `primary` par écran** — celui qui fait avancer le voyage.
   Les autres actions sont `secondary` ou `ghost`.
3. **Aucune information n'est portée par la couleur seule.** Un retard s'écrit
   « +12 min », une suppression porte le mot « Supprimé » (`PastilleDesserte`,
   `PastilleBillet`, `InlineMessage`). La barre hors réseau
   (`BandeauReseau`) associe toujours une icône et une phrase à sa couleur.
4. **L'anneau de focus n'est jamais supprimé**, et reste à l'extérieur du
   contrôle (`globals.css`, `:focus-visible { box-shadow: var(--focus-ring) }`).
5. **Les heures et montants s'alignent d'une ligne à l'autre** : classe
   `.tabular` (police mono, `font-variant-numeric: tabular-nums`) ou utilitaire
   `text-time`.
6. **Aucune valeur hexadécimale en dur dans les composants applicatifs.** On
   passe par les utilitaires Tailwind exposés (`bg-surface`, `text-ink-muted`,
   `rounded-lg`) ou par les variables CSS (`var(--c-accent)`). Seuls
   `packages/ui/src/marque/*` et le pont `globals.css` touchent aux valeurs
   brutes.
7. **L'heure d'abord, le prix ensuite, le reste en gris** : une carte de
   résultat (`CarteTrajet`) affiche l'heure en mono 22–24 px, le prix en 21 px
   gras, le contexte (train, arrêts) en 12,5 px `ink-muted`.

## Le mouvement

Défini dans `packages/ui/src/styles/tokens.css` (bloc « Mouvement ») et
`packages/ui/src/styles/marque.css`. Règle générale : **le ruban est la seule
chose qui bouge** — pas d'ombres qui grandissent, pas d'icônes qui tournent en
boucle, pas de fondu décoratif sans raison.

| Token | Valeur | Usage |
| --- | --- | --- |
| `--dur-micro` | 90 ms | réponse immédiate au doigt (pression d'un bouton flottant) |
| `--dur-fast` | 120 ms | changements d'état courts |
| `--dur-base` | 200 ms | apparitions, filet de navigation |
| `--dur-slow` | 320 ms | feuilles, fenêtres modales |
| `--dur-glisse` | 480 ms | le ruban glisse vers sa nouvelle position (onglet, jour, étape, trajet choisi) |
| `--dur-boucle` | 1600 ms | une rame qui passe pendant une attente réelle, sans fin |
| `--ease` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | courbe générale de l'interface |
| `--ease-glisse` | `cubic-bezier(0.45, 0, 0.2, 1)` | départ progressif, arrivée en douceur — le geste d'un train |
| `--ease-sortie` | `cubic-bezier(0.4, 0, 1, 1)` | ce qui part accélère (écran de démarrage qui s'efface) |

`prefers-reduced-motion: reduce` coupe toute transition et animation
décorative (`globals.css`, règle globale sur `*`) ; `marque.css` fige en plus
le ruban en attente à sa position finale plutôt que de le faire disparaître,
pour ne pas perdre l'information qu'il portait.

Le motif vit dans `marque.css` :

- `.voie` / `.voie-v` — rails et traverses (dégradé + `repeating-linear-gradient`),
  horizontale ou verticale (`LigneArrets`). `data-fond` change la teinte des
  rails sur fond clair, encre (billet) ou bleu.
- `.voie-ruban` — le remplissage, propriété CSS enregistrée `--p` (`@property`)
  pour pouvoir l'animer ; `data-etat="pleine"` le remplit, `data-etat="attente"`
  y fait défiler une rame en boucle (`@keyframes st-rame`).
- `.filet-ruban` — le ruban traverse le haut de l'écran pendant un chargement
  de page (`FiletNavigation`) ; n'apparaît qu'au-delà de 150 ms.
- `.st-en-cours` — un bouton en attente garde son libellé et sa taille ; un
  ruban fin passe sous le texte.
- `.signe` — le signe de Ruban (`SigneRuban`) : `data-etat="reflexion"` fait
  courir un tronçon de ruban le long du tracé (`@keyframes st-signe-glisse`),
  `data-trace` le dessine une fois (`@keyframes st-signe-trace`).
- `.st-apparait` — cascade courte à l'arrivée d'une liste (six éléments au
  plus, 28 ms d'écart), `@keyframes st-monte`.

## Tokens — `packages/ui/src/styles/tokens.css`

Source de vérité, importée du projet Claude Design « SETRAG Design System ».
Ne pas modifier une valeur sans la répercuter côté design. Mode clair par
défaut sur `:root`, mode sombre opt-in via `[data-theme="dark"]` — jamais la
classe `.dark`, qu'un hôte en thème sombre poserait pour sa propre interface.
`[data-theme="light"]` force le clair sous un hôte sombre.

| Famille | Tokens | Notes |
| --- | --- | --- |
| Neutres | `--c-canvas`, `--c-surface`, `--c-surface-sunk`, `--c-line`, `--c-line-strong`, `--c-ink`, `--c-ink-muted`, `--c-ink-faint`, `--c-ink-inverse` | teinte 257, chroma très bas |
| Accents | `--c-accent` (bleu du logo, oklch 0.441 0.144 257), `--c-accent-hover/-active/-soft/-line/-ink/-on-ink`, `--c-second` (acier, teinte 248) | `--c-accent-on-ink` : version claire de l'accent pour un fond encre ou bleu (contraste sur `*-soft` inversé) |
| Sémantique | `--c-success`, `--c-warning`, `--c-danger`, `--c-info` + `-soft` / `-ink` / `-hover` | jamais utilisés pour la marque |
| Typo | `--font-ui` (Schibsted Grotesk Variable), `--font-mono` (IBM Plex Mono), `--t-display` → `--t-caption`, `--t-time` | polices servies localement via `@fontsource`, jamais par CDN |
| Espacement | `--s-1` (4px) → `--s-20` (80px) | base 4 |
| Rayons | `--r-xs` 4 · `--r-sm` 8 · `--r-md` 12 · `--r-lg` 20 · `--r-pill` 999 | |
| Ombres | `--sh-sm`, `--sh-md`, `--sh-lg`, `--focus-ring` | |
| Cibles tactiles | `--target-min` (44px) | |
| Mouvement | `--ease`, `--dur-fast/base/slow`, `--dur-micro/glisse/boucle`, `--ease-glisse`, `--ease-sortie` | voir « Le mouvement » |
| Marque | `--brand-orange`, `--brand-jaune`, `--brand-vert`, `--brand-indigo`, `--brand-bleu`, `--brand-encre` | indépendants du thème ; réservés au logo, au ruban et à leurs dérivés — jamais à un statut |

Le mode sombre redéfinit les familles Neutres, Accents, Sémantique et les
ombres ; les tokens Marque restent fixes dans les deux thèmes (`:root` seul).
Le ruban lui-même (`--brand-ruban`, `--brand-ruban-v`, `--brand-ruban-clair`)
est déclaré dans `marque.css`, pas `tokens.css`, car il relit `--c-accent` :
il doit donc être redéclaré dans chaque portée de thème (`:root`,
`[data-theme="light"]`, `[data-theme="dark"]`).

## Le pont vers Tailwind — `packages/ui/src/styles/globals.css`

Importe `tokens.css` puis `marque.css`, branche les variables shadcn
(`--primary`, `--background`, `--border`…) sur les tokens SETRAG pour que les
composants du registre shadcn héritent de la charte sans réécriture, puis
expose tout en utilitaires Tailwind via `@theme inline` :

- couleurs : `bg-canvas`, `text-ink-muted`, `bg-accent-soft`, `text-danger-ink`,
  `bg-brand-jaune`… ;
- espacement SETRAG en plus de l'échelle Tailwind : `gap-s-6`, `p-s-4` ;
- rayons : `rounded-xs` → `rounded-pill` ;
- échelle typographique en classes dédiées (`@layer utilities`) :
  `text-display`, `text-h1` → `text-h4`, `text-body-lg`, `text-body`,
  `text-small`, `text-caption`, `text-time`, `text-mono-label` ;
- `.tabular` (`@layer base`) : police mono + `tabular-nums`, pour les heures et
  montants ;
- utilitaires mobiles : `.pt-safe`, `.pb-safe`, `.mb-safe`, `.inset-x-safe`
  (`env(safe-area-inset-*)`, actifs seulement si le document déclare
  `viewport-fit=cover`) et `.no-scrollbar` ;
- `.bg-ruban`, `.bg-ruban-v`, `.bg-ruban-clair` : le ruban en fond (filets,
  indicateurs) — jamais sous du texte.

`@source` scanne tout le monorepo (`packages/`, `apps/`) pour que le JIT
Tailwind trouve les classes utilisées par les applications.

## L'utilitaire `cn` — `packages/ui/src/lib/utils.ts`

```ts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

`tailwind-merge` ne connaît pas l'échelle typographique SETRAG par défaut : il
prendrait `text-small` pour une couleur de texte et `cn("text-caption",
"text-ink-muted")` perdrait la taille. `extendTailwindMerge` déclare donc un
groupe `font-size` couvrant `display`, `h1`–`h4`, `body-lg`, `body`, `small`,
`caption`, `time`, `mono-label`, pour que ces classes se fusionnent
correctement entre elles.

## La marque — `packages/ui/src/marque`

| Fichier | Rôle |
| --- | --- |
| `logo.tsx` | `Logo` — le S en voie ferrée (rails + traverses, orange du site setrag.eramet.com), le mot en tracés (Schibsted Grotesk 800 italique convertie en chemins, aucune dépendance à la police au rendu), le ruban souligne le nom. Props : `variante` (`complet` \| `compact` \| `symbole` \| `symbole-petit` \| `symbole-ruban`), `theme` (`auto` \| `couleur` \| `negatif` \| `sur-bleu` \| `mono-encre` \| `mono-blanc`), `title`. `theme="auto"` (par défaut) suit `[data-theme]` via les classes `.logo-auto` de `marque.css` — couleur en clair, négatif en sombre. |
| `logo-anime.tsx` | `LogoAnime` — la voie se pose, le ruban la parcourt, sort au pied du S, se couche sous le mot, chaque lettre se lève à son passage (3,3 s), joué une fois. Charge `lottie-web` et le fichier Lottie correspondant à la demande ; si `prefers-reduced-motion` ou en cas d'échec de chargement, retombe sur `Logo` fixe. Props : `variante` (`complet` \| `compact` \| `symbole`), `fond` (`clair` \| `sombre`), `onFin`, `rejouer` (changer la valeur rejoue l'animation), `title`. |
| `signe-ruban.tsx` | `SigneRuban` — le ruban seul, posé en S sans les rails : l'icône de Ruban, l'assistant. États (`etat`) : `repos`, `reflexion` (une rame parcourt le S, > 400 ms d'attente), `ecoute` / `parole` (l'épaisseur du trait suit `niveau`, 0 → 1, lissé côté appelant), `hors-ligne` (ruban gris). `fond="sombre"` éclaircit la tête du ruban pour un fond encre ; `trace` le dessine une fois (première ouverture de session). |
| `traces.ts` | **Généré, ne pas modifier à la main.** Tracés SVG précalculés dans le repère du S (boîte 100×100) : `S`, `RAILS`, `RAILS_PETIT`, `LETTRES`, `SIGNATURE`, `RUBAN` (géométrie du soulignement), `DEGRADES` (étapes de couleur `clair` / `sombre` / `blanc`). Les composants React ne calculent rien, ils posent ces chaînes dans du SVG. |
| `svg/*.svg` | Livrables téléchargeables (page `/charte`, rastérisation des icônes PWA et mobile) : `setrag-logo(.svg)`, `-compact`, `-negatif`, `-sur-bleu`, `-mono-encre`, `-mono-blanc`, `setrag-symbole`, `setrag-symbole-ruban`, `setrag-icone-app`, `setrag-icone-app-sombre`. |
| `lottie/*.json` | Animations du logo (clair, sombre, compact, symbole), du signe de Ruban (réflexion, apparition) et des écrans de chargement. |

### Régénérer la marque

Tout part de `packages/ui/scripts/marque/geo.mjs` (le S) et
`logo-geom.mjs` (le mot et la signature, extraits de Schibsted Grotesk 800
italique par `glyphes.mjs`) :

```bash
cd packages/ui && bun scripts/marque/generer.mjs
```

Ce script écrit trois sorties, aucune à modifier à la main :

1. `src/marque/traces.ts` — les tracés SVG ci-dessus ;
2. `src/marque/svg/*.svg` — les dix fichiers livrables ;
3. `../mobile-ui/src/tokens/ruban.ts` — le même ruban, interpolé en oklch puis
   converti en sRGB pour React Native (voir plus bas).

## Composants — `packages/ui/src/components`

Réexportés par `packages/ui/src/index.ts`, mais les applications importent par
chemin (`@workspace/ui/components/*`, `@workspace/ui/voyage/*`,
`@workspace/ui/marque`) pour garder le tree-shaking.

### Primitives

| Composant | Rôle | Props principales | Charte |
| --- | --- | --- | --- |
| `button` | `Button` — pastille, bouton d'action | `variant` (`primary`\|`secondary`\|`ghost`\|`danger`\|`noir`), `size` (`sm` 36 \| `md` 44 \| `lg` 52 \| `icon-*`), `block`, `asChild`, `loading`, `loadingLabel` | ≥ 44 px en `md` ; un seul `primary` par écran ; `loading` garde le libellé et fait passer un ruban sous le texte (`.st-en-cours`), jamais de spinner qui remplace le texte |
| `badge` | `Badge` — pastille shadcn générique | `variant` (`default`\|`secondary`\|`outline`\|`success`\|`warning`\|`destructive`\|`info`) | s'appuie sur le pont shadcn, pas sur les tokens `tag` |
| `card` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | — | registre shadcn, hérite de la charte via le pont |
| `choice` | `Checkbox`, `Radio` + `RadioGroup`, `Switch` | `label` (obligatoire), props Radix natives | case 22 px, interrupteur 44×26 ; le libellé fait partie de la cible tactile (44 px) |
| `code-aztec` | `CodeAztec` — le code Aztec du billet | `valeur`, `label` | charge `bwip-js/browser` à la demande ; même encodeur que le PDF du backend |
| `code-otp` | `CodeOtp` — saisie du code SMS/e-mail | `valeur`, `onChange`, `longueur` (6), `invalide`, `autoFocus` | un seul champ réel (`autocomplete="one-time-code"`), cases dessinées ; erreur écrite sous le champ, pas de secousse |
| `compte-a-rebours` | `Tenue` + `useCompteARebours` + `formatRebours` | `fin` (horodatage ms) | places tenues pendant le paiement ; passe au rouge sous 2 min, dit « délai écoulé » à 0 |
| `compteur` | `Compteur` | `valeur`, `onChange`, `min`, `max`, `label` | boutons ronds 36 px, chiffre en mono |
| `empty-state` | `EmptyState`, `SAttente` (illustration : le S gris, jamais animé), `SkeletonLines` | `title`, `description`, `action`, `illustration` | toujours une porte de sortie (« Le prochain part samedi à 07:40 »), jamais un simple « Aucun résultat » |
| `feuille` | `Feuille` | `open`, `onOpenChange`, `titre`, `description`, `pied`, `hauteur` (`auto`\|`haute`) | feuille du bas sur mobile (se ferme en la tirant), fenêtre centrée dès `md:` ; un seul composant pour les deux |
| `field` | `Field` + `Input`, `Textarea`, `SelectNative` | `label`, `hint`, `error`, `htmlFor` | hauteur 52, liens ARIA posés automatiquement ; erreur toujours écrite, jamais la bordure rouge seule |
| `indicateur` | `IndicateurRuban`, `NavRuban`, `useIndicateur` | `actif` (clé de l'élément courant), `retrait`, `largeur`, `cote` (`bas`\|`haut`) | le ruban glisse vers l'élément choisi en 480 ms (`--dur-glisse`/`--ease-glisse`) ; le premier placement ne glisse jamais |
| `inline-message` | `InlineMessage`, `ToastBar` | `tone` (`info`\|`success`\|`warning`\|`danger`), `title` | filet de 3 px à gauche ; ton concret (« Votre train partira 12 min plus tard. ») |
| `jours` | `Jours` | `jours` (`Jour[]`), `valeur`, `onChange` | bande de jours, ruban sous le jour choisi, défile au doigt et garde le choix visible |
| `ligne-arrets` | `LigneArrets` | `arrets` (`Arret[]`), `rame` (position fractionnaire), `pas` | voie verticale, rame (ruban) qui glisse entre deux gares en 1,2 s |
| `schema-ligne` | `SchemaLigne` | `gares`, `segment`, `trains` | la ligne du Transgabonais, gares à leur point kilométrique réel |
| `segmented-control` | `SegmentedControl` | `options`, `value`, `onValueChange`, `label`, `size` (`compact`\|`touch`) | fond qui glisse d'une option à l'autre, seul mouvement du contrôle |
| `separator` | `Separator` | `orientation` | registre shadcn |
| `skeleton` | `Skeleton` | — | registre shadcn |
| `stepper` | `Stepper` | `steps`, `current` | étapes du tunnel d'achat ; le ruban avance jusqu'à l'étape courante, le numéro reste écrit pour les lecteurs d'écran |
| `tabs` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | — | registre shadcn |
| `tag` | `Tag` | `tone` (`accent`\|`second`\|`success`\|`warning`\|`danger`\|`info`\|`neutral`\|`strong`\|`marque`\|`filterOn`\|`filterOff`), `onRemove` | pastille de statut ; `marque` (bleu sur jaune) réservée aux mises en avant commerciales, jamais à un statut |
| `theme-scope` | `ThemeScope` | `theme` (`light`\|`dark`), `surface` | épingle un thème sur une sous-arborescence, indépendamment de l'hôte |
| `voie` | `Voie`, `Chargeur` | `etat` (`vide`\|`pleine`\|`attente`), `rempli`, `fond` (`clair`\|`encre`\|`bleu`) | la voie qui relie deux informations ; `Chargeur` : attente > 1 s, une rame passe et une phrase dit ce qu'on attend |
| `avatar` | `Avatar` | `name`, `size` (`sm`\|`md`\|`lg`), `src` | initiales sur pastille acier, ou photo |
| `select`, `table`, `dialog` | primitives shadcn brutes | — | non réexportées par le barrel `index.ts` ; importées par chemin quand un registre shadcn suffit (ex. `Feuille` réutilise `Dialog` de Radix directement, pas ce wrapper) |

### Composants métier voyage — `packages/ui/src/components/voyage`

| Composant | Rôle | Props principales | Charte |
| --- | --- | --- | --- |
| `bandeau-trafic` | `BandeauTrafic` | `titre`, `lien`, `arrondi`, `onFermer` | jaune sur bleu SETRAG, comme le bandeau du site ; dit ce qui change et ce qui reste acquis |
| `billet` | `Billet` | `depart`, `arrivee`, `train`, `statut`, `etat` (`valide`\|`retard`\|`utilise`\|`annule`\|`expire`), `cases`, `code`, `legendeCode`, `emis` | fond encre dans les deux thèmes ; la voie remplace les pointillés de découpe, le ruban la traverse une fois à l'émission (720 ms) |
| `carte-trajet` | `CarteTrajet` | `depart`, `arrivee`, `duree`, `train`, `pastilles`, `prix`, `etat` (`defaut`\|`choisi`\|`supprime`), `onChoisir` | un résultat de recherche ; la voie se remplit (ruban) quand le trajet est choisi ; s'adapte à sa largeur (`@container`) |
| `choix` | `ChoixCartes`, `MarqueOperateur` | `options` (`OptionChoix[]`), `valeur`, `onChange`, `sousChoix`, `colonnes` | choix exclusif en cartes (classe, moyen de paiement) ; le sous-choix (numéro Airtel Money…) s'affiche sous l'option retenue |
| `recapitulatif` | `Recapitulatif` | `titre`, `sousTitre`, `lignes` (`LigneRecap[]`), `total`, `tenueJusqua` | récapitulatif du panier ; affiche le compte à rebours de tenue des places |
| `statut` | `PastilleDesserte` (`StatutDesserte`), `PastilleBillet` (`StatutBillet`) | `statut`, `retard` | le libellé porte toujours l'information (« +12 min »), jamais la couleur seule |
| `tableau-departs` | `TableauDeparts` | `titre`, `horloge`, `departs` (`Depart[]`) | fond encre, heures en jaune du site, comme un tableau de gare ; se replie en lignes sans colonnes « train »/« quai » sur mobile |

Les montants sont formatés en XAF par `@workspace/ui/lib/format`
(`formatPrice`, `formatPriceCompact`, `formatTime`, `formatDuration`,
`spellTime`).

## Portage mobile — `packages/mobile-ui/src/tokens`

`packages/mobile-ui/src/tokens/index.ts` est un **portage** de
`packages/ui/src/styles/tokens.css`, pas une seconde source de vérité : toute
évolution part du CSS. React Native ne lit pas `oklch()`, les couleurs y sont
donc écrites en sRGB hexadécimal (conversion faite à la main depuis les
valeurs oklch de référence, hors du générateur automatique).

| Export | Contenu |
| --- | --- |
| `colors` | `{ light, dark }`, mêmes clés que les tokens `--c-*` (`canvas`, `surface`, `ink`, `accent`, `success`…) |
| `fonts` | familles chargées par `useSetragFonts()` (Schibsted Grotesk, IBM Plex Mono) |
| `typography` | équivalent de `--t-*` : `fontFamily`, `fontSize`, `lineHeight`, `letterSpacing` calculés depuis les ratios du CSS |
| `spacing`, `radius` | équivalents de `--s-*` et `--r-*` |
| `controlHeight` | `sm` 36, `md` 44, `lg` 52, `field` 52 — la cible tactile ne descend jamais sous 44 |
| `targetMin` | 44 |
| `shadows` | équivalent de `--sh-*`, au format `shadowColor`/`shadowOffset`/`elevation` |
| `brand` | équivalent de `--brand-*` (`orange`, `jaune`, `vert`, `indigo`, `bleu`, `encre`) — réservé au logo et au ruban |
| `RUBAN` | réexporté depuis `./ruban` — **généré** par `packages/ui/scripts/marque/generer.mjs` (voir plus haut), ne pas modifier à la main |
| `motion` | équivalent de `--dur-*`/`--ease-*` : `durationMicro/Fast/Base/Slow/Glisse/Boucle` en ms, `easing.standard/glisse/sortie` en points de contrôle Bézier (à passer à `Easing.bezier(...)` de Reanimated) |

`packages/mobile-ui/src/components` porte par ailleurs des primitives
(`Text`, `Button`, `Card`, `Field`, `Choice`, `SegmentedControl`, `Stepper`,
`EmptyState`, `InlineMessage`, `ToastBar`, `Tag`, `Badge`, `Avatar`,
`Separator`) et un dossier `voyage/` (`TripSearchBar`, `TripResultCard`,
`PriceCalendar`, `TrafficBanner`, `Ticket`, `BoardingPass`, `WalletPass`,
`CheckoutSummary`) — non couverts par cette page, qui documente les tokens.
Ces noms ne correspondent pas un à un aux composants voyage web actuels
(`CarteTrajet`, `Billet`, `ChoixCartes`…) : leur parité avec la charte
« voie et ruban » reste à vérifier séparément.

## Documents du voyageur — `packages/backend/convex/lib`

Le billet PDF, le pass Wallet et les e-mails sont fabriqués par le backend,
sans navigateur : ils portent la charte par **portage**, comme le mobile.
Toute évolution de `tokens.css` ou du logo s'y reporte.

| Fichier | Contenu |
| --- | --- |
| `ticketPdf.ts` | le billet du site (`voyage/billet`) mis en page pour le papier : A5 paysage, **fond blanc cerné d'un filet** (le billet du site est encre, mais celui-ci s'imprime : un aplat viderait les cartouches et bave au laser), logo compact en couleur, voie pleine et ruban entre les heures, découpe en voie vide bordée de ses encoches, talon Aztec ; bandeau « TITRE NON VALABLE » hors statut valide ou utilisé. `MISE_EN_PAGE_DU` : les PDF rangés avant cette date sont refaits à la demande — à avancer à chaque changement visible |
| `pdfMarque.ts` | couleurs (sRGB des valeurs oklch), logo tracé depuis `@workspace/ui/marque/traces`, voie, ruban en vrai dégradé PDF, icônes Lucide des pastilles |
| `polices.ts` | Schibsted Grotesk 400/500/600 et IBM Plex Mono 400/600 embarquées en sous-ensemble ; coupe « Latin étendu » ajoutée si un nom l'exige ; accent retiré puis « ? » pour ce qu'aucune coupe ne connaît |
| `libellesBillet.ts` | mots du billet partagés PDF / Wallet : « Express 201 », « 1re », « Mar. 28 juil. 2026 », « 34 500 FCFA » (espace U+00A0), « (+1 j) » |
| `walletPass.ts` | pass Apple et Google : fond encre, libellés du site, icône et logo |
| `courriels.ts` | gabarit des e-mails : logo PNG servi par la billetterie, titre indigo, références en mono |

Deux modules sont **générés**, à ne pas modifier à la main :

```bash
cd packages/backend && bun run ressources   # policesDonnees.ts, walletImages.ts
cd apps/billetterie-web && bun run icones   # public/marque/setrag-logo.png (e-mails)
```

## Faire évoluer la charte

Les composants shadcn s'ajoutent depuis `packages/ui` et héritent des tokens
via le pont de `globals.css` :

```bash
cd packages/ui && bunx shadcn@latest add <composant>
```

Le CLI écrase les fichiers de même nom : `button.tsx`, `field.tsx`… sont des
implémentations SETRAG, ne pas les régénérer sans réappliquer leurs variantes.

Pour la marque (logo, ruban, tracés), tout part de la géométrie dans
`packages/ui/scripts/marque/` — voir « Régénérer la marque » plus haut.
