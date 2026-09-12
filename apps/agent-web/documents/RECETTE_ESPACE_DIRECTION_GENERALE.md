# Dossier de recette — Espace Direction générale

| Élément | Valeur |
| --- | --- |
| Application | Portail Agent SETRAG, espace `/direction` |
| Environnement de recette | https://setrag-agent-web.vercel.app/direction |
| Compte à utiliser | Direction générale |
| Version | livraison du 13 septembre 2026 |
| Destinataire | Direction générale de la SETRAG |
| Émetteur | OkaTech, équipe produit |

## 1. Objet

Ce dossier permet à la Direction générale de valider son espace de pilotage. Il
présente ce qui est livré, les décisions déjà prises, les scénarios à dérouler
volet par volet et les questions d’orientation que seule la Direction générale
peut trancher. Il se termine par une grille de visa.

La séance dure environ 45 minutes. Chaque scénario se note « Conforme » ou
« Non conforme », avec une remarque au besoin.

## 2. Ce que l’espace garantit

- **Lecture seule.** Aucune action métier ne part de l’espace : il informe, il
  ne décide pas à la place des directions.
- **Provenance visible.** Chaque valeur porte l’un de six états écrits en
  toutes lettres : Opérationnel, Synthétique · non officiel, Aucune donnée,
  Non accessible, Non raccordé, Chargement.
- **Aucune valeur inventée.** Pas d’objectif, de seuil ni de chiffre de
  remplacement : une donnée absente est dite absente.
- **Habilitations respectées.** L’espace n’ouvre que ce que le compte a le
  droit de lire.

**Sur l’environnement de démonstration, toutes les données sont fictives, y
compris celles marquées « Opérationnel » (historique voyageurs généré).** La
recette porte sur la structure, la lisibilité et la justesse des états, pas
sur les montants.

## 3. Décisions déjà prises

Ces décisions sont appliquées. La recette les confirme ou les remet en cause.

| N° | Décision |
| --- | --- |
| D1 | L’espace est réservé au rôle Direction générale. |
| D2 | Incidents et procès-verbaux : la Direction générale lit une synthèse agrégée et anonyme (effectifs, gravité, montants). Les registres nominatifs (identités, descriptions, photos) restent aux fonctions de contrôle et de sécurité. |
| D3 | La Direction générale lit le remplissage par desserte et les blocages de places (réquisitions, délégations) : ces données ne sont pas nominatives. |
| D4 | La période par défaut couvre les 30 derniers jours. Elle s’applique aux sources datées (voyageurs, incidents, procès-verbaux) ; les autres sources sont des instantanés horodatés. |
| D5 | Le volet Activité suit l’organigramme de l’étude 03 (DEF, DCFV, DMAT, DINFRA), à confirmer. |
| D6 | La ligne affiche 669 km, valeur du référentiel des gares. La communication publique cite 648 km : la convention reste à homologuer. |

## 4. Scénarios de recette

### Vue d’ensemble

| N° | Action | Résultat attendu | Conforme |
| --- | --- | --- | --- |
| VE-01 | Se connecter avec le compte Direction générale. | L’accueil est la Vue d’ensemble ; l’en-tête affiche « Direction générale ». | ☐ |
| VE-02 | Lire « Le point ». | Le nombre de signaux à arbitrer vient en tête, puis une phrase par source (dessertes du jour, ligne, sécurité à bord, voyageurs, fret, finance, continuité), chacune avec son état. | ☐ |
| VE-03 | Parcourir « La ligne ». | Les 23 gares d’Owendo à Franceville, les circulations avec leur retard écrit, les conflits nommés ; un tableau reprend les mêmes données. | ☐ |
| VE-04 | Choisir la période « Trimestre ». | Les chiffres voyageurs changent ; la période reste la même en ouvrant un autre volet. | ☐ |
| VE-05 | Ouvrir un signal de la liste « À arbitrer ». | Le volet qui détaille le signal s’ouvre. | ☐ |
| VE-06 | Refaire VE-02 à VE-05 sur un téléphone. | Le menu s’ouvre en tiroir ; « Le point » et les premiers signaux se lisent sans défilement horizontal. | ☐ |

### Activité et exploitation

