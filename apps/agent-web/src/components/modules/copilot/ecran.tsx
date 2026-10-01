"use client"

import type { FunctionReturnType } from "convex/server"
import {
  Archive,
  ArchiveRestore,
  ArrowUp,
  Check,
  CircleAlert,
  Download,
  ExternalLink,
  Lock,
  PenLine,
  Plus,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Wrench,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"

import { useAction, useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

import { Panneau, telechargerTexte } from "@/components/charte"
import { Puces, useOperation } from "@/components/gestion/referentiels/elements"
import { dateHeure, messageErreur } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire } from "@/components/gestion/referentiels/formulaire"
import { Markdown } from "@/components/modules/etudes/markdown"
import { DIRECTIONS } from "@/components/modules/ged/statuts"
import type { Id } from "@/components/modules/ged/types"

import { AvatarCopilot, CadreCopilot } from "./cadre"

type Configuration = FunctionReturnType<typeof api.modules.copilot.conversations.configuration>
type Vue = NonNullable<FunctionReturnType<typeof api.modules.copilot.conversations.conversation>>
type Message = Vue["messages"][number]
type Action = Vue["actions"][number]

const SUGGESTIONS: Record<string, string> = {
  ventes_du_jour: "Où en sont les ventes aujourd'hui ?",
  remplissage_dessertes: "Quels trains sont les plus chargés aujourd'hui ?",
  caisses_a_viser: "Quelles caisses attendent le visa du contrôle des recettes ?",
  incidents_ouverts: "Quels incidents restent ouverts sur le réseau ?",
  operations_fret: "Où en sont les trains de fret en ce moment ?",
  ot_en_retard: "Quels ordres de travail de maintenance sont en retard ?",
  mon_parapheur: "Qu'est-ce qui attend ma signature ou mon visa ?",
  rechercher_documents: "Retrouve les contrats passés avec COMILOG.",
  rechercher_etudes: "Que disent les études sur la conservation des pièces comptables ?",
  plan_actions_audit: "Quelles actions d'audit sont en retard ?",
}

const GRAVITES = { majeure: "Majeure", moderee: "Modérée", mineure: "Mineure" } as const

/* ═══════════════════════════════════════════════ Messages ═══ */

function CarteAction({ action }: { action: Action }) {
  const confirmer = useMutation(api.modules.copilot.conversations.confirmerAction)
  const refuser = useMutation(api.modules.copilot.conversations.refuserAction)
  const operation = useOperation()
  const entree = action.entree
  return (
    <div className="grid gap-3 rounded-[16px] border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-2.5 text-[11.5px] font-bold tracking-[0.05em] text-ink-muted uppercase">
        <ShieldCheck aria-hidden className="size-4" />
        Proposition à confirmer
        <span className="ml-auto normal-case">
          {action.statut === "a_confirmer" ? (
            <Tag tone="warning">Rien n&apos;est encore enregistré</Tag>
          ) : action.statut === "confirmee" ? (
            <Tag tone="success">Confirmée · {action.resultat}</Tag>
          ) : action.statut === "refusee" ? (
            <Tag tone="neutral">Écartée</Tag>
          ) : (
            <Tag tone="danger">Échec</Tag>
          )}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-3.5 text-[14px]">
        <dt className="text-ink-muted">Action</dt>
        <dd className="font-semibold">{entree.titre}</dd>
        <dt className="text-ink-muted">Constat</dt>
        <dd>{entree.constat}</dd>
        <dt className="text-ink-muted">Recommandation</dt>
        <dd>{entree.recommandation}</dd>
        <dt className="text-ink-muted">Gravité</dt>
        <dd>{GRAVITES[entree.gravite as keyof typeof GRAVITES] ?? entree.gravite}</dd>
        <dt className="text-ink-muted">Direction</dt>
        <dd>{DIRECTIONS[entree.direction as keyof typeof DIRECTIONS] ?? entree.direction}</dd>
        <dt className="text-ink-muted">Échéance</dt>
        <dd className="tabular">{entree.echeance}</dd>
      </dl>
      {action.statut === "a_confirmer" ? (
        <div className="flex flex-wrap gap-2 border-t border-line px-3.5 py-2.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={operation.enCours === "confirmer"}
            onClick={() => void operation.executer("confirmer", () => confirmer({ actionId: action._id }))}
          >
            <Check />
            Confirmer l&apos;inscription
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={operation.enCours === "refuser"}
            onClick={() => void operation.executer("refuser", () => refuser({ actionId: action._id }))}
          >
            Écarter
          </Button>
        </div>
      ) : null}
      {operation.retour?.ton === "danger" ? (
        <div className="px-3.5 pb-3">
          <InlineMessage tone="danger" title="Action refusée.">
            {operation.retour.detail}
          </InlineMessage>
        </div>
      ) : null}
    </div>
  )
}

function Retour({ message }: { message: Message }) {
  const donner = useMutation(api.modules.copilot.conversations.donnerRetour)
  const [erreur, setErreur] = useState<string | null>(null)
  const envoyer = (retour: "utile" | "pas_utile") =>
    void donner({ messageId: message._id, retour }).catch((cause: unknown) => setErreur(messageErreur(cause)))
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Cette réponse vous a-t-elle aidé ?">
      <Button type="button" variant="ghost" size="sm" aria-pressed={message.retour === "utile"} onClick={() => envoyer("utile")}>
        <ThumbsUp />
        {message.retour === "utile" ? "Jugée utile" : "Utile"}
      </Button>
      <Button type="button" variant="ghost" size="sm" aria-pressed={message.retour === "pas_utile"} onClick={() => envoyer("pas_utile")}>
        <ThumbsDown />
        {message.retour === "pas_utile" ? "Jugée pas utile" : "Pas utile"}
      </Button>
      {erreur ? <small className="text-[12.5px] text-danger-ink">{erreur}</small> : null}
    </div>
  )
}

