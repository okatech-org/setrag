# Messagerie multicanale — assistant Ruban

Le backend sépare deux familles de fournisseurs :

- les fournisseurs IA (`openai`, `anthropic`, `google`), sélectionnés par
  l'assistant ;
- les canaux de messagerie (`telegram`, `whatsapp`, `messenger`,
  `apple_messages`), chargés uniquement de recevoir et d'envoyer des messages.

Telegram est le premier adaptateur opérationnel. Le cœur, les tables et les
contrats ne lui sont pas spécifiques afin que WhatsApp puisse être ajouté sans
modifier l'assistant ni les outils billettiques.

## Flux d'un message

```text
Telegram
  → POST /webhooks/telegram
  → vérification de X-Telegram-Bot-Api-Secret-Token
  → déduplication par update_id dans messagingEvents
  → orchestrateur commun, asynchrone et ordonné par thread
  → ai.chat.sendMessageFromThread (variante interne, acteur = compte relié)
  → messagingOutbox
  → dispatcher du canal
  → adaptateur API Telegram
```

Le webhook accuse réception avant l'appel au modèle. Les erreurs de réseau ne
font donc pas perdre le message : l'événement et la réponse sortante ont chacun
leur état et leur politique de retry.

Pas de flux dans une messagerie : sur le site, la réponse de Ruban s'écrit au
fil de l'eau dans son message (`ai.conversations.getReply`) ; depuis un fil,
rien ne s'écrit en route, le message de Ruban naît terminé avec le tour, et
l'orchestrateur met en file d'envoi le message final (`ChatResult.message`)
avec ses boutons. Comme avant, ce message est la conclusion du modèle (sa
dernière étape), sans ce qu'il a dit avant d'appeler un outil.

## Modèle de données

| Table                   | Responsabilité                                             |
| ----------------------- | ---------------------------------------------------------- |
| `messagingIdentities`   | Identité propre au canal et compte SETRAG relié (`userId`) |
| `messagingLinkRequests` | Liens émis depuis le site : compte, empreinte du jeton, échéance |
| `messagingThreads`      | Conversation externe ↔ conversation Ruban                  |
| `messagingEvents`       | Inbox, déduplication et reprises                           |
| `messagingApprovals`    | Jetons opaques de confirmation/refus                       |
| `messagingOutbox`       | Envois, boutons (rappel ou lien), livraison et retries     |
| `assistantTurns`        | Résultat IA structuré rejouable, appels d'outils du tour (`toolCalls`) relus au modèle aux tours suivants |

Les identifiants externes sont conservés sous forme de chaînes. Ils ne doivent
jamais être traités comme des identifiants de comptes SETRAG : seul
`messagingIdentities.userId`, posé quand la personne ouvre dans SA messagerie
un lien émis depuis le site par un compte connecté, relie un fil à un compte.

## Identité et acteur

L’orchestrateur n’a pas de jeton de session. Il appelle les variantes internes
de l’assistant, qui reçoivent le fil (`threadId`) au lieu d’un secret :

| Variante interne                       | Équivalent public          |
| -------------------------------------- | -------------------------- |
| `ai.chat.sendMessageFromThread`        | `ai.chat.sendMessage`      |
| `ai.chat.approveToolCallFromThread`    | `ai.chat.approveToolCall`  |
| `ai.chat.rejectToolCallFromThread`     | `ai.chat.rejectToolCall`   |

`ai.conversations.accessContext` vérifie que la conversation est bien celle du
fil, puis :

- si l’identité du fil n’est reliée à aucun compte, la conversation est
  invitée et n’a pas d’acteur ;
- si elle est reliée, la conversation porte le même `userId` et ce compte
  devient l’acteur : « Mes billets », « Mes réservations », le profil, les
  voyageurs enregistrés et ce que Ruban retient du compte fonctionnent depuis
  la messagerie. Une note prise dans le fil (`remember`) appartient au compte
  (`source: "messaging"`) et vaut aussi sur le site et l’application.

