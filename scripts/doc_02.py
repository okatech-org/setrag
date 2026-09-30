# -*- coding: utf-8 -*-

content = """# Document 02 — Étude Approfondie des Métiers du Rail et Typologie des Transports de la SETRAG au Gabon

**Projet :** SETRAG Enterprise Operating System (SI Intégré Ferroviaire)  
**Entité :** Société d'Exploitation du Transgabonais (SETRAG) — République Gabonaise  
**Référence :** ETUDE-FRET-SET-2026-V1.0  
**Date d'étude :** Septembre 2026  
**Expertise :** Ingénierie des Transports Lourds & Économie Ferroviaire Gabonaise  

---

## 1. Vue d'Ensemble du Réseau Transgabonais

Le chemin de fer **Transgabonais** est l'unique ligne ferroviaire de la République Gabonaise. Longue de **648 kilomètres** en voie unique à écartement standard (1 435 mm), elle relie le port en eau profonde d'**Owendo** (banlieue sud de Libreville) à la gare terminus de **Franceville** (chef-lieu de la province du Haut-Ogooué), en traversant cinq provinces stratégiques : l'Estuaire, le Moyen-Ogooué, l'Ogooué-Ivindo, l'Ogooué-Lolo et le Haut-Ogooué.

```
       CARTE SYNOPTIQUE DE L'AXE FERROVIAIRE DU TRANSGABONAIS (648 KM)
=============================================================================
 [PK 0] OWENDO (Ports minéralier/commercial, Ateliers centraux, Siège SETRAG)
   |
 [PK 35] NKOK (Zone Économique Spéciale / ZES - Déchargement Grumes)
   |
 [PK 182] NDJOLÉ (Gare de transit, fleuve Ogooué, bifurcation forestière)
   |
 [PK 252] LOPÉ (Traversée du Parc National de la Lopé, zone UNESCO)
   |
 [PK 338] BOOUÉ (Centre névralgique de régulation et relais traction)
   |
 [PK 485] LASTOURSVILLE (Bassin forestier et carrières)
   |
 [PK 608] MOANDA (Gisement de manganèse COMILOG / Plateau de Bangombé)
   |
 [PK 648] FRANCEVILLE (Terminus sud-est, hub logistique frontalier)
=============================================================================
```

Bien que le grand public connaisse principalement la SETRAG à travers ses trains de passagers, **le modèle économique de la société repose à plus de 80 % sur le transport lourd de marchandises (fret minier, forestier et conteneurs)**.

---

## 2. Le Fret Minier (Manganèse) : Le Poumon Économique

### 2.1 Contexte et Acteurs
Le Gabon est le **2e producteur mondial de manganèse** à haute teneur, extrait par la **COMILOG** (Compagnie Minière de l'Ogooué, filiale du groupe Eramet et actionnaire à 51 % de la SETRAG) sur le plateau de Bangombé à Moanda. L'évacuation de ce minerai vers le marché mondial est **100 % tributaire du Transgabonais**.

### 2.2 Caractéristiques des Convois Minéraliers
- **Volume annuel :** Entre 4 et 7 millions de tonnes de minerai transportées par an.
- **Composition type d'un train minéralier :**
  - **Traction :** 2 à 3 locomotives diesel-électriques de forte puissance (3 300 à 4 400 ch type General Electric GT46MAC ou EMD).
  - **Matériel remorqué :** 84 à 100+ wagons trémies spéciaux (wagons à déchargement par le fond ou rotatifs).
  - **Masse brute d'un convoi :** 8 000 à 10 000 tonnes (parmi les trains les plus lourds d'Afrique subsaharienne).
  - **Charge à l'essieu :** 21 à 25 tonnes par essieu, soumettant la plateforme et les rails à une fatigue mécanique extrême.

### 2.3 Processus Opérationnel & Besoins Système (Module Fret Minier)
1. **Planification & Ordre d'Expédition :** Émission du programme hebdomadaire d'expédition par la COMILOG en liaison avec le planning des minéraliers au port d'Owendo.
2. **Pesage Dynamique en Gare de Chargement (Moanda) :** Détection en marche de la charge par essieu et de la tare pour éviter les surcharges dangereuses pour la voie.
3. **Traçabilité en Ligne & Suivi GPS :** Contrôle de la progression du convoi par le COTRAF (Contrôle Trafic), gestion des créneaux de croisement avec les autres trains.
4. **Réception et Déchargement au Port Minéralier d'Owendo (GSEZ/COMILOG) :** Basculeurs de wagons, retournement des rames et contrôle des temps de rotation (*turnaround time*).
5. **Facturation au Tonnage/Kilomètre :** Application des conventions tarifaires cadre minières, intégrant les bonus/malus d'efficacité et la taxe de passage d'infrastructure.

---

## 3. Le Fret Forestier (Bois en Grumes et Débité)

### 3.1 Contexte Industriel Gabonais
Depuis l'interdiction d'exporter des grumes brutes non transformées décidée en 2010 par le Gabon, la filière bois a connu une mutation radicale. Le Transgabonais achemine :
- Les grumes depuis les concessions forestières de l'intérieur (Booué, Lastoursville, Ndjolé) vers les usines de sciage et de placage de la **Zone Économique Spéciale (ZES) de Nkok (GSEZ)**.
- Les conteneurs de bois ouvré (contreplaqué, bois de sciage raboté) depuis Nkok vers le port commercial d'Owendo pour l'export.

### 3.2 Acteurs de la Filière
Les grands exploitants et industriels du bois : **Rougier Gabon, Precious Woods, BSO, SNBG, Thebault**, et les dizaines d'entreprises installées à Nkok.

### 3.3 Caractéristiques Opérationnelles
- **Matériel roulant :** Wagons plats spécialisés équipés de ranchers amovibles ou fixes, et wagons porte-conteneurs.
- **Réglementation & Traçabilité :** Contrôle strict des cubages (système de mesure des billes au diamètre/longueur), vérification des autorisations légales d'abattage (Bordereaux de Suivi Forestier délivrés par le Ministère des Eaux et Forêts) et certificats phytosanitaires.
- **Besoins Système du Module Bois :**
  - Gestion du cubage commercial (formule de Brereton ou volume cylindrique en m3).
  - Intégration de l'identifiant unique de chaque bille (code barre forestier) dans la lettre de voiture ferroviaire.
  - Gestion des parcs à bois des gares de chargement (Lastoursville, Booué) avec inventaire des stocks en attente de mise sur wagon.

---

## 4. Le Fret d'Hydrocarbures et de Marchandises Diverses

### 4.1 Transport des Produits Pétroliers
Le Gabon consomme ses hydrocarbures raffinés (carburants, gazole, kérosène) qui proviennent de la raffinerie de Port-Gentil (SOGARA), acheminés par cabotage jusqu'à Owendo, puis dispatchés par le rail vers l'intérieur du pays.
- **Acteurs :** GOC (Gabon Oil Company), TotalEnergies Marketing Gabon, PetroGabon, Engen.
- **Matériel :** Wagons citernes sécurisés aux normes TMD (Transport de Marchandises Dangereuses).
- **Enjeux :** Suivi strict des jauges de remplissage, purge des citernes, certification des soupapes et prévention des risques d'explosion ou d'incendie en milieu équatorial.

### 4.2 Transport de Marchandises Générales et Conteneurs
- **Matériaux de construction :** Cimenterie d'Owendo (Cimgabon) approvisionnant le Haut-Ogooué en ciment pour les chantiers d'infrastructure.
- **Conteneurs maritimes (EVP) :** Équipements industriels lourds, intrants chimiques pour les mines, biens de grande consommation destinés aux supermarchés de Moanda et Franceville.
- **Interfaces :** Opérateurs portuaires (OPRAG, GSEZ Ports, AGL - Africa Global Logistics / MSC, Bolloré).

---

## 5. Le Transport de Voyageurs : Un Rôle Social Vital

Bien que déficitaire au plan purement financier, le service passagers est **stratégique et obligatoire** au titre de la concession signée avec l'État gabonais. Il assure le désenclavement total de bassins de vie inaccessibles par la route lors des saisons des pluies.
- **Trafic :** Environ 280 000 à 330 000 passagers transportés par an.
- **Régimes de trains :**
  - **Train Express :** Dessert les gares principales en reliant Owendo à Franceville en ~12 heures.
  - **Train Omnibus :** Dessert les 24 gares et arrêts de brousse pour le ravitaillement des populations rurales.
- **Services complémentaires intégrés :**
  - Messagerie et Colis Express (transport vital de plis officiels, médicaments, denrées fraîches).
  - Train Auto Accompagné (TAA) permettant aux usagers de transporter leurs véhicules 4x4 entre Libreville et l'intérieur.
  - Transport funéraire (mission sociale essentielle au Gabon pour le retour des défunts dans leurs provinces natales).

---

## 6. La Contrainte Majeure : L'Exploitation en Voie Unique

L'ensemble de ces trafics hétérogènes (trains minéraliers ultralourds de 10 000 tonnes, trains de grumes, trains voyageurs rapides, trains de travaux PRN) circule sur **une seule et même voie de 648 km**.

```
                           RÈGLES DE GESTION DU CROISEMENT EN VOIE UNIQUE
===================================================================================================
 GARE DE CROISEMENT (Ex: Gare de Booué)
 --------------------------------------------------------------------------------------------------
   Voie Principale   ===> [ Train Minier Chargé 8 000 t ] ===> (Priorité inertie, arrêt coûteux)
   Voie d'Évitement  ===> [ Train Omnibus à l'arrêt     ] ===> (Attente dépassement ou croisement)
 --------------------------------------------------------------------------------------------------
 * Règle de priorité ferroviaire gabonaise :
   1. Train de Secours / Train de Travaux d'urgence
   2. Train Voyageurs Express
   3. Train Minéralier plein (Moanda -> Owendo)
   4. Train Voyageurs Omnibus
   5. Train de Grumes / Marchandises
   6. Train Minéralier vide (Owendo -> Moanda)
===================================================================================================
```

### Exigences pour le futur Système d'Exploitation SETRAG :
1. **Module Régulation & COTRAF :** Suivi graphique des circulations (graphique d'espace-temps numérique) pour anticiper les conflits de croisement.
2. **Gestion des Priorités Métier :** Arbitrage automatique par algorithme/IA entre l'engagement horaire des passagers et la fluidité des flux miniers d'exportation.
3. **Traçabilité des Retards & Litiges :** Imputation précise des causes d'arrêts (avarie locomotive, incident voie, dépassement de canton, fausse manœuvre d'aiguille).
"""

with open("docs/etude-erp-setrag/02_ETUDE_METIERS_TRANSPORTS_FRET_SETRAG.md", "w", encoding="utf-8") as f:
    f.write(content)

print("Document 02 généré avec succès.")
