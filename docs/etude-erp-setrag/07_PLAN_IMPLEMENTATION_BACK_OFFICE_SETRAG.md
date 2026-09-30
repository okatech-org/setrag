# Document 07 — Plan d’implémentation exécutable du Back-Office SETRAG

**Projet :** SETRAG Enterprise Operating System  
**Portée :** transformation progressive de `agent-web` en back-office ferroviaire intégré  
**Statut :** plan directeur proposé — décisions métier et réglementaires à valider  
**Date :** septembre 2026  
**Horizon :** premier pilote en 14 à 18 semaines, programme complet par vagues

---

## 1. Décision directrice

Le back-office ne doit pas être construit comme dix écrans indépendants posés sur une
base commune. Il doit évoluer comme un **monolithe modulaire**, livré par flux métier
complets et vérifiables.

Le premier objectif n’est donc pas « ouvrir tous les modules », mais livrer :

1. un socle d’identité, d’habilitations, de référentiels, d’audit et d’intégration ;
2. une verticale **Fret minier de bout en bout**, du programme d’expédition jusqu’à
   la facture et au déversement SAGE ;
3. un pilote limité, mesuré et réversible avant généralisation.

Cette trajectoire diffère volontairement de la feuille de route initiale qui place la
GED et la messagerie en tête. Le Fret est le premier écart bloquant et le cœur
économique décrit par les études. La GED reste une capacité transverse importante,
mais elle doit d’abord servir les pièces du workflow Fret plutôt que devenir un produit
collaboratif complet avant que le premier flux industriel existe.

---

## 2. Sources examinées et hiérarchie de confiance

Le présent plan résulte de la lecture intégrale des documents 01 à 06, du Livre Blanc,
du plan d’implémentation historique d’`agent-web`, des ADR du backend, du schéma Convex,
de la matrice de permissions et des routes applicatives actuelles.

Ordre de confiance retenu :

1. code et tests présents dans le dépôt ;
2. ADR acceptées du projet ;
3. exigences explicites des études ;
4. hypothèses, chiffres et règles externes des études, à valider par SETRAG et ses
   conseils avant utilisation en production.

Les taux fiscaux et sociaux, l’actionnariat, les volumes, le nombre de gares, les
durées réglementaires, les règles de priorité ferroviaire et les exigences
d’archivage ne sont pas considérés comme des vérités juridiques ou contractuelles tant
qu’une source officielle datée et un propriétaire métier ne les ont pas approuvés.

---

## 3. État réel du produit au démarrage

### 3.1 Socle déjà exploitable

- Monorepo Bun/Turborepo, applications Next.js 16 et backend Convex 1.42.
- Billetterie voyageurs, ventes guichet, caisse, après-vente et administration
  voyageurs raccordées à des fonctions Convex réelles.
- Schéma billettique riche : 51 tables couvrant référentiels, inventaire, ventes,
  paiements, contrôle, comptabilité préparatoire, audit, notifications et assistants.
- Transactions anti-survente, titres signés et contrôle hors ligne déjà documentés et
  testés.
- 11 rôles, 22 ressources et cinq permissions élémentaires dans une matrice
  déclarative.
- Export comptable V65/SAGE fondé sur une outbox, avec aperçu, acquittement et rejeu.
- PWA de contrôle avec IndexedDB et synchronisation différée, réutilisable comme
  référence de conception — pas comme composant générique déjà prêt.
- Design system partagé et règles d’accessibilité établies.

### 3.2 Ce qui n’est aujourd’hui qu’une façade

Les routes `/fret`, `/cotraf`, `/materiel`, `/finances`, `/rh`, `/bureautique` et
`/copilot` existent, mais leurs tableaux, indicateurs et actions sont essentiellement
statiques. Elles n’appellent pas de fonctions métier Convex. La navigation supérieure
existe déjà ; elle ne constitue donc plus un lot à construire.

Les routes prévues `/infrastructures` et `/securite` sont absentes. Les rôles et
ressources actuels restent centrés sur la billettique. Un utilisateur ne porte qu’un
rôle global, sans affectation multiple, portée par direction, gare, atelier, ligne ou
partenaire.

La fonction `audit()` insère une trace en base, mais ne fournit actuellement ni chaîne
d’empreintes, ni scellement externe, ni stockage WORM. Elle ne satisfait donc pas, à
elle seule, l’« immutabilité cryptographique » annoncée dans l’étude d’architecture.

