# ADR-0016 — Documents versionnés et approbations génériques

**Statut :** accepté sous réserve des règles métier SETRAG
**Date :** 2026-09-10
**Portée :** noyau plateforme Convex, pièces jointes, circuits d’approbation

## Contexte

Les futurs modules doivent joindre des pièces à leurs entités et demander des
validations sans reconstruire ces mécanismes dans chaque domaine. Les règles Fret
et les délégations métier ne sont toutefois pas encore validées par SETRAG. Le
socle doit donc fournir des garanties techniques communes sans inventer ces règles.

## Décision

Un dossier `documentRecords` rattache des versions immuables
`documentVersions` à une entité, un module et, si nécessaire, un site. Ajouter une
version ne modifie jamais le blob précédent. L’archivage est logique et conserve
l’historique. Le serveur contrôle la taille, la liste blanche MIME et les
métadonnées du stockage ; l’empreinte SHA-256 du stockage est conservée sous forme
hexadécimale canonique. Chaque dépôt et archivage exige un motif et une corrélation
idempotente, puis écrit une trace d’audit V2.

La classification (`public`, `interne`, `confidentiel`, `restreint`) est une
métadonnée de gouvernance. Tant qu’une politique d’habilitation documentaire
détaillée n’est pas validée, l’accès repose sur le droit du module et la portée de
site. La classification ne promet donc pas encore, à elle seule, un filtrage par
niveau d’habilitation.

Un circuit `approvalInstances` contient une suite ordonnée et immuable
d’`approvalSteps`. Le demandeur ne peut pas approuver sa propre demande. Une étape
ne peut être décidée que par son approbateur désigné et dans l’ordre ; un rejet
termine le circuit, tout comme l’approbation de la dernière étape. L’annulation est
réservée au demandeur ou à un administrateur. Les décisions, rejets et annulations
sont corrélés, idempotents et audités. Le demandeur reçoit une notification interne
à l’état terminal.

Le moteur ne modifie pas automatiquement l’entité métier approuvée. Le module
appelant reste responsable de la transition métier éventuelle dans une mutation
explicitement conçue pour son invariant.

## Conséquences

- Les modules partagent la même version documentaire, la même séparation des
  tâches et la même traçabilité.
- La portée par site est appliquée aussi lors d’un accès direct par identifiant.
- Un fichier archivé demeure récupérable et doit être couvert par la politique de
  rétention ; aucune suppression physique n’est fournie par ce socle.
- Les circuits sont séquentiels. Quorum, étapes parallèles, suppléance et délégation
  nécessiteront une extension explicite.
- Les règles d’approbation propres au Fret restent hors du socle jusqu’à validation
  des propriétaires métier SETRAG.

## Prérequis avant activation

- définir la rétention, les classifications et les types MIME acceptés avec la SSI ;
- valider les approbateurs, délégations et délais d’escalade de chaque workflow ;
- réaliser un contrôle antivirus hors transaction avant de rendre une pièce
  exploitable ;
- déployer le schéma et les fonctions avant de brancher une interface cliente ;
- décider, module par module, quelle transition métier suit une approbation.
