# Application de contrôle à bord

`apps/controleur-web` — application web installable (PWA), pensée pour le
terminal d'un contrôleur du Transgabonais. Port 3002.

Elle reprend écran par écran les maquettes CM-01 à CM-11 de
`docs/maquettes-setrag/Controleur Mobile.dc.html` et le plan
`docs/plans/controleur-mobile.html`, portés du mobile natif vers le web.

## Le principe : hors ligne d'abord

Entre Booué et Lopé, il n'y a pas de réseau. Le contrôle en pleine voie est
donc le régime **nominal** de cette application, pas un mode dégradé. Une
seule opération exige le réseau : l'ouverture de session, qui se fait en gare
avant le départ. Tout le reste — vérifier un titre, vendre, verbaliser,
signaler — fonctionne sur les données embarquées.

Ce qui rend cela possible, c'est que le titre est **auto-porteur** : il
contient sa portée et une signature Ed25519 que la clé publique embarquée
suffit à vérifier. Le terminal n'a pas besoin de demander au serveur si un
billet est authentique ; il l'établit lui-même.

## Écrans

| Écran  | Route         | Rôle                                                      |
| ------ | ------------- | --------------------------------------------------------- |
| CM-01  | `/connexion`  | Mot de passe puis code à six chiffres, tous deux vérifiés |
| CM-02  | `/tournee`    | Desserte du jour, fraîcheur des données, compteurs        |
| CM-03  | `/manifeste`  | Téléchargement par lots, reprenable, interruptible        |
| CM-04  | `/scan`       | Viseur Aztec, lampe, voiture, recherche                   |
| CM-05  | —             | Verdict, en surcouche du viseur                           |
| CM-06  | `/recherche`  | Recherche locale par référence, nom ou place              |
| CM-07  | `/vente`      | Vente à bord — trajet, encaissement, titre                |
| CM-08  | `/pv`         | Procès-verbal — motif, montant, signature                 |
| CM-09  | `/incident`   | Signalement, photos, gravité                              |
| CM-10  | `/historique` | File d'envoi, synchronisation, purge                      |
| CM-11  | `/conflits`   | Titres contrôlés sur deux terminaux                       |

## Authentification

Deux facteurs, tous deux vérifiés par le serveur :

1. le mot de passe du compte de service (`signIn.email`) ;
2. un code à six chiffres envoyé à ce compte, vérifié par
   `emailOtp.checkVerificationOtp` — qui **contrôle** le code sans ouvrir de
   session. C'est ce qui en fait un second facteur : `signIn.emailOtp`, lui,
   ouvrirait une session à part entière et détacherait le compte de son mot de
   passe, si bien que le second facteur remplacerait le premier au lieu de s'y
   ajouter.

Le plan mobile prévoyait un TOTP par application d'authentification. Le
système n'expose pas ce facteur aujourd'hui ; le code par courriel est celui
dont il dispose réellement. Aucun écran ne simule une vérification qui
n'aurait pas lieu.

**Verrouillage.** Après cinq minutes d'inactivité, le terminal se referme et
ne rouvre que sur un code court à quatre chiffres, vérifié **localement**
(empreinte SHA-256 dans les réglages, jamais le code). Redemander le second
facteur ici condamnerait l'agent à attendre la prochaine gare.

**Reprise hors réseau.** Une session ouverte laisse une trace locale
(matricule, rôle, date). Si le serveur ne répond pas, l'application reprend la
tournée sur les données embarquées, avec un bandeau permanent, plutôt que de
rester sur un écran d'attente. Un terminal qui n'a jamais ouvert de session,
lui, retourne à la connexion.

## Base embarquée

IndexedDB, base `setrag-controle`. Le plan mobile visait SQLite chiffré par
SQLCipher, qui suppose une application native ; sur le web, le chiffrement au
repos revient au terminal lui-même (verrouillage d'écran, chiffrement du
profil). C'est le point où le portage s'écarte du plan, et il est assumé — en
échange, l'application s'installe sans magasin d'applications.

