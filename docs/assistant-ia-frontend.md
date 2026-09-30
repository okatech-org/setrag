# Assistant IA voyageur — contrat frontend

Ce document décrit l’intégration des assistants texte et vocal dans la
billetterie web et l’application voyageur. Le backend Convex est déjà posé dans
`packages/backend/convex/ai/`.

L’assistant s’appelle **Ruban**. « Mbolo » reste une salutation gabonaise
possible dans un message d’accueil (« Mbolo ! Je suis Ruban, l’assistant de la
SETRAG… »), jamais un nom.

## Ce que fournit le backend

Quatre profils utilisent le même registre métier :

| Assistant   | Nom affiché        | Usage              | Outils principaux                                 |
| ----------- | ------------------ | ------------------ | ------------------------------------------------- |
| `concierge` | Ruban              | Parcours complet   | Tous les outils autorisés                         |
| `booking`   | Ruban Réservation  | Recherche et achat | Gares, trains, devis et réservation               |
| `tickets`   | Ruban Billets      | Après-vente        | Réservations, billets, téléchargement, annulation |
| `account`   | Ruban Compte       | Compte             | Profil et consentements                           |

Le texte peut être servi par `openai`, `anthropic` ou `google`. Le fournisseur
et le modèle sont des paramètres de déploiement ; aucun composant frontend ne
doit contenir de logique propre à l’un d’eux. La voix utilise OpenAI Realtime
via WebRTC.

