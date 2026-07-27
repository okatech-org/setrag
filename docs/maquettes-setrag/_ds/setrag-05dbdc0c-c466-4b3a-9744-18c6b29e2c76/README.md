# SETRAG — conventions de construction

Design system voyage de la billetterie SETRAG (ligne Owendo–Franceville).
Tailwind CSS v4. Les composants sont exposés sur `window.SetragUI`.

## Aucun provider requis

Les composants ne lisent aucun contexte : ils s'utilisent directement, sans
wrapper. Les tokens vivent dans `styles.css` (chargé par la page), pas dans un
`ThemeProvider`.

Thème sombre : `data-theme="dark"` sur un ancêtre — **et uniquement cet
attribut**. La classe `.dark` n'est volontairement pas reconnue : un hôte en
thème sombre la pose pour sa propre interface, et le design system basculerait
avec lui sans que la surface d'accueil suive. `data-theme="light"` force le
clair sur n'importe quelle sous-arborescence.

## Le vocabulaire de classes — et sa limite

⚠️ **Point décisif.** Tailwind v4 ne génère que les classes effectivement
présentes dans les sources scannées à la compilation. Le `styles.css` livré ici
contient les utilitaires du design system — **une classe Tailwind arbitraire
que vous inventez (`bg-blue-500`, `p-7`, `text-2xl`) n'y sera pas et ne stylera
rien.**

Deux règles qui en découlent :

1. Composez avec les classes listées ci-dessous — elles sont garanties présentes.
2. Pour tout le reste (une valeur non listée, une couleur ponctuelle), utilisez
   les **variables CSS** en style inline : `style={{ padding: "var(--s-5)" }}`.
   Les variables sont toujours définies, elles ne dépendent pas du scan.

### Couleurs (garanties)

| Rôle | Classes |
|---|---|
| Fonds | `bg-canvas` (fond de page), `bg-surface` (carte), `bg-surface-sunk` (sous-carte) |
| Texte | `text-ink`, `text-ink-muted`, `text-ink-faint`, `text-ink-inverse` |
| Bordures | `border-line`, `border-line-strong`, `border-accent-base` |
| Accent (bleu logo #0F52A0) | `bg-accent-base`, `bg-accent-soft`, `text-accent-ink` |
| Secondaire (acier) | `bg-second-soft`, `text-second-ink` |
| Statuts | `bg-success-soft`/`text-success-ink`, `bg-warning-soft`/`text-warning-ink`, `bg-danger-soft`/`text-danger-ink`, `bg-info-soft`/`text-info-ink` |

Règle de paire : un fond `*-soft` va toujours avec un texte `*-ink`. Le contraste
est vérifié pour cette combinaison, pas pour d'autres.

### Typographie (garanties)

`text-display` · `text-h1` · `text-h2` · `text-h3` · `text-h4` ·
`text-body-lg` · `text-body` · `text-small` · `text-caption` ·
`text-time` (heures, mono 25 px) · `text-mono-label` (surtitre mono majuscule)

**`tabular`** met le texte en IBM Plex Mono à chiffres tabulaires. Toute heure,
durée ou montant affiché dans une liste la porte — c'est ce qui aligne les
colonnes d'une ligne à l'autre.

### Formes et espacement (garanties)

Rayons : `rounded-xs` (4) · `rounded-sm` (8) · `rounded-md` (12) ·
`rounded-lg` (20) · `rounded-pill` (999, tous les boutons et pastilles).
Ombres : `shadow-md`, `shadow-lg`. Cible tactile : `min-h-target` (44 px).

Espacement : l'échelle Tailwind standard (`gap-4`, `p-6`) fonctionne, base 4 —
identique aux tokens `--s-*`.

## Les six règles non négociables

1. **L'heure d'abord, le prix ensuite, le reste en gris.** Sur une carte de
   trajet : heure en `text-time`, prix en `text-h3` gras, contexte en
   `text-small text-ink-muted`.
2. **Hauteur d'action ≥ 44 px**, 8 px entre deux cibles.
3. **Un seul bouton `variant="primary"` par écran** — celui qui fait avancer le
   voyage. Les autres actions sont `secondary` ou `ghost`.
4. **Jamais d'information portée par la couleur seule.** Un retard porte un
   libellé chiffré (« +12 min »), une suppression porte le mot.
5. **L'anneau de focus ne se supprime pas.** Il est déjà posé globalement
   (`:focus-visible`), ne l'écrasez pas.
6. **Ton concret.** « Votre train partira 12 min plus tard. Votre place est
   conservée. » — pas « Incident d'exploitation ».

## Où lire la vérité

- `styles.css` et sa chaîne d'`@import` (`tokens.css`, `_ds_bundle.css`,
  `fonts/fonts.css`) : toutes les valeurs réelles.
- `components/<groupe>/<Nom>/<Nom>.prompt.md` : l'usage composant par composant.
- `components/<groupe>/<Nom>/<Nom>.d.ts` : le contrat de props.

