# Application de contrôle à bord

`apps/controleur-web` — application web installable (PWA), pensée pour le
terminal d'un contrôleur du Transgabonais. Port 3002.

Elle suit la charte « la voie et le ruban », comme la billetterie : mêmes
composants (`@workspace/ui`), même coquille mobile, mêmes feuilles. Les
maquettes validées sont celles de la page « Contrôleur » de la charte
(`docs/charte-setrag/controleur.html`, 38 écrans et leurs décisions).

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

Quatre écrans racines portent les onglets (Tournée, Scanner, Historique,
Incident) ; les sous-écrans les masquent et portent un retour, comme l'app
voyageur. Le verdict recouvre tout l'écran : il masque aussi les onglets.

| Route         | Écran                                                                      |
| ------------- | -------------------------------------------------------------------------- |
| `/connexion`  | Compte de service et mot de passe, puis code à six chiffres ; compte démo |
| `/tournee`    | Prise de service (choisir la desserte, puis télécharger) ; puis la tournée : voie de la desserte, dernière gare atteinte, compteurs, rame des voitures |
| `/manifeste`  | Données embarquées : téléchargement par lots, reprenable, interruptible   |
| `/voiture`    | Manifeste d'une voiture : plan des places (quatre états) ou liste          |
| `/scan`       | Viseur toujours sombre, quatre commandes ; puis le verdict plein écran    |
| `/recherche`  | Recherche locale par référence, nom ou place                               |
| `/vente`      | Vente à bord — trajet, encaissement, titre remis                           |
| `/pv`         | Procès-verbal — motif, montant, signature                                  |
| `/incident`   | Signalement : catégorie, gravité, lieu, description, photos                |
| `/historique` | File d'envoi et journal des contrôles ; purge de fin de tournée            |
| `/conflits`   | Titres contrôlés sur deux terminaux, et leur détail                        |

Le code suit la billetterie : `src/coquille` (bandeau de service, onglets,
barre d'app, thème, démarrage, worker), `src/composants` (pièces propres au
terminal : messages, cases, cartes de choix, journal, pictogrammes de
verdict, choix de gare), `src/fonctionnalites/<écran>`, et `src/lib` pour
les règles pures, testées sans interface (`verdicts`, `position`, `tournee`,
`bandeau`, `preferences`, `train`, `format`, et `offline/*`).

## La charte sur le terminal

### Le bandeau de service

Un bandeau permanent de 44 px sous la barre d'état, sur chaque écran, même
verrouillé : réseau, nombre d'écritures à envoyer, heure de la dernière
**confirmation** du serveur (`TerminalSettings.lastSyncAt`). Cinq états
(`lib/bandeau.ts`) : en ligne, hors ligne, envoi en cours (une rame passe
dessous, « Envoi · 2 sur 9 · lot 3 sur 4 »), session non reconnue, échec
(« 2 en échec · conservés · nouvel essai 30 s », compté depuis le dernier
échec). Le toucher ouvre la file d'envoi. L'état s'écrit en toutes lettres.

### Les quatre familles de verdict

Treize verdicts, quatre familles (`lib/verdicts.ts`). Chaque famille a une
forme, un mot, une texture et un retour physique ; la teinte vient en
dernier.

| Famille            | Forme                         | Texture             | Vibration      | Son (réglable)      | Verdicts |
| ------------------ | ----------------------------- | ------------------- | -------------- | ------------------- | -------- |
| Accepté            | cercle, coche                 | —                   | 40 ms          | un bip aigu bref    | Valide, Abonnement valide |
| À vérifier         | triangle, point d'exclamation | liseré en tirets    | 40-60-40 ms    | deux bips moyens    | Déjà contrôlé, Statut inconnu, Clé hors service |
| Refusé             | octogone, croix               | hachures            | 260 ms         | un son grave long   | Hors segment, Mauvaise desserte, Expiré, Titre annulé, Titre remboursé, Non payé, Signature invalide |
| Lecture impossible | cadre en tirets               | fond gris           | aucune         | aucun               | Code illisible |

La suite de chaque verdict tient dans `suitesDuVerdict()` : **un seul**
bouton primaire, puis des secondaires, puis des boutons fantômes.