Côté serveur, les appels aux fournisseurs texte passent par le Vercel AI SDK
(`ai` 7, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google` 4 ;
`ai/providers.ts`), dans le runtime Convex par défaut, sans `"use node"`. Le
SDK ne fait qu’une étape par appel (`streamText` avec des outils sans
`execute`) : la boucle d’outils, le registre, le dispatcher idempotent par
`callId`, les confirmations et les contrôles d’accès restent ceux de Ruban
(`ai/chat.ts`, `ai/tools.ts`). La réponse s’écrit au fil du flux (voir
« Réponse au fil du flux ») et le modèle relit les résultats d’outils des
derniers échanges (voir « Historique relu par le modèle »).

Le texte et la voix utilisent le même registre métier, filtré selon le profil et
l’identité portée par la conversation (voir « Identité d’une conversation »).
Les outils authentifiés sont retirés pour un visiteur ; à l’inverse,
`request_sign_in` n’est proposé qu’aux visiteurs. Une réservation, un paiement, une annulation, une modification de
profil ou un changement de consentement nécessite une confirmation explicite
côté serveur. Le profil `booking` peut créer une réservation, mais ne peut
jamais déclencher le paiement : après la réservation, le frontend prend le
relais sur l’écran de paiement.

## Fonctions Convex publiques

| Fonction                            | Type     | Rôle                                                             |
| ----------------------------------- | -------- | ---------------------------------------------------------------- |
| `ai.conversations.getConfiguration` | query    | Profils disponibles, fournisseur/modèle et état de configuration |
| `ai.conversations.create`           | mutation | Crée une conversation                                            |
| `ai.conversations.get`              | query    | Lit une conversation autorisée                                   |
| `ai.conversations.claim`            | mutation | Rattache au compte connecté une conversation commencée en invité |
| `ai.conversations.listMessages`     | query    | Historique paginé/borné                                          |
| `ai.conversations.getReply`         | query    | Réponse de Ruban à une question, pendant qu’elle s’écrit         |
| `ai.conversations.listTurns`        | query    | Cartes et confirmations des tours terminés, pour réafficher      |
| `ai.conversations.listMine`         | query    | Conversations du compte connecté                                 |
| `ai.conversations.close`            | mutation | Ferme une conversation                                           |
| `ai.chat.sendMessage`               | action   | Envoie un tour texte et exécute les outils de lecture            |
| `ai.chat.approveToolCall`           | action   | Confirme exactement un appel engageant mémorisé                  |
| `ai.chat.rejectToolCall`            | action   | Refuse explicitement un appel engageant mémorisé                 |
| `ai.realtime.mintVoiceToken`        | action   | Crée un secret OpenAI éphémère et les outils de la session       |
| `ai.realtime.executeVoiceTool`      | action   | Exécute un appel reçu sur le DataChannel                         |
| `ai.realtime.updateVoiceSession`    | action   | Marque une session `connected`, `ended` ou `failed`              |
| `messaging.linking.startFromSite`   | action   | Émet un lien `t.me` pour relier Telegram au compte connecté      |
| `messaging.linking.listMine`        | query    | Messageries reliées au compte connecté                           |
| `messaging.linking.unlink`          | mutation | Délie une messagerie depuis l’espace compte                      |
| `ai.memory.listMine`                | query    | Ce que Ruban retient du compte connecté                          |
| `ai.memory.forget`                  | mutation | Efface une note de Ruban                                         |
| `ai.memory.forgetAll`               | mutation | Efface toutes les notes de Ruban du compte                       |

Signatures exactes des fonctions ajoutées :

```ts
// Rattachement : session obligatoire. Idempotent pour le même compte.
api.ai.conversations.claim({
  conversationId: Id<"assistantConversations">,
  guestKey: string,
}) // → { conversationId, status: "claimed" | "already_claimed" }

api.ai.conversations.listTurns({
  conversationId: Id<"assistantConversations">,
  guestKey?: string,
  limit?: number, // 1 à 100, 50 par défaut
}) // → Array<{
//   requestId: string
//   createdAt: number
//   clientActions: Array<{ type: string; payload: unknown }>
//   pendingApprovals: Array<{
//     executionId: string; callId: string; toolName: string
//     label: string; input: unknown
//     status: "approval_required" | "running" | "succeeded" | "failed" | "rejected"
//   }>
// }>  — tours terminés, du plus ancien au plus récent

api.ai.chat.sendMessage({
  conversationId, guestKey?, requestId, content,
  pageContext?: string, // ≤ 600 caractères, facultatif
})

// Réponse au fil du flux : même accès que la conversation. `null` tant que
// le tour n'a pas commencé à répondre, et pour une conversation devenue
// inaccessible (déconnexion, compte désactivé) : l'abonnement ne lève jamais.
api.ai.conversations.getReply({
  conversationId: Id<"assistantConversations">,
  guestKey?: string,
  requestId: string, // celui de sendMessage
}) // → { content: string; status: "en_cours" | "termine" | "erreur"; error: string | null } | null

// Session obligatoire, rôle voyageur. Au plus 3 liens en cours par compte.
api.messaging.linking.startFromSite({ canal: "telegram" })
// → { disponible: true; url: string; expiresAt: number }
//     url = "https://t.me/<bot>?start=<jeton>", valable 10 min, une fois
//   | { disponible: false } // TELEGRAM_BOT_USERNAME absent

api.messaging.linking.listMine({})
// → Array<{ identityId, canal, nomAffiche, linkedAt: number | null, lastSeenAt: number }>

api.messaging.linking.unlink({ identityId: Id<"messagingIdentities"> })
// → { delie: true }

// Création : `attachedToAccount` dit si la conversation appartient déjà au
// compte. Faux pour un visiteur, et pour une session ouverte avant que son
// profil existe (inscription en cours) : l'interface la rattache alors avec
// `claim` dès que le profil est prêt.
api.ai.conversations.create({ guestKey, assistantId?, provider? })
// → { conversationId, assistant, attachedToAccount: boolean, provider, model, configured }

// Ce que Ruban retient — session obligatoire (« Non authentifié » sinon).
api.ai.memory.listMine({})
// → Array<{
//   _id: Id<"assistantMemories">
//   category: "preference" | "trajet" | "compagnon" | "contrainte" | "rappel" | "autre"
//   content: string          // une phrase, 200 caractères au plus
//   source: "session" | "messaging"   // prise sur le site/l'app, ou dans une messagerie
//   createdAt: number; updatedAt: number
// }>  — 50 au plus, les plus récentes d'abord

api.ai.memory.forget({ memoryId: Id<"assistantMemories"> }) // → { count: 1 }
// « Note introuvable. » pour une note inconnue comme pour celle d'un autre compte.
api.ai.memory.forgetAll({})                                  // → { count: number }
```

## Session invitée

Une personne peut chercher et réserver sans compte, comme dans le parcours de
billetterie existant, puis payer elle-même dans l’interface. Le frontend crée un
secret aléatoire, le conserve dans `sessionStorage` et l’envoie à chaque appel
de cette conversation. Ne jamais le placer dans une URL, un log analytics ou un
rapport d’erreur.

```ts
const STORAGE_KEY = "setrag.ai.guest-key"

export function getGuestKey(): string {
  const existing = sessionStorage.getItem(STORAGE_KEY)
  if (existing) return existing
  const created = `${crypto.randomUUID()}${crypto.randomUUID()}`
  sessionStorage.setItem(STORAGE_KEY, created)
  return created
}
```

## Identité d’une conversation

L’identité est portée par la conversation (`userId`) et résolue une seule fois
côté serveur :

- une conversation créée par une personne connectée appartient à son compte ;
  elle n’est accessible qu’avec la session de ce compte ;
- une conversation créée en visiteur n’a pas d’acteur, **même si la personne
  s’est connectée depuis** : les outils personnels restent absents et le
  contexte voyageur n’est pas chargé tant qu’elle n’est pas rattachée ;
- aucune fonction publique n’accepte d’identifiant de compte.

Après une connexion en cours de conversation, rattacher la conversation au
compte plutôt que d’en recréer une :

```ts
const claim = useMutation(api.ai.conversations.claim)

// Juste après la connexion (carte de connexion du chat ou connexion ailleurs).
await claim({ conversationId, guestKey: getGuestKey() })
```

`claim` exige une session, une conversation active, sans compte, et le
`guestKey` qui l’a créée. L’historique est conservé : le tour suivant voit les
outils authentifiés, le profil et les voyageurs enregistrés. L’appel est
idempotent pour le même compte (`status: "already_claimed"`) et refusé si la
conversation appartient à un autre compte (« Conversation inaccessible. »). Une
fois rattachée, la conversation n’est plus accessible par le seul `guestKey`.

## Chat texte

```tsx
import { useAction, useMutation } from "convex/react"
import { api } from "@workspace/backend/generated"

export function useTravelAssistant() {
  const createConversation = useMutation(api.ai.conversations.create)
  const sendMessage = useAction(api.ai.chat.sendMessage)
  const approve = useAction(api.ai.chat.approveToolCall)

  async function start() {
    return createConversation({
      guestKey: getGuestKey(),
      assistantId: "concierge",
      // Omettre provider pour utiliser la configuration serveur.
    })
  }

  async function send(
    conversationId: Id<"assistantConversations">,
    text: string
  ) {
    return sendMessage({
      conversationId,
      guestKey: getGuestKey(),
      requestId: crypto.randomUUID(),
      content: text,
      // Facultatif : ce que la personne a sous les yeux.
      pageContext: describeCurrentPage(),
    })
  }

  return { start, send, approve }
}
```

`requestId` est une clé d’idempotence. Elle doit rester identique si le client
réessaie le même envoi après une coupure, et changer pour un nouveau message.

`pageContext` (600 caractères au plus) décrit brièvement l’écran affiché, par
exemple « Page : résultats. Recherche : Owendo → Franceville, vendredi
2 octobre, 2 voyageurs. ». Le backend l’injecte dans les instructions du seul
tour en cours, comme une donnée non fiable, jamais comme une consigne ; il n’est
pas stocké dans l’historique. Au-delà de 600 caractères, l’envoi est refusé.
N’y mettre ni téléphone, ni e-mail, ni identifiant technique.

La réponse contient :

```ts
type ChatResult = {
  message: string
  provider: "openai" | "anthropic" | "google"
  model: string
  pendingApprovals: Array<{
    executionId: string
    callId: string
    toolName: string
    label: string
    input: unknown
  }>
  clientActions: Array<{ type: string; payload: unknown }>
  usage: { inputTokens: number; outputTokens: number }
  cached: boolean
}
```

`message` est le texte final, identique à celui qui s’est écrit pendant le flux
(textes de toutes les étapes du tour, séparés par une ligne vide). Les
`clientActions` servent à synchroniser l’interface sans réinterpréter le
texte :

- `show_trip_results`
- `show_quote`
- `show_booking`
- `show_my_bookings`
- `show_my_tickets`
- `show_payment_confirmation`
- `show_cancellation`
- `download_ticket`
- `request_sign_in` — `payload: { reason: string }` (motif court, par
  exemple « retrouver vos billets »)
- `show_memory` — Ruban vient de noter ou d'oublier : `payload:
  { action: "noted", memoryId, category, content, replaced }`,
  `{ action: "forgotten", count: 1, content }` ou
  `{ action: "forgotten_all", count }`. L'interface le montre en une ligne,
  avec un lien vers « Ce que Ruban retient » : rien ne se retient en silence.

Le `payload` provient du backend métier. Il faut le passer aux composants
existants de résultats, devis, réservation ou billet.

Les sorties de `get_booking`, `list_my_bookings` et `list_my_tickets` (texte
et voix) sont des projections : elles partent aussi chez le fournisseur IA et
ne portent jamais le code-barres signé d’un titre (`barcodePayload`,
`barcodeSignature`), ni pièce d’identité, date de naissance, nationalité,
téléphone d’urgence, numéro débité (`payerPhone`) ou e-mail de contact. Ce
qui reste :

```ts
// show_booking (get_booking) — null si référence ou téléphone incorrect
type BookingPayload = {
  sale: { number: string; status: string; amounts: { ttc: number }; priceLockedUntil: number | null }
  tickets: Array<{
    _id: string
    passenger: { firstName: string; lastName: string }
    serviceClass: string; seatLabel: string | null; status: string; unitPriceTtc: number
  }>
  trip: {
    trainNumber: string; trainType: string; serviceDate: string
    departureAt: number; arrivalAt: number; status: string; delayMinutes: number
  } | null
  origin: { name: string } | null
  destination: { name: string } | null
  segment: { departureAt: number; arrivalAt: number } | null
}

// show_my_bookings (list_my_bookings) — une ligne par dossier
type MyBookingsPayload = Array<
  Pick<BookingPayload, "sale" | "trip" | "origin" | "destination" | "segment"> & {
    ticketCount: number
  }
>

// show_my_tickets (list_my_tickets) — billets valides
type MyTicketsPayload = Array<{
  reference: string
  ticket: {
    _id: string; status: string
    passenger: { firstName: string; lastName: string }
    serviceClass: string; coachLabel: string | null; seatLabel: string | null
  }
  trip: BookingPayload["trip"]
  origin: { name: string } | null
  destination: { name: string } | null
}>
```

L’écran qui a besoin du dossier complet le relit avec
`functions.bookings.getByReference` (titulaire connecté ou téléphone de
contact).

`show_trip_results` porte la recherche avec son résultat :

```ts
type TripResultsPayload = {
  serviceDate: string // AAAA-MM-JJ, calculée par le backend
  originStationId: string
  destinationStationId: string
  passengers: number
  trips: Array<{
    tripId: string
    trainNumber: string
    trainType: string
    serviceDate: string
    status: string
    cancelled: boolean // desserte supprimée : affichée, marquée, sans prix
    departureAt: number
    arrivalAt: number
    departureTime: string // « 08:00 », heure de Libreville, à afficher telle quelle
    arrivalTime: string
    distanceKm: number
    intermediateStops: number
    availableByClass: Partial<Record<"DEUXIEME" | "PREMIERE" | "VIP", number>>
    prixParClasse: Partial<
      Record<"DEUXIEME" | "PREMIERE" | "VIP", { totalTtc: number; unitaireTtc: number }>
    >
    hasAvailability: boolean
  }>
}
```

La sortie de l’outil vocal `search_trips` a la même forme : lire `output.trips`
et non plus un tableau nu.

### Invitation à se connecter

Le modèle appelle `request_sign_in` quand un visiteur demande ses billets, ses
réservations, son compte, ou veut s’identifier. L’outil ne demande aucune
confirmation et n’est jamais proposé à une conversation rattachée. L’interface
affiche une carte de connexion dans le fil (avec `payload.reason`), fait se
connecter la personne, puis appelle `claim`. Le modèle ne demande jamais
d’identifiant, de mot de passe ni de code dans la conversation.

Dans un fil de messagerie, `request_sign_in` ne produit ni jeton ni lien de
connexion : Ruban explique comment relier la messagerie depuis le site et
joint un bouton vers `${SITE_URL}/compte/messageries` (voir plus bas).

### Paiement par l’assistant

`pay_booking` prend `{ reference, method, payerPhone, contactPhone }` et passe
par `functions.bookings.confirmForActor` : le règlement n’est accepté que du
compte titulaire (l’acteur de la conversation) ou avec le téléphone de contact
donné à la réservation. Un invité doit donc fournir `contactPhone` ; la
référence seule ne suffit pas.

### Réponse au fil du flux

Pendant que `sendMessage` travaille, la réponse s’écrit dans son message
(`assistantMessages`, rôle `assistant`, même `requestId`) :

- le message naît vide, `status: "en_cours"`, dès que le tour commence à
  répondre ; le texte grandit par écritures regroupées (la première tout de
  suite, puis au plus toutes les 200 ms, et à chaque fin d’étape avant un
  outil), chacune portant le texte entier ;
- à la fin du tour, dans la même transaction que le résultat structuré, il
  passe `termine` avec le texte final ;
- si le fournisseur échoue en route, il passe `erreur` : le texte déjà reçu
  reste, `error` porte un libellé pour le voyageur (« La réponse de Ruban a
  été interrompue. Relancez votre question. », ou « Ruban est très sollicité…
  » sur un 429) ; le détail technique ne reste que sur le tour.

Le site s’abonne à `getReply` pour la question en cours et affiche le texte
réellement reçu, sans effet de frappe ; les cartes et confirmations arrivent
avec le résultat de l’action. Relancer une réponse interrompue, c’est rappeler
`sendMessage` avec le **même** `requestId` : le même message repart de zéro
(une seule réponse par question), et un tour que le serveur avait terminé
entre-temps est resservi tel quel (`cached: true`), cartes comprises. Une
réponse en cours ou en erreur n’entre jamais dans l’historique du modèle.

Dans une messagerie, rien ne s’écrit en route : le message naît terminé et
seule la conclusion du modèle part, comme avant le flux.

Chaque étape est bornée (60 s jusqu’au premier contenu, 30 s entre deux
morceaux, 90 s en tout) : un flux figé chez le fournisseur passe la réponse en
erreur au lieu de la laisser « en cours ». Le bail du tour est prolongé à
chaque étape.

### Historique relu par le modèle

À chaque tour, le modèle relit les textes échangés (30 derniers messages) et,
juste avant la réponse des tours récents, leurs appels d’outils avec la sortie
**projetée** qu’il avait lue, au format du SDK : l’appel puis son résultat,
appariés par `callId` (`ai/rejeu.ts`, `assistantTurns.toolCalls`). Il ne
relance donc pas `list_stations` ou `search_trips` pour répondre à « et il
arrive à quelle heure ? », et ne réaffiche pas une carte identique.

- Bornes : les outils des 3 derniers tours qui en ont appelé, de moins de
  30 minutes (au-delà, prix et places ont pu changer : il relance), 12 000
  caractères rejoués au plus en tout, 3 000 par sortie. Les gros résultats
  sont réduits à l’essentiel (8 trajets d’une recherche, sans horodatages
  bruts ; arrêts d’une desserte en heures de Libreville) ou tronqués
  proprement (éléments omis comptés), jamais coupés au milieu.
- Une confirmation se relit dans son état **actuel** (`approval_required`
  toujours ouverte, confirmée avec son résultat, annulée) : une question posée
  pendant qu’une carte est ouverte ne l’invalide pas, et le modèle ne rappelle
  pas l’outil pour la même action. Une confirmation encore ouverte se relit
  toujours, hors fenêtre et hors budget. Dans une messagerie, dont les boutons
  valent 15 minutes, elle se relit ensuite comme expirée, à reproposer.
- Acteur : ce qui dépend de l’acteur (réservations, billets, profil, notes,
  confirmations) n’est relu qu’à l’acteur qui l’a obtenu. Après `claim`, le
  compte ne relit de la période invitée que les données publiques (gares,
  trains, prix) ; la liaison d’une messagerie, elle, ouvre une conversation
  neuve, sans rien de l’échange invité ; un outil qui n’est plus ouvert à
  l’acteur courant (`request_sign_in` après connexion) n’est jamais relu. Le
  lien temporaire d’un billet (`get_ticket_download_url`) n’est jamais gardé.
- Données personnelles : ces appels sont effacés avec leur tour par
  `deleteMyAccount` et figurent dans `exportMyData.assistantConversations`
  (messages écrits et appels d’outils gardés de chaque conversation ; 50
  conversations au plus, `truncated` au-delà de 200 messages ou 100 tours lus,
  `assistantConversationsTruncated` si le volume lu dépasse 6 millions de
  caractères). Les sorties d’outils brutes (`role: "tool"`) n’y sont pas.

### Réafficher une conversation

Après un rechargement, `listMessages` rend le texte (avec le `status` d’une
réponse en cours ou interrompue) et `listTurns` les cartes :
pour chaque tour terminé, ses `clientActions` et ses `pendingApprovals`, chacune
avec l’état courant de l’exécution. Seules les approbations encore
`approval_required` doivent présenter « Confirmer » et « Annuler » ; les
autres s’affichent comme résolues (`succeeded`, `rejected`, `failed`).

### Confirmation texte

Pour chaque `pendingApprovals`, afficher une carte lisible reprenant l’action et
ses informations essentielles, avec « Confirmer » et « Annuler ». Ne jamais
permettre au client d’éditer les arguments mémorisés.

```ts
await approve({
  conversationId,
  guestKey,
  callId: pending.callId,
})
```

Le backend recharge lui-même le nom et les arguments originaux. Un double clic
ou un rejeu reçoit le résultat déjà enregistré et ne crée pas une seconde
réservation.

Le bouton « Annuler » appelle symétriquement :

```ts
await reject({
  conversationId,
  guestKey,
  callId: pending.callId,
})
```

Le refus est mémorisé et ajouté une seule fois à l'historique. Après une
confirmation réussie, le backend ajoute aussi une synthèse déterministe
contenant notamment la référence utile, afin que le tour suivant conserve le
contexte même si l'approbation a eu lieu hors de la session du modèle.

## Voix OpenAI Realtime

OpenAI recommande WebRTC pour les clients navigateur/mobile, et le backend
génère un secret éphémère via `/v1/realtime/client_secrets`. La clé API standard
reste exclusivement dans Convex :

- [Realtime API avec WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc)
- [Conversations et function calling Realtime](https://developers.openai.com/api/docs/guides/realtime-conversations#function-calling)

### Démarrage

1. Créer ou réutiliser une conversation.
2. Appeler `ai.realtime.mintVoiceToken`.
3. Demander le micro.
4. Créer le `RTCPeerConnection`, l’élément audio et le DataChannel
   `oai-events`.
5. Envoyer l’offre SDP à `grant.url` avec `grant.token`.
6. Marquer la session `connected`.

```ts
const grant = await mintVoiceToken({
  conversationId,
  guestKey,
  voice: "marin",
})
if (!grant.available) return showVoiceUnavailable(grant.reason)

const pc = new RTCPeerConnection()
const audio = new Audio()
audio.autoplay = true
pc.ontrack = (event) => {
  audio.srcObject = event.streams[0]
}

const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
pc.addTrack(stream.getAudioTracks()[0]!, stream)

const channel = pc.createDataChannel("oai-events")
const offer = await pc.createOffer()
await pc.setLocalDescription(offer)

const sdp = await fetch(grant.url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${grant.token}`,
    "Content-Type": "application/sdp",
  },
  body: offer.sdp,
})
if (!sdp.ok) throw new Error(`Realtime SDP: ${sdp.status}`)

await pc.setRemoteDescription({
  type: "answer",
  sdp: await sdp.text(),
})
```

Le secret a une durée courte. Ne pas le persister, le journaliser ou le
réutiliser pour une autre connexion.

### Appels d’outils sur le DataChannel

Écouter `response.done`. Sa sortie peut contenir plusieurs
`function_call` : les traiter tous. Pour chacun :

1. parser `arguments` ;
2. appeler `ai.realtime.executeVoiceTool` avec le même `call_id` ;
3. renvoyer le résultat en `function_call_output` ;
4. envoyer `response.create`.

```ts
channel.addEventListener("message", async (event) => {
  const serverEvent = JSON.parse(event.data)
  if (serverEvent.type !== "response.done") return

  for (const item of serverEvent.response.output ?? []) {
    if (item.type !== "function_call") continue

    const result = await executeVoiceTool({
      conversationId,
      guestKey,
      callId: item.call_id,
      name: item.name,
      input: JSON.parse(item.arguments || "{}"),
    })

    channel.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: item.call_id,
          output: JSON.stringify(result),
        },
      })
    )
    channel.send(JSON.stringify({ type: "response.create" }))
  }
})
```

### Confirmation entièrement vocale

Le grant ajoute un outil spécial `confirm_pending_action`. Lorsqu’une action
engageante retourne `approval_required`, le modèle demande oralement « Voulez-
vous confirmer ? ». Si la personne répond clairement oui, le modèle appelle
`confirm_pending_action` avec le `callId` original. Le backend recharge et
exécute exactement les arguments mémorisés.

L’interface montre aussi une carte tactile pendant cette attente. Un tap sur
« Confirmer » injecte un message utilisateur explicite dans la conversation
Realtime ; le modèle doit ensuite appeler `confirm_pending_action`. Le frontend
ne renvoie jamais lui-même l’appel original avec un drapeau `approved`, car
l’autorisation reste portée par l’appel de confirmation mémorisé côté serveur.

### Transcriptions et état visuel

Afficher au minimum ces états : `connecting`, `listening`, `thinking`,
`speaking`, `approval`, `error`, `ended`. Les événements Realtime utiles sont :

- transcription utilisateur terminée ;
- delta/transcription de réponse audio ;
- `response.done` ;
- `error` ;
- `rate_limits.updated`.

À la fermeture, arrêter toutes les pistes locales, fermer le DataChannel puis
le peer connection, et appeler `updateVoiceSession(..., status: "ended")`.

## Implémentation dans la billetterie web

Le composant prêt à l’emploi se trouve dans
`apps/billetterie-web/src/components/assistant/voice-travel-assistant.tsx`. Il
est intégré aux deux blocs de recherche :

- `components/trip-search-form.tsx` pour le parcours principal ;
- `components/home/mobile-search-card.tsx` pour la carte mobile.

Le bouton rond avec l’icône micro est placé à droite de l’action de recherche.
Il ouvre la conversation sans modale : un indicateur flottant non bloquant
affiche l’état d’écoute, la dernière réponse utile et le bouton d’arrêt. La
conversation synchronise les gares, la date et le nombre de voyageurs avec le
formulaire existant, puis annonce les horaires retournés par le backend. Après
le devis et la confirmation explicite, une réservation est créée, les données
sont placées dans `ticketingStorage` et l’utilisateur est redirigé vers
`/paiement`.

Les parseurs Realtime et l’adaptation vers le parcours existant sont isolés
dans
`apps/billetterie-web/src/features/assistant/voice-assistant-runtime.ts`.
Ils sont testés indépendamment du composant WebRTC.

L’assistant ne transforme pas une ville arbitraire en gare fictive. Par exemple,
« Libreville » est rapproché d’Owendo uniquement après confirmation, tandis
qu’une destination absente de `list_stations` donne lieu à une explication et à
la proposition des gares réellement desservies.

### Le fil de conversation

L’état de Ruban (`fonctionnalites/assistant/contexte-ruban.tsx`) et son fil
(`fil.tsx`) suivent le flux :

- à l’envoi, la question et sa réponse `ruban-<requestId>` entrent ensemble
  dans le fil, la réponse vide et `etat: "en-cours"` ; le contexte s’abonne à
  `getReply` et la réponse prend le texte reçu. Même clé, même nœud jusqu’à la
  fin : terminée (cartes et confirmations), ou interrompue (`etat: "erreur"`,
  texte partiel, libellé, bouton « Relancer la question », hauteur 44 px) ;
- aucun effet de frappe : le texte affiché est celui que le serveur a écrit.
  « Ruban cherche… » (et le S qui s’anime, figé si `prefers-reduced-motion`)
  n’apparaît qu’après 400 ms sans premier mot, ou 700 ms sans nouveau morceau
  (un outil travaille) ;
- la région de la réponse est `aria-live="polite"`, `aria-busy` tant qu’elle
  s’écrit : elle est annoncée une fois complète ;
- défilement : la dernière question est épinglée à 12 px du haut, la réserve
  mesurée par `ResizeObserver` rétrécit à mesure que la réponse grandit (rien
  ne bouge au-dessus), et « Aller au dernier message » apparaît dès que la
  réponse déborde, sans attendre un défilement ;
- une réponse qui s’écrivait lors d’un rechargement devient « interrompue » ;
  la relancer ressert le tour si le serveur l’a terminé.

### Un bon agent : il agit, suppose, et ne demande qu’un feu vert

Ruban (texte et voix) se conduit comme un bon agent de gare
(`buildAssistantInstructions`, `ai/contracts.ts`) :

- il ne demande jamais la permission d’utiliser les informations du voyageur
  connecté (profil, voyageurs enregistrés, notes) ni ce qu’il vient de dire :
  il s’en sert et les nomme dans le récapitulatif (« pour vous, Élise
  Ndong ») ;
- il cherche les trains, calcule le devis et relit le compte sans demander ;
- il fait les hypothèses évidentes et les dit : « réserve-moi un billet » =
  le titulaire voyage seul ; contact = son téléphone ; classe = celle évoquée
  ou notée, sinon la 2e, en le disant ; plusieurs trains = le plus adapté, avec
  l’alternative citée. Il ne pose une question que pour ce qui manque
  vraiment (gare de départ ou d’arrivée, date ; civilité du titulaire si elle
  n’est pas connue), une à la fois ;
- **une seule confirmation, portée par la carte** : dès que tout est réuni, il
  appelle `quote_booking` puis `create_booking`, et la carte de confirmation
  est le feu vert. Le texte qui l’accompagne est un récapitulatif affirmatif
  (« L’Express 201 de demain, 08:00, Owendo → Franceville, en 2e classe, pour
  vous, Élise Ndong : 34 500 FCFA. Confirmez sur la carte… »), jamais « puis-je
  réserver ? ». Même logique pour le paiement et l’annulation ; dans une
  messagerie, ce sont les boutons ; à l’oral, un seul « Je réserve ? » ;
- après une action réussie, il enchaîne sur l’étape suivante sans demander
  « voulez-vous continuer ? » (voir `toolResolutionMessage`).

Les heures annoncées viennent des champs `departureTime`/`arrivalTime` (heure
de Libreville) : le modèle ne convertit jamais un horodatage lui-même.

Un voyageur, c’est un prénom, un nom et une civilité. Date de naissance,
document d’identité, nationalité, e-mail, code promotionnel et siège ne sont
jamais demandés ; le siège est attribué par l’inventaire.

### Le voyageur « Moi »

Le compte porte son voyageur par défaut : le **titulaire**, décrit par le
profil (`users` : prénom, nom, téléphone, e-mail et `gender`, civilité
facultative `M`/`F`). Il n’existe pas de fiche en double dans
`savedPassengers`, qui reste la liste des personnes avec qui l’on voyage.
Règles pures partagées : `convex/model/titulaire.ts`, exporté pour le web
sous `@workspace/backend/titulaire`.

- La civilité se demande **une fois** : à la fin de l’inscription (étape du
  nom), dans le profil, ou par Ruban s’il ne la connaît pas. Dans ce dernier
  cas, la civilité donnée pour le titulaire dans une réservation confirmée
  complète son profil (`completerCiviliteDuTitulaire`, appelée par
  `bookings.create`/`createForActor` ; jamais pour remplacer une civilité
  connue, journalisée `profil.completer_civilite`) ; la réponse de la
  réservation porte `civiliteEnregistree`.
- Un compte plus ancien sans civilité au profil la retrouve dans la fiche
  enregistrée à ses nom et prénom, s’il en avait créé une pour lui-même.
- Le contexte injecté à chaque tour d’une conversation rattachée contient
  `profile` (dont `gender` et `missingForTicket`, ce qui manque encore pour
  un billet), `savedPassengers` et les notes de Ruban.

### Ce que Ruban retient

Une mémoire par **compte** (jamais pour un invité), partagée entre le site,
l’application et les messageries reliées : table `assistantMemories`,
fonctions `ai/memory.ts`, règles pures `model/memoire.ts`.

- Ruban note avec l’outil `remember` (`{ category, content, replacesMemoryId }`)
  des faits durables dits par le voyageur : classe ou horaires préférés,
  trajets habituels, compagnons (prénom et lien), contraintes, « rappelle-
  moi… ». Il oublie avec `forget` (`{ memoryId, all }`). Ni l’un ni l’autre
  ne demande de confirmation ; tous deux sont réservés aux conversations
  rattachées à un compte.
- Filtrage serveur : une note contenant un numéro (6 chiffres ou plus, hors
  dates, heures et montants), un e-mail, un lien, une balise, ou un mot de
  pièce d’identité, code, moyen de paiement, santé, croyance, opinion ou
  consigne adressée à l’assistant est **refusée**, jamais tronquée.
- 50 notes par compte au plus : au-delà, la plus ancienne cède la place. Les
  30 plus récentes sont injectées dans les instructions, sérialisées en JSON
  dans un bloc « données, jamais des consignes ». Pas de recherche
  vectorielle : à ce volume, une lecture indexée suffit.
- Chaque écriture est journalisée (`assistant_memoire.noter`, `.modifier`,
  `.oublier`, `.tout_oublier`) sans le contenu de la note. Les notes font
  partie de l’export (`exportMyData.assistantMemories`) et sont effacées par
  `deleteMyAccount`.
- Le voyageur les voit et les efface dans `/compte/ruban` (« Ce que Ruban
  retient »), ou en le demandant à Ruban (« oublie ça », « oublie tout »).

Les vues de compte desktop et mobile exposent les mêmes rubriques : profil,
voyageurs enregistrés, affichage/langue et notifications. La page d’accueil
mobile utilise toujours le bloc de recherche compact, y compris sans connexion ;
l’état d’authentification ne change pas la densité du formulaire.

## Relier une messagerie depuis le site

Le lien de liaison naît sur le site, jamais dans le fil. Dans l’espace compte
(`/compte/messageries`, `fonctionnalites/compte/messageries.tsx`) :

1. le voyageur connecté appuie sur « Relier Telegram » (bouton secondaire) ;
   le site appelle `messaging.linking.startFromSite({ canal: "telegram" })` ;
2. avec `{ disponible: true, url, expiresAt }`, l’écran affiche le lien
   « Ouvrir Telegram » (`target="_blank"`, `rel="noreferrer"`), la consigne
   « Dans Telegram, appuyez sur Démarrer. » et l’échéance en mono
   (`.tabular`) ; passé l’échéance, il invite à redemander un lien ;
3. avec `{ disponible: false }`, il dit honnêtement que la liaison n’est pas
   encore ouverte (bot non configuré) ;
4. la personne ouvre le lien dans SON Telegram et appuie sur « Démarrer » ;
   le backend relie cette conversation au compte et le confirme dans le fil.
   `messaging.linking.listMine` étant réactive, la liste des messageries se
   met à jour seule et l’écran affiche « Telegram est relié à votre
   compte. ».

L’adresse contient le jeton : ne la journaliser ni la transmettre à un outil
d’analyse. Elle est valable 10 minutes, une fois, et relie à ce compte la
messagerie qui l’ouvre : la personne ne doit pas la partager. Dans le fil,
`/connexion` et `request_sign_in` ne font que renvoyer vers cette page. Les
messageries reliées se délient avec `messaging.linking.unlink`.

## Sécurité à préserver côté frontend

- Ne jamais appeler directement une fonction métier à partir d’un nom ou
  d’arguments produits par le modèle. Toujours passer par les actions IA.
- Ne jamais mettre `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` ou `GEMINI_API_KEY`
  dans une variable `NEXT_PUBLIC_*` ou dans l’application mobile.
- Ne pas rendre les résultats d’outils en HTML non échappé.
- Masquer téléphone, e-mail et identité dans les analytics.
- Ne pas enregistrer l’audio par défaut. Si une fonction d’enregistrement est
  ajoutée plus tard, elle exigera un consentement séparé.
- Un refus de permission ou une référence/téléphone incorrects doivent rester
  des erreurs métier ; le client ne doit pas contourner le backend.
  `bookings.getByReference` répond `null` aussi bien à une référence inconnue
  qu’à un téléphone qui ne lui correspond pas (et `confirm`/`cancelHold`
  lèvent le même « Référence ou téléphone incorrect ») : l’écran affiche
  « Référence ou téléphone incorrect » sans dire lequel.

## Configuration du déploiement

Exemples depuis `packages/backend` :

```bash
bunx convex env set AI_TEXT_PROVIDER openai
bunx convex env set OPENAI_API_KEY sk-...
bunx convex env set AI_OPENAI_MODEL gpt-5.6-luna

bunx convex env set AI_REALTIME_ENABLED true
bunx convex env set AI_REALTIME_MODEL gpt-realtime-2.1-mini
bunx convex env set AI_REALTIME_VOICE marin
```

Pour basculer le texte :

```bash
bunx convex env set AI_TEXT_PROVIDER anthropic
bunx convex env set ANTHROPIC_API_KEY sk-ant-...
bunx convex env set AI_ANTHROPIC_MODEL claude-sonnet-4-6
```

ou :

```bash
bunx convex env set AI_TEXT_PROVIDER google
bunx convex env set GEMINI_API_KEY ...
bunx convex env set AI_GOOGLE_MODEL gemini-3.5-flash
```

Des surcharges par assistant sont possibles avec
`AI_CONCIERGE_PROVIDER`/`AI_CONCIERGE_MODEL`,
`AI_BOOKING_PROVIDER`/`AI_BOOKING_MODEL`, etc.

Les clés sont lues dans ces seules variables et passées explicitement au SDK,
qui n’en cherche aucune lui-même (`GOOGLE_GENERATIVE_AI_API_KEY`, par exemple,
n’est pas lue). Aucun nouvel essai silencieux : une erreur du fournisseur
remonte telle quelle (`OpenAI (429) : …`, corps borné à 1 000 caractères).

## Critères d’acceptation frontend

- « Je veux aller à Booué » déclenche d’abord la résolution des gares, puis
  demande la date manquante.
- Une date complète déclenche la recherche réelle et propose uniquement des
  horaires/disponibilités du backend.
- Le choix d’un horaire puis d’une classe produit un devis réel.
- La réservation n’est créée qu’après confirmation explicite.
- Après réservation, l’assistant s’arrête et l’utilisateur effectue lui-même le
  paiement.
- Le rejeu réseau d’un même `requestId`/`callId` ne duplique rien.
- Le vocal sait exécuter les mêmes outils et accepte une confirmation orale.
- Un invité ne voit jamais les outils « Mes réservations », « Mes billets » ou
  « Mon profil ».
- « Mes billets » demandé par un invité affiche une carte de connexion ; après
  connexion et `claim`, la même conversation retrouve les billets du compte.
- Un voyageur connecté dont la civilité est connue qui dit « réserve-moi un
  billet Owendo → Franceville demain » reçoit directement le récapitulatif et
  la carte de réservation, sans question sur son identité.
- « Retiens que je préfère la 1re classe » ajoute une note, visible dans
  « Ce que Ruban retient » ; la conversation suivante propose la 1re classe.
- Une conversation rattachée à un compte est refusée à tout autre compte et au
  seul `guestKey`.
- Une session ne révèle aucune clé fournisseur dans le bundle, les logs ou le
  stockage local.
- La réponse de Ruban s’affiche par morceaux pendant qu’elle s’écrit, dans
  la même entrée du fil du début à la fin ; la dernière question reste
  épinglée en haut, et « Aller au dernier message » apparaît dès que la
  réponse déborde.
- Une réponse interrompue garde son texte, affiche un libellé clair et se
  relance sur la même question.
- « Quels trains demain Owendo → Franceville ? » puis « Il arrive à quelle
  heure ? » : la seconde réponse ne relance aucune recherche.
