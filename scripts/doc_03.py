# -*- coding: utf-8 -*-

content = """# Document 03 — Cartographie Exhaustive des Acteurs et Parties Prenantes de la SETRAG

**Projet :** SETRAG Enterprise Operating System (SI Intégré Ferroviaire)  
**Entité :** Société d'Exploitation du Transgabonais (SETRAG) — République Gabonaise  
**Référence :** CARTOG-ACTEURS-SET-2026-V1.0  
**Date d'étude :** Septembre 2026  
**Domaine :** Analyse Organisationnelle, Rôles Métiers & Écosystème Institutionnel  

---

## 1. Introduction & Objectif de la Cartographie

Le fonctionnement du chemin de fer Transgabonais mobilise un écosystème complexe composé de plus de **1 500 agents directs**, de plusieurs centaines de sous-traitants, de géants miniers et forestiers mondiaux, d'institutions régaliennes de la République Gabonaise et de bailleurs de fonds internationaux.

Ce document dresse la **matrice complète des acteurs internes (collaborateurs SETRAG)** et des **parties prenantes externes**. Pour chaque acteur, il identifie ses missions, ses contraintes de terrain et ses exigences fonctionnelles vis-à-vis du futur **Système d'Exploitation d'Entreprise (ERP Intégré)**.

---

## 2. Cartographie des Acteurs Internes (Collaborateurs SETRAG)

```
                            ORGANIGRAMME FONCTIONNEL DE LA SETRAG
===================================================================================================
                                      [ CONSEIL D'ADMINISTRATION ]
                           (Eramet/Comilog 51% | Meridiam 40% | État Gabonais 9%)
                                                   |
                                         [ DIRECTION GÉNÉRALE ]
                            (Direction Générale, Audit & Risques, Juridique)
                                                   |
       +--------------------+----------------------+--------------------+--------------------+
       |                    |                      |                    |                    |
     [ DEF ]             [ DMAT ]              [ DINFRA ]             [ DCFV ]             [ DFC ]
  Exploitation       Matériel Roulant        Installations Fixes     Commercial      Finances & Compta
  - COTRAF           - Ateliers Owendo       - Brigades Voies       - Billetterie    - SYSCOHADA
  - Conducteurs      - Ateliers Booué        - Travaux PRN          - Grands Comptes - Fiscalité DGI
  - Chefs de Gare    - Locos & Wagons        - Ouvrages & Ponts     - Litiges Fret   - Trésorerie
       |                    |                      |                    |                    |
       +--------------------+----------------------+--------------------+--------------------+
                            |                                           |
                         [ DRH ]                                     [ DSED ]
                    Ressources Humaines                         Sécurité & Environnement
                    - Paie Gabonaise (CNSS/CNAMGS)              - Sécurité Circulations
                    - Roulements 3x8 Conducteurs                - Enquêtes Accidents
                    - Médecine du Travail                       - Parc National de la Lopé
===================================================================================================
```

### 2.1 Direction de l'Exploitation Ferroviaire (DEF)
La DEF est le cœur opérationnel de la circulation des trains :
1. **Régulateurs du COTRAF (Poste de Commande Centralisé - Owendo/Booué) :**
   - *Missions :* Gestion en temps réel du trafic sur les 648 km de voie unique, espacement des trains (cantonnement), délivrance des bulletins de circulation, commande des aiguillages et gestion des retards.
   - *Besoins SI :* Graphique de circulation informatisé temps réel, alertes automatiques de franchissement de canton, aide à la décision pour le croisement en gare.
2. **Chefs de Gare (25 gares de la ligne) :**
   - *Missions :* Accueil des trains, manœuvres d'aiguilles locales, sécurité des départs, surveillance du quai, interface avec les usagers et les chargeurs locaux.
   - *Besoins SI :* Vue locale des trains en approche, registre numérique de circulation de gare, validation des arrivées/départs.
3. **Conducteurs de Ligne (Mécaniciens de Train) :**
   - *Missions :* Conduite des locomotives de fret lourd (10 000 t) et des trains express, respect strict des limitations de vitesse selon l'état de la voie.
   - *Besoins SI :* Fiche de train numérique sur tablette durcie (vitesse limite, profil de la voie, bulletins d'ordres temporaires de ralentissement).
4. **Chefs de Train & Contrôleurs :**
   - *Missions :* Sécurité à bord, vérification des titres de transport, gestion des litiges, encaissement des procès-verbaux (PV), gestion des incidents voyageurs.
   - *Besoins SI :* Application mobile connectée/déconnectée (`controleur-web`), contrôle cryptographique hors ligne, synchronisation automatique en gare.
5. **Agents de Visite Technique (Visiteurs de Rames) :**
   - *Missions :* Inspection visuelle et mécanique des wagons avant départ (boîtes d'essieux, attelages, conduites de frein pneumatique).
   - *Besoins SI :* Saisie mobile des bulletins de visite technique et déclaration des wagons réformés pour avarie.

### 2.2 Direction du Matériel Roulant (DMAT)
1. **Ingénieurs & Contremaîtres d'Atelier (Owendo et Booué) :**
   - *Missions :* Maintenance préventive et curative des 40+ locomotives diesel et des 1 500+ wagons (trémies, plats, citernes, voitures voyageurs).
   - *Besoins SI (GMAO) :* Ordres de travail numériques, historique des pannes par numéro de caisse/bogies, suivi de l'usure des semelles de frein et des essieux.
2. **Gestionnaires de Stocks & Magasiniers Pièces de Rechange :**
   - *Missions :* Gestion des magasins centraux d'Owendo et des magasins secondaires de ligne, réapprovisionnement des pièces critiques (importations Europe/USA/Afrique du Sud).
   - *Besoins SI :* Gestion des stocks avec seuils d'alerte, traçabilité des numéros de série des composants critiques (moteurs de traction, compresseurs).

### 2.3 Direction des Installations Fixes (DINFRA)
1. **Brigades de Voie & Cantonniers :**
   - *Missions :* Surveillance quotidienne à pied des sections de voie, détection des affaissements de terrain, des rails cassés ou des glissements de talus (climat équatorial).
   - *Besoins SI :* Signalement géolocalisé des anomalies de voie sur application mobile terrain.
2. **Équipes du Programme de Remise à Niveau (PRN) :**
   - *Missions :* Pose des traverses en béton bibloc en remplacement des traverses en bois usées, renouvellement du ballast et rectification de la géométrie de voie par bourrage mécanique.
   - *Besoins SI :* Planification des fenêtres d'interruption de trafic (chantiers de voie), suivi kilométrique de l'avancement du PRN.
3. **Techniciens Télécoms & Signalisation :**
   - *Missions :* Entretien des boucles de détection, des feux de signalisation des gares, des passages à niveau et du réseau radio sol-train (VHF/Fibre optique le long du rail).
   - *Besoins SI :* Supervision d'état des équipements de télécommunications et alertes de coupure de fibre.

### 2.4 Direction Commerciale Fret & Voyageurs (DCFV)
1. **Guichetiers & Chefs de Vente :** Émission des billets, encaissement, arrêtés de caisse quotidiens (couverts actuellement par `agent-web`).
2. **Gestionnaires Grands Comptes Fret :** Suivi des contrats-cadres avec la COMILOG, les exploitants forestiers et les distributeurs pétroliers.
   - *Besoins SI :* Émission des lettres de voiture ferroviaires dématérialisées, suivi de la facturation au tonnage/km, gestion des pénalités d'immobilisation de wagons.

### 2.5 Direction Financière et Comptable (DFC)
1. **Comptables Généraux & Auxiliaires :**
   - *Missions :* Tenue des livres comptables aux normes du **SYSCOHADA révisé**, suivi des comptes fournisseurs, clients fret et voyageurs.
   - *Besoins SI :* Plan comptable OHADA intégré (classes 1 à 9), lettrage automatique, rapprochement bancaire et mobile money automatique.
2. **Fiscalistes & Trésoriers :**
   - *Missions :* Déclarations fiscales mensuelles auprès de la DGI Gabon (TVA 18%, CSS 1%, précomptes, retenues à la source 9.5%), équilibre de trésorerie multi-devises (FCFA, EUR, USD).
   - *Besoins SI :* Générateur automatique de la déclaration fiscale gabonaise (e-tax) et de la liasse financière OHADA.

### 2.6 Direction des Ressources Humaines (DRH)
1. **Gestionnaires de Paie Gabonaise :**
   - *Missions :* Établissement mensuel des bulletins de paie de 1 500+ collaborateurs en stricte conformité avec le Code du Travail gabonais et la Convention Collective Ferroviaire.
   - *Besoins SI :* Moteur de paie gabonais calculant l'IRPP, la Taxe Complémentaire sur les Salaires (TCS 5%), les cotisations CNSS (plafond 1,5 M FCFA) et CNAMGS.
2. **Planificateurs des Roulements Ferroviaires :**
   - *Missions :* Élaboration des plannings de service des conducteurs et contrôleurs (régime 3x8, repos périodiques, découchés en gares d'étape comme Booué ou Franceville).
   - *Besoins SI :* Grille de planification des roulements avec contrôle strict des durées maximales de conduite continue pour prévenir l'endormissement et les accidents.
3. **Médecins & Infirmiers du Travail (Centre Médical SETRAG Owendo) :**
   - *Missions :* Visites médicales d'aptitude obligatoire à la sécurité ferroviaire (acuité visuelle, tests auditifs, dépistage toxicologique des conducteurs et régulateurs).
   - *Besoins SI :* Dossier médical d'aptitude ferroviaire informatisé avec alerte de renouvellement obligatoire d'habilitation de sécurité.

---

## 3. Cartographie des Acteurs & Parties Prenantes Externes

| Acteur / Institution | Statut / Rôle | Enjeux & Interactions avec la SETRAG | Interfaces Requises dans l'ERP |
|---|---|---|---|
| **Eramet / COMILOG** | Actionnaire majoritaire (51 %) & 1er client fret | Évacuation de 7 Mt/an de manganèse de Moanda vers Owendo. Rentabilité industrielle du groupe. | EDI / API : programmes hebdomadaires de trains miniers, données de pesage, facturation fret. |
| **Meridiam** | Actionnaire stratégique (40 %) | Fonds d'investissement international spécialisé en infrastructures durables, co-financeur du PRN. | Tableaux de bord financiers, KPI ESG (Environnement, Social, Gouvernance), reporting d'avancement des investissements. |
| **État Gabonais** | Actionnaire (9 %) & Conédant | Propriétaire de l'infrastructure ferroviaire, garant de la continuité territoriale et du service public voyageurs. | Rapports de suivi de la concession, statistiques de trafic, contrôle des tarifs réglementés. |
| **ARTF** (Autorité de Régulation des Transports Ferroviaires) | Régulateur étatique indépendant | Veille au respect des règles de sécurité, de concurrence et d'entretien de la voie ferrée concédée. | Registre officiel des incidents et accidents ferroviaires, homologation du matériel roulant, audits de sécurité. |
| **Ministère des Eaux et Forêts** | Autorité de tutelle forestière | Contrôle de la légalité du bois transporté (lutte contre le braconnage et l'abattage illégal de bois précieux). | Validation des Bordereaux de Suivi Forestier (BSF), traçabilité des billes par code-barres avant chargement sur wagon. |
| **Douanes Gabonaises (DGDDI)** | Administration régalienne | Contrôle des flux d'exportation (minerai, bois) et des importations de matériels ferroviaires (régime douanier privilégié PRN). | Dédouanement fret, manifestes électroniques d'entrée/sortie au port d'Owendo. |
| **GSEZ (Nkok & Ports)** | Opérateur de la Zone Spéciale et des ports | Réception des grumes à Nkok, gestion du terminal minéralier et du terminal à conteneurs d'Owendo. | Échange de données de chargement/déchargement, planification des sillons de desserte portuaire. |
| **DGI (Direction Générale des Impôts)** | Administration fiscale du Gabon | Perception des impôts, TVA (18%), CSS (1%), impôt sur les sociétés (30%), contrôles fiscaux. | Télédéclaration fiscale normalisée, piste d'audit fiable (PAF) pour justifier les déductions de TVA. |
| **CNSS & CNAMGS** | Caisses de sécurité sociale & santé | Protection sociale des travailleurs gabonais, cotisations retraite, accidents du travail et assurance maladie. | Télé-déclaration mensuelle nominative des salaires (DTS) et bordereaux d'appels de cotisations. |
| **AFD / SFI / Proparco / UE** | Bailleurs de fonds internationaux | Financement par prêts et garanties du Programme de Remise à Niveau (PRN) à hauteur de plusieurs centaines de millions d'euros. | Suivi rigoureux de l'affectation des fonds, audits de conformité environnementale et sociale (normes de performance SFI). |
"""

with open("docs/etude-erp-setrag/03_CARTOGRAPHIE_ACTEURS_INTERNES_EXTERNES.md", "w", encoding="utf-8") as f:
    f.write(content)

print("Document 03 généré avec succès.")
