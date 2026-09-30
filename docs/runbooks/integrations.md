# Runbook — supervision des intégrations

Ce runbook couvre l’outbox plateforme `integrationEvents`. Les exports historiques
de la billettique restent suivis dans `outboxEvents` pendant leur migration.

## Vérification courante

Depuis **Gestion → Intégrations**, contrôler :

1. le nombre d’événements en attente, en cours, envoyés et rejetés ;
2. l’âge du plus ancien événement en attente ;
3. les événements arrivés à échéance ;
4. la dernière erreur normalisée par destination ;
5. l’état actif de la destination concernée.

Le bandeau de l’outbox plateforme n’est chargé que lorsque le backend compatible est
déployé et que `NEXT_PUBLIC_PLATFORM_MODULES_API=1` est activé. Sans ce drapeau,
l’écran de supervision historique continue de fonctionner.

## Événement en attente trop ancien

- Vérifier que la destination est active.
- Vérifier qu’un worker réserve effectivement les événements arrivés à échéance.
- Contrôler les journaux de l’adaptateur hors de la mutation métier.
- Ne pas modifier directement l’état ou le nombre de tentatives en base.

## Événement bloqué en cours

Un événement doit être terminé par un acquittement ou par l’enregistrement d’un
échec. Avant toute reprise, confirmer que l’appel partenaire n’a pas abouti. Utiliser
la clé d’idempotence auprès du partenaire pour éviter un doublon. Une procédure de
récupération automatique des réservations expirées devra être définie avec le délai
d’exploitation de chaque connecteur.

## Événement rejeté

- Corriger d’abord la destination, le contrat ou la donnée en cause.
- Utiliser l’action **Rejouer** avec le droit `integrations/modifier`.
- Conserver un motif opérationnel précis ; une nouvelle corrélation est créée et
  l’ancienne devient la causalité du rejeu.
- Vérifier ensuite que l’événement retourne en attente puis reçoit un acquittement.

Un rejeu ne doit jamais être utilisé pour masquer une erreur fonctionnelle ou pour
contourner une séparation des tâches.

## Acquittement incohérent

Un second acquittement portant la même clé est un doublon sûr. Une clé différente
pour le même événement est rejetée : comparer les reçus du partenaire avant toute
correction. Ne pas fabriquer un acquittement lorsque la réponse distante est
inconnue.

## Scellement du journal d’audit

Un scellement de la journée UTC précédente est lancé automatiquement chaque jour à
00:30 UTC. Le rejeu de la même fenêtre est idempotent.

Les fenêtres doivent être closes, chronologiques, d’au plus 31 jours et 10 000
traces. Vérifier la continuité de `previousSealHash` puis exporter le sceau vers le
stockage immuable retenu. Le sceau conservé uniquement dans Convex détecte des écarts
mais ne constitue pas à lui seul une archive WORM.
