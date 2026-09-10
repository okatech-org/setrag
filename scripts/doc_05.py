# -*- coding: utf-8 -*-

content = """# Document 05 — Cadre Réglementaire, Normes Comptables OHADA et Conformité Juridico-Fiscale Gabonaise

**Projet :** SETRAG Enterprise Operating System (SI Intégré Ferroviaire)  
**Entité :** Société d'Exploitation du Transgabonais (SETRAG) — République Gabonaise  
**Référence :** REGUL-OHADA-GABON-2026-V1.0  
**Date d'étude :** Septembre 2026  
**Expertise :** Droit des Affaires OHADA, Fiscalité DGI Gabon & Droit Social Gabonais  

---

## 1. Introduction & Périmètre Réglementaire

En tant qu'entreprise concessionnaire de service public opérant en République Gabonaise, la SETRAG est soumise à un triple cadre réglementaire contraignant :
1. **Le Droit Comptable OHADA (SYSCOHADA révisé)**, régissant la tenue des comptes, l'auditabilité et les états financiers annuels.
2. **Le Code Général des Impôts (CGI) du Gabon**, géré par la Direction Générale des Impôts (DGI).
3. **Le Code du Travail de la République Gabonaise (Loi n°022/2021)** et la Convention Collective Ferroviaire régissant les relations sociales, les salaires et la protection sociale (CNSS / CNAMGS).

Ce document définit les règles de gestion impératives que le futur Système d'Exploitation SETRAG doit intégrer de façon native dans ses modules Financiers et Ressources Humaines.

---

## 2. Normes Comptables : SYSCOHADA Révisé

Le système doit implémenter le plan comptable général du **SYSCOHADA révisé** adapté aux spécificités de l'exploitation ferroviaire :

```
                        ARCHITECTURE DU PLAN COMPTABLE SYSCOHADA SETRAG
===================================================================================================
 CLASSE 1 : Capitaux Propres & Ressources Durables (Capital social, Emprunts AFD/SFI, Provisions PRN)
 CLASSE 2 : Actifs Immobilisés (Voies PK 0-648, Ouvrages d'art, Locomotives GE/EMD, Rames, Gares)
 CLASSE 3 : Stocks & En-cours (Pièces de rechange ateliers, Traverses béton, Rails neufs, Gazole)
 CLASSE 4 : Comptes de Tiers (Clients Fret COMILOG, Chargeurs Bois, DGI TVA/CSS, Fournisseurs)
 CLASSE 5 : Comptes de Trésorerie (Comptes BGFI/UGB, Caisses gares FCFA, Portefeuilles Airtel/Moov)
 CLASSE 6 : Charges des Activités Ordinaires (Carburant traction, Maintenance, Salaires cheminots)
 CLASSE 7 : Produits des Activités Ordinaires (Recettes Fret Minier, Fret Bois, Billetterie, Sillons)
 CLASSE 8 : Autres Charges et Produits (Résultats exceptionnels, Cessions de matériels réformés)
 CLASSE 9 : Comptabilité Analytique & Engagements (Coûts au train-kilomètre, Rentabilité par gare)
===================================================================================================
```

### 2.1 Spécificités Ferroviaires des Immobilisations (Classe 2)
- **Découpage par composants selon SYSCOHADA :**
  - Plateforme ferroviaire et terrassements (durée de vie 50 à 100 ans).
  - Traverses en béton bibloc (durée de vie 40 ans) vs traverses en bois (10 à 15 ans).
  - Rails 50 kg/m ou 60 kg/m (amortissement à la tonne-kilomètre brute remorquée - TKBR).
  - Locomotives de ligne : Amortissement séparé du châssis, du moteur thermique et des bogies.

### 2.2 États Financiers Annuels Obligatoires (Liasse Fiscale OHADA)
Le système doit générer automatiquement en un clic :
1. **Le Bilan Annuel** (Actif / Passif).
2. **Le Compte de Résultat** (avec calcul automatique de la Valeur Ajoutée, de l'EBE et du Résultat d'Exploitation).
3. **Le Tableau des Flux de Trésorerie (TFT)** selon la méthode directe ou indirecte.
4. **Les 36 Notes Annexes Normalisées**, notamment la Note 3 (Immobilisations) et la Note 16 (Détail des dettes financières PRN).

---

## 3. Fiscalité de la République Gabonaise (DGI)

Le module Financier intègre les moteurs de calcul automatique de la fiscalité gabonaise en vigueur :

| Taxe / Impôt | Taux Applicable | Base d'Imposition | Règles de Gestion & Écritures SI |
|---|---|---|---|
| **TVA (Taxe sur la Valeur Ajoutée)** | **18 %** (Taux normal) | Prestations de transport fret et billets voyageurs | - Facturation avec mention obligatoire du NIF.<br>- Gestion du précompte TVA pour les grands comptes.<br>- Établissement de la déclaration mensuelle DGI (Formulaire e-tax). |
| **CSS (Contribution Spéciale de Solidarité)** | **1 %** | Chiffre d'affaires hors taxes taxable | - Calcul automatique sur chaque facture de fret et billet voyageur.<br>- Non récupérable (collectée pour le compte de l'État). |
| **Retenue à la Source (RAS) Prestations Locales** | **9,5 %** | Factures de sous-traitants gabonais ne justifiant pas d'une attestation de non-retenue | - Retenue automatique au moment du paiement fournisseur.<br>- Reversement mensuel au Trésor Public gabonais avec état récapitulatif. |
| **Retenue à la Source Prestataires Étrangers** | **20 %** | Prestations d'assistance technique, licences logicielles, révisions moteurs hors zone CEMAC | - Application des conventions fiscales bilatérales pour éviter la double imposition. |
| **Précompte TVA** | **100 % ou 50 %** | Montant de la TVA facturée par les prestataires de la SETRAG | - La SETRAG est habilitée par la DGI comme collecteur direct du précompte TVA sur ses fournisseurs. |
| **Impôt sur les Sociétés (IS)** | **30 %** (ou taux de convention d'établissement) | Résultat fiscal après réintégrations et déductions | - Calcul prévisionnel des acomptes trimestriels et liquidation annuelle au 30 avril. |

---

## 4. Droit Social, Paie et Charges du Gabon (Code du Travail & Sécurité Sociale)

Le module RH et Paie garantit le respect scrupuleux du Code du Travail gabonais (Loi n°022/2021) pour l'ensemble des 1 500+ cheminots :

```
                          STRUCTURE DU BULLETIN DE PAIE GABONAIS SETRAG
===================================================================================================
 SALAIRE DE BASE (Grille indiciaire convention collective)
 + Primes de Fonction & Technicité ferroviaire
 + Primes de Sujétion (Travail de nuit, travail en milieu isolé / brousse)
 + Primes de Traction (Calculée au train-kilomètre pour les conducteurs)
 + Heures Supplémentaires (Majorations 125 %, 150 % et 200 % selon le Code du Travail)
 = SALAIRE BRUT TOTAL
 --------------------------------------------------------------------------------------------------
 DÉDUCTIONS SOCIALES SALARIALES :
 - CNSS Vieillesse / Retraite : 2,5 % du salaire brut plafonné à 1 500 000 FCFA
 - CNAMGS Assurance Maladie : 1 % à 2,5 % du salaire brut selon le collège
 --------------------------------------------------------------------------------------------------
 DÉDUCTIONS FISCALES SALARIALES :
 - TCS (Taxe Complémentaire sur les Salaires) : 5 % du brut imposable
 - IRPP (Impôt sur le Revenu des Personnes Physiques) : Barème progressif avec QUOTIENT FAMILIAL
 --------------------------------------------------------------------------------------------------
 = SALAIRE NET À PAYER AU CHEMINOT (Virement bancaire ou Airtel/Moov Money)
 ==================================================================================================
 CHARGES PATRONALES SETRAG :
 - CNSS Prestations Familiales : 8 % (plafond 1 500 000 FCFA)
 - CNSS Accidents du Travail & Maladies Pro : 3 % à 5 % (Risque ferroviaire)
 - CNSS Retraite Patronale : 5 % (plafond 1 500 000 FCFA)
 - CNAMGS Patronale : 4,1 % à 5 %
===================================================================================================
```

### 4.1 Mécanisme du Quotient Familial Gabonais pour l'IRPP
L'IRPP gabonais applique un barème par tranches après division du revenu imposable par le nombre de parts du foyer :
- Célibataire, divorcé sans enfant : **1 part**
- Marié sans enfant : **2 parts**
- Par enfant à charge : **0,5 part supplémentaire** (plafonné à 6 parts au total).
Le moteur de calcul RH intègre nativement cette formule avec le barème officiel de la DGI Gabon.

### 4.2 Réglementation Spécifique du Travail Ferroviaire Roulant
- **Durée de Conduite Continue :** Limitation stricte à 6 heures consécutives de conduite de locomotive de ligne sans pause.
- **Gestion des Découchés :** Enregistrement des nuits passées hors de la gare d'attache (dans les cités cheminotes de Booué ou Franceville) donnant droit à l'indemnité forfaitaire de découché et au repos compensateur obligatoire avant reprise de convoi.
"""

with open("docs/etude-erp-setrag/05_CONFORMITE_OHADA_FISCALITE_DROIT_GABON.md", "w", encoding="utf-8") as f:
    f.write(content)

print("Document 05 généré avec succès.")
