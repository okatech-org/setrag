# Audit d'implémentation — billetterie web voyageur

Date de référence : 27 juillet 2026.

Sources comparées :

- `SETRAG_Billettique_Applications-Front-Office.pdf` ;
- `SETRAG_CDC_Projet-Billettique.pdf` ;
- `plans/billetterie-web.html` ;
- `plans/croquis-billetterie-web.html` (BW-01 à BW-10) ;
- maquette vivante et design system SETRAG ;
- fonctions Convex réellement exposées dans `packages/backend`.

## Légende

- **Livré** : le parcours utilise le backend réel et possède une vérification.
- **Partiel** : utilisable, mais une dépendance métier ou externe empêche la
  complétude.
- **Bloqué externe** : le code peut être préparé, mais des secrets, contrats,
  certificats ou décisions SETRAG sont indispensables.

## Matrice fonctionnelle

| Exigence                                    | État                        | Implémentation / reste à faire                                                                                               |
| ------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Recherche par gares, date et voyageurs      | Livré                       | Gares et dessertes Convex, validation adulte/enfant, maximum de 9 voyageurs                                                  |
| Tri des résultats                           | Livré                       | Horaire, durée et prix                                                                                                       |
| Disponibilité par segment et classe         | Livré                       | `trips.search`, `bookings.quote`                                                                                             |
| Réductions enfant / groupe / militaire      | Partiel                     | Moteur backend disponible ; enfant transmis, justificatifs et parcours groupe à compléter                                    |
| Choix de place                              | Livré                       | `trips.availableSeats`, choix facultatif par voyageur, attribution automatique en repli                                      |
| Prix figé et tenue 15 minutes               | Livré                       | Réservation transactionnelle et expiration par cron                                                                          |
| Paiement Airtel/Moov/carte                  | Bloqué externe              | Parcours et simulation présents ; webhooks, contrats opérateurs et rapprochement réel requis                                 |
| Paiement au guichet                         | Livré                       | Réservation non réglée, échéance et annulation de la tenue                                                                   |
| Acceptation CGV opposable                   | Livré                       | Version et horodatage portés par la vente, y compris pour un achat invité                                                    |
| Confirmation par URL durable                | Livré                       | `/reservation/[reference]`, propriétaire connecté ou référence + téléphone                                                   |
| Un titre par voyageur avec code signé       | Partiel                     | Charge utile signée et Aztec dans le PDF ; l'écran web utilise encore un QR pour afficher la même charge utile               |
| PDF par billet                              | Livré                       | Génération sécurisée, téléchargement réel, cache et invalidation                                                             |
| PDF groupé                                  | Livré                       | Assemblage multi-pages et cache au niveau du dossier                                                                         |
| Envoi PDF par e-mail                        | Livré, désactivé par défaut | Pièce jointe, limitation anti-abus, journal et webhook Resend                                                                |
| Envoi automatique après paiement            | Livré, désactivé par défaut | Planifié seulement si une adresse est présente ; aucun appel sans activation                                                 |
| Renvoi par SMS                              | Bloqué externe              | Aucun fournisseur SMS transactionnel n'est configuré                                                                         |
| Ajout au calendrier                         | Livré                       | Fichier `.ics` avec rappel la veille                                                                                         |
| Apple / Google Wallet                       | Bloqué externe              | Mapping présent ; certificats Apple, compte émetteur Google et service de mise à jour requis                                 |
| Mes réservations                            | Livré                       | Données réelles, bons trajets, statuts, nombre de billets et liens durables                                                  |
| Annulation d'une réservation non payée      | Livré                       | Libération immédiate des places                                                                                              |
| Annulation / remboursement d'un billet payé | Partiel                     | Moteur agent disponible ; CGV, pénalités et autorisation du workflow voyageur à valider                                      |
| Suivi du remboursement                      | Partiel                     | Les écritures liées sont renvoyées avec le dossier ; présentation détaillée à enrichir après validation du workflow voyageur |
| Suivi de desserte                           | Livré                       | Recherche train + date, arrêts et horaires issus du backend, retard et annulation réactifs                                   |
| Alertes SMS de desserte                     | Bloqué externe              | Fournisseur SMS et consentement dédié nécessaires                                                                            |
| Profil voyageur                             | Livré                       | Nom, prénom et e-mail reliés au backend                                                                                      |
| Consentements                               | Partiel                     | Accord et révocation marketing reliés ; l'écran détaillé de l'historique versionné reste à composer                          |
| Export des données                          | Livré                       | Téléchargement JSON des ventes, billets et consentements                                                                     |
| Suppression du compte                       | Livré                       | Confirmation explicite et anonymisation avec conservation légale                                                             |
| OTP téléphone / e-mail                      | Partiel                     | Parcours Better Auth présent ; fournisseurs SMS/e-mail OTP encore en mode développement                                      |
| Aide, tarifs et bagages                     | Livré                       | Pages de service et navigation sans liens factices                                                                           |
| Support par e-mail / ticketing              | Bloqué externe              | Adresse de support, SLA et outil de traitement à désigner                                                                    |
| Retour dans une même commande               | Partiel                     | Champ de recherche présent ; le modèle de vente actuel traite une desserte par réservation                                   |
| Multilingue                                 | Partiel                     | Architecture compatible, mais seul le français est livré                                                                     |

## Configuration e-mail

Les e-mails de billets ne partent que si les cinq conditions suivantes sont
réunies :

1. domaine d'envoi validé chez Resend ;
2. `RESEND_API_KEY` renseignée dans le déploiement Convex ;
3. `RESEND_WEBHOOK_SECRET` renseigné ;
4. `TICKETS_EMAIL_FROM` renseigné ;
5. `TICKETS_EMAIL_ENABLED=true`.

Le mode fournisseur reste limité aux adresses de test tant que
`RESEND_TEST_MODE` n'est pas explicitement positionné à `false`.

## Décisions SETRAG encore indispensables

1. Texte et version définitive des CGV.
2. Barème d'annulation voyageur : délais, motifs, taux de pénalité et canal de
   remboursement.
3. Contrats et secrets des opérateurs Airtel Money, Moov Money et carte.
4. Fournisseur SMS transactionnel et règles de consentement.
5. Adresse et outil de traitement du support voyageur.
6. Comptes émetteurs et certificats Wallet.
7. Politique des allers-retours et des groupes de plus de neuf voyageurs.
