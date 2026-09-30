# Document 06 — Feuille de Route Stratégique, Plan d'Implémentation & Continuité d'Activité (PCA/PRA)

**Projet :** SETRAG Enterprise Operating System (SI Intégré Ferroviaire)  
**Entité :** Société d'Exploitation du Transgabonais (SETRAG) — République Gabonaise  
**Référence :** ROADMAP-IMPL-SET-2026-V1.0  
**Date d'étude :** Septembre 2026  
**Expertise :** Direction de Projet SI, Urbanisation & Conduite du Changement  

---

## 1. Calendrier Prévisionnel et Phasage de Déploiement

Le déploiement d'un Système d'Exploitation d'Entreprise couvrant 648 km de ligne, des flux industriels de 7 millions de tonnes de manganèse et plus de 1 500 collaborateurs exige une approche par paliers progressifs (*iterative milestones*) pour éviter toute rupture d'exploitation.

```
                          FEUILLE DE ROUTE STRATÉGIQUE (PHASES 1 À 4)
===================================================================================================
 [PHASE 1 : MOIS 1-4]   SOCLE MODULAIRE, CONSOLIDATION VOYAGEURS & BUREAUTIQUE D'ENTREPRISE
                        - Nouvelle barre de navigation de niveau entreprise (Module Switcher)
                        - Déploiement de la GED, du Parapheur Électronique et de la Messagerie Interne
                        - Raccordement temps réel des 89 guichets existants

 [PHASE 2 : MOIS 5-8]   FRET INDUSTRIEL (MANGANÈSE / BOIS) & FINANCES OHADA / FISCALITÉ DGI
                        - Gestion des expéditions COMILOG (Moanda-Owendo) et pesage dynamique
                        - Gestion de la filière bois vers Nkok et des conteneurs portuaires
                        - Comptabilité générale SYSCOHADA révisé et déclarations TVA/CSS DGI

 [PHASE 3 : MOIS 9-14]  EXPLOITATION COTRAF, GMAO DU MATÉRIEL ROULANT & RH / PAIE GABON
                        - Graphique numérique de circulation espace-temps en voie unique
                        - GMAO des locomotives et wagons (ateliers d'Owendo et Booué)
                        - Moteur de paie gabonais (IRPP, TCS, CNSS, CNAMGS) et roulements 3x8

 [PHASE 4 : MOIS 15-20] INFRASTRUCTURES PRN, SÉCURITÉ ARTF & IA MÉTIER (SETRAG COPILOT)
                        - Cartographie kilométrique du PRN (traverses béton, géométrie de voie)
                        - Registre réglementaire de sécurité ARTF et gestion environnementale Lopé
                        - IA d'optimisation des croisements ferroviaires et maintenance prédictive
===================================================================================================
```

---

## 2. Architecture Technique et Traitement des Données

L'infrastructure repose sur le monorepo unifié existant, étendu pour répondre aux exigences industrielles :
- **Frontend Applicatif :** Next.js 16 avec React 19 et Turbopack. L'interface utilise le Design System SETRAG (Tailwind 4, composants Radix/shadcn).
- **Moteur de Données & Transactionnel :** Convex 1.42. Offre des transactions ACID instantanées pour les stocks de places, les assignations de sillons et les réservations de fret.
- **Réseau Déconnecté (Edge Offline-First) :** Pour les 15 gares isolées et les chantiers de voie en forêt équatoriale, utilisation de Service Workers PWA et de réplication locale IndexedDB (technologie validée sur `controleur-web`).
- **Passerelles d'Interconnexion Industrielle :**
  - Connecteurs ponts-bascules (Moanda et Owendo) via WebSockets sécurisés.
  - Interface bancaire et Mobile Money (Airtel Money B2B, Moov Money B2B, GIMAC/BEAC).
  - Passerelle EDI avec les douanes (SYDONIA World) et la DGI (télé-déclaration e-tax).
  - Connecteur bilatéral avec le progiciel financier SAGE X3 V12 de la SETRAG.

---

## 3. Matrice des Responsabilités (RACI) de la Gouvernance Projet

| Phase / Livrable | Direction Générale (DG) | DSI / Prestataire OkaTech | Direction Métier Concerne | ARTF / Ministère |
|---|---|---|---|---|
| **Cadrage & Validation Architecturale** | **A** (Approbateur) | **R** (Réalisateur) | **C** (Consulté) | **I** (Informé) |
| **Phase 1 : Bureautique & GED** | **I** | **R** | **C** (Secrétariat & Services) | **I** |
| **Phase 2 : Fret Minier & Bois** | **A** | **R** | **C** (DCFV & COMILOG) | **I** |
| **Phase 2 : Finances & Fiscalité** | **A** | **R** | **C** (DFC / Fiscalistes) | **C** (DGI Gabon) |
| **Phase 3 : COTRAF & GMAO** | **A** | **R** | **C** (DEF / DMAT) | **C** (ARTF) |
| **Phase 3 : RH & Paie Gabonaise** | **A** | **R** | **C** (DRH / Partenaires Sociaux)| **I** (CNSS/CNAMGS) |
| **Phase 4 : IA & Infrastructures PRN** | **A** | **R** | **C** (DINFRA / Bailleurs AFD) | **I** |

*(Légende : R = Responsable de réalisation, A = Approbateur final, C = Consulté, I = Informé)*

---

## 4. Plan de Continuité d'Activité (PCA) et Plan de Reprise d'Activité (PRA)

Le Transgabonais étant l'unique voie d'approvisionnement ferroviaire de la nation, toute indisponibilité du système supérieur à 2 heures a des conséquences critiques sur l'exportation du manganèse et le ravitaillement des provinces.

### 4.1 Dispositif de Haute Disponibilité (PCA)
- **Hébergement Hybride Résilient :** Déploiement des services web et de la base Convex sur une infrastructure Cloud certifiée Tier III+ à haute redondance, doublée d'un réplica miroir sur site au datacenter du siège de la SETRAG à Owendo.
- **Réseau Télécoms Dédié :** Exploitation prioritaire de la fibre optique privée de la SETRAG longeant la voie ferrée de PK 0 à PK 648, avec basculement automatique sur liaison satellitaire (Starlink / VSAT) en cas de rupture de câble par engin de chantier ou intempérie.
- **Autonomie des Postes Locaux :** Chaque gare dispose d'une instance de cache local lui permettant d'émettre des billets et d'enregistrer des passages de trains pendant 72 heures sans connexion au serveur central.

### 4.2 Procédure de Reprise d'Activité après Sinistre (PRA)
- **RPO (Recovery Point Objective) :** Zéro perte de données transactionnelles (RPO < 1 seconde grâce aux journaux de mutations WAL synchronisés).
- **RTO (Recovery Time Objective) :** Reprise nominale des opérations en moins de 15 minutes en cas de sinistre majeur sur le serveur primaire.
- **Plan de Secours Papier (Mode Dégradé Rétrograde) :** Maintien en gare des carnets de secours à souche papier pré-imprimés et numérotés pour la billetterie et le fret, avec protocole de saisie de rattrapage dès rétablissement du réseau.