### 3.3 Dette à stabiliser avant extension

- Les nouveaux écrans et changements ERP sont encore non consolidés dans la branche
  de travail : ils doivent être isolés sur une branche dédiée avant le premier lot.
- Le SSO Entra ID/ERAMET n’est pas raccordé ; Better Auth local reste le mécanisme
  réel.
- Le format V65 n’a pas encore été confronté à une instance SAGE X3 réelle et aucun
  mécanisme n’alerte sur une outbox trop ancienne.
- Les paiements externes et plusieurs services de notification restent dépendants de
  contrats, secrets et environnements partenaires.
- Les référentiels officiels gares, PK, matériels, partenaires, comptes et tarifs ne
  sont pas encore fournis comme jeux de données approuvés.

---

## 4. Choix d’architecture

### 4.1 Monolithe modulaire, pas microservices prématurés

Le monorepo et Convex sont conservés pour le premier programme. Chaque nouveau domaine
est une tranche verticale autonome :

```text
packages/backend/convex/modules/<domaine>/
  tables.ts        schéma possédé par le domaine
  enums.ts         valeurs métier stables
  permissions.ts   ressources et actions du domaine
  model/            logique pure et testable
  queries.ts        lectures autorisées
  mutations.ts      commandes transactionnelles
  actions.ts        appels externes et traitements longs
  events.ts         événements publiés/consommés
  seeds/            données de démonstration séparées

apps/agent-web/src/components/modules/<domaine>/
  screens/          écrans routés
  components/       composants propres au domaine
  forms/            formulaires et validations
  hooks/            requêtes et commandes typées
```

Les modules ne modifient jamais directement les tables d’un autre domaine. Les échanges
passent par une API publique ou par des événements versionnés et idempotents.

### 4.2 Noyau transverse minimal

Le noyau partagé couvre uniquement :

- identité, organisations, sites, affectations et habilitations ;
- référentiels communs et identifiants uniques ;
- audit, horodatage, corrélation et journal technique ;
- pièces jointes, workflow d’approbation et notifications ;
- outbox d’intégration, rejeu, file de rejet et supervision ;
- feature flags par module et par site ;
- conventions offline : identifiant client, version, idempotence et conflits.

Il ne contient aucune règle de calcul Fret, GMAO, Finance, RH ou COTRAF.

### 4.3 Frontières des domaines

| Domaine | Possède | Consomme ou publie |
| --- | --- | --- |
| Voyageurs | ventes, billets, caisses, inventaire voyageurs | publie recettes et taxes |
| Fret | programmes, contrats, ordres, chargements, pesées, LVF, factures métier | référence matériels et circulations ; publie créances |
| COTRAF | sillons, circulations, cantons, ordres, main courante | consomme disponibilités, restrictions et habilitations |
| GMAO | actifs roulants, composants, visites, OT, stocks atelier | publie disponibilité et coûts |
| Infrastructures | voie, PK, ouvrages, défauts, travaux PRN | publie restrictions et immobilisations |
| Finances | journaux légaux, périodes, tiers, taxes, rapprochements | reçoit des écritures proposées idempotentes |
| RH | relation de travail, temps, paie, compétences | expose seulement affectation et aptitude nécessaires |
| GED/Workflow | documents, versions, visas, scellements, rétention | attache des pièces aux objets métier sans les posséder |
| Sécurité/ARTF | événements, enquêtes, preuves, actions correctives | référence COTRAF, GMAO, Infrastructure et RH |
| Copilot | index autorisé et propositions explicables | lecture contrôlée ; aucune décision critique autonome |

### 4.4 Décisions de sûreté et de conformité

- **COTRAF V1 est un outil de visualisation, journalisation et aide à la décision.**
  Il ne commande pas les signaux ou aiguillages et ne donne pas d’ordre autonome tant
  que le périmètre de sûreté, l’homologation et le système ferroviaire maître ne sont
  pas formellement définis.
- **SAGE X3 reste le système comptable légal maître** durant le premier programme.
  Le back-office produit des pièces et écritures rapprochables via l’outbox existante.
  Son remplacement éventuel fera l’objet d’une décision séparée.
