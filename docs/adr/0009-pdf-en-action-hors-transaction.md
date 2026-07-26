# ADR-0009 — Le billet PDF est produit par une action, hors de la vente

**Statut :** accepté
**Date :** 2026-07-26
**Portée :** `convex/functions/documents.ts`, `convex/lib/ticketPdf.ts`

## Contexte

Le billet imprimable pèse une dizaine de kilo-octets et demande d'encoder un
symbole Aztec puis de composer une page. La vente, elle, est une mutation
transactionnelle dont chaque milliseconde allonge la fenêtre de conflit
([ADR-0004](0004-vente-en-une-mutation.md)).

## Décision

Le PDF est produit par une **action** Convex, à la demande, et **mis en cache**
sur le titre (`pdfStorageId`). Un second appel resert le même fichier ;
`force: true` le refabrique et supprime le précédent.

Le PDF **n'est pas le titre**. Le titre, c'est la ligne en base et son
code-barres signé. Le PDF n'en est qu'une représentation — c'est précisément
ce qui autorise à le mettre en cache sans risque, et à le jeter sans perte.

## Options considérées

### Option A — Action à la demande, avec cache (retenue)

**Pour :** aucun coût sur la vente. Un billet jamais imprimé n'est jamais
fabriqué. Le stockage ne porte que ce qui a été demandé.

**Contre :** premier appel plus lent (~1 s). Deux allers-retours
(query d'accès, mutation de rattachement).

### Option B — Générer dans la mutation de vente

**Pour :** le billet existe dès l'achat.

**Contre :** impossible en pratique — la génération est asynchrone, et
surtout elle rallongerait la transaction la plus disputée du système pour
produire un fichier que beaucoup de voyageurs ne téléchargeront jamais.

### Option C — Générer côté client

**Pour :** zéro charge serveur.

**Contre :** trois implémentations à tenir (web voyageur, back-office agent,
mobile), qui divergeront. Et le guichet imprime depuis le serveur de toute
façon.

## Contrôle d'accès

Un billet porte le nom, le trajet et la place d'un voyageur. Trois portes,
par confiance décroissante :

1. agent habilité aux **duplicatas** ;
2. client authentifié **propriétaire** de la vente ;
3. achat sans compte : référence de vente **doublée du téléphone** de
   contact.

La référence seule ne suffit jamais — elle est séquentielle, donc devinable.

## Conséquences

**Devient plus facile**
- La vente reste rapide et étroite.
- Un changement de gabarit se propage en régénérant, sans toucher aux titres.

**Devient plus difficile**
- Le cache doit être invalidé quand le titre change. Fait à deux endroits :
  `force` (changement de place, correction d'identité) et `resignTickets`
  (rotation de clé — l'ancien PDF porte un symbole devenu faux, il est
  supprimé).

**À revoir**
- L'envoi automatique par e-mail et SMS après paiement reste à câbler ; le
  plan prévoit un pipeline durable (`workflow`) plutôt qu'un appel direct
  depuis l'action.
- Les polices standard du PDF n'encodent que le jeu WinAnsi. `sanitize()`
  translittère plutôt que d'échouer — mieux vaut un accent perdu qu'un billet
  non délivré. Une police embarquée lèverait la limite, au prix de ~100 Ko
  par fichier.
