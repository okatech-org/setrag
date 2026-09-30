# ADR-0018 — Finance OHADA et règles fiscales versionnées

**Statut :** accepté sous réserve de validation DFC, fiscaliste et DGI
**Date :** 2026-09-10
**Portée :** module Finance, SYSCOHADA, fiscalité gabonaise

## Contexte

La phase 2 du plan directeur demande une comptabilité générale fondée sur le
SYSCOHADA révisé et la préparation des déclarations gabonaises. Les taux, bases,
exemptions, conventions et formulaires peuvent toutefois évoluer. Le Document 05
constitue un cadrage fonctionnel, pas une preuve suffisante pour appliquer un taux
à une opération réelle.

Le dépôt possède déjà un journal des ventes voyageurs destiné à SAGE X3. Le nouveau
socle doit compléter ce flux sans créer un second grand-livre légal concurrent ni
modifier rétroactivement les écritures historiques.

## Décision

Le module Finance porte trois invariants :

1. le plan de comptes est versionné et chaque compte appartient à une classe
   SYSCOHADA de 1 à 9 ;
2. chaque jeu de règles fiscales possède des dates d'effet, une source légale et
   des taux exprimés en points de base ; aucune valeur fiscale n'est un défaut
   implicite du code ;
3. un lot comptable ne peut être validé que s'il est équilibré, avec des montants
   entiers en FCFA et un valideur distinct de son créateur. Après validation, le
   lot et ses lignes sont immuables ; une correction passe par une nouvelle pièce.

Les mutations sont corrélées, idempotentes et auditées. L'interface n'affiche que
les données persistées et expose explicitement les prérequis manquants. Elle ne
présente pas une déclaration comme « prête » tant qu'un jeu fiscal approuvé, un
plan de comptes actif et les mappings SAGE X3/e-tax homologués ne sont pas
disponibles. Le présent lot ne stocke pas encore cette homologation : la production
réglementaire reste donc fermée par défaut.

Le journal voyageur historique et l'outbox SAGE restent en place. Leur migration
vers le module Finance se fera producteur par producteur, après validation du
mapping V65 et du contrat SAGE X3 par la DFC/DSI.

## Conséquences

- Un changement de loi crée une nouvelle version datée ; il ne réécrit jamais le
  passé.
- Les exemples 18 % ou 1 % peuvent servir aux tests, mais ne deviennent actifs que
  par une configuration validée et sourcée.
- La présence d'un calcul ne vaut ni déclaration DGI ni conformité certifiée.
- Les arrondis, exonérations, précomptes, retenues, conventions internationales et
  formulaires e-tax restent à homologuer avant émission réelle.
- Le contrôle créateur/valideur prépare le raccordement au parapheur générique sans
  inventer le circuit d'approbation propre à la DFC.

## Sources normatives à contrôler avant activation

- AUDCIF/SYSCOHADA publié par l'OHADA le 15 février 2017 :
  <https://www.ohada.org/pt-pt/publicacao-do-novo-acto-uniforme-sobre-o-direito-da-contabilidade-e-da-informacao-financeira/>
- Textes spécifiques et Code général des impôts publié par la DGI Gabon :
  <https://dgi.ga/textes-specifiques/>
- Journal officiel de la République gabonaise :
  <https://journal-officiel.ga/>

## Prérequis de mise en service

- validation formelle du plan de comptes et des axes analytiques SETRAG ;
- visa de la DFC/fiscaliste sur chaque jeu de règles et sa période d'effet ;
- jeux d'essai couvrant exonérations, avoirs, précomptes et arrondis ;
- rapprochement avec SAGE X3 sur un exercice de recette sans double comptage ;
- homologation du format et du canal e-tax avant tout envoi DGI.
