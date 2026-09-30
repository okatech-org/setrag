# ADR-0017 — Objectifs PCA/PRA et preuves d’exercice

**Statut :** accepté sous réserve d’intégration au schéma et d’exercices SETRAG
**Date :** 2026-09-10
**Portée :** registre de continuité, objectifs RPO/RTO, autonomie hors ligne et secours papier

## Contexte

Le Document 06 fixe notamment un RPO inférieur à une seconde, un RTO inférieur à
15 minutes, 72 heures d’autonomie locale, un réplica miroir à Owendo et un secours
papier avec saisie de rattrapage. Ces valeurs sont des objectifs de conception. Ni
leur présence dans un document ni leur enregistrement dans une base ne démontre
qu’elles sont atteintes.

Le dépôt actuel utilise Convex cloud et comporte un mode hors ligne pour le contrôle
à bord. Ces éléments ne prouvent pas un réplica miroir opérationnel à Owendo, une
bascule télécom ou applicative, un RPO inférieur à une seconde, un RTO inférieur à
15 minutes, ni 72 heures de fonctionnement autonome dans chaque gare. Le mode hors
ligne du contrôleur ne couvre pas à lui seul la vente, le fret, les carnets papier et
leur saisie de rattrapage.

Le Document 05 exige une information comptable auditable et une conformité
juridico-fiscale. Le présent lot fournit des preuves et une séparation des tâches ;
il ne crée aucune règle ni aucun taux fiscal.

## Décision

Créer un registre PCA/PRA transverse composé de deux familles de données :

- `continuityPolicies` conserve des versions immuables d’objectifs par code et
  portée, avec RPO en secondes, RTO en minutes, autonomie hors ligne en heures,
  limites déclarées et états `brouillon`, `approuve`, `retire` ;
- `continuityExercises` conserve les fenêtres, mesures, résultats, constats et
  références probantes des exercices de restauration, bascule, hors ligne et
  papier. Un résultat et la validation de sa preuve restent deux informations
  distinctes.

Une nouvelle version ne remplace pas physiquement la précédente. Son approbation
retire l’ancienne version approuvée du même code. Le créateur ne peut valider ni sa
politique ni sa preuve d’exercice. Les créations, validations, rejets et retraits
sont corrélés, idempotents et audités.

Le registre relève du module `securite`, plutôt que du module `infrastructure`, car
la continuité couvre toutes les activités, la gouvernance des risques, les preuves
et l’audit — pas seulement les actifs techniques. La matrice actuelle accordant
l’écriture de module par `creer`/`modifier`, la validation exige `securite/modifier`
et journalise l’intention `valider`, en plus de la séparation d’identité. Lorsque
la matrice exposera un droit `securite/valider`, la garde devra être resserrée sans
migration des données.

Le calcul de préparation est fermé par défaut. Une politique n’est prête que si :

1. sa version est approuvée ;
2. un exercice réussi, approuvé et référencé de restauration ou de bascule porte
   les deux mesures observées et respecte les objectifs RPO et RTO ;
3. un exercice hors ligne réussi, approuvé et référencé couvre au moins la durée
   d’autonomie cible ;
4. un exercice papier réussi, approuvé et référencé démontre la procédure et la
   saisie de rattrapage.

Une affirmation, une preuve non validée, un exercice sans mesure, une preuve vide,
un échec ou un exercice antérieur à la version de politique ne compte jamais.
Les objectifs et mesures sont des entiers sûrs dans leurs unités déclarées : RPO
non négatif, RTO et autonomie strictement positifs. Ainsi, un objectif strictement
inférieur à une seconde se représente par zéro seconde entière ; une précision
subseconde exigerait une évolution explicite de l’unité et du protocole de mesure.

## Conséquences

- Le tableau de synthèse peut distinguer objectif approuvé et objectif réellement
  prouvé, sans fabriquer un niveau de disponibilité.
- Une mesure satisfaisante ne vaut que pour la version de politique liée.
- Les requêtes bornent à 25 politiques et 50 exercices par politique et signalent
  explicitement une fenêtre tronquée.
- Les références de preuve désignent les rapports, journaux, exports ou pièces GED ;
  leur conservation et leur contrôle d’intégrité restent à organiser avec la SSI.
- Les montants, taxes, barèmes et taux du Document 05 restent hors de ce module.

## État de preuve au moment de la décision

Le dépôt ne prouve **pas** :

- l’existence ni la réplication opérationnelle d’un miroir à Owendo ;
- un RPO inférieur à une seconde ;
- un RTO inférieur à 15 minutes ;
- 72 heures d’autonomie de vente et d’exploitation dans chaque gare ;
- une procédure papier et une saisie de rattrapage testées de bout en bout ;
- une bascule automatique fibre vers satellite.

Convex cloud et le fonctionnement hors ligne du contrôleur sont des composants
utiles, mais insuffisants pour conclure à la conformité PCA/PRA.

## Prérequis avant activation

- régénérer les types Convex et déployer le schéma central qui compose
  `continuityTables` ;
- définir les propriétaires, validateurs et périodicités avec la DSI, la SSI et les
  directions métier ;
- rattacher les références de preuve à la GED avec une rétention validée ;
- exécuter les scénarios du runbook sur des environnements représentatifs ;
- faire approuver les objectifs et critères de succès par la SETRAG ;
- n’afficher aucun badge « prêt » tant que les quatre contrôles probants ne sont pas
  satisfaits.
