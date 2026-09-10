# Runbook — continuité et reprise PCA/PRA

Ce runbook organise les objectifs et preuves. Il ne certifie pas la disponibilité
du système. À ce jour, le dépôt ne démontre ni miroir Owendo, ni RPO inférieur à une
seconde, ni RTO inférieur à 15 minutes, ni autonomie de 72 heures.

## Préparer une politique

1. Définir un code stable, un titre et une portée précise.
2. Saisir le RPO en secondes entières non négatives, puis le RTO en minutes et
   l’autonomie hors ligne en heures entières strictement positives. Avec cette
   unité, l’objectif « RPO inférieur à une seconde » se saisit à zéro seconde.
3. Déclarer honnêtement les limites connues : périmètre non couvert, dépendances
   Convex, réseau, énergie, terminaux, stockage, personnel et procédures papier.
4. Créer une version brouillon avec une corrélation unique.
5. Faire contrôler la version par une personne distincte du créateur.
6. Après approbation, vérifier que l’ancienne version du même code est retirée.

Une correction crée toujours une nouvelle version. Ne jamais modifier directement
une politique approuvée ni supprimer son historique.

## Exercice de restauration ou de bascule

Avant l’exercice, définir le sinistre simulé, le point de départ, les données
sentinelles et le critère de retour au service nominal. Conserver les horodatages
dans une même référence temporelle.

La preuve doit contenir au minimum :

- la fenêtre réelle de l’exercice ;
- le RPO observé, calculé à partir de la dernière transaction intègre récupérée ;
- le RTO observé, calculé jusqu’au retour vérifié du service ;
- les constats, anomalies et opérations manuelles ;
- les références des journaux, exports, captures et rapports conservés dans la GED.

Un résultat « réussi » sans RPO et RTO observés est refusé. Une mesure supérieure à
l’objectif est conservée comme preuve de l’exercice mais maintient la préparation à
`false`. Tester séparément le scénario réellement revendiqué : une restauration
Convex ne prouve pas un miroir Owendo ni une bascule vers satellite.

## Exercice hors ligne de 72 heures

Le scénario doit couvrir les opérations revendiquées par la politique, pas seulement
le contrôle des billets. Pour une gare autonome, inclure selon le périmètre validé :

- émission et contrôle des billets ;
- enregistrement des mouvements ou passages de trains ;
- opérations fret concernées ;
- alimentation électrique et renouvellement des terminaux ;
- prévention des doublons et maintien d’un journal local ;
- resynchronisation, résolution des conflits et rapprochement final.

Enregistrer la fenêtre continue réelle. Une simulation raccourcie ou un mode hors
ligne limité à `controleur-web` ne prouve pas 72 heures d’autonomie de gare.

## Exercice papier et saisie de rattrapage

1. Inventorier les carnets pré-imprimés et numérotés remis aux responsables.
2. Simuler l’indisponibilité et produire des opérations papier sans rupture de
   séquence.
3. Faire contrôler les souches, montants et habilitations par une seconde personne.
4. Saisir le rattrapage après rétablissement avec les identifiants papier uniques.
5. Rapprocher exhaustivement carnets, caisse, ventes, fret et écritures comptables.
6. Conserver le procès-verbal, les écarts et leur résolution dans la GED.

Le stockage de billets manuels dans l’application ne suffit pas : la procédure
terrain, la conservation des carnets et le rattrapage doivent être testés ensemble.

## Enregistrer et valider une preuve

- Enregistrer le résultat réel (`reussi`, `echoue`, `inconclusif`), même défavorable.
- Ajouter au moins un constat et une référence de preuve vérifiable.
- Utiliser une corrélation unique ; une reprise strictement identique est sans effet.
- Faire examiner la preuve par un utilisateur distinct de son créateur.
- Rejeter la preuve si les pièces sont absentes, incohérentes ou hors périmètre.

La validation confirme la qualité de la preuve, pas automatiquement l’atteinte des
objectifs. Le calcul de préparation compare ensuite les mesures et durées aux
objectifs de la version approuvée.

## Lire la synthèse

La préparation n’est vraie que si la politique est approuvée et si les preuves de
reprise mesurée, d’autonomie hors ligne et de procédure papier sont toutes présentes
et approuvées. Traiter chaque code d’écart :

- `politique_non_approuvee` : faire valider la version par un autre acteur ;
- `objectifs_invalides` : créer une nouvelle version avec des entiers sûrs et des
  unités conformes au registre ;
- `reprise_non_mesuree_ou_hors_objectifs` : instrumenter ou refaire la restauration/
  bascule ;
- `autonomie_hors_ligne_non_prouvee` : exécuter toute la durée et le périmètre ;
- `procedure_papier_non_testee` : réaliser le scénario papier et son rattrapage.

Les requêtes sont bornées. Si `policyWindowTruncated` ou
`exerciseWindowTruncated` vaut `true`, compléter l’analyse avant de conclure.

## Incident pendant un exercice

1. Protéger les personnes et l’exploitation ferroviaire avant le test SI.
2. Arrêter l’exercice si ses garde-fous ne sont plus respectés.
3. Enregistrer le résultat `echoue` ou `inconclusif` sans effacer les traces.
4. Ouvrir l’incident, préserver les journaux et corréler les actions correctives.
5. Faire valider la preuve de l’échec ; elle sert au retour d’expérience mais ne
   satisfait aucun objectif.
6. Corriger puis planifier un nouvel exercice avec une nouvelle corrélation.
