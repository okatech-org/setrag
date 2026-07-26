# ADR-0002 — Logique métier pure isolée dans `convex/model/`

**Statut :** accepté
**Date :** 2026-07-26
**Portée :** `packages/backend/convex/model/`

## Contexte

Le métier ferroviaire porte des règles denses et vérifiables : barème
kilométrique à tranches, arrondis réglementaires, coefficients d'abonnement
sur 44 tranches, quotas tarifaires, masques d'occupation, machine à états
d'approbation, écritures comptables V65.

Ces règles ont deux propriétés qui les distinguent du reste du code : elles
sont **totalement déterministes** et elles sont **celles que le client
contestera**. Un désaccord sur un prix se tranche en relisant une fonction,
pas en rejouant une transaction.

## Décision

Toute règle métier calculable vit dans `convex/model/`, en **TypeScript pur,
sans aucun import de Convex**. Les fonctions Convex (`convex/functions/`)
lisent la base, appellent ces fonctions pures, écrivent le résultat. Elles
n'arbitrent rien.

13 modules aujourd'hui : `fares`, `inventory`, `pricing`, `permissions`,
`network`, `seating`, `approval`, `calendar`, `sales`, `ancillary`,
`accounting`, `barcode`, `aztec`.

## Options considérées

### Option A — Séparation stricte `model/` ↔ `functions/`

**Pour :** les règles se testent sans base de données, donc exhaustivement.
La matrice de droits se couvre sur ses 11 rôles × 22 ressources × 5
permissions en quelques millisecondes. Le barème se vérifie sur toute la
plage de distances. Ce niveau de couverture serait impensable s'il fallait
amorcer une base à chaque cas.

**Contre :** une indirection de plus. Certaines règles ont besoin de données
qu'il faut charger d'abord et passer en argument, ce qui allonge les
signatures.

### Option B — Règles dans les fonctions Convex

**Pour :** plus direct, moins de fichiers, accès libre à `ctx.db` au milieu
d'un calcul.

**Contre :** chaque test métier devient un test d'intégration. Le coût par
cas explose, et en pratique la couverture s'arrête aux chemins nominaux —
c'est-à-dire exactement là où les bugs ne sont pas.

## Analyse

Le point n'est pas l'élégance mais **le coût marginal d'un cas de test**.
Quand il tombe à zéro, on écrit les tests d'inversion, de monotonie, de
bornes — ceux qui trouvent des choses.

C'est ce qui a fait apparaître l'**inversion de prix à 100 km** : 99 km
coûtent 4 700 XAF, 100 km en coûtent 4 350. Le défaut est dans le barème du
CDC lui-même, pas dans le code. Il est aujourd'hui figé dans un test
documenté plutôt que « corrigé » en douce — le corriger sans mandat du client
serait outrepasser.

## Conséquences

**Devient plus facile**
- 93,9 % de couverture de lignes sans effort disproportionné.
- Les règles sont portables : un changement de socle ne les touche pas
  ([ADR-0001](0001-convex-comme-socle.md)).

**Devient plus difficile**
- La discipline doit tenir. Une règle glissée dans une fonction Convex
  n'échoue pas — elle devient simplement moins testée. Rien ne l'interdit
  mécaniquement aujourd'hui.

**À revoir**
- Une règle ESLint interdisant l'import de `convex/` depuis `model/`
  transformerait la convention en garantie.
