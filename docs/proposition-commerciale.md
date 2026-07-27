# Proposition commerciale — Plateforme billettique SETRAG

> **Ébauche de travail** — les montants sont des structures de chiffrage à compléter,
> pas des prix engageants. Références : CDC « Projet Billettique » v1.2 du 02/07/2025
> (36 p.) et CDC « Applications Front-Office ».

---

## 1. Compréhension du besoin

La SETRAG a publié deux cahiers des charges complémentaires :

- **CDC « Projet Billettique »** — remplacement du système central MOBIPASS :
  vente en guichet des 5 produits voyageurs (billets, bagages, colis express,
  Train Auto Accompagné, transport funéraire), gestion des trains et des places,
  tarification (dont yield management), reporting, interface comptable SAGE X3 V12,
  exploitation sur 25 gares et 89 points de vente.
- **CDC « Applications Front-Office »** — canaux de vente directe : site web de
  billetterie, applications mobiles voyageur (Android/iOS) et application
  contrôleur (scan QR, procès-verbaux, encaissement d'amendes, mode hors-ligne).

Les problèmes du système actuel sont clairement identifiés dans le CDC : billets
falsifiables et non traçables, double émission indétectable, attribution manuelle
des places, paiement limité au cash, aucun contrôle en ligne, données non
protégées, plan de reprise non testé.

**Notre lecture structurante : ces deux lots forment un seul système.**
L'inventaire de places par segment, le moteur tarifaire (dont le yield management)
et le journal comptable sont indivisibles entre la vente au guichet, la vente en
ligne et le contrôle à bord. Nous proposons donc une plateforme unifiée exposant
les deux périmètres, plutôt que deux systèmes reliés par des interfaces — c'est
la condition pour éliminer structurellement la survente, la double émission et
les écarts de caisse.

---

## 2. Notre offre

### Lot 1 — Système central de billettique (back-office)

| Module | Contenu (terminologie CDC) |
|---|---|
| Vente guichet | 5 produits : billet voyageur, bagages (0–30 kg), colis express, TAA, transport funéraire ; édition papier et numérique avec identifiant unique et QR code |
| Trains & places | Création des trains (EXPRESS / OMNIBUS / SPECIAL), voitures et classes (1re / 2e / VIP), blocage/déblocage de places, inventaire transactionnel anti-survente |
| Points de vente | 89 points de vente sur 25 gares, quotas par date / type / numéro de train, agences accréditées et premium |
| Tarification | Barèmes kilométriques, réductions (enfants 50 %, groupes 30–45 %, militaires 10 %), abonnements, arrondis 10/50/100 F, **yield management complet** (modulation au remplissage, quotas tarifaires, ajustement temps réel, indicateurs recette/siège) |
| Livrets horaires | Cycle de vie complet : création, approbation, import en masse, export |
| Comptabilité | Génération des écritures et du dossier comptable (état V65), **interface SAGE X3 V12**, taxes TVA et CSS, axes analytiques |
| Contrôle & reporting | États de caisse, traçabilité des places et des ventes, tableau de bord passagers, KPI, exports |
| Mode dégradé | Vente manuelle avec rattrapage numéroté en cas de coupure |
| Administration | Utilisateurs et profils (RBAC), paramétrage complet (taxes, délais, motifs, modèles d'impression et d'email) |

### Lot 2 — Front-office

| Application | Contenu |
|---|---|
| Billetterie web | Recherche d'itinéraire, sélection train/classe/options, paiement en ligne, billet PDF + QR code, compte client, annulation/modification selon CGV, tarification dynamique |
| Mobile voyageur (Android + iOS) | Mêmes parcours que le web, billets disponibles hors-ligne, notifications push (rappels de départ, retards, annulations), application légère adaptée aux réseaux 3G |
| Application contrôleur | Scan QR de validation, **mode hors-ligne obligatoire** (tunnels, zones blanches de l'axe Owendo–Franceville) avec synchronisation différée, procès-verbaux, encaissement des amendes, signalement d'incidents, historique des contrôles, autonomie batterie une journée, mises à jour OTA |
| Back-office ventes en ligne | Tableau de bord ventes et contrôles, statistiques par ligne/train/période, exports |

### Socle commun

- Backend temps réel unique : une seule source de vérité pour les places, les
  tarifs et les ventes, quel que soit le canal.
- Paiements : **Airtel Money, Moov Money, Click&Pay** (mobile money), **VISA /
  MASTERCARD**, espèces au guichet — avec réconciliation automatique des
  encaissements par canal.
- Sécurité conforme aux exigences des deux CDC : SSO Active Directory
  (SAML 2 / OIDC), MFA généralisé (2FA obligatoire côté contrôleurs), RBAC et
  moindre privilège, TLS 1.2+ / AES-256, protections OWASP Top 10, journalisation
  intégrable SIEM, accès administratifs par bastion, tests d'intrusion réguliers.
  Alignement sur les annexes cybersécurité DSIG-SSI / référentiel ERAMET (à
  instruire dès réception des annexes).
- Mode SaaS avec disponibilité ≥ 99,9 %, émission de billet < 4 s, connexion
  SSO < 2 s, plan de reprise d'activité testé.

---

## 3. Ancrage dans le marché gabonais

Notre conception part des réalités d'usage au Gabon, pas d'un modèle européen
transposé :

**Le mobile money est le moyen de paiement dominant.** 368 millions
d'opérations pour 4 087 milliards FCFA en 2024 (+17 % sur un an). Les parcours
d'achat placent donc Airtel Money et Moov Money en premier choix, la carte
bancaire en second — l'inverse des billetteries européennes. L'intégration
respecte l'instruction BEAC n°001/GR/2024 (authentification, gestion
d'incidents) et s'inscrit dans l'interopérabilité GIMAC.

**Le guichet et le cash restent structurants.** Avec ~285 000 voyageurs/an et
une clientèle en partie non bancarisée le long de l'axe, la vente au guichet en
espèces (Lot 1) reste le canal principal à court terme ; le front-office la
complète sans la remplacer. Les états de caisse et le contrôle des recettes sont
traités comme des fonctions de premier rang.

**La connectivité est bonne en ville, incertaine le long de la voie.**
71,9 % de pénétration internet (janv. 2025) et 88 % des connexions mobiles en
haut débit, mais la couverture le long des 648 km Owendo–Franceville n'est pas
garantie : applications légères, tolérantes aux réseaux 3G, billets consultables
hors connexion, et mode hors-ligne complet pour les contrôleurs.

**Conformité locale.** Au-delà de la conformité RGPD exigée par les CDC, la
solution respecte la loi gabonaise n°025/2023 sur la protection des données
personnelles et se déclare auprès de l'**APDPVP** (Autorité pour la Protection
des Données Personnelles et de la Vie Privée). Fiscalité intégrée nativement :
TVA et CSS paramétrées dans le moteur tarifaire et le journal comptable.

**Un trafic appelé à croître.** L'objectif public de 330 000 voyageurs/an à
l'horizon 2026-2027 (+27 % vs 2022) et la modernisation de la voie justifient
une plateforme scalable, dimensionnée pour les pics (fêtes, vacances) — et le
yield management demandé par le CDC pour maximiser la recette par train.

---

## 4. Démarche et calendrier

Le CDC billettique fixe un délai de réalisation de **6 mois** jusqu'à la mise en
exploitation. Nous proposons un phasage qui sécurise ce délai en livrant par
paliers utilisables :

| Phase | Durée | Contenu | Jalons |
|---|---|---|---|
| 0. Cadrage | 3 sem. | Étude de l'existant MOBIPASS, spécifications fonctionnelles détaillées, instruction des annexes cyber, reprise des données | PV de liaison, specs validées |
| 1. Cœur billettique | 2 mois | Trains/places/tarifs, vente guichet des 5 produits, billets QR, mode dégradé | Pilote sur 2 gares (Owendo, Franceville) |
| 2. Gestion & comptabilité | 1,5 mois | Reporting, états de contrôle, interface SAGE X3 V12, livrets horaires, yield management | Recette comptable sur un mois de ventes |
| 3. Front-office | 2 mois (en parallèle de la phase 2) | Web billetterie, apps voyageur iOS/Android, app contrôleur, paiements en ligne | UAT, publication stores |
| 4. Déploiement | 1 mois | Équipement des 19 gares opérationnelles (puis Alembe, Lifouta, Bissouma à moyen terme), formation, bascule MOBIPASS | PV de mise en production |
| 5. Vie courante | 6 mois inclus | Maintenance, dépannage, ajustements terrain (exigence CDC) | Comité mensuel |

Recette conforme au CDC front-office : plan de tests, scénarios UAT,
environnement de préproduction, recette technique et fonctionnelle avant toute
mise en production.

---

## 5. Livrables

Conformes aux listes des deux CDC : étude de l'existant, spécifications
fonctionnelles, exigences, architecture logicielle, guide utilisateur, manuel
technique, procès-verbaux (liaison, recette, mise en production), documentation
des API (formats JSON/XML).

---

## 6. Formation, maintenance, engagements

- **Formation** : sessions techniques (IT) et fonctionnelles (guichetiers,
  superviseurs, comptables, contrôleurs), avec accompagnement des agents en gare
  comme demandé au CDC.
- **Maintenance** : corrective et évolutive sous SLA ; 6 premiers mois après
  mise en production inclus (paramétrage selon réalités terrain, dépannage).
  Support hotline + ticketing. Au-delà : contrat de tierce maintenance
  applicative annuel.
- **Propriété intellectuelle** (exigence CDC front-office) : licence
  perpétuelle, irrévocable et exclusive accordée à la SETRAG ; remise du code
  source complet et documenté, tenu à jour des versions en production, avec
  droit de modification par la SETRAG ou tout tiers mandaté.
- **Réversibilité** (exigence CDC billettique) : restitution intégrale des
  données en formats ouverts (CSV, JSON, XML), assistance à migration d'au moins
  3 mois, attestation d'effacement en fin de transfert.

---

## 7. Proposition tarifaire

### 7.1 Méthode de chiffrage

Le chiffrage est construit en jours-homme à partir du périmètre détaillé des
deux CDC (57 écrans maquettés : 26 back-office, 10 billetterie web, 10 mobile
voyageur, 11 contrôleur), valorisés à un **TJM mixte de 250 000 FCFA HT**
(~380 €), positionnement cohérent avec les taux pratiqués par les ESN servant
les grands comptes en Afrique francophone.

Notre chaîne de production est **augmentée par l'IA** (génération et revue de
code assistées, tests automatisés, documentation) : à périmètre égal, les
charges sont réduites d'environ 25 % par rapport à un chiffrage classique.
Cette productivité est répercutée intégralement dans les prix ci-dessous — et
c'est aussi elle qui sécurise le délai de 6 mois fixé par le CDC. Les
engagements de qualité restent inchangés : chaque livraison passe revue
humaine, tests et recette contractuelle.