Ce qui, en revanche, est tenu à l'identique : **chaque écriture métier et son
entrée en file d'envoi sont écrites dans une seule transaction**
(`commitOperation`). Une coupure entre les deux produirait soit un contrôle
jamais envoyé, soit un envoi sans objet.

| Magasin                        | Contenu                                    |
| ------------------------------ | ------------------------------------------ |
| `manifests`                    | En-tête, arrêts, barèmes, clé publique     |
| `tickets`, `subscriptions`     | Titres embarqués, indexés pour la recherche |
| `scans`, `sales`, `penalties`, `incidents` | Écritures de terrain           |
| `photos`                       | Images d'incident, envoyées avant leur incident |
| `queue`                        | File d'envoi : nature, priorité, tentatives |
| `settings`                     | Réglages du terminal, trace de session     |

## Synchronisation

Ordre d'envoi, décidé par l'exploitation et non par le code appelant :

1. **incidents critiques** — seul retard à conséquence physique à bord ;
2. procès-verbaux ;
3. ventes à bord ;
4. contrôles.

Chaque écriture porte un identifiant client. Les contrôles, procès-verbaux et
incidents partent groupés — leurs mutations sont idempotentes par lot. Les
**ventes partent une par une** : une mutation Convex est une transaction, et
un refus au milieu d'un lot annulerait les ventes déjà passées du même envoi.

Un échec ne supprime rien : l'écriture reste due, avec son motif et son nombre
de tentatives, jusqu'à ce qu'elle passe. La purge de fin de tournée n'est
offerte qu'une fois **tout** confirmé.

Le prix d'une vente est **recalculé par le serveur**. Le montant encaissé à
bord revient dans la réponse, et l'écran affiche les deux côte à côte lorsque
le yield management les sépare : l'écart doit être justifié en caisse, pas
absorbé.

## Lecture des codes

Trois recours, dans cet ordre :

1. `BarcodeDetector` natif — présent sur Chrome Android, le terminal visé ;
2. `zxing-wasm`, servi **depuis l'application** (`/wasm/zxing_reader.wasm`) et
   non depuis un CDN : un décodeur qui exigerait le réseau serait inutile là
   où l'on contrôle ;
3. la saisie manuelle du code, qui n'est pas un décodeur mais un filet — une
   caméra refusée ou un code déchiré ne doivent jamais bloquer un contrôle.

## Service worker

Le worker précache **tous** les écrans, le décodeur WebAssembly et les
ressources du build. Ses caches sont nommés d'après une empreinte du build :
un déploiement chasse le précédent, sinon un terminal servirait indéfiniment
une page réclamant des ressources supprimées.

En ligne, le worker **ne s'interpose pas** sur les navigations : il les laisse
partir au réseau et se contente d'en garder une copie. Intercepter une
navigation qui aboutit n'apporte rien et ferait dépendre l'ouverture de
l'application du bon fonctionnement du worker.

Il ne pratique ni `skipWaiting` ni `clients.claim()` : un worker qui prend le
contrôle d'une page déjà ouverte l'interrompt, et un contrôleur en pleine
saisie de procès-verbal perdrait son écran. Le nouveau worker attend la
prochaine ouverture.

Les appels à Convex ne sont **jamais** mis en cache : une réponse d'inventaire
servie depuis un cache muet ferait croire à l'agent qu'il travaille en ligne.
Les données hors ligne vivent dans IndexedDB, où l'application connaît leur âge
et l'affiche.

> **À valider sur un terminal réel.** Le service worker n'a pas pu être vérifié
> de bout en bout : le navigateur d'aperçu utilisé pendant le développement
> interrompt la page dès qu'un service worker s'enregistre, quelle que soit sa
> stratégie — y compris sans aucune interception. Ce qui est vérifié : le
> worker s'installe, précache les onze écrans, vingt-cinq fragments de code et
> le décodeur WebAssembly, et l'application entière fonctionne lorsqu'il est
> désactivé. Ce qui reste à confirmer sur Chrome Android : l'ouverture de
> l'application réseau coupé. En cas de difficulté sur un modèle de terminal,
> `NEXT_PUBLIC_DISABLE_SW=1` neutralise le worker et le désinstalle des
> terminaux déjà équipés ; l'application perd le hors-ligne mais reste
> utilisable, et tout le reste — vérification locale des titres, écritures,
> file d'envoi — continue de fonctionner sans lui.

