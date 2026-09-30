/**
 * Fournisseurs simulés pour les tests : des réponses en flux (SSE), au format
 * que lit le Vercel AI SDK pour OpenAI Responses, Anthropic Messages et
 * Google Gemini.
 *
 * Réservé aux tests. Le nom à deux points tient ce fichier hors du
 * déploiement Convex, et hors des fichiers de test de Vitest.
 */

/** Une réponse `text/event-stream` faite des événements donnés. */
export function reponseSse(evenements: unknown[]): Response {
  const corps = evenements
    .map((evenement) => `data: ${JSON.stringify(evenement)}\n\n`)
    .join("")
  return new Response(corps, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  })
}

/** Découpe un texte en morceaux de deux mots, comme un flux réel. */
export function morceaux(texte: string): string[] {
  const mots = texte.match(/\S+\s*/g) ?? []
  const resultat: string[] = []
  for (let index = 0; index < mots.length; index += 2) {
    resultat.push(mots.slice(index, index + 2).join(""))
  }
  return resultat
}

/**
 * Réponse de l'API Responses décrite comme l'ancienne réponse JSON
 * (`output_text`, `output` avec des `function_call`, `usage`), servie en
 * flux : le texte arrive par morceaux, puis les appels d'outils.
 */
export type CorpsOpenAI = {
  output_text?: string
  output?: Array<{
    type?: string
    call_id?: string
    name?: string
    arguments?: string
    content?: Array<{ type?: string; text?: string }>
  }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

export function evenementsOpenAI(corps: CorpsOpenAI): unknown[] {
  const evenements: unknown[] = [
    {
      type: "response.created",
      response: {
        id: "resp_test",
        created_at: 1_700_000_000,
        model: "test-openai",
      },
    },
  ]
  let index = 0
  const texte =
    corps.output_text ??
    (corps.output ?? [])
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .filter((part) => part.type === "output_text")
      .map((part) => part.text ?? "")
      .join("")
  if (texte) {
    const id = `msg_test_${index}`
    evenements.push({
      type: "response.output_item.added",
      output_index: index,
      item: { type: "message", id, role: "assistant", content: [] },
    })
    for (const morceau of morceaux(texte)) {
      evenements.push({
        type: "response.output_text.delta",
        item_id: id,
        output_index: index,
        content_index: 0,
        delta: morceau,
      })
    }
    evenements.push({
      type: "response.output_item.done",
      output_index: index,
      item: {
        type: "message",
        id,
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: texte, annotations: [] }],
      },
    })
    index += 1
  }
  for (const item of corps.output ?? []) {
    if (item.type !== "function_call") continue
    const id = `fc_${item.call_id ?? index}`
    evenements.push({
      type: "response.output_item.added",
      output_index: index,
      item: {
        type: "function_call",
        id,
        call_id: item.call_id,
        name: item.name,
        arguments: "",
      },
    })
    evenements.push({
      type: "response.function_call_arguments.delta",
      item_id: id,
      output_index: index,
      delta: item.arguments ?? "",
    })
    evenements.push({
      type: "response.output_item.done",
      output_index: index,
      item: {
        type: "function_call",
        id,
        call_id: item.call_id,
        name: item.name,
        arguments: item.arguments ?? "",
        status: "completed",
      },
    })
    index += 1
  }
  evenements.push({
    type: "response.completed",
    response: {
      usage: {
        input_tokens: corps.usage?.input_tokens ?? 0,
        output_tokens: corps.usage?.output_tokens ?? 0,
      },
    },
  })
  return evenements
}

export function reponseOpenAI(corps: CorpsOpenAI): Response {
  return reponseSse(evenementsOpenAI(corps))
}

/** Réponse Anthropic Messages en flux : texte, puis `tool_use`. */
export function reponseAnthropic(corps: {
  text?: string
  toolUses?: Array<{ id?: string; name?: string; input: unknown }>
  usage?: { input_tokens?: number; output_tokens?: number }
}): Response {
  const evenements: unknown[] = [
    {
      type: "message_start",
      message: {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "test-anthropic",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: corps.usage?.input_tokens ?? 0, output_tokens: 0 },
      },
    },
  ]
  let index = 0
  if (corps.text) {
    evenements.push({
      type: "content_block_start",
      index,
      content_block: { type: "text", text: "" },
    })
    for (const morceau of morceaux(corps.text)) {
      evenements.push({
        type: "content_block_delta",
        index,
        delta: { type: "text_delta", text: morceau },
      })
    }
    evenements.push({ type: "content_block_stop", index })
    index += 1
  }
  for (const appel of corps.toolUses ?? []) {
    evenements.push({
      type: "content_block_start",
      index,
      content_block: { type: "tool_use", id: appel.id, name: appel.name, input: {} },
    })
    evenements.push({
      type: "content_block_delta",
      index,
      delta: { type: "input_json_delta", partial_json: JSON.stringify(appel.input) },
    })
    evenements.push({ type: "content_block_stop", index })
    index += 1
  }
  evenements.push({
    type: "message_delta",
    delta: {
      stop_reason: (corps.toolUses?.length ?? 0) > 0 ? "tool_use" : "end_turn",
      stop_sequence: null,
    },
    usage: { output_tokens: corps.usage?.output_tokens ?? 0 },
  })
  evenements.push({ type: "message_stop" })
  return reponseSse(evenements)
}

/** Réponse Gemini `streamGenerateContent` (SSE) : texte, puis `functionCall`. */
export function reponseGemini(corps: {
  text?: string
  functionCalls?: Array<{ name: string; args: unknown }>
  usage?: { promptTokenCount?: number; candidatesTokenCount?: number }
}): Response {
  const evenements: unknown[] = morceaux(corps.text ?? "").map((morceau) => ({
    candidates: [{ content: { role: "model", parts: [{ text: morceau }] } }],
  }))
  evenements.push({
    candidates: [
      {
        content: {
          role: "model",
          parts: (corps.functionCalls ?? []).map((appel) => ({
            functionCall: { name: appel.name, args: appel.args },
          })),
        },
        finishReason: "STOP",
      },
    ],
    usageMetadata: {
      promptTokenCount: corps.usage?.promptTokenCount ?? 0,
      candidatesTokenCount: corps.usage?.candidatesTokenCount ?? 0,
      totalTokenCount:
        (corps.usage?.promptTokenCount ?? 0) +
        (corps.usage?.candidatesTokenCount ?? 0),
    },
  })
  return reponseSse(evenements)
}

/** Corps JSON des requêtes parties vers un fournisseur. */
export function corpsEnvoyes<T = Record<string, unknown>>(
  appels: ReadonlyArray<ReadonlyArray<unknown>>,
  prefixe = "https://api.openai.com/"
): T[] {
  return appels
    .filter(([url]) => String(url).startsWith(prefixe))
    .map(([, init]) => JSON.parse((init as RequestInit).body as string) as T)
}

/** Texte d'un message de l'entrée Responses (`input_text` ou `output_text`). */
export function texteEntree(item: {
  content?: string | Array<{ type?: string; text?: string }>
}): string {
  if (typeof item.content === "string") return item.content
  return (item.content ?? []).map((part) => part.text ?? "").join("")
}
