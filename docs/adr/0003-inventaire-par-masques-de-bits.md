# ADR-0003 — Inventaire des places par masques de bits sur les segments

**Statut :** accepté
**Date :** 2026-07-26
**Portée :** `convex/model/inventory.ts`, table `seatOccupancy`

## Contexte

Le Transgabonais dessert jusqu'à 23 gares sur 648 km. Un siège n'est pas
« occupé » ou « libre » : il l'est **par tronçon**. Un voyageur Owendo →
Booué et un voyageur Booué → Franceville peuvent partager le même siège sans
se gêner — c'est même l'objet du remplissage. Le CDC §7.5 l'exige
explicitement.

Il faut donc, pour chaque siège d'une desserte, savoir quels tronçons sont
pris, et pouvoir tester une réservation en temps constant sous concurrence.

## Décision

L'occupation d'un siège est un **entier dont le bit *i* vaut 1 si le segment
*i* est occupé**. Trois masques par siège : `soldMask` (vendu ferme),
`heldMask` (réservé temporairement), `blockedMask` (retiré de la vente).

Un trajet de l'arrêt *a* à l'arrêt *b* devient le masque des bits *a* à
*b−1*. Le siège est disponible si `masque_demandé & (vendu | réservé |
bloqué) === 0`. L'occupation est `masque | demandé`.

`MAX_SEGMENTS = 30`.

## Options considérées

### Option A — Masques de bits

| Dimension | Évaluation |
|---|---|
| Complexité | Faible une fois le vocabulaire posé (`segmentMask`, `isRangeFree`, `occupy`) |
| Coût de lecture | Un entier par siège, quel que soit le nombre d'arrêts |
| Concurrence | Un seul document patché par vente → fenêtre de conflit minimale |
| Lisibilité | Moyenne : `0b0000111` demande une fonction de rendu pour le débogage |

### Option B — Une ligne par (siège, segment)

**Pour :** lisible directement dans le tableau de bord, pas de plafond
d'arrêts.

**Contre :** une vente Owendo → Franceville touche 22 documents au lieu d'un.
Sous concurrence, cela multiplie par 22 la surface de conflit OCC, donc le
taux de rejeu. C'est exactement le mécanisme qui, à l'ouverture des ventes,
transformerait une file de guichet en série d'échecs.

### Option C — Intervalles `[début, fin]` par réservation

**Pour :** pas de plafond, sémantique explicite.

**Contre :** tester la disponibilité devient un parcours de la liste des
intervalles existants, avec la logique de chevauchement à écrire et à
tester. Le masque de bits fait la même chose en une instruction processeur.

## Analyse

Le facteur décisif est la **taille de la fenêtre de conflit**. Convex détecte
les conflits par document lu et écrit ; concentrer l'état d'un siège dans un
seul document est ce qui rend la vente concurrente viable.

Le prix payé est le **plafond de 30 segments**, imposé par les opérateurs
bitwise de JavaScript qui travaillent sur 32 bits signés. Ce n'est pas une
limite théorique lointaine : 23 gares font 22 segments, il reste huit
tronçons de marge. Une extension du réseau au-delà de 31 arrêts imposerait
de passer à `BigInt` ou à deux masques chaînés. La contrainte est vérifiée à
la génération des dessertes, qui refuse au-delà de `MAX_SEGMENTS` — un
dépassement échoue bruyamment, il ne corrompt pas silencieusement.

## Conséquences

**Devient plus facile**
- Le partage de siège par tronçon est le comportement par défaut, pas une
  fonctionnalité ajoutée.
- La vente concurrente reste tenable : 40 ventes parallèles sur 10 sièges
  donnent exactement 10 succès et 30 refus en 289 ms sur backend réel.

**Devient plus difficile**
- Lire l'état brut en base est peu parlant ; il faut passer par
  `occupiedSegments()` pour diagnostiquer.
- Le plafond de 30 segments est structurel et doit être documenté partout où
  le réseau pourrait s'étendre.

**À revoir**
- Si le réseau dépasse 31 arrêts, migrer vers `BigInt`. Les fonctions de
  `model/inventory.ts` encapsulent déjà l'arithmétique : le changement y est
  circonscrit.
