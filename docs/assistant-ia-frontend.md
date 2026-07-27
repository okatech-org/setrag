# Assistant IA voyageur — contrat frontend

Ce document décrit l’intégration des assistants texte et vocal dans la
billetterie web et l’application voyageur. Le backend Convex est déjà posé dans
`packages/backend/convex/ai/`.

## Ce que fournit le backend

Quatre profils utilisent le même registre métier :

| Assistant   | Usage              | Outils principaux                                 |
| ----------- | ------------------ | ------------------------------------------------- |
| `concierge` | Parcours complet   | Tous les outils autorisés                         |
| `booking`   | Recherche et achat | Gares, trains, devis et réservation               |
| `tickets`   | Après-vente        | Réservations, billets, téléchargement, annulation |
| `account`   | Compte             | Profil et consentements                           |

Le texte peut être servi par `openai`, `anthropic` ou `google`. Le fournisseur
et le modèle sont des paramètres de déploiement ; aucun composant frontend ne
doit contenir de logique propre à l’un d’eux. La voix utilise OpenAI Realtime
via WebRTC.

Le texte et la voix utilisent le même registre métier, filtré selon le profil et
l’identité de la personne. Les outils authentifiés sont retirés pour un
visiteur. Une réservation, un paiement, une annulation, une modification de
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
| `ai.conversations.listMessages`     | query    | Historique paginé/borné                                          |
| `ai.conversations.listMine`         | query    | Conversations du compte connecté                                 |
| `ai.conversations.close`            | mutation | Ferme une conversation                                           |
| `ai.chat.sendMessage`               | action   | Envoie un tour texte et exécute les outils de lecture            |
| `ai.chat.approveToolCall`           | action   | Confirme exactement un appel engageant mémorisé                  |
| `ai.chat.rejectToolCall`            | action   | Refuse explicitement un appel engageant mémorisé                 |
| `ai.realtime.mintVoiceToken`        | action   | Crée un secret OpenAI éphémère et les outils de la session       |
| `ai.realtime.executeVoiceTool`      | action   | Exécute un appel reçu sur le DataChannel                         |
| `ai.realtime.updateVoiceSession`    | action   | Marque une session `connected`, `ended` ou `failed`              |

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

Lorsqu’un utilisateur se connecte, créer une nouvelle conversation authentifiée.
Une conversation créée avant la connexion reste une conversation invitée ; ne
pas essayer de la « promouvoir » côté client.

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
    })
  }

  return { start, send, approve }
}
```

`requestId` est une clé d’idempotence. Elle doit rester identique si le client
réessaie le même envoi après une coupure, et changer pour un nouveau message.

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

Afficher `message` immédiatement. Les `clientActions` servent à synchroniser
l’interface sans réinterpréter le texte :

- `show_trip_results`
- `show_quote`
- `show_booking`
- `show_my_bookings`
- `show_my_tickets`
- `show_payment_confirmation`
- `show_cancellation`
- `download_ticket`

Le `payload` provient du backend métier. Il faut le passer aux composants
existants de résultats, devis, réservation ou billet.

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

Pour finaliser une réservation vocale, Mbolo ne recueille que les informations
du parcours client : trajet, date, nombre d’adultes et d’enfants, horaire,
classe, prénom/nom/sexe des voyageurs et un téléphone de contact. Les
identifiants techniques ne sont jamais prononcés. La date de naissance, le
document d’identité, la nationalité, l’e-mail, le code promotionnel et le numéro
de siège ne sont pas demandés. Le siège est attribué automatiquement par
l’inventaire au moment de la réservation.

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
- Une session ne révèle aucune clé fournisseur dans le bundle, les logs ou le
  stockage local.