- **Les règles fiscales et de paie sont effectives-datées et paramétrables.** Aucun
  taux, plafond, barème ou durée de repos n’est codé en dur sans version, date d’effet,
  source et approbation.
- **Les données médicales sont isolées.** Les opérations ne voient qu’un statut
  d’aptitude et sa date d’échéance ; elles n’accèdent jamais au dossier clinique.
- **L’IA reste en mode conseil.** Toute action financière, RH, matérielle ou de
  circulation exige une autorisation serveur et, si nécessaire, une validation humaine.

### 4.5 Réemploi OkaTech obligatoire

Avant de développer les briques transverses, réaliser un spike de portage des modules
existants :

- `iDocument`, moteur Tiptap et rendu HTML/PDF pour documents et gabarits ;
- `iCorrespondance` et `iArchive` pour courrier, filiation et conservation ;
- `iCom` pour canaux internes et accusés de lecture ;
- `LiveKit` pour une future visio, si l’infrastructure est retenue ;
- `iAsted` seulement après audit de sécurité et isolation stricte des données.

Le premier MVP ne comprend ni suite collaborative complète, ni visioconférence, ni
Copilot généraliste. Il réutilise seulement les fonctions documentaires nécessaires à
la LVF, aux pièces de pesée et aux approbations.

---

## 5. Programme de livraison

### Phase 0 — Cadrage vérifiable et décisions structurantes (semaines 1–2)

**Objectif :** transformer les études en spécifications acceptables.

Livrables :

- périmètre du pilote Fret : marchandise, client, origine, destination et équipe ;
- cartographie des systèmes maîtres et propriétaires de données ;
- glossaire et référentiels officiels initiaux ;
- cartographie des flux actuel/cible, y compris le mode papier ;
- matrice rôles × actions × portées × séparation des tâches ;
- contrats d’intégration disponibles ou simulés : COMILOG, pont-bascule, SAGE ;
- BIA et classification des services/données ;
- exigences non fonctionnelles mesurées : volumes, latence, disponibilité, rétention ;
- décision d’architecture COTRAF et note de sûreté ;
- validation juridique des règles utilisées dans le pilote ;
- backlog, critères d’acceptation et jeu de données de recette signés.

**Gate de sortie :** un Product Owner Fret et un approbateur SETRAG acceptent le
scénario de bout en bout et ses données de référence.

### Phase 1 — Fondation back-office (semaines 3–6)

**Objectif :** fournir un walking skeleton sécurisé.

Livrables :

- catalogue de modules et feature flags par environnement/site ;
- organisations, directions, sites, partenaires et affectations utilisateur ;
- évolution additive du RBAC vers RBAC + portées ABAC ;
- navigation et gardes serveur alimentées par le même manifeste ;
- enveloppe d’événement versionnée, corrélation et idempotence ;
- outbox supervisée avec âge, tentatives, rejet, acquittement et rejeu ;
- audit V2 avec motif, contexte, corrélation et stratégie de scellement ;
- pièces jointes et premier workflow approbation générique ;
- observabilité minimale, alertes, tableau de santé et runbooks ;
- squelette du module Fret et tests d’autorisation.

**Gate de sortie :** connexion → habilitation → module Fret → commande de démonstration
→ audit → notification, sans donnée statique dans le parcours.

### Phase 2 — MVP Fret minier « ordre à encaissement » (semaines 7–14)

**Périmètre provisoire recommandé :** flux minéralier Moanda–Owendo pour un client
pilote, à confirmer en Phase 0.

Parcours livré :

1. importer ou saisir un programme hebdomadaire ;
2. créer et approuver un ordre d’expédition ;
3. composer le convoi avec locomotives et wagons référencés ;
4. enregistrer les pesées et détecter les dépassements ;
5. générer et signer la lettre de voiture ferroviaire ;
6. enregistrer départ, événements, arrivée et déchargement ;
7. calculer tonnage-kilomètre, bonus/malus et frais contractuels ;
8. produire la facture et les écritures proposées ;
9. envoyer l’export SAGE via outbox et enregistrer l’acquittement ;
10. présenter les KPI de volume, délai, rotation, anomalie et facturation.

Exclusions : bois unitaire, TMD, conteneurs, commande COTRAF, paiement bancaire,
comptabilité générale complète, application mobile hors ligne.