### 7.2 Deux formules au choix

#### Formule A — une seule plateforme

Pour une attribution lot par lot :

| Offre | Contenu | Charge | Montant HT (FCFA) | ≈ EUR |
|---|---|---:|---:|---:|
| **A1 — Billettique centrale seule (Lot 1)** | Socle backend complet (places, tarifs/yield, SAGE X3, paiements, SSO/MFA) + back-office web 26 écrans + API front-office documentée pour un prestataire tiers + cadrage, recette, déploiement 19 gares, formation | 231 j | 58 000 000 | 88 400 |
| **A2 — Front-office seul (Lot 2)** | Billetterie web + app voyageur (Android/iOS) + app contrôleur (Android/iOS) + intégration à l'API back-office d'un prestataire tiers + cadrage, recette, publication stores, formation | 227 j | 57 000 000 | 86 900 |

#### Formule B — plateforme complète (recommandée)

Les deux lots réalisés comme un seul système, socle mutualisé, une seule
gouvernance et une seule recette :

| Poste | Contenu | Charge | Montant HT (FCFA) | ≈ EUR |
|---|---|---:|---:|---:|
| Socle backend & sécurité | Inventaire transactionnel des places, moteur tarifaire + yield management, comptabilité SAGE X3 V12, paiements (Airtel Money, Moov Money, Click&Pay, VISA/MC), SSO AD + MFA, journalisation SIEM | 90 j | 22 500 000 | 34 300 |
| Back-office web | 26 écrans : vente guichet 5 produits, trains/places, points de vente, livrets horaires, tarifs, reporting/KPI, états de contrôle, mode dégradé, administration | 96 j | 24 000 000 | 36 600 |
| Billetterie web | 10 écrans : recherche, réservation, paiement en ligne, billets QR/PDF, compte client, annulation/modification | 44 j | 11 000 000 | 16 800 |
| App mobile voyageur (Android + iOS) | 10 écrans : parcours d'achat complet, billets hors-ligne, notifications push, publication stores | 52 j | 13 000 000 | 19 800 |
| App contrôleur (Android + iOS) | 11 écrans : scan QR, **mode hors-ligne avec synchronisation différée**, procès-verbaux, encaissement amendes, signalements, historique, MAJ OTA | 68 j | 17 000 000 | 25 900 |
| Transverse | Cadrage et spécifications, recette (UAT, préproduction), reprise de données MOBIPASS, déploiement 19 gares, formation, gestion de projet | 70 j | 17 500 000 | 26 700 |
| **Total Formule B** | | **420 j** | **105 000 000** | **160 100** |

