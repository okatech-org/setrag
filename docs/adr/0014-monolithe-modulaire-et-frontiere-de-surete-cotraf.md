# ADR-0014 — Monolithe modulaire et frontière de sûreté COTRAF

**Statut :** accepté sous réserve des décisions SETRAG ci-dessous
**Date :** 2026-09-10
**Portée :** monorepo, modules métier Convex, back-office SETRAG

## Contexte

Le back-office doit étendre un socle Convex et un monorepo déjà exploitables sans
transformer simultanément chaque façade ERP en produit autonome. Les domaines Fret,
COTRAF, GMAO, Infrastructures, Finances, RH, GED/Workflow et Sécurité ont des
règles et des rythmes différents, mais l'équipe du pilote ne justifie ni des
déploiements indépendants ni la charge d'exploitation de microservices.

Le premier écart fonctionnel bloquant est le Fret. La valeur attendue se mesure sur
un flux complet — du programme d'expédition à la facture et à son déversement
comptable — et non au nombre de rubriques visibles. Des capacités documentaires sont
nécessaires à ce flux, mais une suite collaborative ou un Copilot généraliste ne le
sont pas.

COTRAF touche à l'exploitation ferroviaire. Assimiler une interface de pilotage à
un système de sécurité, ou lui permettre d'agir sur les installations sans cadre
formel, créerait un risque que le logiciel du pilote n'est ni conçu ni homologué
pour porter. La même distinction de responsabilité existe en comptabilité : le
back-office peut préparer et transmettre des écritures, mais SAGE X3 demeure le
système légal maître pendant le pilote.

## Décision

Le pilote reste dans le **monorepo existant et sur Convex**, organisé comme un
**monolithe modulaire**.

Chaque domaine :

- possède ses tables et sa logique métier ;
- n'écrit jamais directement dans les tables d'un autre domaine ;
- expose les lectures et commandes inter-domaines par une API publique ;
- publie ou consomme, pour les traitements découplés, des événements versionnés,
  idempotents et observables.

Cette propriété est une frontière de code et de responsabilité, pas une promesse de
déploiements séparés. Elle doit être rendue visible par l'arborescence, les API
exportées, les revues et les tests. La logique pure reste isolée selon
[ADR-0002](0002-logique-metier-pure-isolee.md), et les autorisations sont appliquées
côté serveur selon [ADR-0005](0005-matrice-de-droits-declarative.md).

Le **noyau transverse** est limité à l'identité, aux organisations, sites,
affectations et habilitations ; aux référentiels et identifiants communs ; à l'audit,
l'horodatage et la corrélation ; aux pièces jointes, approbations et notifications ;
à l'outbox, au rejeu, à la file de rejet et à leur supervision ; aux feature flags
et aux conventions d'idempotence et de conflit hors ligne. Il ne contient aucune
règle de calcul propre au Fret, à COTRAF, à la GMAO, aux Finances ou aux RH.

Le **Fret est la première verticale de valeur**. Le pilote construit un flux borné
de bout en bout avant d'ouvrir les autres domaines. Le réemploi documentaire est
limité aux besoins de ce flux, notamment la lettre de voiture ferroviaire, les pièces
de pesée et les approbations. Une suite collaborative complète, la visioconférence et
un Copilot généraliste sont exclus du MVP.

**COTRAF V1 est strictement un outil de supervision, de journalisation et d'aide à
la décision.** Il n'émet aucune commande de signal ou d'aiguillage et aucun ordre
autonome. Il ne comporte pas de connecteur capable de contourner cette frontière.
Toute proposition reste consultative, attribuable et soumise à une décision humaine
dans le processus et le système ferroviaire maître désignés par SETRAG. Une extension
prescriptive est interdite tant que le périmètre de sûreté, les autorités, les modes
dégradés, le processus d'homologation et le système maître ne sont pas formalisés.

**SAGE X3 reste le système comptable légal maître.** Le back-office produit des
pièces et des écritures proposées, rapprochables, puis les émet par l'outbox. Il ne
considère une transmission acquittée qu'après retour explicite du processus
d'intégration, conformément à
[ADR-0013](0013-comptabilite-en-outbox.md). Un remplacement de SAGE ferait l'objet
d'une décision distincte.

## Options considérées

### Option A — Monolithe modulaire livré par verticale (retenue)

**Pour :** conserve les transactions et l'exploitation unifiées de Convex, permet
de livrer un flux Fret mesurable, et pose des frontières extractibles sans payer leur
distribution dès le pilote.

**Contre :** l'isolation repose d'abord sur la structure, les API et les tests ; une
dépendance interdite n'est pas bloquée par le réseau. Un noyau transverse mal tenu
peut redevenir un domaine métier implicite.

### Option B — Écrans indépendants sur une base commune

**Pour :** donne rapidement l'impression que tous les modules existent.

**Contre :** duplique les habilitations, workflows et intégrations, encourage les
écritures directes dans des tables partagées et ne prouve aucun flux de bout en bout.
Cette option est rejetée.

### Option C — Microservices par domaine dès le pilote

