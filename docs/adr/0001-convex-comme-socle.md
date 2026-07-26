# ADR-0001 — Convex comme socle applicatif

**Statut :** accepté
**Date :** 2026-07-26
**Portée :** `packages/backend`

## Contexte

Le système vend des places sur un train à capacité fixe, depuis quatre canaux
simultanés — guichet, agence accréditée, web voyageur, contrôleur à bord. La
propriété centrale à garantir est l'absence de survente : deux ventes
concurrentes sur le même siège et le même segment ne doivent jamais réussir
toutes les deux.

Contraintes du projet :

- déploiement en région **US** par défaut, décision du client — voir
  [ADR-0012](0012-tarification-conforme-au-cdc.md) sur le principe général ;
- équipe réduite, pas d'exploitant d'infrastructure dédié ;
- le contrôle à bord doit fonctionner **sans réseau** (couverture ferroviaire
  gabonaise discontinue), donc la synchronisation différée est un cas nominal,
  pas une dégradation.

## Décision

Le backend est bâti sur **Convex** : base de données, fonctions serveur,
planificateur, stockage de fichiers et authentification dans un même plan
transactionnel.

## Options considérées

### Option A — Convex

| Dimension | Évaluation |
|---|---|
| Complexité | Faible : un seul déploiement, pas d'ORM ni de migrations manuelles |
| Coût | Facturation à l'usage, sans plancher d'infrastructure |
| Concurrence | Contrôle optimiste (OCC) natif ; les mutations sont sérialisables |
| Familiarité équipe | Moyenne — modèle mental à acquérir (réactivité, rejeu) |

**Pour :** la transaction est le défaut, pas une option à activer. Le rejeu
automatique sur conflit règle la survente sans verrou explicite ni file
d'attente. Le temps réel est gratuit, ce dont l'écran d'occupation des trains
a directement besoin.

**Contre :** fournisseur unique, pas d'auto-hébergement en production. Les
mutations ont un budget d'exécution borné, ce qui interdit les traitements de
masse en une passe. L'écosystème est jeune : plusieurs composants sont en
alpha.

### Option B — PostgreSQL + API applicative (NestJS/Fastify)

| Dimension | Évaluation |
|---|---|
| Complexité | Élevée : ORM, migrations, pool, file de tâches, cache, temps réel |
| Coût | Plancher d'infrastructure permanent |
| Concurrence | `SELECT … FOR UPDATE` ou `SERIALIZABLE`, à écrire et à tester |
| Familiarité équipe | Élevée |

**Pour :** maîtrise totale, portabilité, hébergement souverain possible — un
argument non nul pour un opérateur public gabonais.

**Contre :** tout ce que Convex donne (temps réel, planificateur, stockage,
rejeu sur conflit) devient du code à écrire et à exploiter. Pour une équipe
réduite, c'est le poste de dépense qui étouffe le métier.

## Analyse

Le facteur décisif n'est pas la performance mais **où vit la garantie
d'intégrité**. Avec Postgres, l'absence de survente repose sur une discipline
d'écriture : chaque développeur doit penser au verrou. Avec Convex, elle
découle de la forme du code — si la lecture et l'écriture sont dans la même
mutation, le conflit est détecté et la transaction rejouée.

Le prix payé est réel : dépendance à un fournisseur, et un plafond
d'exécution par mutation qui impose de découper les traitements de masse
(génération des dessertes, reprise des signatures) en lots bornés.

## Conséquences

**Devient plus facile**
- La règle anti-survente se démontre au lieu de s'espérer — voir
  [ADR-0004](0004-vente-en-une-mutation.md).
- Les crons, le stockage des PDF et les notifications n'ajoutent aucune
  infrastructure.

**Devient plus difficile**
- Aucun traitement ne peut parcourir une table entière : tout lot est borné et
  reprenable.
- Les tests de concurrence réels exigent un backend Convex local en Docker —
  voir [ADR-0010](0010-strategie-de-test-a-deux-etages.md).

**À revoir**
- Si SETRAG exige un hébergement souverain, la couche `convex/model/` est
  portable telle quelle ; ce sont les fonctions qui seraient à réécrire. C'est
  précisément pourquoi [ADR-0002](0002-logique-metier-pure-isolee.md) existe.
