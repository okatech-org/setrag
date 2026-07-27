# SETRAG — Plateforme de billetterie du Transgabonais

Monorepo de la plateforme de vente et de contrôle des billets voyageurs de la
Société d'Exploitation du Transgabonais (ligne Owendo–Franceville).

## Applications

| Chemin                 | Nom               | Rôle                                                             | Port |
| ---------------------- | ----------------- | ---------------------------------------------------------------- | ---- |
| `apps/billetterie-web` | `billetterie-web` | Billetterie voyageur : recherche, réservation, paiement, billets | 3000 |
| `apps/agent-web`       | `agent-web`       | Portail agent / back-office : guichet, contrôle, exploitation    | 3001 |
| `apps/voyageur-mobile` | `voyageur-mobile` | Application mobile voyageur (iOS / Android)                      | Expo |

## Paquets partagés

| Paquet                 | Contenu                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `@workspace/backend`   | Backend Convex — schéma, fonctions, crons, authentification     |
| `@workspace/ui`        | Design system web — Tailwind 4, tokens SETRAG, composants React |
| `@workspace/mobile-ui` | Design system React Native — mêmes tokens, composants natifs    |
| `@workspace/shared`    | Types, schémas Zod et règles métier (tarifs, remboursements)    |
| `@workspace/api`       | Provider Convex + client Better Auth pour les applications web  |
| `@workspace/tsconfig`  | Configurations TypeScript de base                               |

Le backend vit dans `packages/backend`. Les applications l'importent comme
n'importe quel autre paquet du workspace :

```ts
import { api } from "@workspace/backend/generated"
```

L'API typée (`convex/_generated/`) est produite par `convex dev`, lancé depuis
ce paquet. Aucune application ne référence `convex/` par chemin relatif.

## Stack

- **Monorepo** — Bun workspaces 1.3 + Turborepo 2.10 (linker `hoisted`, requis par Metro)
- **Web** — Next.js 16 (App Router, React Compiler), React 19.2, Tailwind CSS 4, shadcn (style `radix-vega`)
- **Design system** — SETRAG v1.1.0, voir [docs/design-system.md](docs/design-system.md)
- **Mobile** — Expo SDK 57, React Native 0.86, Expo Router, nouvelle architecture
- **Backend** — Convex 1.42 (base temps réel, fonctions, crons, composants)
- **Authentification** — Better Auth 1.6 via `@convex-dev/better-auth` (OTP e-mail et SMS)
- **Qualité** — TypeScript 5.9 strict, ESLint 9, Prettier, Vitest + `convex-test`

## Assistants IA voyageurs

Le backend expose quatre assistants (`concierge`, `booking`, `tickets`,
`account`) capables d'utiliser les mêmes actions que le parcours client. Le
chat texte accepte OpenAI, Anthropic et Gemini ; la voix utilise OpenAI
Realtime avec des secrets WebRTC éphémères. Les réservations, paiements,
annulations et modifications de données exigent une confirmation serveur
idempotente.

Contrat d'intégration web/mobile :
[docs/assistant-ia-frontend.md](docs/assistant-ia-frontend.md).

Le socle de messagerie permet de raccorder les mêmes assistants à des canaux
externes. Telegram est le premier adaptateur ; WhatsApp, Messenger et Apple
Messages partagent les mêmes threads, événements, approbations et outbox :
[docs/messagerie-multicanale.md](docs/messagerie-multicanale.md).

## Démarrage

```bash
bun install
bun run dev:convex   # backend Convex, à laisser tourner
bun run dev          # les deux applications web
bun run dev:mobile   # serveur Expo
```

Le déploiement Convex de développement est déjà provisionné
(`okatech/setrag`) ; ses coordonnées sont dans `packages/backend/.env.local`.

### Jeu de données de démarrage

```bash
bun run seed
```

Crée 10 gares, 2 rames et 56 dessertes sur 14 jours.
⚠️ Les points kilométriques et horaires sont indicatifs — à remplacer par les
données d'exploitation officielles avant toute mise en production.

## Commandes

```bash
bun run build       # build des applications web
bun run typecheck   # TypeScript sur tout le monorepo
bun run lint        # ESLint
bun run test        # tests Convex (Vitest)
bun run deploy:convex
```

Les commandes Convex brutes se lancent depuis `packages/backend` :

```bash
cd packages/backend && bunx convex env list
```

## Variables d'environnement

**Déploiement Convex** (`bunx convex env set …`) :

| Variable             | Rôle                                                        |
| -------------------- | ----------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | Secret de signature des sessions (32 caractères minimum)    |
| `SITE_URL`           | Origine par défaut pour les redirections OAuth              |
| `TRUSTED_ORIGINS`    | Origines web supplémentaires, séparées par des virgules     |
| `DEV_SIGNIN_ENABLED` | `true` en développement : autorise les origines `localhost` |

La billetterie et le portail agent Vercel officiels sont toujours autorisés par
le code. `TRUSTED_ORIGINS` complète cette liste sans la remplacer.

**Applications** — voir les fichiers `.env.example` de chaque application.

## Domaine métier

Le schéma (`packages/backend/convex/schema.ts`) modélise :

- `stations`, `trains`, `trips`, `tripStops` — le réseau et le plan de transport
- `bookings`, `tickets`, `payments` — le parcours d'achat et les titres de transport
- `ticketScans` — le contrôle à l'embarquement
- `users`, `auditLogs`, `notifications`, `pushTokens` — comptes, traçabilité, notifications

Le blocage des places est transactionnel : `bookings:create` décrémente
`trips.seatsAvailable` dans la même mutation, ce qui exclut toute survente. Un
cron restitue les places des réservations impayées après 15 minutes.