L’acteur venu d’une messagerie (`source: "messaging"`) est refusé si le compte
est désactivé (« Compte désactivé », comme `requireUser`) ou s’il n’est pas
voyageur. Il ne bénéficie jamais des droits internes d’un rôle : le
téléchargement d’un billet (`documents.printDataForActor`) n’y retombe pas
sur le droit aux duplicatas, seul compte la propriété de la vente (ou le
téléphone de contact, comme pour tout invité).

Les outils personnels appellent des fonctions internes `…ForActor` (dans
`functions/bookings`, `functions/customers`, `functions/documents`) avec cet
acteur ; ils ne dépendent plus d’un jeton. Aucune fonction publique n’accepte
d’identifiant de compte ni de fil.

`core.ensureThread` maintient l’invariant : la conversation du fil appartient
toujours au compte relié à l’identité (ou à personne). Une conversation close
ou portant un autre compte est remplacée par une conversation neuve.

## Configuration Telegram

Créer le bot avec BotFather, puis poser les secrets sur le déploiement Convex :

```bash
cd packages/backend
bunx convex env set MESSAGING_SESSION_SECRET "$(openssl rand -base64 48)"
bunx convex env set TELEGRAM_BOT_TOKEN "<token BotFather>"
bunx convex env set TELEGRAM_BOT_USERNAME "<nom du bot, sans @>"
bunx convex env set TELEGRAM_WEBHOOK_SECRET "$(openssl rand -hex 32)"
```

`TELEGRAM_BOT_USERNAME` sert à construire le lien de liaison
`https://t.me/<bot>?start=<jeton>`. Sans lui, `messaging.linking.startFromSite`
répond `{ disponible: false }` et l’espace compte le dit.

Enregistrer ensuite le webhook :

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<deployment>.convex.site/webhooks/telegram",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["message", "callback_query"]
  }'