**L'offre groupée économise ~10 M FCFA** par rapport aux deux plateformes
prises séparément (A1 + A2 = 115 M FCFA) : socle mutualisé, une seule phase de
cadrage et de recette, pas d'interface à négocier entre deux prestataires. Elle
supprime aussi le principal risque projet du scénario A : la coordination de
deux fournisseurs autour d'une même API (places, tarifs, contrôle).

Échéancier (les deux formules) : 30 % au démarrage, 15 % par phase sur PV
(4 phases), 10 % à la recette définitive.

### 7.3 Récurrent annuel (OPEX)

Pour la Formule B :

| Poste | Contenu | Montant annuel HT (FCFA) | ≈ EUR |
|---|---|---:|---:|
| Abonnement SaaS | Hébergement, disponibilité ≥ 99,9 %, supervision et alerting, sauvegardes, PRA testé, mises à jour de sécurité, support hotline/ticketing | 18 000 000 (1 500 000/mois) | 27 400 |
| TMA & évolutions | Maintenance corrective sous SLA + banque de 30 j d'évolutions ; démarre après les 6 mois inclus au forfait | 18 000 000 | 27 400 |
| **Total récurrent** | | **36 000 000** | **54 900** |

La TMA représente ~17 % du forfait de réalisation, dans la norme du marché
(15–25 %/an constatés). En Formule A (un seul lot), le récurrent est ramené au
prorata du périmètre exploité : **A1 : 22 M FCFA/an** (SaaS 1,1 M/mois + TMA
18 j) ; **A2 : 20 M FCFA/an** (SaaS 1,0 M/mois + TMA 16 j).