**Pour :** frontières d'exécution fortes et déploiements indépendants.

**Contre :** contrats réseau, observabilité distribuée, cohérence éventuelle,
gestion des pannes partielles et exploitation multi-services avant que les domaines
soient stabilisés. Cette option est rejetée comme prématurée, pas interdite à terme.

### Option D — COTRAF prescriptif ou connecté aux organes de commande

**Pour :** boucle d'exploitation plus intégrée et automatisation accrue.

**Contre :** attribue au pilote une fonction de sécurité sans périmètre de sûreté,
système maître, analyse de risques, modes dégradés ou homologation formalisés. Cette
option est rejetée pour COTRAF V1.

## Analyse

Le monolithe modulaire sépare deux questions souvent confondues : un domaine peut
être autonome dans son modèle et ses contrats sans être déployé séparément. Cette
autonomie logique permet d'apprendre sur le Fret avant de figer des contrats réseau.
Si un domaine exige plus tard un cycle, une charge ou une certification distincts,
ses API et événements fournissent un point d'extraction.

La frontière COTRAF est plus forte qu'une permission d'interface : aucune mutation,
action ou intégration du V1 ne doit rendre une recommandation exécutoire. Elle réduit
la portée du pilote ; elle ne constitue ni une homologation ferroviaire ni une preuve
que Convex convient à un futur système de sécurité.

Les affirmations sur un pilote minéralier, un itinéraire, des volumes, des règles de
priorité, des taux ou des contrats partenaires restent des hypothèses de cadrage tant
qu'elles ne sont pas appuyées par une source officielle datée et approuvée. Elles ne
sont pas incorporées à cette décision d'architecture.

## Conséquences

**Devient plus facile**

- Livrer, autoriser et mesurer une verticale Fret réelle avant les domaines suivants.
- Auditer la propriété des données et les dépendances entre domaines.
- Réutiliser l'outbox et les garanties transactionnelles du socle Convex retenu par
  [ADR-0001](0001-convex-comme-socle.md).
- Extraire ultérieurement un domaine sur la base de contrats déjà explicites.
- Démontrer que COTRAF V1 ne porte pas d'autorité de commande.

**Devient plus difficile**

- Maintenir un noyau transverse minimal et refuser les raccourcis inter-domaines.
- Versionner les événements, garantir leur idempotence et superviser les rejets.
- Montrer dans les tests l'autorisation serveur, la désactivation des modules et les
  frontières de domaine, en complément de
  [ADR-0010](0010-strategie-de-test-a-deux-etages.md).
- Faire progresser COTRAF sans transformer progressivement une aide en commande
  implicite.

**Risques à surveiller**

- croissance d'un noyau partagé qui absorberait les règles des domaines ;
- couplage par lecture directe de tables ou par événements non versionnés ;
- présentation d'une recommandation COTRAF comme un ordre opérationnel ;
- confusion entre écriture proposée dans le back-office et écriture légale dans
  SAGE X3 ;
- extension de la GED ou de l'IA avant la preuve du flux Fret.

## Décisions SETRAG encore requises

Cette ADR fixe les garde-fous du pilote ; elle ne tranche pas les choix relevant de
SETRAG. Avant d'engager les fonctions correspondantes, SETRAG doit encore valider :

- le flux, le client, le site et les données officielles du MVP Fret ;
- le système maître de chaque référentiel et les contrats d'intégration partenaires ;
- le statut effectif de SAGE X3, le format et le mode d'échange réels, avec un test
  d'acquittement sur l'environnement cible ;
- les exigences d'hébergement, de localisation, de réversibilité et de reprise qui
  confirment ou remettent en cause Convex pour la suite ;
- la limite d'autorité de COTRAF, le système ferroviaire maître et le processus
  d'homologation applicable ;
- les sources officielles et propriétaires des règles comptables, fiscales,
  sociales et ferroviaires ;
- les objectifs de disponibilité, de reprise et de fonctionnement hors ligne par
  service.

Jusqu'à leur validation, toute valeur, règle ou cible issue d'une étude ou d'une
hypothèse externe demeure réversible et ne doit pas être codée comme une vérité
métier.

## Critères de réexamen

La décision sera réexaminée si :

- un domaine a besoin d'un déploiement, d'une charge, d'une isolation réglementaire
  ou d'un cycle de livraison incompatibles avec le monolithe ;
- les tests et revues ne suffisent plus à empêcher les dépendances inter-domaines ;
- les exigences SETRAG d'hébergement ou de souveraineté invalident le socle Convex ;
- SETRAG formalise pour COTRAF un périmètre de sûreté, un système maître, une
  autorité opérationnelle, des modes dégradés et un parcours d'homologation ;
- SETRAG décide de remplacer SAGE X3 comme livre comptable légal ;
- le pilote Fret démontre que les besoins documentaires ou d'assistance dépassent
  les limites fixées au MVP.

Toute levée de la frontière COTRAF ou tout remplacement du système comptable maître
exige un nouvel ADR ; ils ne peuvent pas être traités comme une simple extension de
fonctionnalité.
