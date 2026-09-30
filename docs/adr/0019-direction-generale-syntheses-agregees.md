# ADR-0019 — Direction générale : synthèses agrégées plutôt que registres nominatifs

**Statut :** accepté sous réserve de la recette Direction générale et d’une revue DSI, SSI et DPO
**Date :** 2026-09-13
**Portée :** matrice de droits, contrôle à bord, reporting, espace `/direction`

## Contexte

L’espace de pilotage de la Direction générale affichait trois sources « Non
accessible » : incidents à bord, procès-verbaux et remplissage par desserte.
Un dirigeant ferroviaire doit pourtant voir la sécurité à bord, la lutte contre
la fraude et la saturation des trains pour orienter l’exploitation.

Ces sources ne portent pas le même risque. Un procès-verbal contient l’identité
du contrevenant, son numéro de pièce et son téléphone. Un incident contient une
description libre, des photos et parfois une catégorie médicale. Le remplissage
par desserte ne contient aucune donnée personnelle : ce sont des sièges-kilomètres
par train et par classe.

`incidents` et `proces_verbaux` font partie des ressources à permission fine
(`FINE_PERMISSION_RESOURCES`) : un niveau modulaire n’y remplace jamais le RBAC.

## Décision

1. `direction_generale` reçoit `places` en consultation. Elle lit le remplissage
   par desserte (`reporting.occupancy`) et les blocages de places, dont les
   réquisitions et délégations, sans aucune écriture.
2. `direction_generale` ne reçoit ni `incidents` ni `proces_verbaux`. Les
   registres nominatifs restent aux fonctions de contrôle et de sécurité.
3. Une requête `control.networkSummary({ from, to })` produit une synthèse
   agrégée et anonyme de la période : effectifs par catégorie, gravité et statut
   pour les incidents, effectifs et montants par statut et par motif pour les
   procès-verbaux. Elle ne rend ni identité, ni description, ni photo, ni train,
   ni gare, ni date détaillée.
4. La synthèse est gardée par la lecture du module Sécurité (`assertCan`,
   ressource `securite`). Une vue réseau exige une portée globale : une
   affectation limitée à un site reçoit un résultat « restreint », sans lecture
   des registres.
5. La lecture est bornée à 5 000 lignes par registre, avec un indicateur
   `truncated`. Les index `by_reported_at` et `by_issued_at` servent la lecture
   par période. Les comptes sont faits par des fonctions pures
   (`convex/model/controlSummary.ts`).
6. L’espace `/direction` affiche la synthèse dans « Risques et continuité », le
   remplissage dans « Activité et exploitation », et deux signaux : incidents
   critiques non résolus, et dessertes saturées au tronçon de pointe selon la règle
   du reporting (tronçon ≥ 95 % pour une moyenne < 80 %).
7. Le persona de démonstration Direction générale atterrit sur `/direction`.

## Alternatives écartées

- **Ouvrir les registres à la Direction générale.** Elle verrait des identités et
  des données de santé sans en avoir besoin pour décider, contre le principe de
  minimisation et la séparation des tâches.
- **Laisser les sources « Non accessible ».** La direction resterait aveugle sur
  la sécurité à bord et la saturation des trains.
- **Garder `reporting.occupancy` par `rapports`.** Changer la garde élargirait
  l’accès des uns et retirerait celui des autres ; l’octroi ciblé de `places`
  ne modifie que la Direction générale.

## Conséquences

- Tout rôle qui lit le module Sécurité avec une portée globale voit la synthèse
  agrégée ; c’est acceptable car elle est anonyme. Les affectations locales ne la
  voient pas.
- Un petit effectif, par exemple un seul incident médical sur la période, reste
  visible. Sans train, gare ni date, il ne permet pas de retrouver la personne ;
  tout découpage plus fin devra repasser par une revue DPO.
- La Direction générale voit la rubrique « Places » de `/gestion` en lecture.
- Sur l’environnement de démonstration, l’historique voyageurs est généré mais
  s’affiche « Opérationnel », faute de marqueur de provenance dans
  `dailyMetrics` et `tripMetrics`. Ce marqueur reste à ajouter.