```

Déclarer aussi les commandes auprès de BotFather (`/setcommands`) :

```text
start - Accueil
connexion - Comment relier votre compte SETRAG
deconnexion - Délier votre compte SETRAG
nouveau - Nouvelle conversation
aide - Ce que Ruban sait faire
```

Le bot prend en charge :

- `/start` — accueil (« Mbolo ! Je suis Ruban, l’assistant de la SETRAG… ») ;
  `/start <jeton>`, envoyé par Telegram quand on appuie sur « Démarrer »
  depuis le lien du site, relie le compte (voir plus bas) ;
- `/nouveau` — nouvelle conversation Ruban (le compte relié est conservé) ;
- `/aide` — capacités disponibles ;
- `/connexion` (ou « connexion », « me connecter ») — explique comment relier
  le compte depuis le site, avec un bouton vers `${SITE_URL}/compte/messageries`
  (sans jeton) ;
- `/deconnexion` (ou « déconnexion », « me déconnecter ») — délie le compte ;
  le fil repart sur une conversation invitée neuve ;
- les messages texte privés ;
- les boutons de confirmation et de refus ;
- le bouton lien « Relier depuis le site » ;
- l'envoi d'un PDF lorsque l'assistant produit `download_ticket`.

## Liaison à un compte SETRAG

Le jeton naît sur le site, pour le compte connecté ; jamais dans le fil. C’est
la personne connectée qui désigne sa messagerie, et non un fil qui désignerait
un compte : un lien envoyé par un tiers ne relie que le compte de ce tiers.

1. Dans son espace compte (`/compte/messageries`), le voyageur connecté
   appuie sur « Relier Telegram ». Le site appelle l’action publique
   `messaging.linking.startFromSite({ canal: "telegram" })`, qui :
   - exige une session et le rôle `voyageur` ;
   - tire un jeton de 32 octets aléatoires, en base64url (43 caractères
     `[A-Za-z0-9_-]`, sous la limite de 64 du paramètre `start` de
     Telegram) ;
   - n’enregistre que son empreinte SHA-256, avec le compte, dans
     `messagingLinkRequests` (échéance 10 minutes, usage unique, au plus
     3 demandes en cours par compte : les plus anciennes expirent) ;
   - rend `{ disponible: true, url: "https://t.me/<bot>?start=<jeton>",
     expiresAt }`, ou `{ disponible: false }` sans `TELEGRAM_BOT_USERNAME`.
2. La personne ouvre le lien dans SON Telegram et appuie sur « Démarrer ».
   Le bot reçoit `/start <jeton>`. `parseTelegramUpdate` n’en garde que
   l’empreinte (`messagingEvents.linkTokenHash`) et expurge le texte et le
   message brut : le jeton n’est stocké nulle part.
3. `messaging.linking.linkFromStart` (interne) vérifie que le jeton existe,
   n’a pas expiré ni servi, que le compte est un voyageur actif, et que
   l’identité Telegram n’est pas déjà reliée à un autre compte (elle doit
   alors être déliée par `/deconnexion` ; le lien reste valable). Il relie
   alors l’identité qui a appuyé sur « Démarrer » au compte du jeton,
   fait repartir le fil sur une conversation neuve du compte — l’échange mené
   en invité est fermé et n’est jamais rattaché, pour qu’une personne ayant
   ouvert le lien d’un autre ne lui livre pas ses messages —, ferme les autres
   liens encore ouverts du compte, journalise `messagerie.lier` et répond
   dans le fil « Votre compte SETRAG (Prénom) est relié à cette
   conversation… Si ce n’est pas votre compte, envoyez /deconnexion. » Le
   prénom permet à qui aurait ouvert le lien d’un autre de s’en apercevoir.
4. Les messages suivants du fil agissent pour ce compte. L’espace compte,
   réactif (`messaging.linking.listMine`), affiche la liaison dès qu’elle
   aboutit.

Dans le fil, `/connexion` et l’outil `request_sign_in` ne produisent aucun
jeton : Ruban explique la marche à suivre et joint un bouton « Relier depuis
le site » vers `${SITE_URL}/compte/messageries`. `SITE_URL` est l’origine de la
billetterie déjà utilisée par l’authentification :

```bash
bunx convex env set SITE_URL https://billetterie.setrag.ga
```

Si le canal ne sait pas afficher de bouton lien
(`CHANNEL_CAPABILITIES[canal].urlButtons`), ou si l’adresse n’est pas en HTTPS
(Telegram refuse les boutons vers `http://localhost`), l’adresse est écrite
dans le texte.

Le cron `purge messaging link requests` (toutes les heures) efface les
demandes échues, par lots.

Depuis l’espace compte, `messaging.linking.listMine` liste les messageries
reliées et `messaging.linking.unlink` les délie : la conversation reliée est
close, le fil est prévenu et repartira sur une conversation invitée.

À la suppression du compte (`customers.deleteMyAccount`), les messageries sont
déliées sans prévenir les fils ; l’identité perd son nom affiché et son
identifiant externe, remplacé par une empreinte non réversible (HMAC avec le
secret serveur) ; ses fils sont fermés et leur identifiant externe effacé de
même. Si la personne écrit de nouveau au bot, elle repart en invitée sur un
fil neuf. Les conversations Ruban du compte (messages, tours, exécutions
d’outils, sessions vocales) sont purgées par `ai.conversations.purgeUserData`,
par lots qui se replanifient ; ce que Ruban retient du compte
(`assistantMemories`) est effacé dans la même transaction que la suppression.

Les groupes, médias entrants et notes vocales ne font pas partie de cette
première version.

## Sécurité et idempotence

`MESSAGING_SESSION_SECRET` dérive une clé invitée distincte pour chaque
combinaison canal/thread. Cette clé ne quitte jamais le backend et n'est pas
stockée en clair.

Le `update_id` Telegram déduplique l'entrée. Les événements d'un même thread
sont traités dans l'ordre afin que deux messages simultanés ne modifient pas le
même historique en parallèle.

Les sorties d’outils envoyées au modèle sont projetées (`ai/tools.ts`) : ni
code-barres signé, ni pièce d’identité, date de naissance, nationalité,
téléphone d’urgence, numéro débité ou e-mail de contact.