- Valide, Abonnement : « Valider et scanner le suivant ». Le retour au
  viseur est **automatique après 1,5 s** ; toucher l'écran l'annule.
- Déjà contrôlé : « Continuer sans second contrôle », l'heure du premier
  contrôle écrite.
- Statut inconnu : « Régulariser », puis « Établir un procès-verbal » ;
  « Enregistrer et scanner le suivant » reste possible, hors du primaire.
- Clé hors service : « Chercher dans le manifeste », puis « Signaler à
  l'exploitation » (incident technique prérempli) — jamais de
  procès-verbal : c'est un problème d'exploitation, pas de voyageur.
- Hors segment : « Régulariser — vendre le complément », puis le
  procès-verbal. La ligne sous le billet dit l'écart en gares et en PK.
- Mauvaise desserte, Expiré (refus de bonne foi) : la vente d'abord, puis le
  procès-verbal.
- Annulé, Remboursé, Non payé, Signature invalide : le procès-verbal, puis
  la vente.
- Code illisible : « Scanner à nouveau », « Saisir le code à la main »,
  « Chercher dans le manifeste ». Rien n'est enregistré : ce n'est pas un
  verdict sur le voyageur.

Tout verdict sur un titre est enregistré dès que l'agent choisit une suite
(refus compris) ; « Fermer sans enregistrer » n'écrit rien. La caméra est
coupée pendant le verdict, et rouverte au retour sur le viseur.

### La dernière gare atteinte

C'est d'elle que dépend « hors segment ». Le terminal la **propose**
d'après l'horaire embarqué (`gareProposee` : la dernière gare dont l'heure de
passage est échue), sur la tournée et sur le viseur ; l'agent la
**confirme** d'un geste, sur la voie des gares (`ChoixGare`). Rien n'avance
sans lui, et la proposition ne recule jamais. `currentStopIndex` porte le
rang (`sequence`) de la gare confirmée.

### Voitures, composition et plan

Le manifeste embarque la composition du train (`composition` : voitures dans
l'ordre de la rame, classe, places assises et debout, plan des places) et la
voiture de chaque titre. La rame de la tournée dit, sous chaque voiture, la
part de ses titres déjà contrôlés ; le plan d'une voiture montre ses places
en quatre états (contrôlé, à contrôler, refusé, sans titre), chacun avec sa
forme et son mot. Le choix de la voiture contrôlée suit la composition
réelle (six voitures pour l'Express, quatre pour l'Omnibus). Un manifeste
téléchargé avant cet ajout se rabat sur les voitures des titres.

« Contrôlés » compte les **titres distincts**, pas les passages : un titre
compte dès qu'il a été vu, sur ce terminal ou par un autre agent (statut
« utilisé »), quel qu'ait été le verdict. Ni un code illisible ni une
contrefaçon — qui peut recopier la référence d'un vrai titre — ne sont
imputés à un titre.

### Thème de nuit, son, contraste renforcé

Réglages du terminal, dans `localStorage` (`lib/preferences.ts`) : ils valent
dès l'écran de connexion et survivent à la purge.

- **Thème** : sombre de 18:30 à 06:00 (heure de Libreville), heures
  réglables, ou forcé clair ou sombre. Un script posé dans `<head>`
  l'applique avant le premier rendu (`lib/script-affichage.ts`) : un terminal
  rouvert à minuit ne s'allume pas en clair. Le viseur reste **toujours**
  sombre. De nuit, les tokens sombres s'appliquent tels quels — le bouton
  principal devient un aplat bleu clair.
- **Son des verdicts** : un son par famille (Web Audio, rien à télécharger),
  coupable — des voyageurs dorment. La vibration reste.
- **Contraste renforcé**, pour le plein soleil : textes secondaires passés
  en encre, bordures plus sombres (`[data-contraste="renforce"]` dans
  `app/globals.css`). Les tirets qui portent un sens restent des tirets.

### La marque