**Gate de sortie :** scénario UAT complet sur données de recette, totaux rapprochés,
aucun doublon après rejeu et traçabilité de chaque état jusqu’à sa source.

### Phase 3 — Pilote terrain et industrialisation (semaines 15–18)

- deux répétitions de reprise de données ;
- pilote sur un flux et un site limités ;
- coexistence contrôlée avec outils actuels ;
- formation par rôle, support et hypercare ;
- tests de charge, restauration, sécurité et coupure réseau ;
- mesure des KPI de départ et des écarts ;
- décision go/no-go et plan de retour arrière.

### Vague 2 — Fret complet et finance opérationnelle

- bois, parcs et traçabilité BSF ;
- hydrocarbures/TMD et certificats ;
- conteneurs et interfaces portuaires ;
- contrats, créances, litiges, pénalités d’immobilisation ;
- rapprochement bancaire/mobile money ;
- fiscalité et analytique validées ;
- généralisation des sites et clients.

### Vague 3 — GMAO et actifs industriels

- registre unifié locomotives, wagons, composants et compteurs ;
- visites, défauts, ordres de travail et remise en service ;
- stocks et pièces sérialisées ;
- disponibilité publiée à Fret/COTRAF ;
- coûts et immobilisations proposés à Finances ;
- premier usage terrain hors ligne borné et testé.

### Vague 4 — COTRAF en mode supervision puis sécurité

- main courante numérique ;
- positions, passages en gare et causes de retard ;
- graphique espace-temps en lecture ;
- restrictions d’infrastructure et indisponibilités matériel ;
- propositions de croisements explicables, confirmées par le régulateur ;
- homologation et essais indépendants avant toute extension d’autorité.

### Vague 5 — Infrastructures, sécurité/ARTF et PRN

- référentiel linéaire PK 0–648, ouvrages et équipements ;
- anomalies géolocalisées, inspections et travaux ;
- fenêtres d’intervention coordonnées avec COTRAF ;
- registre de sécurité, enquêtes, preuves et actions correctives ;
- rapports ARTF et bailleurs.

### Vague 6 — RH, temps et paie

- dossier salarié, affectation, compétences et habilitations ;
- roulements et compteurs de repos ;
- interface d’aptitude médicale cloisonnée ;
- paie parallèle en environnement de recette ;
- rapprochement sur plusieurs cycles avant bascule ;
- déclarations DGI/CNSS/CNAMGS après validation officielle.

### Vague 7 — GED avancée, collaboration et Copilot

- classement, conservation, scellement et recherche autorisée ;
- correspondance, parapheur et courrier officiel ;
- canaux internes et, si justifié, visio LiveKit ;
- Copilot réglementaire sur corpus validé ;
- maintenance prédictive et optimisation seulement après historique qualifié.

---

## 6. Backlog exécutable des neuf premiers sprints

Les sprints sont proposés sur deux semaines.

| Sprint | Résultat démontrable | Éléments principaux |
| --- | --- | --- |
| S0 | spécification pilote acceptée | `CAD-001` à `CAD-008` |
| S1 | module Fret activable et protégé | `PLAT-001`, `IAM-001`, `IAM-002` |
| S2 | référentiels, audit et outbox observables | `REF-001`, `AUD-001`, `INT-001` |
| S3 | client, contrat et programme Fret réels | `FRT-001` à `FRT-003` |
| S4 | ordre approuvé et composition de convoi | `FRT-004`, `FRT-005` |
| S5 | pesée idempotente et LVF générée | `FRT-006`, `FRT-007` |
| S6 | facture, écriture proposée et export SAGE | `FRT-008`, `FIN-001`, `INT-002` |
| S7 | UAT et migrations répétées | `MIG-001`, `SEC-001` |
| S8 | pilote terrain, hypercare et go/no-go | `OPS-001`, `CHG-001` |

### Épics de fondation

#### `PLAT-001` — Manifeste des modules

- codes stables : `voyageurs`, `fret`, `cotraf`, `gmao`, `infrastructure`,
  `finance`, `rh`, `ged`, `securite`, `copilot` ;
- activation par environnement, site et utilisateur ;
- même source pour navigation, routes et autorisation serveur ;
- module désactivé = refus serveur, pas seulement lien masqué.

#### `IAM-001` — Affectations multiples

