# ADR-0012 — La tarification suit le cahier des charges, pas les pratiques du secteur

**Statut :** accepté
**Date :** 2026-07-26
**Portée :** `convex/model/fares.ts`, `convex/model/pricing.ts`

## Contexte

Le CDC fixe un mode de tarification précis : **barème kilométrique** à
tranches de distance, arrondis réglementaires (10, 50 ou 100 F selon la
distance), coefficients d'abonnement sur 44 tranches, et un yield management
par **contingents tarifaires** modulés par des règles en pourcentage, avec
plancher et plafond.

Ce n'est pas ainsi que fonctionne le revenue management d'un opérateur
européen. La tentation d'« améliorer » est réelle.

## Décision

**Le CDC fait foi.** Le code implémente ce que le client a spécifié. Les
recommandations issues de pratiques externes qui contredisent le CDC sont
écartées, pas intégrées en douce.

Cela vaut aussi pour les décisions d'infrastructure : déploiement en région
**US par défaut**, jamais en Europe, sur instruction explicite du client.

## Justification

C'est le client qui décide de son mode de facturation. Un prestataire qui
substitue son jugement à une spécification tarifaire livre un système que
l'exploitant ne reconnaît pas, ne sait pas justifier devant son régulateur, et
n'a pas demandé.

## Ce que cela implique concrètement

### L'inversion de prix à 100 km est conservée

Le barème du CDC produit un défaut mesurable : **99 km coûtent 4 700 XAF,
100 km en coûtent 4 350** — 350 F de moins pour 1 km de plus. L'anomalie
s'étend de 100 à 107 km. Elle vient du changement de taux au passage de
tranche, non compensé.

Ce n'est **pas** un bug d'implémentation. C'est le barème.

Traitement retenu : un test le **fige explicitement**, avec commentaire. Le
comportement est donc documenté et surveillé — s'il change par accident, la
suite échoue. Mais il n'est pas « corrigé » sans mandat.

À signaler à SETRAG comme une observation, en laissant la décision au client.

### Les leviers de yield écartés

Les mécanismes proposés initialement — tarification dynamique à la demande,
enchères de surclassement, familles tarifaires non prévues — ont été retirés
du plan parce qu'ils ne figurent pas au CDC. Le moteur implémente les
contingents et les règles de modulation spécifiés, additivement, avec
plancher et plafond appliqués **après** cumul.

## Conséquences

**Devient plus facile**
- Le système est justifiable ligne à ligne devant le client et son
  régulateur.
- Les écarts éventuels entre le calcul et l'attente de SETRAG se tranchent en
  relisant le CDC.

**Devient plus difficile**
- Certaines anomalies connues restent en place tant que le client ne tranche
  pas.

**À revoir**
- Données encore attendues de SETRAG : points kilométriques officiels des 21
  gares intermédiaires (aujourd'hui **interpolés**, marqués `approx: true`),
  et quatre barèmes manquants — colis (zones × poids), TAA, transport
  funéraire, excédent de bagages. Les valeurs actuelles sont fictives,
  préfixées `[PROVISOIRE]`, et purgeables en une commande.