## Backend

Ajouts à `convex/functions/control.ts` pour ce portage :

| Fonction                  | Rôle                                                |
| ------------------------- | --------------------------------------------------- |
| `manifest`                | Enrichi : barème kilométrique, abonnements, `includeTickets` |
| `manifestTickets`         | Titres par pages reprenables                        |
| `assignedTrips`           | Dessertes de la fenêtre de service                  |
| `syncSale`                | Une vente, idempotente par `clientSaleId`           |
| `flagConflict`            | Signale un conflit au chef de gare, sans y toucher  |
| `incidentPhotoUploadUrl`  | Jeton d'envoi d'une photo                           |

**Un contrôle enregistré n'est jamais modifiable** — invariante du projet,
vérifiée par un test de la matrice de droits. Le contrôleur signale donc un
conflit ; le clore relève du chef de gare (`resolveConflict`).

## Mise en service d'un compte

Better Auth crée les comptes ; c'est la table `users` qui porte le rôle, et un
compte nouvellement inscrit est « voyageur » tant qu'un administrateur ne l'a
pas habilité. Pour amorcer un déploiement ou ouvrir un poste :

```bash
cd packages/backend && bunx convex run seeds/staffAccounts:grantRole '{"email":"controleur@setrag.ga","role":"controleur_train","matricule":"C-401","pointOfSaleCode":"OWE-PV"}'
```

La mutation est **interne** : aucun client ne peut l'appeler, seule la CLI du
déploiement le peut. Le rattachement à un point de vente n'est pas optionnel
— la vente à bord exige une caisse ouverte, et une caisse appartient à un
point de vente.

## Démonstration

L'écran de connexion affiche un bouton « Compte contrôleur » dès que le
déploiement est marqué comme environnement de démonstration. Il emprunte
**exactement** le même chemin d'authentification qu'un agent réel — les deux
facteurs sont vérifiés par le serveur ; seule la saisie est épargnée. Sur un
déploiement de développement, le code est relevé automatiquement ; ailleurs,
l'écran s'arrête à l'étape du code, identifiant pré-rempli.

Variables du déploiement Convex :

```bash
cd packages/backend && bunx convex env set DEMO_ACCOUNTS_ENABLED true
```

Puis `DEMO_CONTROL_EMAIL` et `DEMO_CONTROL_PASSWORD`. Retirer
`DEMO_ACCOUNTS_ENABLED` fait disparaître le bouton immédiatement — les
identifiants ne sont transmis au navigateur que sous ce drapeau.

Les données de la tournée se provisionnent ensuite :

```bash
cd packages/backend && bunx convex run seeds/controlDemo:provision
```

Ce seed installe ce qu'un contrôleur trouve en montant à bord : la prochaine
desserte ouverte à la vente avec six voyageurs, une caisse ouverte, trois
contrôles déjà effectués, un procès-verbal réglé, un incident en cours — et un
**conflit à arbitrer**, le seul état qu'on ne peut pas produire en manipulant
l'application, puisqu'il faut un second terminal. Il est idempotent : le
relancer met à jour sans dupliquer.

## Vérifications

```bash
cd apps/controleur-web && bun run typecheck && bun run lint && bun run test:once && bun run build
```

Les tests couvrent ce qui doit tenir sans réseau : vérification de titres
réellement signés (verdicts valide, contrefait, hors segment, expiré, annulé,
déjà contrôlé, abonnement, clé hors service), atomicité des écritures, ordre
de la file, conservation des échecs, refus de purge prématurée, et égalité du
tarif embarqué avec le barème de référence du backend.