- conserver temporairement `users.role` pour compatibilité billettique ;
- ajouter organisations, positions et affectations effectives-datées ;
- permettre plusieurs rôles par utilisateur avec portée direction/site/atelier/gare ;
- migrer progressivement les contrôles vers `assertCan()`.

#### `IAM-002` — Séparation des tâches

- créateur, approbateur et comptable distincts sur ordre/facture ;
- visiteur, réparateur et remise en service distincts en GMAO ;
- accès médical séparé du statut d’aptitude ;
- tests exhaustifs des refus, y compris administrateur technique.

#### `AUD-001` — Audit V2

- acteur, affectation, permission, appareil, date, motif, avant/après, résultat ;
- identifiants de corrélation et causalité ;
- scellement périodique hors de la table applicative ;
- journalisation des consultations sensibles ;
- export SIEM et politique de rétention à définir.

#### `INT-001` — Outbox commune

- événement versionné et idempotency key obligatoire ;
- état en attente/en cours/envoyé/rejeté ;
- tentatives bornées, prochaine tentative, erreur normalisée ;
- dashboard, alertes d’âge, acquittement et rejeu contrôlé ;
- aucun appel partenaire dans une mutation métier.

### Épics du MVP Fret

#### `FRT-001` — Référentiel commercial

Réutiliser `corporateAccounts` comme point de départ et ajouter contrats,
conditions tarifaires, validités, axes analytiques, contacts et pièces.

#### `FRT-002` — Programme hebdomadaire

Import manuel CSV/JSON puis adaptateur partenaire. Contrôles de doublon, version,
fenêtre, origine/destination et tonnage prévu.

#### `FRT-003` — Ordre d’expédition

Cycle brouillon → à valider → approuvé → planifié → en cours → livré → clôturé,
avec rejet motivé et historique immuable des transitions.

#### `FRT-004` — Composition du convoi

Locomotives et wagons identifiés, ordre, tare, capacité, disponibilité et incompatibilités.
Le MVP crée un référentiel minimal sans prétendre remplacer la future GMAO.

#### `FRT-005` — Approbations

Workflow commercial et exploitation, séparation des tâches, notifications et échéances.

#### `FRT-006` — Pesage

Ingestion signée ou saisie contrôlée, essieu/wagon/convoi, seuils, anomalies, pièces
brutes conservées, déduplication et rapprochement entrée/sortie.

#### `FRT-007` — Lettre de voiture ferroviaire

Numéro unique, parties, marchandise, wagons, poids, parcours, conditions, version,
signature/visa et PDF généré depuis le module documentaire réutilisé.

#### `FRT-008` — Tarification et facturation

Moteur pur et testable : distance, tonnage, barème, bonus/malus et taxes paramétrées.
Trace complète du calcul, facture/avoir et écritures proposées vers Finances.

#### `FIN-001` — Pont SAGE

Étendre le patron V65/outbox existant aux recettes Fret. Aperçu, contrôle d’équilibre,
acquittement, rejet et rapprochement sont obligatoires avant généralisation.

---

## 7. Modèle de données initial du MVP

Tables proposées, à confirmer par ateliers métier :

- `organizations`, `sites`, `positions`, `userAssignments`, `moduleActivations` ;
- `integrationEndpoints`, `integrationEvents`, `integrationReceipts` ;
- `freightContracts`, `freightRateRules`, `freightPrograms` ;
- `freightOrders`, `freightOrderVersions`, `freightConsignments` ;
- `rollingStockAssets`, `convoyCompositions` ;
- `weighingSessions`, `weighingMeasurements`, `weighingAnomalies` ;
- `freightWaybills`, `freightOperationalEvents` ;
- `freightInvoices`, `freightInvoiceLines`, `freightAccountingProposals` ;
- `documentRecords`, `documentVersions`, `approvalInstances`, `approvalSteps` ;
- `auditSeals` en complément de `auditLogs`.

Toutes les entités portent : identifiant stable, version, statut, auteur, horodatages,
classification, corrélation et règles de suppression/archivage. Les montants sont
stockés dans la plus petite unité monétaire ou suivant une convention décimale unique
documentée ; aucun calcul financier ne dépend d’un flottant non maîtrisé.

---

## 8. Stratégie d’intégration et hors-ligne

### 8.1 Adaptateurs partenaires