| N° | Action | Résultat attendu | Conforme |
| --- | --- | --- | --- |
| AE-01 | Lire la section DEF. | Indicateurs de circulation, ligne complète, circulations, conflits et cantons contraints, dessertes du jour. | ☐ |
| AE-02 | Lire la section DCFV. | Fret (indicateurs, opérations, alertes) puis voyageurs (série, points de vente, produits) et remplissage par desserte avec la mention « Saturée au tronçon de pointe ». | ☐ |
| AE-03 | Lire les sections DMAT et DINFRA. | Mention « Non raccordé » et accès à la vue de démonstration, sans chiffre. | ☐ |

### Finances

| N° | Action | Résultat attendu | Conforme |
| --- | --- | --- | --- |
| FI-01 | Lire les recettes voyageurs. | Recettes nettes, remboursements, panier moyen, ventes, répartition par produit et par canal. | ☐ |
| FI-02 | Lire le journal comptable. | Lots validés, totaux débit et crédit, derniers lots, jeu de données signalé. | ☐ |
| FI-03 | Lire les règles fiscales et les prérequis. | Référentiel actif daté et sourcé ; prérequis non établis ; préparation des déclarations fermée. | ☐ |
| FI-04 | Lire trésorerie, budget et créances. | Mention « Non raccordé », aucun montant. | ☐ |

### Risques et continuité

| N° | Action | Résultat attendu | Conforme |
| --- | --- | --- | --- |
| RC-01 | Lire la continuité PCA/PRA. | Politiques, objectifs de reprise, état probant et écarts à traiter. | ☐ |
| RC-02 | Lire la santé du système. | Sévérité écrite en toutes lettres et constats de supervision. | ☐ |
| RC-03 | Lire les incidents et procès-verbaux. | Effectifs, incidents critiques non résolus, montants par statut ; aucune identité ni description. | ☐ |
| RC-04 | Lire les habilitations du compte. | Liste des modules et niveau d’accès de chacun. | ☐ |

### Décisions attendues

| N° | Action | Résultat attendu | Conforme |
| --- | --- | --- | --- |
| DA-01 | Lire les signaux à arbitrer. | Liste complète ; chaque signal mène à son volet. | ☐ |
| DA-02 | Lire les demandes de qualité de données. | Chaque source vide, non accessible ou non raccordée devient une demande avec sa direction responsable. | ☐ |
| DA-03 | Lire le raccordement des directions. | Tableau des sept directions, de leurs modules et de leur état. | ☐ |

## 5. Questions d’orientation

Ces questions conditionnent les prochaines évolutions. Une réponse par
question suffit ; « à étudier » est une réponse recevable.

| N° | Question | Réponse de la Direction générale |
| --- | --- | --- |
| Q1 | Les quatre chiffres de tête (recettes voyageurs nettes, billets émis, remplissage siège-km, tonnes en mouvement) sont-ils ceux qui orientent vos décisions ? Lesquels ajouter ou retirer ? | |
| Q2 | Quelles cibles fixer (remplissage, ponctualité à 5 minutes, traitement des incidents, recouvrement des procès-verbaux) ? Aucune cible n’est affichée tant qu’elle n’est pas fixée sur une situation de référence mesurée. | |
| Q3 | Dans quel ordre raccorder les domaines absents : paie et effectifs (DRH), parc matériel (DMAT), état de la voie et PRN (DINFRA), trésorerie et budget (DFC), registre de sécurité ARTF (DSED), facturation fret (DCFV) ? | |
| Q4 | L’espace doit-il s’ouvrir à d’autres lecteurs (Audit et risques, représentant de l’État, conseil d’administration), et avec quel niveau de détail ? | |
| Q5 | La synthèse agrégée des incidents suffit-elle, ou les incidents critiques doivent-ils remonter en détail à la Direction générale ? | |
| Q6 | Quelle période par défaut retenir : 30 jours, mois en cours ou trimestre ? | |
| Q7 | Quelle longueur de ligne officielle afficher : 648 km ou 669 km ? | |

## 6. Grille de visa

| Volet | Conforme | À ajuster | Non conforme | Observations |
| --- | --- | --- | --- | --- |
| Vue d’ensemble | ☐ | ☐ | ☐ | |
| Activité et exploitation | ☐ | ☐ | ☐ | |
| Finances | ☐ | ☐ | ☐ | |
| Risques et continuité | ☐ | ☐ | ☐ | |
| Décisions attendues | ☐ | ☐ | ☐ | |

**Conclusion de la recette :** ☐ espace validé en l’état · ☐ validé sous
réserve des ajustements notés · ☐ à reprendre.

| Pour la Direction générale | Pour OkaTech |
| --- | --- |
| Nom : | Nom : |
| Fonction : | Fonction : |
| Date : | Date : |
| Signature : | Signature : |