Deux groupes : `general` (primitives) et `voyage` (métier ferroviaire —
`TripSearchBar`, `TripResultCard`, `PriceCalendar`, `TrafficBanner`, `Ticket`,
`CheckoutSummary`, `BoardingPass`, `WalletPass`).

Pour un écran de résultats complet : `AppHeader` + `Avatar` en haut,
`FilterGroup` / `SegmentedControl` / `RangeFilter` dans la colonne de filtres,
`ResultsToolbar` au-dessus de la liste de `TripResultCard`.

`BoardingPass` est la carte du quai (compte à rebours, voiture/place/quai) ;
`WalletPass` l'aperçu de la carte ajoutée à Apple Wallet ou Google Wallet.

## Exemple idiomatique

```jsx
const { TripResultCard, Tag, Button } = window.SetragUI

function Resultats({ trajets, onChoisir }) {
  return (
    <section className="bg-canvas grid gap-4 p-6">
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="text-h2">Owendo → Franceville</h2>
        <span className="text-small text-ink-muted">vendredi 7 août</span>
      </header>

      {trajets.map((t) => (
        <TripResultCard
          key={t.id}
          departureAt={t.departureAt}
          arrivalAt={t.arrivalAt}
          durationMinutes={t.durationMinutes}
          originLabel="Owendo"
          destinationLabel="Franceville"
          priceXaf={t.priceXaf}
          tags={[{ label: "À l'heure", tone: "success" }]}
          onSelect={() => onChoisir(t.id)}
        />
      ))}

      <footer className="border-line flex items-center gap-3 border-t pt-4">
        <span className="tabular text-small text-ink-muted">3 dessertes</span>
        <Button variant="ghost" size="sm">Voir le lendemain</Button>
      </footer>
    </section>
  )
}
```

Les montants sont en francs CFA : passez un nombre en `priceXaf`, le composant
formate lui-même (`18 000 FCFA`). N'écrivez pas le formatage à la main.

# SetragUI (@workspace/ui@0.0.0)

This design system is the published @workspace/ui React library, bundled as a single
browser global. All 43 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.SetragUI`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.SetragUI.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { AppHeader } = window.SetragUI;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<AppHeader />);
```

Wrap the tree in the provider — most components read theme/i18n from context:

```jsx
<ThemeScope theme={"light"}>{children}</ThemeScope>
```

## Tokens

199 CSS custom properties from @workspace/ui. Names are
preserved verbatim from upstream. They are declared inside `_ds_bundle.css` (this DS ships one compiled stylesheet rather than separate token files).

- **color** (23): `--color-black`, `--text-xs`, `--text-xs--line-height`, …
- **spacing** (4): `--tw-inset-shadow`, `--tw-inset-shadow-alpha`, `--tw-inset-ring-shadow`, …
- **typography** (11): `--font-mono`, `--font-weight-medium`, `--font-weight-semibold`, …
- **radius** (1): `--radius`
- **shadow** (4): `--tw-shadow`, `--tw-ring-shadow`, `--tw-shadow-alpha`, …
- **other** (156): `--spacing`, `--container-md`, `--container-2xl`, …

## Components

### general
- `AppHeader` — En-tte d'application  marque, navigation, compte.
- `Avatar` — Initiales sur pastille acier, ou photo si src est fourni.
- `Badge`
- `Button`
- `Card`
- `CardContent`
- `CardDescription`
- `CardFooter`
- `CardHeader`
- `CardTitle`
- `Checkbox`
- `EmptyState` — tat vide SETRAG  contour pointill, et systmatiquement une porte de
- `Field` — Enveloppe libell + contrle + aide/erreur, avec les liens ARIA poss.
- `FilterGroup`
- `InlineMessage`
- `Input`
- `Radio`
- `RadioGroup`
- `RangeFilter` — Curseur de plage  piste 4 px, remplissage accent, poigne saisissable.
- `ResultsToolbar` — Bandeau au-dessus d'une liste de rsultats : dcompte  gauche, tri  droite.
- `SearchSlot`
- `SegmentedControl` — Choix exclusif en pastilles  crneau horaire, type de trajet, tri.
- `SelectNative`
- `Separator`
- `Skeleton`
- `SkeletonLines` — Lignes de squelette  largeurs dgressives, comme dans la charte.
- `Stepper` — Progression SETRAG  pastilles 26 px relies par un filet de 2 px.
- `Switch`
- `Tabs`
- `TabsContent`
- `TabsList`
- `TabsTrigger`
- `Tag`
- `Textarea`
- `ToastBar` — Bandeau de confirmation flottant  fond encre, action  droite.

### voyage
- `BoardingPass` — Carte d'embarquement  l'cran qu'on ouvre debout sur le quai.
- `CheckoutSummary` — Tunnel de paiement  rcapitulatif, choix du moyen de paiement, action.
- `PriceCalendar` — Calendrier des prix  une pastille par jour, prix en mono sous le quantime.
- `Ticket` — Billet SETRAG  fond encre, chiffres en mono, sparation pointille avant
- `TrafficBanner`
- `TripResultCard`
- `TripSearchBar` — Barre de recherche voyage  une ligne sur desktop, empile sur mobile.
- `WalletPass`
