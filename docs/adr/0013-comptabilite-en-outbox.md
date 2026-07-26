# ADR-0013 — Interface comptable SAGE X3 en outbox, jamais en appel direct

**Statut :** accepté
**Date :** 2026-07-26
**Portée :** `convex/model/accounting.ts`, `convex/functions/accounting.ts`,
tables `journalEntries`, `outboxEvents`

## Contexte

Les recettes doivent être déversées dans **SAGE X3** au format **V65**. Deux
systèmes indépendants, deux disponibilités différentes, et une contrainte
sans indulgence : la comptabilité n'accepte ni doublon, ni trou de séquence.

Un appel synchrone vers SAGE depuis la clôture de journée poserait la
question insoluble : que faire si l'appel expire sans réponse ? Rejouer
risque le doublon ; ne pas rejouer risque la perte.

## Décision

La clôture écrit les **écritures V65 en base** et dépose un événement dans
`outboxEvents`. Aucun appel sortant n'a lieu dans la transaction.

Le déversement est ensuite piloté explicitement :
`previewExport` → `listExports` → `acknowledgeExport` / `retryExport`.

`checkManualSequence` détecte les trous de numérotation des ventes manuelles.

## Options considérées

### Option A — Outbox (retenue)

**Pour :** la transaction métier et l'appel sortant sont découplés. SAGE
indisponible n'empêche pas de clôturer. Un déversement échoué se rejoue sans
ambiguïté, l'état étant en base.

**Contre :** un état de plus à surveiller. Un événement jamais acquitté reste
en attente indéfiniment si personne ne regarde.

### Option B — Appel synchrone à la clôture

**Pour :** simple, retour immédiat.

**Contre :** couple la disponibilité de la comptabilité SETRAG à celle de la
billetterie, et laisse la question du délai d'attente sans réponse correcte.
Impossible d'ailleurs dans une mutation Convex, qui n'autorise pas les appels
réseau.

### Option C — Fichier déposé sur un partage

**Pour :** c'est souvent ce que la comptabilité attend en pratique.

**Contre :** aucune traçabilité de l'acquittement. On ne sait pas si le
fichier a été intégré, seulement qu'il a été écrit.

## Analyse

Le point n'est pas la fiabilité du transport mais **où vit la vérité de
l'acquittement**. Avec l'outbox, elle est en base, consultable, rejouable.
`acknowledgeExport` est une action humaine ou système explicite, pas une
supposition tirée d'un code HTTP 200.

La séparation des tâches est conservée : le **contrôleur de recettes** valide
la journée, le **comptable** déverse. Ni l'un ni l'autre ne fait les deux —
voir [ADR-0005](0005-matrice-de-droits-declarative.md).

## Conséquences

**Devient plus facile**
- La clôture n'échoue jamais pour une raison extérieure.
- Le rejeu est sûr et laisse une trace.

**Devient plus difficile**
- Il faut une supervision des événements non acquittés. Non implémentée
  aujourd'hui : rien n'alerte si un export reste en attente.

**À revoir**
- Le format V65 est implémenté d'après le CDC ; il n'a pas encore été
  confronté à une instance SAGE X3 réelle.
- Une alerte sur les événements en attente au-delà d'un seuil.
- Le composant `action-retrier` est prévu au plan pour porter les tentatives ;
  l'outbox garde l'état métier, le composant exécute les relances.
