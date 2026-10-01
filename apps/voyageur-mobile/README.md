# SETRAG — app voyageur

Application Expo (iOS et Android) du Transgabonais. Elle suit écran par écran
les maquettes de la charte : [`docs/charte-setrag/mobile.html`](../../docs/charte-setrag/mobile.html)
(et la feuille de Ruban dans `assistant.html`). En cas d'écart, la maquette fait foi.

Elle utilise le déploiement Convex de `packages/backend` et le design system
`packages/mobile-ui` (tokens, composants, et `marque/` : logo, voie, ruban,
signe de Ruban).

## Démarrage

Depuis la racine du monorepo :

```sh
bun install
cp apps/voyageur-mobile/.env.example apps/voyageur-mobile/.env.local
```

Renseigner les deux URL publiques du déploiement Convex dans `.env.local`, puis :

```sh
cd packages/backend && bun run dev
cd apps/voyageur-mobile && bunx expo start --dev-client
```

La première fois, et après tout ajout de module natif ou de plugin Expo, il
faut reconstruire le client de développement : `bun run ios` ou
`bun run android`. Les dossiers `ios/` et `android/` sont générés
(`bunx expo prebuild --clean`) et ignorés par Git.

Metro résout d'abord `apps/voyageur-mobile/node_modules`, puis la racine
(`metro.config.js`). L'app y épingle les versions natives du SDK (React
19.2.3, react-native-svg…) quand la racine hisse celles du web : sans cet
ordre, `packages/mobile-ui` chargerait une seconde copie de React.

## Écrans

| Maquette                 | Route                                   |
| ------------------------ | --------------------------------------- |
| Démarrage                | écran natif, puis `components/demarrage`|
| Bienvenue                | `/bienvenue`                            |
| Connexion (code à 6 chiffres) | `/connexion`                       |
| Accueil, choix d'une gare| `/` (onglet Accueil, feuilles)          |
| Résultats                | `/resultats`                            |
| Voyageurs et classe      | `/reservation`                          |
| Paiement                 | `/paiement`                             |
| Validation Mobile Money  | `/paiement/attente`                     |
| Billets émis             | `/confirmation`                         |
| Billets                  | `/billets` (onglet)                     |
| Billet plein écran       | `/billets/[reference]?billet=…`         |
| Suivi du voyage          | `/suivi?tripId=…`                       |
| Notifications            | `/notifications`                        |
| Compte                   | `/compte` (onglet) et `/compte/*`       |
| Ruban                    | `/assistant` (feuille à deux hauteurs)  |

## Règles

- **Billets hors réseau.** La copie locale (`lib/bookings-cache.tsx`) ne
  recouvre jamais une réponse du serveur et n'est effacée qu'à la
  déconnexion explicite ou à la suppression du compte. Hors réseau, la
  session paraît absente : l'app relit alors la copie du dernier compte
  connecté, pas celle d'un invité.
- **Code du billet.** Aztec signé, rendu par bwip-js comme le PDF et la
  billetterie web — jamais un QR code.
- **Marque.** Le logo et le signe de Ruban viennent de
  `packages/mobile-ui/src/marque/logos.ts`, généré par
  `packages/ui/scripts/marque/generer.mjs`. Icône et écran de démarrage :
  `bun run icones`. Ne rien redessiner à la main.
- **Charte.** Pas de couleur en dur dans les écrans : thème
  (`useTheme().colors`) ou tokens (`surEncre` pour le billet, `wallet`).
- Le paiement est simulé par le backend : aucun débit réel. En
  développement, l'écran de paiement le rappelle.

## Ce qui manque côté serveur

- Le quai et l'heure d'embarquement : le billet affiche voiture, place et
  classe, et compte le temps jusqu'au départ.
- L'information trafic (travaux) : le bandeau de l'accueil ne s'affiche que
  pour un train supprimé, connu par la desserte.
- La demande de paiement Mobile Money réelle : l'écran d'attente envoie la
  confirmation simulée et attend que le dossier soit payé.

## Vérification

```sh
cd apps/voyageur-mobile
bun run typecheck
bun run lint
bunx expo export --platform ios
```
