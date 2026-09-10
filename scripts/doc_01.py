# -*- coding: utf-8 -*-
import os

content = """# Document 01 — Audit Exhaustif du Portail Agent Existant (`agent-web`) & Analyse des Écarts (Gap Analysis)

**Projet :** SETRAG Enterprise Operating System (SI Intégré Ferroviaire)  
**Entité :** Société d'Exploitation du Transgabonais (SETRAG) — République Gabonaise  
**Référence :** AUDIT-SET-2026-V1.0  
**Date d'audit :** Septembre 2026  
**Auditeur :** OkaTech Consulting / Division Ingénierie des Systèmes Complexes  

---

## 1. Contexte et Périmètre de l'Audit

L'application **`agent-web`** (accessible en local sur le port `3001` et déployée sur Vercel) a été conçue comme le portail d'exploitation et de vente au guichet de la SETRAG. Elle s'inscrit dans le cadre initial du remplacement de l'ancien système d'exploitation billettique **MOBIPASS**.

Le présent audit a pour vocation d'analyser en profondeur l'architecture, le code source, les fonctionnalités et la couverture opérationnelle de cette application, afin de déterminer les écarts structurels à combler pour la transformer en un véritable **Système d'Exploitation d'Entreprise (ERP Intégré)** couvrant l'intégralité des activités de la SETRAG.

```
+-------------------------------------------------------------------------------+
|                       PORTAIL AGENT SETRAG (agent-web)                       |
|                                                                               |
|   +--------------------------+  +-----------------------------------------+   |
|   |    FRONT-OFFICE GUICHET  |  |       BACK-OFFICE GESTION & YIELD       |   |
|   |                          |  |                                         |   |
|   |  - Caisse & Encaissement |  |  - Gestion Voyageurs & Billets          |   |
|   |  - Émission Billets      |  |  - Grilles Tarifaires & Yield           |   |
|   |  - Colis Express         |  |  - Contingentement des Places           |   |
|   |  - Bagages Excédentaires |  |  - Points de Vente & Livrets            |   |
|   |  - Prestations Spéciales |  |  - Matériel Roulant (Rames Voyageurs)   |   |
|   |  - Ventes Manuelles      |  |  - Incidents & Procès-Verbaux (PV)      |   |
|   |  - Opérations Après-Vente|  |  - Rapports de Vente & Pré-comptabilité |   |
|   +--------------------------+  +-----------------------------------------+   |
|                                                                               |
|   Socle Technique : Next.js 16 (Turbopack) | Convex 1.42 | Better Auth 1.6    |
|   Design System   : Tailwind CSS 4 | Tokens SETRAG | Radix UI / shadcn        |
+-------------------------------------------------------------------------------+
```

---

## 2. Inventaire Fonctionnel Détaillé de l'Existant

L'analyse de l'arborescence des routes (`apps/agent-web/src/app`) et des modèles de données révèle deux espaces fonctionnels distincts :

### 2.1 Espace « Vente » (`/vente`) — Front-Office Guichet

Cet espace est dédié aux guichetiers et agents de gare pour les opérations directes avec les usagers :
1. **Gestion de Caisse (`/vente/caisse`) :**
   - Ouverture de caisse avec contrôle du fonds de roulement initial.
   - Suivi en temps réel des encaissements par mode de paiement (espèces FCFA, Airtel Money, Moov Money, cartes bancaires).
   - Arrêté de caisse, calcul des écarts théoriques/réels et clôture sécurisée.
2. **Encaissement & Émission de Billets (`/vente/billet`, `/vente/encaissement`) :**
   - Sélection du parcours sur la ligne Owendo–Franceville (25 gares).
   - Choix de la classe (VIP, 1re Classe, 2e Classe) et du régime de train (Express, Omnibus).
   - Affectation de place assise nominative avec blocage transactionnel anti-survente dans Convex.
   - Application automatique des réductions statutaires (enfants, militaires, familles nombreuses).
   - Impression du titre de transport avec identifiant sécurisé et QR Code signé cryptographiquement.
3. **Services Complémentaires Voyageurs :**
   - **Colis Express (`/vente/colis`) :** Prise en charge des expéditions de messagerie rapide entre gares, pesée, tarification au kilogramme et édition de bordereaux d'expédition.
   - **Excédents Bagages (`/vente/bagage`) :** Enregistrement des bagages hors franchise, calcul de la surtaxe au kilo et étiquetage bagage.
   - **Prestations Spéciales (`/vente/prestation-speciale`) :** Réservation d'espaces spécifiques (Train Auto Accompagné - TAA, transport mortuaire/funéraire avec respect des réquisitions légales).
   - **Ventes Manuelles de Secours (`/vente/ventes-manuelles`) :** Enregistrement a posteriori des ventes sur carnets à souche papier en cas de rupture de connectivité en gare de brousse, avec réconciliation différée.
4. **Opérations Après-Vente (`/vente/operations`) :**
   - Échange de billet, modification de date/classe selon les conditions générales de vente (CGV).
   - Annulation et remboursement avec calcul des pénalités selon le délai avant départ.

### 2.2 Espace « Gestion » (`/gestion`) — Back-Office & Exploitation Voyageurs

Cet espace s'adresse aux chefs de gare, superviseurs d'exploitation et administrateurs réseau :
1. **Gestion Clientèle & Billets (`/gestion/voyageurs`) :** Consultation de l'historique des réservations, recherche multicritères par identifiant voyageur, téléphone ou numéro de billet.
2. **Plan de Transport & Rames (`/gestion/trains`) :** Configuration des compositions de trains voyageurs (locomotive, fourgon à bagages, voitures VIP/1re/2e classe, voiture-bar).
3. **Gestion des Capacités & Contingents (`/gestion/places`) :** Blocage de quotas de places pour les réquisitions de l'État, les délégations officielles, les militaires ou la maintenance.
4. **Grilles Tarifaires & Yield Management (`/gestion/tarifs`, `/gestion/yield`) :**
   - Matrice kilométrique de base entre les 25 gares.
   - Règles de modulation dynamique des tarifs selon le taux de remplissage de la rame et la courbe de réservation.
5. **Réseau de Vente & Postes (`/gestion/points-de-vente`, `/gestion/livrets`) :**
   - Déclaration et habilitation des 89 guichets répartis sur le territoire gabonais.
   - Gestion de l'approvisionnement et du suivi des livrets de billets sécurisés.
6. **Incidents & Police Ferroviaire (`/gestion/incidents`, `/gestion/incidents/proces-verbaux`) :**
   - Centralisation des rapports d'incidents voyageurs (retards, avaries techniques, malaises à bord).
   - Traitement et recouvrement des procès-verbaux (PV) d'infraction émis par les contrôleurs à bord (défaut de titre, incivilités).
7. **Reporting & Clôtures Périodiques (`/gestion/rapports`) :**
   - Synthèses journalières et mensuelles des ventes par gare, par train et par agent.
   - Génération de l'état comptable **V65** destiné à l'exportation vers le progiciel financier central.

---

## 3. Forces de l'Architecture Technique Actuelle

L'audit met en évidence des choix technologiques modernes et particulièrement robustes :
- **Framework Frontend :** Next.js 16 avec Turbopack et React 19, offrant des temps de réponse instantanés (< 300 ms au démarrage).
- **Architecture de Données :** Convex 1.42 agissant comme base réactive temps réel avec moteur transactionnel ACID. Cela élimine structurellement la survente de places (mutation unique de décrémentation des stocks et de création de réservation).
- **Authentification & Sécurité :** Better Auth 1.6 intégrant la gestion des sessions, le contrôle d'accès basé sur les rôles (RBAC : Guichetier, Chef de gare, Contrôleur, Administrateur) et la traçabilité via `audit()`.
- **Design System SETRAG :** Conforme aux spécifications graphiques officielles (Tailwind CSS 4, tokens oklch portés en sRGB, boutons d'action >= 44 px, accessibilité contrastée, support des chiffres tabulaires pour les horaires).

---

## 4. Analyse des Écarts (Gap Analysis) : Les Manques Vers le SI Intégré

Si `agent-web` remplit remarquablement sa mission de billetterie, il ne couvre qu'une fraction minime (environ 15 %) des opérations réelles de la SETRAG. Pour devenir le **Système d'Exploitation Global**, les lacunes majeures suivantes ont été relevées :

| Domaine Métier SETRAG | État dans `agent-web` Actuel | Réalité Opérationnelle SETRAG & Exigences Cibles | Criticité de l'Écart |
|---|---|---|---|
| **Fret Minier (Manganèse)** | **Inexistant** | Cœur économique de la SETRAG (~70 % des revenus). Convois lourds de 84 à 100+ wagons pour la COMILOG, pesage essieux à Moanda et Owendo, interfaces Port Minéralier. | **Bloquant / Majeur** |
| **Fret Forestier (Bois/Grumes)** | **Inexistant** | Transport de grumes et bois débité depuis l'intérieur vers Nkok et Owendo. Suivi des cubages, wagons plats/ranchers, bordereaux de traçabilité Eaux & Forêts. | **Bloquant / Majeur** |
| **Fret Général & Hydrocarbures** | **Inexistant** | Wagons citernes (PetroGabon/Total), conteneurs maritimes (GSEZ/OPRAG), marchandises pondéreuses (ciment). Lettres de voiture ferroviaires, facturation tonnage/km. | **Bloquant / Majeur** |
| **Régulation du Trafic (COTRAF)** | **Inexistant** | Poste de commande centralisé supervisant la voie unique (648 km). Gestion des cantons, bulletins de circulation, évitements et croisements en gares. | **Bloquant / Majeur** |
| **Maintenance & GMAO Matériel** | Limité à la composition des rames voyageurs | Gestion des révisions des locomotives (General Electric / EMD), maintenance des wagons trémies, suivi des essieux, des bogies et des stocks d'ateliers (Owendo/Booué). | **Majeur** |
| **Infrastructure & Travaux (PRN)** | **Inexistant** | Programme de Remise à Niveau de la voie (remplacement traverses bois par béton, géométrie, ballast, ouvrages d'art, caténaires/signalisation). | **Majeur** |
| **Finances & Comptabilité OHADA** | Simple export V65 vers SAGE X3 | Comptabilité générale SYSCOHADA révisé intégrée (classes 1 à 9), trésorerie, déclarations fiscales DGI Gabon (TVA 18%, CSS 1%, retenues à la source). | **Bloquant / Majeur** |
| **Ressources Humaines & Paie** | Simple table utilisateurs avec rôles | Gestion de plus de 1 500 agents cheminots, convention collective, roulements complexes 3x8, paie gabonaise (IRPP, TCS, cotisations CNSS et CNAMGS). | **Majeur** |
| **Bureautique & GED Entreprise** | **Inexistant** | Gestion électronique des documents, archivage probatoire, parapheur électronique de validation des ordres de mission/dépenses, messagerie et visio internes. | **Moyen / Structurant** |
| **Intelligence Artificielle Métier** | Présente uniquement en back-office pour assistants vocaux voyageurs | IA d'optimisation des sillons en voie unique, maintenance prédictive sur données de capteurs, assistant juridique et réglementaire (OHADA / Gabon). | **Différenciant / Stratégique** |

---

## 5. Recommandations Architecturales d'Évolution

Pour transformer `agent-web` sans perturber le fonctionnement de la billetterie existante, nous recommandons une architecture modulaire en **Plateforme Unifiée Multi-Métiers** :

1. **Adoption d'une Topbar de Navigation de Niveau Entreprise :**
   Intégrer un sélecteur de modules supérieur permettant de basculer instantanément entre les grands domaines fonctionnels :
   - 🎫 Billetterie & Voyageurs (Module actuel)
   - 🚂 Fret & Logistique Marchandises
   - 🚦 Exploitation & Régulation COTRAF
   - 🔧 Matériel Roulant & GMAO
   - 💼 Affaires Financières & OHADA
   - 👥 Ressources Humaines & Paie Gabon
   - 📁 Bureautique & Collaboration Unifiée
   - 🤖 IA Métier & Décisionnel (SETRAG Copilot)
2. **Modélisation d'un Schéma de Données Étendu dans Convex :**
   Compléter le schéma Convex (`packages/backend/convex/schema.ts`) avec des tables dédiées aux convois de fret, aux fiches matériels, aux comptes comptables SYSCOHADA, aux dossiers salariés et aux documents administratifs.
3. **Maintien du Régime Déconnecté pour les Postes de Ligne :**
   Étendre l'architecture hors-ligne (mise en œuvre avec succès sur `controleur-web`) aux gares et ateliers isolés du Haut-Ogooué et de l'Ogooué-Lolo pour les modules de maintenance et de pointage RH.
"""

with open("docs/etude-erp-setrag/01_AUDIT_PORTAIL_AGENT_EXISTANT.md", "w", encoding="utf-8") as f:
    f.write(content)

print("Document 01 généré avec succès.")
