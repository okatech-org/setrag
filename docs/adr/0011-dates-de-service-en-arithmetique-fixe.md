# ADR-0011 — Dates de service en arithmétique fixe UTC+1

**Statut :** accepté
**Date :** 2026-07-26
**Portée :** `convex/model/calendar.ts`

## Contexte

Trois notions de « jour » cohabitent et ne coïncident pas :

- la **date de circulation** — le jour où le train roule ;
- la **journée de guichet** — celle qui numérote les pièces et porte la
  session de caisse ;
- la **journée comptable** — celle qui reçoit les écritures.

Toutes s'expriment dans le fuseau du Gabon. Une erreur d'un jour ne plante
rien : elle décale silencieusement un chiffre d'affaires ou fait afficher une
mauvaise date sur un billet.

## Décision

`LIBREVILLE_UTC_OFFSET_MINUTES = 60`, constante. Les conversions se font par
**addition sur l'horodatage**, puis lecture des composantes UTC.

Aucun appel à `Intl`, `toLocaleDateString` ni base de fuseaux.

## Justification

**Africa/Libreville est à UTC+1 toute l'année, sans heure d'été.** Le Gabon
n'a jamais pratiqué de changement d'heure. La règle qui rend l'arithmétique de
dates dangereuse ailleurs — deux fois 2 h 30 en octobre, jamais 2 h 30 en
mars — n'existe pas ici.

## Options considérées

### Option A — Décalage fixe (retenue)

**Pour :** ne dépend d'aucune base de fuseaux, donc du même comportement dans
tous les runtimes — navigateur, `edge-runtime` des tests, runtime Convex, Node
des actions. Ces environnements n'embarquent pas tous les mêmes données ICU,
et c'est une source classique de divergence entre test et production.

**Contre :** faux si le Gabon adopte un jour l'heure d'été. Une seule
constante à changer, mais toutes les dates historiques deviendraient
ambiguës.

### Option B — `Intl.DateTimeFormat` avec `timeZone: "Africa/Libreville"`

**Pour :** correct par construction, y compris si la règle change.

**Contre :** dépend des données ICU du runtime. Un `edge-runtime` compilé sans
ICU complet renvoie silencieusement de l'UTC — le test passe, la production
dérive d'une heure. Plus lent, et non trivialement déterministe en test.

### Option C — Bibliothèque de dates (Luxon, Temporal)

**Pour :** API confortable.

**Contre :** une dépendance de plus pour ce qui tient en une addition dans le
cas gabonais.

## Conséquences

**Devient plus facile**
- Comportement identique partout, testable sans figer l'horloge du système.
- `toServiceDate`, `enumerateServiceDates` et `saleWindow` (31 jours par
  défaut) sont de la logique pure.

**Devient plus difficile**
- Le système est **mono-fuseau par construction**. Une extension hors Gabon
  imposerait de reprendre `calendar.ts` en entier.

**À revoir**
- Si le Gabon adopte un changement d'heure, il faudra basculer sur `Intl` et
  reprendre les dates historiques.
- Ne pas confondre journée de guichet et date de circulation : c'est
  exactement le défaut trouvé dans le code-barres, qui portait la date de
  vente au lieu de la date de circulation. Le nom `serviceDate` dans
  `sales.ts` désigne la journée de guichet — piège de nommage à garder à
  l'esprit.
