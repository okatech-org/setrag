# ADR-0015 — Outbox plateforme versionnée et scellement de l’audit

**Statut :** accepté sous réserve des prérequis d’exploitation
**Date :** 2026-09-10
**Portée :** noyau plateforme Convex, intégrations inter-domaines, audit V2

## Contexte

L’outbox historique `outboxEvents` couvre déjà les exports SAGE V65, les états
ColiRail et certaines notifications. Son contrat fermé et ses trois états répondent
à ces flux, mais ne portent ni version d’événement, ni clé d’idempotence commune, ni
corrélation, acquittement externe ou file de rejet explicite. L’étendre directement
aurait obligé à migrer plusieurs parcours billettiques déjà testés alors que le
premier flux Fret n’est pas encore validé par SETRAG.

Le journal `auditLogs` indique qui a fait quoi et quand. Pour les futurs workflows
inter-domaines, il doit aussi conserver le droit exercé, le motif, le résultat, la
portée d’affectation et les liens de corrélation. Une détection d’altération est
nécessaire, sans pour autant présenter la base applicative comme un stockage WORM.

## Décision

Une outbox transverse additive est introduite avec trois tables :
`integrationEndpoints`, `integrationEvents` et `integrationReceipts`.

Chaque événement comporte obligatoirement :

- un type et une version entière positive ;
- une clé d’idempotence unique par destination ;
- l’entité source et un payload JSON ;
- un identifiant de corrélation et, si applicable, de causalité ;
- un nombre maximal de tentatives figé lors de sa création.

Sa machine d’état est :

```text
en_attente → en_cours → envoye
     ↑           │
     └───────────┤ erreur rejouable, avec backoff borné
                 └→ rejete

rejete ── rejeu manuel autorisé et audité ──→ en_attente
```

La mutation métier et `enqueueIntegrationEvent()` partagent la même transaction.
Aucun appel partenaire ne se déroule dans cette mutation. Une action ou un worker
réserve ensuite atomiquement un événement, réalise l’appel hors transaction, puis
enregistre soit l’acquittement, soit l’échec normalisé. La livraison est donc « au
moins une fois » ; le partenaire doit dédupliquer avec la clé d’idempotence.

Un acquittement répété avec la même clé est idempotent. Une autre clé pour un
événement déjà acquitté est une incohérence et doit échouer bruyamment. Le rejeu
manuel est réservé au droit `integrations/modifier`, exige un motif et une nouvelle
corrélation, et conserve l’ancienne corrélation comme causalité.

L’outbox historique reste en place jusqu’à migration explicite de chaque producteur.
Cette coexistence évite une bascule simultanée de la billettique et permet de
qualifier le nouveau contrat sur le flux Fret.

`auditLogs` évolue de façon additive. Les nouveaux champs V2 sont optionnels pour
relire les traces historiques ; `audit()` écrit désormais `result = succes` par
défaut. Les fenêtres closes du journal peuvent être résumées par SHA-256 dans
`auditSeals`. Chaque scellement référence le précédent et un rejeu de la même
fenêtre est idempotent.

Ce scellement est un mécanisme de détection et de rapprochement. Il ne devient une
preuve externe qu’après export régulier du sceau vers un stockage immuable séparé.

## Conséquences

**Devient plus facile**

- publier un événement dans la même transaction que le changement métier ;
- diagnostiquer l’âge, les tentatives, les rejets et les acquittements ;
- rejouer sans créer un second événement métier ;
- suivre une opération entre commande, intégration et audit avec la corrélation ;
- vérifier périodiquement qu’un lot d’audit n’a pas été modifié.

**Devient plus difficile**

- exploiter temporairement deux outbox pendant la migration ;
- fournir un worker et un adaptateur par partenaire ;
- imposer la déduplication côté récepteur ;
- exporter et conserver les sceaux hors de Convex.

## Prérequis avant activation en environnement partagé

- déployer le schéma et les fonctions backend avant d’activer
  `NEXT_PUBLIC_PLATFORM_MODULES_API=1` dans le back-office ;
- configurer les destinations sans secret en base et conserver les secrets dans le
  gestionnaire d’environnement ;
- brancher un ordonnanceur et des actions d’envoi bornées ;
- fixer avec SETRAG les seuils d’alerte, la rétention et la procédure de rejeu ;
- valider sur chaque partenaire la clé d’idempotence et le format d’acquittement ;
- définir le stockage WORM/SIEM externe des sceaux et sa preuve de dépôt.

## Critères de réexamen

La coexistence avec `outboxEvents` sera réexaminée après migration des producteurs
SAGE, ColiRail et notifications. Le format d’un événement change par nouvelle
version, jamais par modification silencieuse. Une garantie « exactement une fois »
ou une valeur probatoire réglementaire exigerait une décision distincte et des
preuves fournies par les systèmes externes.
