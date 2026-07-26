# ADR-0006 — Identité lue via `ctx.auth`, découplée du composant Better Auth

**Statut :** accepté
**Date :** 2026-07-26
**Portée :** `convex/lib/auth.ts`

## Contexte

L'authentification passe par **Better Auth** (`@convex-dev/better-auth`),
retenu pour ses plugins OTP e-mail et téléphone — le canal réaliste au Gabon,
où le compte e-mail n'est pas la norme.

Ce composant est explicitement en **early alpha**. La première version de
`getUser` l'interrogeait directement pour résoudre l'utilisateur courant.

## Décision

`getUser` lit l'identité par **`ctx.auth.getUserIdentity()`**, primitive
native de Convex, puis retrouve le profil applicatif dans la table `users`
par son `authId`.

Better Auth reste responsable de l'authentification — émission et validation
du jeton — mais n'est plus dans le chemin de chaque requête.

## Options considérées

### Option A — Passer par `ctx.auth`

**Pour :** une dépendance de moins par requête. Le composant peut évoluer,
casser ou être remplacé sans toucher les 12 modules de fonctions. Et
accessoirement, cela a débloqué les tests : `convex-test` n'enregistre pas
les composants, et toute la suite échouait sur
`Component "betterAuth" is not registered`.

**Contre :** il faut maintenir la correspondance `authId` → profil
applicatif, et un utilisateur authentifié sans profil est un état à gérer
(`ensureProfile`).

### Option B — Interroger le composant à chaque requête

**Pour :** une seule source d'identité, pas de table miroir.

**Contre :** couplage fort à une bibliothèque alpha, sur le chemin critique
de **chaque** requête. Et les tests unitaires deviennent impossibles sans
simuler le composant.

## Analyse

La contrainte de test a révélé un défaut de conception plutôt qu'elle ne l'a
créé. Un système ne devrait pas dépendre de son fournisseur d'identité pour
répondre à « qui est l'appelant ? » alors que le jeton porte déjà la réponse.

La table `users` n'est d'ailleurs pas un miroir : elle porte le **rôle**, le
point de vente de rattachement et la source d'identité — des données métier
qui n'ont rien à faire dans un fournisseur d'authentification.

## Conséquences

**Devient plus facile**
- Remplacer Better Auth n'impacte que la mise en place du jeton.
- Les 770 tests tournent sans simuler de composant.

**Devient plus difficile**
- La création du profil au premier accès (`ensureProfile`) est une étape
  explicite à ne pas oublier côté applications.

**À revoir**
- Le MFA exigé par le CDC pour tous les accès internes reste à câbler ;
  `requiresMfa()` existe dans la matrice de droits mais n'est pas encore
  appliqué à l'ouverture de session.