Chaque partenaire dispose d’un adaptateur isolé : COMILOG, pont-bascule, GSEZ/OPRAG,
SAGE, banques/mobile money, DGI, CNSS/CNAMGS et ARTF. Les contrats sont versionnés et
testés sur fixtures. Un mode fichier signé est prévu lorsqu’aucune API n’existe.

### 8.2 Synchronisation terrain

Le mode hors ligne n’est activé qu’après définition, par type de donnée, de :

- l’autorité de vérité ;
- l’identifiant client et la règle d’idempotence ;
- la stratégie de conflit ;
- la durée locale et le chiffrement ;
- la révocation d’appareil ;
- le comportement en données périmées ;
- la preuve de resynchronisation.

Le premier MVP Fret reste connecté. Un spike hors ligne porte sur une saisie terrain
non critique et sans allocation concurrente ; il ne bloque pas le pilote central.

---

## 9. Qualité, sécurité et critères de sortie

Chaque lot respecte les deux étages de tests déjà décidés dans les ADR : logique et
fonctions via Vitest/Convex-test, invariants de concurrence sur backend Convex réel.

### Definition of Done commune

- aucun chiffre opérationnel de démonstration utilisé comme donnée réelle ;
- autorisation contrôlée côté serveur et testée positivement/négativement ;
- action sensible auditée et corrélée ;
- logique de calcul pure, versionnée et testée sur cas limites ;
- écriture externe idempotente, observable et rejouable ;
- états de chargement, vide, erreur et hors-ligne traités ;
- accessibilité clavier, contraste et cible de 44 px ;
- documentation API, runbook et procédure de retour arrière ;
- métriques et alertes associées ;
- validation du PO métier sur scénario UAT ;
- aucun défaut critique de sécurité ouvert.

### KPI du pilote Fret

Les seuils sont fixés après mesure de la situation actuelle. Les indicateurs minimum :

- délai programme → ordre approuvé ;
- délai chargement → LVF ;
- écart poids prévu/pesé et taux d’anomalie ;
- délai livraison → facture ;
- taux d’exports SAGE acquittés sans intervention ;
- nombre de doublons, événements rejetés et corrections manuelles ;
- complétude de la piste d’audit ;
- disponibilité et temps de réponse aux heures d’exploitation ;
- adoption par rôle et volume encore traité hors système.

---

## 10. Gouvernance et équipe

### RACI corrigé

- **DG SETRAG :** sponsor, arbitrage et approbation du programme.
- **PO Fret/DCFV :** responsable du périmètre et approbateur fonctionnel du MVP.
- **DSI SETRAG :** responsable de l’architecture, des accès, de l’exploitation et des
  systèmes maîtres.
- **OkaTech :** responsable de la conception détaillée, réalisation, tests et transfert.
- **DFC/Contrôle interne :** approbateur des calculs, pièces et intégrations comptables.
- **RSSI/DPO/Juridique :** gates sécurité, données, signature, rétention et conformité.
- **DEF/DMAT/DINFRA/DSED :** propriétaires métier de leurs vagues.
- **ARTF et partenaires :** consultés dès le cadrage des interfaces et fonctions
  ferroviaires concernées, pas uniquement à la fin.

### Équipe MVP indicative

- 1 Product Owner Fret disponible chaque semaine ;
- 1 responsable programme ;
- 1 architecte/lead ;
- 4 à 6 développeurs full-stack ;
- 1 UX/UI ;
- 1 à 2 QA ;
- 1 spécialiste données/intégrations ;
- DevSecOps/SRE, sécurité et conduite du changement à temps partiel.

Sans disponibilité régulière du PO, d’un comptable SAGE et d’un référent exploitation,
le calendrier du MVP n’est pas engageable.

---

## 11. Risques prioritaires et réponses

| Risque | Réponse obligatoire |
| --- | --- |
| Construire dix produits simultanément | verticale Fret puis vagues avec gates |
| Données ou chiffres non officiels | registre des sources et approbation métier |
| COTRAF utilisé comme système de sécurité non homologué | V1 en supervision/conseil seulement |
| Convex incompatible avec souveraineté ou miroir on-prem | décision d’hébergement avant engagements PCA/PRA |
| RPO quasi nul incompatible avec 72 h hors ligne | objectifs par service et preuve de resynchronisation |
| SAGE sans contrat d’interface réel | spike et test d’acquittement en Phase 0/1 |
| Audit déclaré immuable mais modifiable | scellement externe/WORM et contrôle d’intégrité |
| Taux fiscaux et sociaux erronés | règles effectives-datées, validation professionnelle |
| Fuite de paie ou données médicales | cloisonnement, masquage et audit de consultation |
| E2EE incompatible avec recherche et archivage | décision de gouvernance par type de canal |
| IA exposant des données inter-domaines | filtrage d’autorisation avant indexation et restitution |
| Copie de modules transverses divergents | portage documenté, tests et filiation vers la source |