Ces sorties projetées, réduites, sont aussi relues au modèle aux tours
suivants (`ai/rejeu.ts`) : un fil ne relance pas la recherche qu’il vient de
faire. Celles qui dépendent de l’acteur (réservations, billets, profil,
notes, confirmations) ne sont relues qu’à l’acteur qui les a obtenues. La
liaison d’un fil à un compte ouvre de toute façon une conversation neuve : rien
de l’échange invité n’est rejoué au compte. Après `/deconnexion`, le fil repart sur une conversation neuve, sans
rien de l’ancienne. Le lien temporaire d’un billet n’est jamais gardé. Les
boutons Confirmer/Annuler valent 15 minutes (`APPROVAL_TTL_MS`) : au-delà,
une confirmation restée sans réponse est relue comme expirée, et Ruban peut
la reproposer.

L’identifiant de sécurité transmis au fournisseur IA (`safety_identifier` de
l’API Responses) est une empreinte HMAC-SHA256 de la clé de limitation, avec
`MESSAGING_SESSION_SECRET` ou, à défaut, `BETTER_AUTH_SECRET` ; jamais un
identifiant de la base. Sans secret, aucun identifiant n’est transmis.

Les boutons contiennent uniquement un jeton HMAC opaque de moins de 64 octets.
Le backend recharge le nom et les arguments de l'outil mémorisé. Un rejeu du
bouton ne peut ni changer les arguments ni créer une seconde réservation.

## Paiement

Le paiement actuel de la billetterie reste simulé par
`functions.bookings.confirm`. Le bot est donc un canal de démonstration tant
qu'un prestataire réel n'a pas remplacé cette mutation.

L’outil `pay_booking` passe par `functions.bookings.confirmForActor` : le
règlement n’est accepté que du compte titulaire (l’acteur du fil) ou avec le
téléphone de contact (`contactPhone`, paramètre de l’outil), exactement comme
`bookings.confirm` sur le site. La référence seule ne suffit pas.

Avant toute ouverture publique :

1. créer un `paymentIntent` ;
2. envoyer un lien de paiement ou une demande Mobile Money ;
3. attendre le webhook signé du prestataire ;
4. confirmer la vente de manière idempotente ;
5. générer et envoyer les billets.

Le retour navigateur ou un message utilisateur ne constitue jamais une preuve
de paiement.

## Ajouter un canal

Un nouvel adaptateur doit :

1. vérifier son webhook ;
2. normaliser le payload puis l'insérer dans `messagingEvents` (commandes
   `/connexion` et `/deconnexion` comprises : les équivalents en texte libre
   sont reconnus par l’orchestrateur). Si le canal offre un lien profond
   équivalent à `/start <jeton>`, ne transmettre que l’empreinte du jeton
   (`linkTokenHash`) et l’expurger du message brut ; `startFromSite` devra
   alors accepter ce canal ;
3. planifier `messaging.orchestrator.processEvent` ;
4. traduire `messagingOutbox` vers l'API du canal, y compris les deux formes de
   bouton : `{ label, data }` (rappel opaque) et `{ label, url }` (lien) ;
5. déclarer `urlButtons` dans `CHANNEL_CAPABILITIES` ;
6. être ajouté au petit dispatcher de sortie ;
7. enregistrer les identifiants et statuts de livraison.

La future intégration WhatsApp ajoutera donc son webhook et son renderer, mais
ne changera ni `ai/contracts.ts`, ni les outils de réservation, ni les
fournisseurs IA, ni la liaison de compte. Points propres à WhatsApp : le
message interactif `cta_url` ne porte qu’un lien et ne se combine pas avec des
boutons de réponse (l’adaptateur devra scinder le message), et un envoi hors de
la fenêtre de 24 heures — l’avis d’une déliaison faite depuis le site peut
arriver plus tard — exige un modèle de message approuvé. La liaison elle-même
répond au message de la personne, dans la fenêtre.
