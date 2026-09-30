# Espace Direction générale

Route `/direction`, réservée au rôle `direction_generale`. Elle donne à la
gouvernance une lecture consolidée du réseau sans dupliquer les écrans
métier du back-office ni leur ajouter de nouvelles ressources Convex.

## Ce que c’est, ce que ce n’est pas

- **Lecture seule, réseau entier.** Les cinq volets ne portent aucune action
  métier — pas de création, de validation ni d’export. Modifier une donnée
  reste le rôle de `/gestion` et des modules dédiés (`/fret`, `/cotraf`,
  `/finances`, `/securite`…).
- **Une synthèse, pas un nouveau module.** `EXECUTIVE_PATH`
  (`apps/agent-web/src/lib/portal-access.ts`) le dit dans son commentaire :
  « des rubriques de lecture consolidée, pas un module ». Chaque donnée
  reste gardée par les ressources module et `rapports/consulter`
  existantes ; aucune ressource protégée n’a été créée pour cet espace.

## Route et volets

Les cinq volets suivent les questions d’un dirigeant, pas le catalogue des
modules (`apps/agent-web/src/components/direction/executive-navigation.ts`) :

| Code  | Route                  | Volet                    | Question                                                             |
| ----- | ---------------------- | ------------------------ | -------------------------------------------------------------------- |
| DG-01 | `/direction`           | Vue d’ensemble           | Où en est le réseau aujourd’hui, et qu’attend une décision ?         |
| DG-02 | `/direction/activites` | Activité et exploitation | Que produit l’entreprise, que fait-elle circuler ?                   |
| DG-03 | `/direction/finances`  | Finances                 | Que rapporte-t-elle, où en est la conformité ?                       |
| DG-04 | `/direction/risques`   | Risques et continuité    | Qu’est-ce qui menace la continuité et la concession ?                |
| DG-05 | `/direction/decisions` | Décisions attendues      | Quels signaux, demandes et raccordements attendent une orientation ? |

## Habilitation

`EXECUTIVE_ROLES` (`apps/agent-web/src/lib/portal-access.ts`) ne contient que
`direction_generale`. `canAccessManagementPath` traite `/direction` à part :
l’accès n’y est autorisé que si le rôle figure dans `EXECUTIVE_ROLES`,
indépendamment des droits sur les ressources protégées. Les gardes serveur
existantes — matrice `packages/backend/convex/model/permissions.ts`, contrôle
propre à chaque fonction Convex interrogée — ne changent pas pour autant :
chaque source lue par le cockpit reste soumise à son contrôle d’accès
habituel, comme depuis son écran d’origine.

## Chrome partagé

`ExecutiveShell` (`executive-shell.tsx`) réutilise `EnterpriseShell` :

- les cinq rubriques de l’espace sont rendues dans la barre latérale
  **avant** « Mes modules » (commentaire du composant : « Rubriques d’un
  espace transverse, rendues dans la barre latérale avant "Mes modules" »,
  `enterprise-layout.tsx`) ;
- chaque sous-volet affiche un lien de retour « Vue d’ensemble » au-dessus
  du titre (`eyebrow`), sauf la vue d’ensemble elle-même ;
- en pied de volet, une navigation « Volets voisins » propose le précédent
  et le suivant dans l’ordre de lecture (`adjacentVolets`) ;
- le bloc compte affiche le périmètre `Réseau entier · Owendo–Franceville`
  (`EXECUTIVE_SCOPE_LABEL`).

## Période de lecture

Un sélecteur `?periode=` accepte quatre préréglages (`executive-period.ts`) :
`30j` (défaut), `mois`, `trimestre`, `annee`. Il s’applique aux sources
datées : voyageurs (chiffre d’affaires, billets, remplissage agrégé et par
desserte), incidents et procès-verbaux. Les autres domaines — Fret, COTRAF,
Finance, Continuité, santé système — sont des instantanés horodatés
(`freshnessAt`, `generatedAt`, `checkedAt`) qui ignorent ce réglage. La
période par défaut ne s’écrit pas dans l’URL (`periodHref`).

## Sources et hook `useExecutiveCockpit`

Tout passe par un unique hook,
`apps/agent-web/src/components/direction/use-executive-cockpit.ts`, qui
assemble le DTO `ExecutiveOverviewDto` :

| Domaine                     | Requête Convex                                                            | Gardé par                                                 |
| --------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| Voyageurs                   | `reporting.dashboard`, `dailySeries`, `byProduct/byChannel/byPointOfSale` | module `voyageurs`                                        |
| Santé système               | `monitoring.health`                                                       | module `voyageurs` (même bascule)                         |
| Fret                        | `modules.fret.queries.dashboard`                                          | module `fret`                                             |
| COTRAF                      | `modules.cotraf.queries.dashboard`                                        | module `cotraf`                                           |
| Finance                     | `modules.finance.queries.getFinanceOverview`                              | module `finance`                                          |
| Continuité                  | `modules.continuity.queries.getContinuitySummary`                         | module `securite` (pas de module `continuity` séparé)     |
| Remplissage par desserte    | `functions.reporting.occupancy` (200 lignes au plus)                      | ressource `places`, lue seulement si la matrice l’accorde |
| Incidents et procès-verbaux | `functions.control.networkSummary` (synthèse agrégée)                     | module `securite` et portée globale                       |
| Dessertes du jour           | `functions.trips.listByDate`                                              | source publique, toujours interrogée                      |
| Gares                       | `functions.referential.listStations`                                      | source publique, toujours interrogée                      |