---

## 12. Décisions SETRAG nécessaires

Ces décisions n’empêchent pas de préparer le socle, mais conditionnent le pilote :

1. flux, client et site du MVP Fret ;
2. liste officielle des gares, PK, voies, matériels et partenaires ;
3. système maître de chaque référentiel ;
4. statut de SAGE X3 et mode d’échange réel ;
5. accès aux formats de programme, pesage et facturation COMILOG ;
6. règles contractuelles de calcul tonnage-kilomètre et bonus/malus ;
7. tenant Entra ID/AD, MFA et groupes disponibles ;
8. exigences DSIG/RSSI, hébergement, localisation et réversibilité ;
9. politiques de signature, archivage, rétention et protection des données ;
10. limite d’autorité du futur COTRAF et processus d’homologation ;
11. sources officielles des règles fiscales, sociales et ferroviaires ;
12. objectifs de disponibilité, reprise et durée hors ligne par service.

Hypothèses de démarrage, réversibles jusqu’à validation :

- pilote minéralier Moanda–Owendo ;
- SAGE X3 demeure le livre comptable maître ;
- Convex demeure le socle transactionnel du pilote ;
- COTRAF reste en lecture et aide à la décision ;
- aucune paie, visio ou IA autonome dans le MVP.

---

## 13. Première tranche à implémenter

La première tranche technique recommandée est :

> **Manifeste de modules + affectations utilisateur + squelette vertical Fret + tests
> d’autorisation.**

Elle est suffisamment petite pour être livrée sans dépendre des contrats partenaires,
mais suffisamment structurante pour éviter que chaque futur module invente ses propres
routes, permissions et conventions.

Ordre de travail :

1. isoler les prototypes ERP actuels sur une branche dédiée ;
2. écrire l’ADR « monolithe modulaire et frontière de sûreté COTRAF » ;
3. introduire `ModuleCode` et l’activation de modules ;
4. ajouter organisations, sites et affectations sans casser `users.role` ;
5. créer `convex/modules/fret/` et son manifeste ;
6. protéger `/fret` par une ressource dédiée, côté serveur et côté interface ;
7. remplacer les premiers KPI statiques par une requête vide réelle ;
8. couvrir les autorisations, états vides et désactivation du module ;
9. valider typage, lint, tests et build du périmètre.

**Résultat attendu :** un module Fret vide mais réel, activable, correctement autorisé,
auditable et prêt à recevoir le premier agrégat métier sans dette de démonstration.

---

## 14. Références du dossier

- `01_AUDIT_PORTAIL_AGENT_EXISTANT.md` — existant et écarts.
- `02_ETUDE_METIERS_TRANSPORTS_FRET_SETRAG.md` — flux industriels.
- `03_CARTOGRAPHIE_ACTEURS_INTERNES_EXTERNES.md` — rôles et partenaires.
- `04_ARCHITECTURE_SYSTEME_EXPLOITATION_MODULES.md` — modules cibles.
- `05_CONFORMITE_OHADA_FISCALITE_DROIT_GABON.md` — règles à faire valider.
- `06_FEUILLE_DE_ROUTE_ET_PLAN_IMPLEMENTATION.md` — trajectoire initiale.
- `LIVRE_BLANC_SETRAG_SYSTEME_EXPLOITATION_INTEGRE.md` — vision stratégique.
- `docs/plans/implementation-agent-web.md` — état des lots billettiques.
- `docs/adr/0001-convex-comme-socle.md` — choix Convex.
- `docs/adr/0005-matrice-de-droits-declarative.md` — autorisations.
- `docs/adr/0010-strategie-de-test-a-deux-etages.md` — stratégie de test.
- `docs/adr/0013-comptabilite-en-outbox.md` — intégration SAGE.