### 7.4 Options

| Option | Modèle | Indication |
|---|---|---|
| Commission sur ventes en ligne | % par transaction web/mobile, en substitution partielle de l'abonnement SaaS | 1,5 % par transaction (les frais d'agrégateur — ex. SingPay : 2,5 % au-delà de 25 M FCFA cumulés — restent à la charge de la SETRAG) |
| Terminaux contrôleurs | Fourniture et MDM des terminaux durcis Android | Sur devis selon volume (~15–25 terminaux) |
| Notifications SMS | Passerelle SMS pour la clientèle sans smartphone (confirmation d'achat, retards) | Forfait d'intégration 4 000 000 FCFA + coût opérateur au SMS |

### 7.5 Hypothèses de chiffrage

1. Les montants de la Formule B supposent l'attribution conjointe des deux
   lots (socle mutualisé) ; ceux de la Formule A supposent l'existence d'une
   API documentée côté prestataire tiers (A2) ou sa réalisation par nos soins
   (A1).
2. Les annexes cybersécurité DSIG-SSI/ERAMET ne modifient pas substantiellement
   l'architecture (à confirmer à leur réception ; sinon avenant).
3. Les contrats d'agrégation de paiement sont souscrits par la SETRAG ; nous
   réalisons l'intégration technique.
4. Reprise de données MOBIPASS limitée aux référentiels et à 24 mois
   d'historique de ventes.
5. Équipements en gare (imprimantes, terminaux) fournis par la SETRAG sauf
   option 7.4.
6. Montants HT, hors TVA et CSS ; parité utilisée 1 € = 655,957 FCFA.

---

## 8. Points à clarifier avant chiffrage ferme

1. **Annexes cybersécurité** DSIG-SSI (CDC Cyber Front, annexe contrat v2.6,
   questionnaires PRA/SaaS) : à obtenir pour intégrer leurs exigences au forfait.
2. **Volumes front-office cibles** (part de ventes en ligne attendue) : absents
   du CDC, ils dimensionnent l'infrastructure de paiement.
3. **Contrats d'agrégation de paiement** : qui contracte avec Airtel/Moov/
   Click&Pay et l'acquéreur carte — SETRAG ou prestataire ?
4. **Reprise de données MOBIPASS** : profondeur d'historique à reprendre.
5. **Équipements en gare** (imprimantes billets/étiquettes, terminaux
   contrôleurs) : inclus ou fournis par la SETRAG.
6. **Couverture réseau le long de la voie** : à vérifier avec l'ARCEP/les
   opérateurs pour calibrer la synchronisation hors-ligne.
7. **Calendrier front-office** : le CDC front-office n'en fixe pas ; nous
   proposons l'alignement sur les 6 mois du lot billettique (cf. §4).

---

## Sources marché citées

- Mobile money 2024 : Gabonreview / AfriqueITNews (368,3 M d'opérations,
  4 087 Mds FCFA).
- Internet : DataReportal, Digital 2025 Gabon (71,9 % de pénétration) ; ARCEP,
  observatoire mobile T1 2025.
- Trafic et objectif 330 000 voyageurs : Agence Ecofin, Gabonreview ;
  volumes détaillés 2020-2024 : annexe 1 du CDC billettique (p. 29).
- Réglementation : loi n°025/2023, APDPVP ; instruction BEAC n°001/GR/2024.
