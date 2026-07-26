# ADR-0010 — Stratégie de test à deux étages : `convex-test` et backend réel

**Statut :** accepté
**Date :** 2026-07-26
**Portée :** `vitest.config.ts`, `vitest.integration.config.ts`, `docker/`

## Contexte

La propriété la plus importante du système est l'**absence de survente**.
Elle ne se manifeste que sous concurrence réelle : deux mutations qui lisent
le même document et écrivent en même temps.

Or `convex-test`, la bibliothèque officielle, exécute les fonctions dans un
mock en mémoire. Elle est excellente pour la logique, l'accès aux données et
le contrôle d'accès — mais elle **ne simule pas les conflits OCC**. Une suite
qui n'utiliserait qu'elle passerait au vert sur un code qui survend.

C'est un point à énoncer clairement plutôt qu'à laisser deviner : *les tests
`convex-test` ne démontrent pas l'absence de survente.*

## Décision

Deux étages, deux configurations Vitest :

| | Unitaire / intégration | Concurrence |
|---|---|---|
| Config | `vitest.config.ts` | `vitest.integration.config.ts` |
| Environnement | `edge-runtime` | `node` |
| Cible | mock `convex-test` | **backend Convex réel** en Docker |
| Parallélisme | par défaut | `fileParallelism: false`, `maxWorkers: 1` |
| Volume | 30 fichiers, 770 tests | 1 fichier, 7 tests |

Le second étage exerce **le code de production**, pas une copie :
`performSale` a été extraite de la mutation précisément pour que les tests de
concurrence appellent la vraie fonction.

## Options considérées

### Option A — `convex-test` seul

**Pour :** rapide (2 s pour 770 tests), aucune dépendance externe.

**Contre :** la garantie centrale du système reste non démontrée. Inacceptable
ici.

### Option B — Backend réel pour tout

**Pour :** fidélité maximale.

**Contre :** Docker obligatoire pour toucher au code, suite lente, isolation
entre tests à gérer à la main. On perdrait le coût marginal nul qui rend
possible la couverture fine ([ADR-0002](0002-logique-metier-pure-isolee.md)).

### Option C — Preuve formelle du protocole

**Pour :** la garantie la plus forte.

**Contre :** disproportionné, et cela ne prouverait que le modèle — pas le
code réellement déployé.

## Ce que le second étage a établi

- **40 ventes parallèles sur 10 sièges** → exactement 10 succès, 30 refus, en
  289 ms.
- **12 titres vendus sur une voiture de 6 places** (6 Owendo→Booué +
  6 Booué→Franceville) sans survente, compteurs de segments exactement
  conformes aux masques — la propriété du CDC §7.5.

Ce sont des mesures, pas des attentes.

## Conséquences

**Devient plus facile**
- La boucle de développement reste courte : l'immense majorité des tests
  tourne sans Docker.
- La garantie anti-survente est vérifiée, pas postulée.

**Devient plus difficile**
- Deux configurations à maintenir.
- Les tests de concurrence exigent Docker et `--env-file docker/.env.local` —
  la CLI Convex refuse `CONVEX_DEPLOYMENT` et `CONVEX_SELF_HOSTED_URL`
  ensemble.

**Pièges rencontrés, à ne pas réintroduire**
- Le motif extglob de la documentation Convex
  (`import.meta.glob("./**/!(*.*.*)*.*s")`) renvoie **zéro module** avec
  Vite 7 / Vitest 4, et l'erreur affichée parle trompeusement de
  `_generated` introuvable. Voir `convex/test.setup.ts` : motifs négatifs.
- Les variables d'environnement doivent être posées **avant** le premier
  déploiement : `http.ts` enregistre les routes Better Auth au chargement du
  module, et échoue sans `BETTER_AUTH_SECRET`.
- Les noms de champs Convex doivent rester en **ASCII** — même règle que les
  identifiants de crons.

**À revoir**
- Aucun test de charge sur la contention réelle à l'ouverture des ventes. Le
  composant `sharded-counter` reste l'option de secours si elle se révèle
  problématique, pour les compteurs d'affichage uniquement — jamais pour
  l'allocation stricte.
