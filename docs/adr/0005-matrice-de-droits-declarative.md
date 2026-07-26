# ADR-0005 — Matrice de droits déclarative plutôt que rôles en dur

**Statut :** accepté
**Date :** 2026-07-26
**Portée :** `convex/model/permissions.ts`, `convex/lib/auth.ts`

## Contexte

Le CDC §9.1.2 impose de « dissocier les droits en consultation, modification,
suppression, validation », et §8.7 le moindre privilège. Le système compte
**11 rôles** (voyageur, vendeur guichet, vendeur agence, taxateur, contrôleur
train, contrôleur recettes, chef de gare, comptable, responsable KPI, admin
fonctionnel, admin IT) et **22 ressources** protégées.

La séparation des tâches n'est pas décorative : le contrôleur de recettes
clôture la caisse, le comptable déverse en comptabilité, et aucun des deux ne
doit faire les deux.

## Décision

Une **matrice unique** `rôle → ressource → permissions[]`, en TypeScript pur.
Les fonctions Convex n'énumèrent jamais de rôles : elles demandent un droit
sur une ressource via `requirePermission(ctx, "caisse", "valider")`.

Un droit absent vaut refus. Le moindre privilège est donc obtenu par
construction, pas par vigilance.

## Options considérées

### Option A — Matrice déclarative centralisée

**Pour :** une seule chose à relire pour auditer les droits. Testable
exhaustivement — 11 × 22 × 5 combinaisons couvertes sans base de données.
Une question du client (« qui peut annuler ? ») se répond en ouvrant un
fichier.

**Contre :** les droits sont figés au déploiement. Un administrateur ne peut
pas créer un rôle sur mesure sans livraison de code.

### Option B — Vérifications de rôle en ligne

```ts
if (user.role !== "comptable" && user.role !== "admin_fonctionnel") throw …
```

**Pour :** immédiat à écrire.

**Contre :** les droits se dispersent sur des dizaines de fichiers. Ajouter
un rôle devient une chasse. Auditer devient impossible. C'est le mode
d'échec habituel de ce genre de système.

### Option C — Droits en base, administrables

**Pour :** SETRAG ajuste sans livraison.

**Contre :** une lecture supplémentaire par requête, un cache à invalider, et
surtout une surface de mauvaise configuration — un droit accordé par erreur
en production ne laisse aucune trace en revue de code. Prématuré tant que le
référentiel des rôles vient du CDC et non des usages.

## Analyse

La matrice a déjà rendu deux services concrets pendant l'implémentation :

- elle a démenti un test que j'avais écrit — le chef de gare n'ouvre pas de
  session de caisse, et c'était la matrice qui avait raison ;
- elle a rendu visible une **lacune réelle** : le contrôleur train encaissait
  à bord sans avoir de droit sur la ressource `caisse`. Corrigé en
  `READ_WRITE` — il tient sa caisse embarquée mais ne la valide pas
  lui-même, ce qui reste au contrôleur de recettes.

Ces deux épisodes n'auraient pas eu lieu avec des `if` dispersés : il n'y
aurait rien eu à relire.

## Conséquences

**Devient plus facile**
- L'audit des droits est une lecture, pas une enquête.
- La séparation des tâches est explicite et testée.

**Devient plus difficile**
- Tout ajustement passe par une livraison.

**À revoir**
- Si SETRAG demande des rôles administrables, la matrice devient le socle par
  défaut et la base ne porte que les écarts. Ne pas inverser : un système
  sans défaut codé est un système qu'on peut vider par erreur.