Logo compact dans la barre d'app des écrans racines (négatif la nuit), voie
de la desserte et ruban jusqu'à la position du train, ruban sous chaque
voiture, onglets et étapes à ruban, billet encre dans le verdict. Démarrage
à froid au logo animé, une fois, sur l'application installée et hors
tournée. Aucun assistant sur le terminal : pas de réseau là où l'on
contrôle, et un verdict doit rester déterministe et vérifiable.

Les icônes de l'application se régénèrent depuis l'icône d'app du design
system :

```bash
cd apps/controleur-web && node scripts/generer-icones.mjs
```

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
facteur ici condamnerait l'agent à attendre la prochaine gare. Le code se
valide seul au quatrième chiffre ; l'écran dit pourquoi il s'est verrouillé
(inactivité ou verrouillage manuel), et le bandeau de service reste visible
par-dessus.

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

| Magasin                                    | Contenu                                         |
| ------------------------------------------ | ----------------------------------------------- |
| `manifests`                                | En-tête, arrêts, barèmes, clé publique          |
| `tickets`, `subscriptions`                 | Titres embarqués, indexés pour la recherche     |
| `scans`, `sales`, `penalties`, `incidents` | Écritures de terrain                            |
| `photos`                                   | Images d'incident, envoyées avant leur incident |
| `queue`                                    | File d'envoi : nature, priorité, tentatives     |
| `settings`                                 | Réglages du terminal, trace de session          |

## Synchronisation

Ordre d'envoi, décidé par l'exploitation et non par le code appelant :

1. **incidents critiques** — seul retard à conséquence physique à bord ;
2. procès-verbaux ;
3. incidents importants ;
4. ventes à bord ;
5. contrôles ;
6. incidents d'information.

Le rang d'un incident suit donc sa gravité (`INCIDENT_PRIORITY`), et l'écran
le dit hors réseau : seul un incident critique est annoncé « en tête de
file » ; les autres « partent avec le reste de la file ».

Chaque écriture porte un identifiant client. Les contrôles, procès-verbaux et
incidents partent groupés — leurs mutations sont idempotentes par lot. Les
**ventes partent une par une** : une mutation Convex est une transaction, et
un refus au milieu d'un lot annulerait les ventes déjà passées du même envoi.

Un échec ne supprime rien : l'écriture reste due, avec son motif et son nombre
de tentatives, jusqu'à ce qu'elle passe. La purge de fin de tournée n'est
offerte qu'une fois **tout** confirmé.

