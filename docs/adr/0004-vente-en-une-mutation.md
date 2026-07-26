# ADR-0004 — Toute la vente dans une seule mutation

**Statut :** accepté
**Date :** 2026-07-26
**Portée :** `convex/functions/sales.ts` (`performSale`)

## Contexte

Une vente touche sept choses : la séquence de numérotation, la vente, les
titres, les masques d'occupation, les compteurs de segments, les contingents
tarifaires et la session de caisse. Si l'une échoue après que les autres ont
réussi, on obtient soit une survente, soit de l'argent encaissé sans titre,
soit un trou de séquence dans le journal comptable.

## Décision

`performSale` fait **tout dans une seule mutation Convex** : lecture des
disponibilités, calcul du prix, attribution des places, écriture de la vente,
des titres, des masques, des compteurs et des quotas. Aucune étape n'est
différée.

La fonction est paramétrée par un `SaleMode` (`ferme` | `hold`) et sert les
quatre canaux — guichet, agence, en ligne, à bord.

## Options considérées

### Option A — Mutation unique

**Pour :** l'atomicité rend la survente structurellement impossible. Deux
ventes concurrentes sur les mêmes segments lisent le même document
d'occupation ; Convex détecte le conflit et rejoue l'une des deux, qui
échoue alors proprement sur la vérification de disponibilité.

**Contre :** tout doit tenir dans le budget d'exécution d'une mutation. Le
nombre de voyageurs par vente est donc borné en pratique.

### Option B — Saga : réserver, puis payer, puis émettre

**Pour :** étapes courtes, chacune reprenable, adapté à un paiement externe
lent.

**Contre :** il faut écrire les compensations, et une compensation ratée
laisse un siège bloqué sans titre. C'est le mode d'échec classique du sujet.
Pour un train à 340 places, la complexité n'est pas justifiée.

### Option C — Verrou applicatif sur la desserte

**Pour :** raisonnement simple, sérialisation explicite.

**Contre :** un verrou par desserte sérialise **toutes** les ventes du train,
y compris celles qui ne se disputent aucun siège. On échange une garantie
correcte contre un goulot d'étranglement à l'ouverture des ventes.

## Analyse

La vente en ligne a bien besoin d'un temps de paiement, mais elle se résout
par un **mode `hold`** — la même mutation, qui pose `heldMask` au lieu de
`soldMask` et fixe une expiration. Le cron `expire stale holds` libère au
bout de 15 minutes. On garde donc l'atomicité sans saga.

Un point mérite attention : la signature du code-barres se fait *dans* la
mutation. C'est licite parce qu'Ed25519 est **déterministe** — un rejeu
produit exactement la même signature. Une signature aléatoire aurait rendu la
mutation non rejouable. Voir [ADR-0007](0007-titre-autoporteur-signe.md).

## Conséquences

**Devient plus facile**
- L'absence de survente est démontrée, pas supposée : 12 titres vendus sur
  une voiture de 6 places (6 OWE→BOO + 6 BOO→FCV) sans le moindre conflit
  d'inventaire, compteurs conformes aux masques.
- Un seul chemin de vente à maintenir pour quatre canaux.

**Devient plus difficile**
- Aucun appel réseau n'est possible dans la mutation : paiement, SMS, PDF
  sont nécessairement hors transaction — voir
  [ADR-0009](0009-pdf-en-action-hors-transaction.md).
- Une vente de groupe très nombreuse finirait par heurter le budget
  d'exécution. Non atteint aujourd'hui, mais à surveiller.

**À revoir**
- Si un jour le paiement doit être synchrone dans la vente, il faudra
  scinder — et écrire les compensations qu'on s'épargne aujourd'hui.