export function MessageAssistant({ message, actions }: { message: Message; actions: Action[] }) {
  const enCours = message.statut === "en_cours"
  const exemple = message.provider === "exemple"
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-2.5">
      <AvatarCopilot etat={enCours ? "reflexion" : "repos"} />
      <div className="grid min-w-0 gap-2.5">
        {enCours && !message.contenu ? (
          <p role="status" className="text-small text-ink-muted">
            Copilot consulte le SI avec vos droits…
          </p>
        ) : null}
        {message.statut === "non_configure" ? (
          <InlineMessage tone="warning" title="Copilot n'est pas configuré.">
            {message.contenu}
          </InlineMessage>
        ) : message.contenu ? (
          <div aria-live={enCours ? "polite" : undefined}>
            <Markdown texte={message.contenu} />
          </div>
        ) : null}
        {message.statut === "erreur" ? (
          <InlineMessage tone="danger" title="Réponse interrompue.">
            {message.erreur ?? "Relancez votre question."}
          </InlineMessage>
        ) : null}
        {message.outils.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-muted">
            <Wrench aria-hidden className="size-3.5" />
            {message.outils.map((outil, index) => (
              <Tag
                key={`${outil.nom}-${index}`}
                tone={outil.statut === "ok" ? "neutral" : outil.statut === "confirmation" ? "warning" : "danger"}
              >
                {outil.statut === "ok" ? <Check aria-hidden /> : outil.statut === "confirmation" ? <ShieldCheck aria-hidden /> : <Lock aria-hidden />}
                {outil.libelle}
                {outil.statut === "refuse" ? " · refusé" : outil.statut === "erreur" ? " · erreur" : outil.statut === "confirmation" ? " · à confirmer" : ""}
              </Tag>
            ))}
          </div>
        ) : null}
        {message.sources.length > 0 ? (
          <div className="grid gap-1">
            <span className="text-[12px] font-semibold text-ink-muted">Sources</span>
            <ol className="grid gap-1 text-[13px]">
              {message.sources.map((source, index) => (
                <li key={`${source.libelle}-${index}`} className="flex flex-wrap items-baseline gap-1.5">
                  <span className="tabular text-ink-muted">[{index + 1}]</span>
                  {source.lien ? (
                    <Link href={source.lien as Route} className="inline-flex items-center gap-1 font-semibold text-accent-ink underline">
                      {source.libelle}
                      <ExternalLink aria-hidden className="size-3.5" />
                    </Link>
                  ) : (
                    <span className="font-semibold">{source.libelle}</span>
                  )}
                  {source.detail ? <span className="text-ink-muted">— {source.detail}</span> : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {actions.map((action) => (
          <CarteAction key={action._id} action={action} />
        ))}
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
          <span className="tabular">{dateHeure(message.createdAt)}</span>
          {exemple ? <Tag tone="neutral">Conversation d&apos;exemple</Tag> : message.model ? <span>· {message.model}</span> : null}
        </div>
        {message.statut === "termine" && !exemple && !message.requestId.includes(":") ? <Retour message={message} /> : null}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════ Écran ═══ */

function ListeConversations({ courante, onNouvelle, enCreation }: { courante?: string; onNouvelle: () => void; enCreation: boolean }) {
  const conversations = useQuery(api.modules.copilot.conversations.listerConversations, {})
  const [filtre, setFiltre] = useState<"actives" | "archivees">("actives")
  const visibles = conversations?.filter((conversation) => (filtre === "actives" ? conversation.statut === "active" : conversation.statut === "archivee"))
  return (
    <div className="grid content-start gap-3">
      <Button type="button" variant="secondary" onClick={onNouvelle} loading={enCreation} block>
        <Plus />
        Nouvelle conversation
      </Button>
      <Puces
        libelle="Conversations affichées"
        valeur={filtre}
        onChange={setFiltre}
        options={[
          { cle: "actives", libelle: "Actives" },
          { cle: "archivees", libelle: "Archivées" },
        ]}
      />
      {visibles === undefined ? (
        <SkeletonLines />
      ) : visibles.length === 0 ? (
        <p className="text-small text-ink-muted">{filtre === "actives" ? "Aucune conversation. Posez votre première question." : "Aucune conversation archivée."}</p>
      ) : (
        <nav aria-label="Historique des conversations">
          <ul className="grid gap-1">
            {visibles.map((conversation) => (
              <li key={conversation._id}>
                <Link
                  href={`/copilot/${conversation._id}` as Route}
                  aria-current={conversation._id === courante ? "page" : undefined}
                  className={cn(
                    "grid min-h-11 gap-0.5 rounded-md px-3 py-2 text-[14px] hover:bg-surface-sunk",
                    conversation._id === courante && "bg-accent-soft shadow-[inset_3px_0_0_var(--c-accent)] hover:bg-accent-soft"
                  )}
                >
                  <span className="line-clamp-2 font-semibold">{conversation.titre}</span>
                  <small className="text-[12px] text-ink-muted">
                    <span className="tabular">{dateHeure(conversation.lastMessageAt)}</span>
                    {conversation.exemple ? " · exemple" : ""}
                  </small>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}

function PanneauContexte({ configuration }: { configuration: Configuration | undefined }) {
  if (!configuration) return <SkeletonLines />
  const ouverts = configuration.outils.filter((outil) => outil.ouvert)
  const fermes = configuration.outils.filter((outil) => !outil.ouvert)
  return (
    <div className="grid content-start gap-4">
      <Panneau titre="Ce que Copilot lit pour vous">
        <p className="text-small text-ink-muted">
          Avec les droits de {configuration.agent.nom} ({configuration.agent.role}). Chaque lecture est revérifiée côté serveur.
        </p>
        <ul className="grid gap-1.5 text-[14px]">
          {ouverts.map((outil) => (
            <li key={outil.nom} className="flex items-start gap-2">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success-ink" />
              <span>
                {outil.libelle}
                {outil.ecriture ? <small className="block text-[12px] text-ink-muted">Écriture sur confirmation explicite</small> : null}
              </span>
            </li>
          ))}
        </ul>
        {fermes.length > 0 ? (
          <details className="text-[14px]">
            <summary className="min-h-11 cursor-pointer content-center font-semibold">Fermés à votre compte ({fermes.length})</summary>
            <ul className="grid gap-1.5 pt-1">
              {fermes.map((outil) => (
                <li key={outil.nom} className="flex items-start gap-2 text-ink-muted">
                  <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {outil.libelle}
                    <small className="block text-[12px]">Droit requis : {outil.droitRequis}</small>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Panneau>
      <Panneau titre="Garde-fous">
        <ul className="grid list-disc gap-1 pl-5 text-[13.5px] text-ink-muted">
          <li>Chaque chiffre vient d&apos;une lecture du SI et cite sa source.</li>
          <li>Hors du travail à la SETRAG, Copilot refuse et le journalise.</li>
          <li>Aucune écriture sans votre confirmation sur la carte affichée.</li>
          <li>Les données de démonstration sont signalées comme telles.</li>
        </ul>
        <small className="text-[12px] text-ink-muted">
          Modèle : {configuration.provider} · {configuration.model}
        </small>
      </Panneau>
    </div>
  )
}

export function EcranCopilot({ conversationId }: { conversationId?: string }) {
  const router = useRouter()
  const configuration = useQuery(api.modules.copilot.conversations.configuration, {})
  const vue = useQuery(
    api.modules.copilot.conversations.conversation,
    conversationId ? { conversationId: conversationId as Id<"copilotConversations"> } : "skip"
  )
  const creer = useMutation(api.modules.copilot.conversations.creerConversation)
  const archiver = useMutation(api.modules.copilot.conversations.archiverConversation)
  const renommer = useMutation(api.modules.copilot.conversations.renommerConversation)
  const envoyer = useAction(api.modules.copilot.chat.envoyerMessage)
  const operation = useOperation()
  const [saisie, setSaisie] = useState("")
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [renommage, setRenommage] = useState(false)
  const fin = useRef<HTMLDivElement>(null)

  const dernier = vue?.messages[vue.messages.length - 1]
  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" })
  }, [vue?.messages.length, dernier?.contenu.length])

  const configure = configuration?.configure ?? false
  const archivee = vue?.conversation.statut === "archivee"
  const enCours = envoi || dernier?.statut === "en_cours"

  const nouvelle = async () => {
    const resultat = await operation.executer("creer", () => creer({}))
    if (resultat) router.push(`/copilot/${resultat.conversationId}` as Route)
  }

  const poser = async (question: string) => {
    const texte = question.trim()
    if (!texte || enCours) return
    setErreur(null)
    setEnvoi(true)
    setSaisie("")
    try {
      let id = conversationId as Id<"copilotConversations"> | undefined
      if (!id) {
        id = (await creer({})).conversationId
        router.push(`/copilot/${id}` as Route)
      }
      const resultat = await envoyer({ conversationId: id, requestId: crypto.randomUUID(), contenu: texte })
      if (resultat.etat === "erreur") setErreur(resultat.message)
    } catch (cause) {
      setErreur(messageErreur(cause, "La question n'a pas pu être envoyée."))
      setSaisie(texte)
    } finally {
      setEnvoi(false)
    }
  }

  const soumettre = (event: FormEvent) => {
    event.preventDefault()
    void poser(saisie)
  }
  const clavier = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      void poser(saisie)
    }
  }

  const exporter = () => {
    if (!vue) return
    const texte = [
      `# ${vue.conversation.titre}`,
      "",
      ...vue.messages.flatMap((message) => [
        `## ${message.role === "user" ? "Question" : "Copilot"} — ${dateHeure(message.createdAt)}`,
        "",
        message.contenu,
        ...(message.sources.length
          ? ["", "Sources :", ...message.sources.map((source, index) => `${index + 1}. ${source.libelle}${source.lien ? ` (${source.lien})` : ""}`)]
          : []),
        "",
      ]),
    ].join("\n")
    telechargerTexte(`copilot-${vue.conversation.titre.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60)}.md`, texte, "text/markdown;charset=utf-8")
  }

  const suggestions = (configuration?.outils ?? []).filter((outil) => outil.ouvert && SUGGESTIONS[outil.nom]).slice(0, 4)

  return (
    <CadreCopilot
      titre={vue?.conversation.titre ?? "Assistant métier"}
      description={
        vue
          ? vue.conversation.exemple
            ? "Conversation d'exemple créée par le jeu de démonstration : elle montre la forme des réponses, elle n'a pas été produite par le modèle."
            : undefined
          : "Posez une question sur les ventes, l'exploitation, le fret, la GED, les études ou l'audit : Copilot lit le SI avec vos droits et cite ses sources."
      }
      supervision={configuration?.peutSuperviser}
      plein
      actions={
        vue ? (
          <>
            <Button type="button" variant="ghost" onClick={() => setRenommage(true)}>
              <PenLine />
              Renommer
            </Button>
            <Button
              type="button"
              variant="ghost"
              loading={operation.enCours === "archiver"}
              onClick={() =>
                void operation.executer("archiver", () => archiver({ conversationId: vue.conversation._id, archiver: !archivee }))
              }
            >
              {archivee ? <ArchiveRestore /> : <Archive />}
              {archivee ? "Restaurer" : "Archiver"}
            </Button>
            <Button type="button" variant="secondary" onClick={exporter}>
              <Download />
              Exporter
            </Button>
          </>
        ) : null
      }
    >
      {configuration && !configure ? (
        <InlineMessage tone="warning" title="Copilot n'est pas configuré.">
          {configuration.messageNonConfigure}
        </InlineMessage>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="hidden lg:block">
          <ListeConversations courante={conversationId} onNouvelle={() => void nouvelle()} enCreation={operation.enCours === "creer"} />
        </aside>
        <details className="rounded-md border border-line bg-surface p-3 lg:hidden">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">Historique des conversations</summary>
          <div className="pt-3">
            <ListeConversations courante={conversationId} onNouvelle={() => void nouvelle()} enCreation={operation.enCours === "creer"} />
          </div>
        </details>

        <section aria-label="Conversation" className="flex min-h-[560px] min-w-0 flex-col rounded-md border border-line bg-surface">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6">
            {conversationId && vue === undefined ? (
              <SkeletonLines />
            ) : conversationId && vue === null ? (
              <InlineMessage tone="warning" title="Conversation introuvable.">
                Elle n&apos;existe pas, ou elle appartient à un autre compte.
              </InlineMessage>
            ) : !vue || vue.messages.length === 0 ? (
              <div className="grid content-center justify-items-start gap-3 py-6">
                <AvatarCopilot taille={44} etat={configure ? "repos" : "hors-ligne"} />
                <h2 className="text-[22px] leading-tight font-bold">Que voulez-vous savoir ?</h2>
                <p className="text-small max-w-[60ch] text-ink-muted">
                  Copilot répond à partir des données du SI que votre compte peut lire, et cite chaque source. Il ne décide
                  rien à votre place et n&apos;écrit rien sans votre confirmation.
                </p>
                {suggestions.length > 0 ? (
                  <div className="grid w-full gap-2 sm:grid-cols-2">
                    {suggestions.map((outil) => (
                      <button
                        key={outil.nom}
                        type="button"
                        disabled={!configure || enCours}
                        onClick={() => void poser(SUGGESTIONS[outil.nom]!)}
                        className="grid min-h-16 content-center justify-items-start gap-0.5 rounded-[16px] border border-line bg-surface px-3.5 py-2.5 text-left text-[14px] font-semibold transition-colors hover:border-accent-line disabled:opacity-45"
                      >
                        <small className="text-[12px] font-medium text-ink-muted">{outil.libelle}</small>
                        {SUGGESTIONS[outil.nom]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              vue.messages.map((message) =>
                message.role === "user" ? (
                  <div key={message._id} className="grid justify-items-end gap-1">
                    <p className="max-w-[84%] rounded-[18px_18px_4px_18px] bg-accent-base px-3.5 py-2.5 text-[15px] whitespace-pre-wrap text-ink-inverse">
                      {message.contenu}
                    </p>
                    <small className="tabular text-[12px] text-ink-muted">{dateHeure(message.createdAt)}</small>
                  </div>
                ) : (
                  <MessageAssistant
                    key={message._id}
                    message={message}
                    actions={vue.actions.filter((action) => action.requestId === message.requestId)}
                  />
                )
              )
            )}
            <div ref={fin} />
          </div>

          <form onSubmit={soumettre} className="grid gap-2 border-t border-line p-3">
            {erreur ? (
              <InlineMessage tone="danger" title="Question non traitée.">
                <CircleAlert aria-hidden className="inline size-4" /> {erreur}
              </InlineMessage>
            ) : null}
            {archivee ? (
              <p className="text-small text-ink-muted">Conversation archivée : restaurez-la pour poursuivre.</p>
            ) : null}
            <div className="flex items-end gap-2 rounded-[25px] border border-line-strong bg-canvas py-1.5 pr-1.5 pl-4 focus-within:border-accent-base focus-within:shadow-[var(--focus-ring)]">
              <label htmlFor="copilot-question" className="sr-only">
                Votre question
              </label>
              <textarea
                id="copilot-question"
                value={saisie}
                onChange={(event) => setSaisie(event.target.value)}
                onKeyDown={clavier}
                rows={Math.min(5, Math.max(1, saisie.split("\n").length))}
                maxLength={4000}
                disabled={!configure || archivee}
                placeholder={configure ? "Posez votre question… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)" : "Copilot n'est pas configuré"}
                className="min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-ink-faint"
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Envoyer la question"
                disabled={!configure || archivee || !saisie.trim()}
                loading={enCours}
              >
                <ArrowUp />
              </Button>
            </div>
            <small className="text-[12px] text-ink-muted">
              Copilot peut se tromper : vérifiez les chiffres dans leur source avant toute décision.
            </small>
          </form>
        </section>

        <aside className="hidden 2xl:block">
          <PanneauContexte configuration={configuration} />
        </aside>
      </div>
      <div className="2xl:hidden">
        <PanneauContexte configuration={configuration} />
      </div>

      {vue ? (
        <FenetreFormulaire
          open={renommage}
          onOpenChange={setRenommage}
          titre="Renommer la conversation"
          libelleValider="Renommer"
          enCours={operation.enCours === "renommer"}
          erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
          onSubmit={async (donnees) => {
            const resultat = await operation.executer("renommer", () =>
              renommer({ conversationId: vue.conversation._id, titre: String(donnees.get("titre") ?? "") })
            )
            if (resultat) setRenommage(false)
          }}
        >
          <Field label="Titre" htmlFor="conversation-titre">
            <Input id="conversation-titre" name="titre" defaultValue={vue.conversation.titre} required minLength={2} maxLength={120} />
          </Field>
        </FenetreFormulaire>
      ) : null}
    </CadreCopilot>
  )
}