Un domaine gardé n’est interrogé que si `hasVisibleModule(code)` est vrai,
via `useModuleNavigationAccesses(role)` : ce hook croise la matrice de
droits **et** l’activation du module par l’administration déléguée — un
module autorisé mais désactivé reste invisible ici comme ailleurs.
Dessertes et référentiel des gares y échappent : ce sont des sources
publiques, toujours lues.

**Mode E2E** (`NEXT_PUBLIC_E2E_MODE=1`) : aucune requête n’est faite, y
compris les publiques ; le hook renvoie `emptyExecutiveOverview`, un DTO où
rien n’est inventé (états `empty` ou `unavailable` selon le champ).

## Provenance — six états

Chaque section du cockpit porte l’un des six `ExecutiveSourceState`
(`executive-dto.ts`, `provenance.tsx`) :

| État             | Libellé affiché            |
| ---------------- | -------------------------- |
| `loading`        | Chargement                 |
| `operational`    | Opérationnel               |
| `synthetic_demo` | Synthétique · non officiel |
| `empty`          | Aucune donnée              |
| `unavailable`    | Non accessible             |
| `not_connected`  | Non raccordé               |

Rendu par `ProvenanceTag`, toujours avec le libellé — jamais la couleur
seule. Une valeur `synthetic_demo` n’est jamais agrégée à une valeur
`operational` : `deriveExecutiveArbitrations` rétrograde systématiquement un
signal synthétique en signal neutre.

## « La ligne »

Le volet Vue d’ensemble trace le Transgabonais en HTML/SVG maison
(`line-synoptic.tsx`) : les gares viennent de `referential.listStations`
(source publique), positionnées à leur point kilométrique réel ; le COTRAF
n’ajoute que ce qu’il a lui-même enregistré par-dessus (circulations,
conflits de croisement, cantons contraints). Rail horizontal à partir de
`md:`, liste verticale en dessous sur téléphone — les deux lisent le même
modèle — et une table repliée porte les mêmes données en alternative
accessible.

Avertissement affiché à l’écran : les points kilométriques viennent du
schéma de ligne public du Transgabonais, pas d’un tableau officiel SETRAG.
SETRAG communique 648 km quand ce schéma en totalise 669 (écart de 21 km,
~3 % du prix d’un trajet complet) ; le référentiel retient 669 km faute de
mieux, et le signale explicitement
(`packages/backend/convex/seeds/referential.ts`). Convention à homologuer
auprès de SETRAG avant tout usage tarifaire.

## Ce que la Direction générale lit, et ce qu’elle ne lit pas

Décision : [ADR-0019](adr/0019-direction-generale-syntheses-agregees.md).
`direction_generale` lit les dix ressources module, `rapports` et `places`
(`packages/backend/convex/model/permissions.ts`), sans aucune écriture.

- **Remplissage par desserte** : lu via `reporting.occupancy` (ressource
  `places`). Données non nominatives, affichées dans « Activité et
  exploitation ».
- **Incidents et procès-verbaux** : lus en synthèse agrégée et anonyme via
  `control.networkSummary` (effectifs, gravité, statuts, motifs, montants).
  Les registres nominatifs (`listIncidents`, `listPenalties`, ressources
  `incidents` et `proces_verbaux`) restent fermés : identités, descriptions et
  photos ne sortent pas des fonctions de contrôle et de sécurité.

Restent hors de portée, état « Non accessible » là où une provenance s’applique :

- écarts de caisse (`reporting.cashVariances`, ressource `caisse`) ;
- comptabilité voyageurs (`accounting.*`, ressource `journal_comptable`) ;
- supervision des intégrations (`integrationHealth`, ressource
  `integrations`) ;
- utilisateurs et paramétrage (`management.listUsers`/`getSettings`) ;
- scellés du journal d’audit, réservés aux administrateurs.

## Ce qui n’existe pas encore

Aucun champ du DTO ne les porte, faute de module ou de table Convex :
Ressources humaines, GMAO (Matériel), Infrastructures/PRN, budget,
trésorerie et créances, registre de sécurité ARTF, contrats et clients
Fret, historique de ponctualité, chiffre d’affaires groupe consolidé
(voyageurs + fret + autres activités). `rh`, `gmao` et `infrastructure`
figurent dans `MODULE_MANIFEST` comme modules déclarés, mais aucun
répertoire `packages/backend/convex/modules/{rh,gmao,infrastructure}`
n’existe encore.

## Recette

Le dossier de recette destiné à la Direction générale est servi dans
l’application (volet « Décisions attendues » et centre « Audit & documents ») :
`apps/agent-web/documents/RECETTE_ESPACE_DIRECTION_GENERALE.md` et sa version
PDF. Il liste les décisions déjà prises, les scénarios par volet, les questions
d’orientation à trancher et la grille de visa. Toute modification de la source
Markdown impose de régénérer le PDF.

## Suites à donner

- Dérouler la recette avec la Direction générale et reporter ses réponses aux
  questions d’orientation (chiffres de tête, cibles, priorités de
  raccordement, diffusion, période par défaut, convention kilométrique).
- Ajouter un marqueur de provenance à `dailyMetrics` et `tripMetrics` :
  l’historique voyageurs généré s’affiche aujourd’hui « Opérationnel ».
- `.tabular` est déclarée en couche `base` alors que l’échelle
  typographique vit en couche `utilities` : à migrer vers une déclaration
  `@utility`.
- Voir tous les modules déclarés, y compris ceux pas encore activés par
  défaut, exige `NEXT_PUBLIC_PLATFORM_MODULES_API=1` ; la configuration de
  lancement `agent-web-platform` (`.claude/launch.json`) le pose déjà.