L'envoi est **automatique** dès qu'une opération entre dans la file si le
réseau et la session sont disponibles. Il reprend aussi automatiquement au
retour du réseau ou de la session. Après un échec transitoire, le terminal
réessaie toutes les 30 secondes ; l'action manuelle de l'écran historique
n'est qu'un raccourci pour forcer une reprise immédiate.

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
une page réclamant des ressources supprimées. L'empreinte est **fixée à la
compilation** (`NEXT_PUBLIC_EMPREINTE_BUILD` dans `next.config.ts` : le commit
Vercel, à défaut l'heure du build) et le worker s'enregistre sous
`/sw.js?v=<empreinte>`. Elle était auparavant déduite des scripts de la page
ouverte, qui diffèrent d'un écran à l'autre : chaque navigation installait
alors un nouveau worker et vidait les caches.

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

**Le worker ne s'enregistre pas en développement.** Il sert les fragments de
code en cache-first, ce qui fige la version chargée alors que le rechargement
à chaud en produit une nouvelle à chaque frappe : on croit alors déboguer
l'application, on débogue un cache — corrections sans effet, pages qui
refusent de se charger. Le hors-ligne se vérifie donc sur un build de
production :

```bash
cd apps/controleur-web && bun run build && bun run start
```

> **Vérifié sous Chromium, à confirmer sur un terminal réel.** Sur un build de
> production, Chromium (Playwright, 390 × 844) installe le worker, précache
> les écrans, garde la même empreinte d'une navigation à l'autre, et rouvre
> les écrans réseau coupé ; les écritures faites hors ligne partent au retour
> du réseau. Reste à confirmer sur Chrome Android, le terminal visé. En cas de
> difficulté sur un modèle de terminal,
> `NEXT_PUBLIC_DISABLE_SW=1` neutralise le worker et le désinstalle des
> terminaux déjà équipés ; l'application perd le hors-ligne mais reste
> utilisable, et tout le reste — vérification locale des titres, écritures,
> file d'envoi — continue de fonctionner sans lui.

## Backend

Ajouts à `convex/functions/control.ts` pour ce portage :

| Fonction                 | Rôle                                                         |
| ------------------------ | ------------------------------------------------------------ |
| `manifest`               | Enrichi : barème kilométrique, abonnements, `includeTickets` |
| `manifestTickets`        | Titres par pages reprenables                                 |
| `assignedTrips`          | Dessertes de la fenêtre de service                           |
| `syncSale`               | Une vente, idempotente par `clientSaleId`                    |
| `flagConflict`           | Signale un conflit au chef de gare, sans y toucher           |
| `incidentPhotoUploadUrl` | Jeton d'envoi d'une photo                                    |

Pour la charte, deux ajouts rétrocompatibles, en lecture seule :

- `manifest` embarque `composition` — voitures de la rame dans l'ordre,
  classe, places actives et leur position sur le plan ;
- `manifest`, `manifestTickets` et `verifyTicket` résolvent la voiture de
  chaque titre depuis sa place quand le titre ne la porte pas (les titres
  vendus au guichet n'avaient pas de `coachLabel`).

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

L'application ne demande **que** le compte qui la concerne
(`demoAccounts.list` avec `only: ["controle"]`) : proposer un compte guichet
sur le terminal d'un contrôleur n'aurait aucun sens, et transmettrait au
passage des identifiants dont cette application n'a pas l'usage.

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
l'application, puisqu'il faut un second terminal. Il se veut idempotent,
mais ne l'est pas tout à fait : sa recherche des titres déjà vendus filtre
sur une voiture que ces titres ne portent pas, si bien que chaque relance
vend six titres de plus sur la desserte.

Ajouter `--prod` à ces deux commandes les applique à la production.

## Déploiement

L'application est un projet Vercel distinct, `setrag-controleur-web`, dont la
racine est `apps/controleur-web`. Ses variables pointent vers le déploiement
Convex de **production** :

```
NEXT_PUBLIC_CONVEX_URL=https://clean-axolotl-730.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://clean-axolotl-730.convex.site
```

Sans elles, la compilation échoue sur « Variable d'environnement manquante :
NEXT_PUBLIC_CONVEX_URL ».

L'URL publique doit ensuite être ajoutée aux origines de confiance, sinon
l'ouverture de session est refusée par CORS avant même d'atteindre le mot de
passe :

```bash
cd packages/backend && bunx convex env set --prod TRUSTED_ORIGINS "https://setrag-billetterie-two.vercel.app,https://setrag-agent.vercel.app,https://setrag-controlleur.vercel.app"
```

### Le piège du plan Hobby

Vercel refuse de déployer un commit dont l'auteur ne possède pas le compte, et
le plan Hobby n'accepte pas de collaborateurs sur un dépôt privé. Or les
commits de fusion créés par GitHub portent `noreply@github.com` : un
« Merge pull request » est donc **bloqué avant toute compilation**, sans que
rien n'apparaisse dans les journaux de build.

Deux parades : pousser sur `main` un commit dont l'auteur est l'e-mail du
compte Vercel (`git config user.email`), ou déployer depuis un poste avec
`bunx vercel --prod`, qui attribue le déploiement au compte connecté.

## Vérifications

```bash
cd apps/controleur-web && bun run typecheck && bun run lint && bun run test:once && bun run build
```

Les tests couvrent ce qui doit tenir sans réseau : vérification de titres
réellement signés (verdicts valide, contrefait, hors segment, expiré, annulé,
déjà contrôlé, abonnement, clé hors service), atomicité des écritures, ordre
de la file, conservation des échecs, refus de purge prématurée, et égalité du
tarif embarqué avec le barème de référence du backend. S'y ajoutent les
règles de la charte : familles et suites des verdicts (un seul primaire,
retour automatique limité aux titres acceptés), gare proposée d'après
l'horaire, titres contrôlés distincts, états du bandeau, thème de nuit, et
formats (taux « 43,42 », heures de Libreville).
