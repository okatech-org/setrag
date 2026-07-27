# Plan d’implémentation — Agent Web

Références :

- `docs/maquettes-setrag/Agent Web.dc.html`
- `docs/plans/croquis-agent-web.html`
- back-end Convex dans `packages/backend/convex`

## Standard de livraison

Chaque écran possède une route Next.js, des composants réutilisables testés
avec Testing Library et un scénario E2E Playwright fondé sur le comportement
visible. Les données métier viennent de fonctions Convex autorisées côté
serveur ; masquer un bouton dans l’interface ne remplace jamais le contrôle de
permission du back-end.

Les requêtes réactives sont regroupées par besoin d’écran. Les formulaires
longs conservent leur brouillon localement, mais aucune vente électronique
n’est confirmée tant que la mutation Convex atomique n’a pas réussi.

## Lots

| Lot | Écrans                    | Résultat attendu                                                                                         |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | AW-00, AW-V-01, AW-V-02   | Connexion de repli, ouverture de caisse, accueil vendeur temps réel et recherche de desserte             |
| 2   | AW-V-03, AW-V-07, AW-V-08 | Choix de place, encaissement atomique, confirmation et impression                                        |
| 3   | AW-V-04, AW-V-05, AW-V-06 | Bagages, colis express, auto accompagné et transport funéraire                                           |
| 4   | AW-V-09, AW-V-10, AW-V-11 | Après-vente, clôture de caisse et ressaisie du mode papier                                               |
| 5   | AW-G-01 à AW-G-05         | Pilotage, livrets, tarifs, yield et matériel roulant                                                     |
| 6   | AW-G-06 à AW-G-10         | Places, réseau de vente, voyageurs, recettes et comptabilité                                             |
| 7   | AW-G-11 à AW-G-15         | Rapports, incidents, habilitations, paramétrage et supervision                                           |
| 8   | Robustesse transversale   | Brouillons locaux, raccourcis clavier complets, périphériques, reprise réseau, audit UX et accessibilité |

## État d’avancement

- Lot 1 livré : AW-00, AW-V-01 et AW-V-02.
- Lot 2 livré : AW-V-03, AW-V-07 et AW-V-08.
  - Le devis et la vente utilisent le même moteur tarifaire avec le canal
    `guichet`.
  - Le plan de voiture est réactif, filtré par classe et par segments du
    trajet.
  - `createCounterSale` reste l’unique transaction d’émission : contrôle de
    place, inventaire, vente, billets, caisse, comptabilité et audit sont
    atomiques.
  - Le billet PDF est généré à la demande par l’action Convex existante, puis
    mis en cache dans le stockage.
- Lot 3 — socle fonctionnel livré : AW-V-04, AW-V-05 et AW-V-06.
  - La recherche de billet sécurisée alimente les ventes bagage et auto
    accompagné sans ressaisie du trajet.
  - Les devis bagage, colis et prestations spéciales utilisent les barèmes
    annexes Convex ; un barème absent bloque explicitement la vente.
  - Les expéditions, étiquettes et vignettes sont numérotées par les mutations
    métier existantes et rattachées à la caisse/journée comptable.
  - Reste à raccorder ces produits au panier d’encaissement AW-V-07 et à
    produire leurs bordereaux/étiquettes PDF ; les mutations actuelles les
    enregistrent directement comme ventes confirmées.
- Lot 4 livré : AW-V-09, AW-V-10 et AW-V-11.
  - La recherche et les actions d’après-vente utilisent `sales.search`,
    `sales.get`, `sales.cancel`, `sales.refund` et `sales.reprintTicket`.
  - Le rapprochement de caisse repose sur `cash.mySession` et la clôture
    atomique `cash.closeSession`, avec justification obligatoire des écarts.
  - La ressaisie papier utilise `manualSales.list` et
    `manualSales.recordManualSale` sans produire de second titre.
- Lots 5 à 7 livrés : portail Gestion AW-G-01 à AW-G-15.
  - Les indicateurs, livrets, référentiels, exports, incidents et constats de
    supervision sont alimentés par des requêtes Convex réactives.
  - La création d’un livret utilise la mutation Convex existante ; les autres
    actions dont le workflow back-end demande encore un identifiant métier
    affichent un retour explicite et restent soumises aux permissions serveur.

Les paiements Airtel Money, Moov Money et carte sont visibles mais désactivés
tant que les contrats opérateur et terminal ne sont pas raccordés. Aucune
validation fictive n’est envoyée au back-end.

## Routes du portail de vente

| Écran   | Route                           |
| ------- | ------------------------------- |
| AW-00   | `/connexion`                    |
| AW-V-01 | `/vente`                        |
| AW-V-02 | `/vente/billet`                 |
| AW-V-03 | dialogue depuis `/vente/billet` |
| AW-V-04 | `/vente/bagage`                 |
| AW-V-05 | `/vente/colis`                  |
| AW-V-06 | `/vente/prestation-speciale`    |
| AW-V-07 | `/vente/encaissement`           |
| AW-V-08 | `/vente/confirmation/[saleId]`  |
| AW-V-09 | `/vente/operations`             |
| AW-V-10 | `/vente/caisse`                 |
| AW-V-11 | `/vente/ventes-manuelles`       |

## Routes du portail de gestion

| Écran   | Route                      |
| ------- | -------------------------- |
| AW-G-01 | `/gestion`                 |
| AW-G-02 | `/gestion/livrets`         |
| AW-G-03 | `/gestion/tarifs`          |
| AW-G-04 | `/gestion/yield`           |
| AW-G-05 | `/gestion/trains`          |
| AW-G-06 | `/gestion/places`          |
| AW-G-07 | `/gestion/points-de-vente` |
| AW-G-08 | `/gestion/voyageurs`       |
| AW-G-09 | `/gestion/recettes`        |
| AW-G-10 | `/gestion/comptabilite`    |
| AW-G-11 | `/gestion/rapports`        |
| AW-G-12 | `/gestion/incidents`       |
| AW-G-13 | `/gestion/utilisateurs`    |
| AW-G-14 | `/gestion/parametrage`     |
| AW-G-15 | `/gestion/integrations`    |

## Écart d’authentification à traiter

Le back-end actuel active Better Auth avec e-mail/mot de passe et OTP
e-mail/SMS. La cible de la maquette exige Entra ID/OIDC et un TOTP interne de
repli. Le lot 1 utilise le mécanisme e-mail/mot de passe réellement disponible
et affiche honnêtement l’état du raccordement SSO. L’activation d’Entra ID
nécessitera les paramètres du tenant ERAMET/SETRAG ; elle ne doit pas être
simulée côté client.
