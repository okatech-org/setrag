# SETRAG — instructions projet

Plateforme de billetterie du Transgabonais. Quatre applications et un backend
Convex packagé (`packages/backend`).

## Structure

- `apps/billetterie-web` — Next.js 16, billetterie voyageur (port 3000)
- `apps/agent-web` — Next.js 16, portail agent / back-office (port 3001)
- `apps/controleur-web` — Next.js 16, contrôle à bord, PWA hors ligne (port 3002)
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
- **Contrôle à bord** : `apps/controleur-web` travaille hors ligne par défaut.
  Toute écriture de terrain passe par `commitOperation()`, qui inscrit
  l'opération ET sa mise en file dans une seule transaction IndexedDB, avec un
  identifiant client. Un contrôle enregistré n'est **jamais** modifiable —
  invariante vérifiée par la matrice de droits. Détails :
  [docs/controleur-web.md](docs/controleur-web.md).
- **Billetterie voyageur** : `apps/billetterie-web` est installable et consulte
  billets et parcours hors réseau. Elle ne fait que LIRE hors ligne — aucune
  file d'envoi. Deux règles : la copie locale ne recouvre jamais une réponse du
  serveur, et elle n'est effacée qu'à la déconnexion explicite
  (`seDeconnecter()`) ou en ligne — hors réseau, la session paraît absente sans
  l'être. Détails : [docs/billetterie-pwa.md](docs/billetterie-pwa.md).
- **Direction générale** : espace de lecture consolidée sur `/direction`
  (cinq volets, provenance à six états, aucune action métier). Détails :
  [docs/direction-generale.md](docs/direction-generale.md).
- **Design system** : le web suit **SETRAG** — voir [docs/design-system.md](docs/design-system.md)
  et la référence vivante sur `/charte` (billetterie). Source de vérité
  des tokens : `packages/ui/src/styles/tokens.css`, copie du projet Claude
  Design. Le logo, le ruban et leurs tracés SVG vivent dans
  `@workspace/ui/marque` (`Logo`, `LogoAnime`, `SigneRuban`) ; tout se régénère
  avec `packages/ui/scripts/marque/generer.mjs`, qui écrit
  `src/marque/traces.ts`, `src/marque/svg/*.svg` et
  `packages/mobile-ui/src/tokens/ruban.ts` — ne jamais modifier ces sorties à
  la main. Pas de valeur hexadécimale en dur dans les composants applicatifs :
  on passe par les utilitaires (`bg-surface`, `text-ink-muted`, `rounded-lg`)
  ou les variables (`var(--c-accent)`).
  Le mobile (`packages/mobile-ui`) porte la même charte : les couleurs y sont
  la conversion sRGB des valeurs oklch du CSS. C'est un portage, pas une
  seconde source de vérité — toute évolution part de `tokens.css`.
- **Règles SETRAG non négociables** : hauteur d'action ≥ 44 px, un seul bouton
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

## Déploiement Vercel — plan Hobby

Vercel ne déploie que les commits dont l'auteur possède le compte, et le plan
Hobby n'admet pas de collaborateurs sur un dépôt privé. Les commits de fusion
créés par GitHub portent `noreply@github.com` : un « Merge pull request » est
donc **refusé avant toute compilation**, et les journaux de build restent
vides — le blocage n'apparaît que sur la fiche du déploiement.

Le dépôt déployé est `github.com/ntsagui/setrag`, dont le propriétaire est
aussi celui du compte Vercel. Chaque commit a donc pour auteur ET committer
`ntsagui <326687397+ntsagui@users.noreply.github.com>` (adresse noreply du
compte GitHub, qui suffit à l'y rattacher), avec okafrancois en co-auteur :

```bash
GIT_AUTHOR_NAME=ntsagui GIT_AUTHOR_EMAIL=326687397+ntsagui@users.noreply.github.com \
GIT_COMMITTER_NAME=ntsagui GIT_COMMITTER_EMAIL=326687397+ntsagui@users.noreply.github.com \
git commit -m "…" -m "Co-authored-by: okafrancois <44721873+okafrancois@users.noreply.github.com>"
```

À défaut, déployer depuis un poste avec `bunx vercel --prod`, qui attribue le
déploiement au compte connecté plutôt qu'à l'auteur du commit.

## Frictions de typage connues

- `ConvexBetterAuthProvider` : le type `AuthClient` n'infère pas les plugins
  additionnels (emailOTP, phoneNumber, expo) et réduit `useSession().data` à
  `never`. Les providers castent explicitement le client — voir les commentaires
  dans `packages/api/src/provider.tsx` et `apps/voyageur-mobile/src/lib/convex.tsx`.
- Côté mobile, l'état de session se lit via `useConvexAuth()` et le profil via
  la query Convex `users:me`, pas via `authClient.useSession()`.
