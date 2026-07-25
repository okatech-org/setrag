# SETRAG — instructions projet

Plateforme de billetterie du Transgabonais. Trois applications et un backend
Convex packagé (`packages/backend`).

## Structure

- `apps/billetterie-web` — Next.js 16, billetterie voyageur (port 3000)
- `apps/agent-web` — Next.js 16, portail agent / back-office (port 3001)
- `apps/voyageur-mobile` — Expo SDK 57, application mobile voyageur
- `packages/backend` — Convex : schéma, fonctions, crons, authentification
- `packages/ui` — design system web (Tailwind 4)
- `packages/mobile-ui` — design system React Native
- `packages/shared` — types, schémas Zod, règles métier
- `packages/api` — provider Convex + client Better Auth (web)

## Conventions

- **Gestionnaire de paquets** : Bun. Le linker est forcé en `hoisted`
  (`bunfig.toml`) — le mode isolé de Bun 1.3 casse la résolution Metro.
  Ne pas revenir en arrière sans revalider `expo export`.
- **Langue** : le code, les commentaires et l'interface sont en français.
  Les identifiants de crons Convex doivent rester en ASCII.
- **Backend** : tout vit dans `packages/backend`. Les commandes Convex se
  lancent depuis ce dossier (`bun run dev`, `bunx convex env set …`) ; la CLI
  1.42 n'a pas d'option `--cwd`. Les applications importent uniquement
  `@workspace/backend/generated` — jamais un chemin relatif vers `convex/`.
- **Convex** : toute mutation touchant à l'inventaire de places doit rester
  transactionnelle (lecture + écriture dans la même mutation) pour exclure la
  survente. Les contrôles d'accès passent par `convex/lib/auth.ts`
  (`requireUser`, `requireRole`, `requireAgent`, `requireAdmin`).
- **Audit** : toute action sensible du back-office appelle `audit()`.
- **Design system** : le web suit **Cadence** — voir [docs/design-system.md](docs/design-system.md)
  et la référence vivante sur `/design-system` (billetterie). Source de vérité
  des tokens : `packages/ui/src/styles/tokens.css`, copie du projet Claude
  Design. Pas de valeur hexadécimale en dur dans les composants applicatifs :
  on passe par les utilitaires (`bg-surface`, `text-ink-muted`, `rounded-lg`)
  ou les variables (`var(--c-accent)`).
  Le mobile (`packages/mobile-ui`) porte la même charte : les couleurs y sont
  la conversion sRGB des valeurs oklch du CSS. C'est un portage, pas une
  seconde source de vérité — toute évolution part de `tokens.css`.
- **Règles Cadence non négociables** : hauteur d'action ≥ 44 px, un seul bouton
  `primary` par écran, jamais d'information portée par la couleur seule,
  anneau de focus jamais supprimé, heures en mono via `.tabular`.
- **shadcn** : les composants web s'ajoutent depuis `packages/ui`, jamais
  depuis une application — `components.json` y définit les alias
  `@workspace/ui/*`.

  ```bash
  cd packages/ui && bunx shadcn@latest add <composant>
  ```

  Le CLI écrase les fichiers existants portant le même nom : personnaliser un
  composant après l'avoir ajouté, pas l'inverse.

## Vérifications avant livraison

```bash
bun run typecheck
bun run lint
bun run build
cd packages/backend && bunx convex dev --once
```

## Frictions de typage connues

- `ConvexBetterAuthProvider` : le type `AuthClient` n'infère pas les plugins
  additionnels (emailOTP, phoneNumber, expo) et réduit `useSession().data` à
  `never`. Les providers castent explicitement le client — voir les commentaires
  dans `packages/api/src/provider.tsx` et `apps/voyageur-mobile/src/lib/convex.tsx`.
- Côté mobile, l'état de session se lit via `useConvexAuth()` et le profil via
  la query Convex `users:me`, pas via `authClient.useSession()`.
