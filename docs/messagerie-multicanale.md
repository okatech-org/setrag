# Messagerie multicanale — assistant Mbolo

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
  → ai.chat.sendMessage
  → messagingOutbox
  → dispatcher du canal
  → adaptateur API Telegram
```

Le webhook accuse réception avant l'appel au modèle. Les erreurs de réseau ne
font donc pas perdre le message : l'événement et la réponse sortante ont chacun
leur état et leur politique de retry.

## Modèle de données

| Table                 | Responsabilité                                             |
| --------------------- | ---------------------------------------------------------- |
| `messagingIdentities` | Identité propre au canal et futur rattachement à un compte |
| `messagingThreads`    | Conversation externe ↔ conversation Mbolo                  |
| `messagingEvents`     | Inbox, déduplication et reprises                           |
| `messagingApprovals`  | Jetons opaques de confirmation/refus                       |
| `messagingOutbox`     | Envois, statut de livraison et retries                     |
| `assistantTurns`      | Résultat IA structuré rejouable                            |

Les identifiants externes sont conservés sous forme de chaînes. Ils ne doivent
jamais être traités comme des identifiants de comptes SETRAG.

## Configuration Telegram

Créer le bot avec BotFather, puis poser les secrets sur le déploiement Convex :

```bash
cd packages/backend
bunx convex env set MESSAGING_SESSION_SECRET "$(openssl rand -base64 48)"
bunx convex env set TELEGRAM_BOT_TOKEN "<token BotFather>"
bunx convex env set TELEGRAM_WEBHOOK_SECRET "$(openssl rand -hex 32)"
```

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

Le bot prend en charge :

- `/start` — accueil ;
- `/nouveau` — nouvelle conversation Mbolo ;
- `/aide` — capacités disponibles ;
- les messages texte privés ;
- les boutons de confirmation et de refus ;
- l'envoi d'un PDF lorsque l'assistant produit `download_ticket`.

Les groupes, médias entrants et notes vocales ne font pas partie de cette
première version.

## Sécurité et idempotence

`MESSAGING_SESSION_SECRET` dérive une clé invitée distincte pour chaque
combinaison canal/thread. Cette clé ne quitte jamais le backend et n'est pas
stockée en clair.

Le `update_id` Telegram déduplique l'entrée. Les événements d'un même thread
sont traités dans l'ordre afin que deux messages simultanés ne modifient pas le
même historique en parallèle.

Les boutons contiennent uniquement un jeton HMAC opaque de moins de 64 octets.
Le backend recharge le nom et les arguments de l'outil mémorisé. Un rejeu du
bouton ne peut ni changer les arguments ni créer une seconde réservation.

## Paiement

Le paiement actuel de la billetterie reste simulé par
`functions.bookings.confirm`. Le bot est donc un canal de démonstration tant
qu'un prestataire réel n'a pas remplacé cette mutation.

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
2. normaliser le payload puis l'insérer dans `messagingEvents` ;
3. planifier `messaging.orchestrator.processEvent` ;
4. traduire `messagingOutbox` vers l'API du canal ;
5. être ajouté au petit dispatcher de sortie ;
6. enregistrer les identifiants et statuts de livraison.

La future intégration WhatsApp ajoutera donc son webhook et son renderer, mais
ne changera ni `ai/contracts.ts`, ni les outils de réservation, ni les
fournisseurs IA.
