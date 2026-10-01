"use client"

import type { FunctionReturnType } from "convex/server"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"

import { CelluleDouble, Fiche, Indicateur, Indicateurs, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { SelectFiltre } from "@/components/gestion/referentiels/elements"
import { horodatage, nombre } from "@/components/gestion/referentiels/format"

import { CadreCopilot } from "./cadre"

type Journal = FunctionReturnType<typeof api.modules.copilot.conversations.journal>
type Ligne = Journal["lignes"][number]

const EVENEMENTS: Record<Ligne["evenement"], { libelle: string; ton: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  question: { libelle: "Question", ton: "neutral" },
  reponse: { libelle: "Réponse", ton: "success" },
  outil: { libelle: "Lecture du SI", ton: "info" },
  outil_refuse: { libelle: "Lecture refusée", ton: "warning" },
  hors_perimetre: { libelle: "Hors périmètre", ton: "warning" },
  erreur: { libelle: "Erreur", ton: "danger" },
  non_configure: { libelle: "Non configuré", ton: "danger" },
  retour: { libelle: "Retour", ton: "neutral" },
  action_proposee: { libelle: "Écriture proposée", ton: "info" },
  action_confirmee: { libelle: "Écriture confirmée", ton: "success" },
  action_refusee: { libelle: "Écriture écartée", ton: "neutral" },
}

const colonnes: ColonneTableau<Ligne>[] = [
  { cle: "at", libelle: "Quand", rendu: (l) => <span className="tabular">{horodatage(l.createdAt)}</span>, tri: (l) => l.createdAt, export: (l) => new Date(l.createdAt) },
  { cle: "agent", libelle: "Agent", rendu: (l) => <CelluleDouble haut={l.agent} bas={l.role} />, tri: (l) => l.agent, export: (l) => `${l.agent} (${l.role})` },
  {
    cle: "evenement",
    libelle: "Événement",
    rendu: (l) => (
      <span className="flex flex-wrap gap-1.5">
        <Tag tone={EVENEMENTS[l.evenement].ton}>{EVENEMENTS[l.evenement].libelle}</Tag>
        {l.exemple ? <Tag tone="neutral">Exemple</Tag> : null}
      </span>
    ),
    tri: (l) => l.evenement,
    export: (l) => EVENEMENTS[l.evenement].libelle,
  },
  { cle: "outil", libelle: "Outil", rendu: (l) => l.outil ?? "—", tri: (l) => l.outil ?? "", secondaire: true },
  {
    cle: "detail",
    libelle: "Détail",
    rendu: (l) => <span className="line-clamp-2 text-[13px] text-ink-muted">{l.detail === "utile" ? "Utile" : l.detail === "pas_utile" ? "Pas utile" : (l.detail ?? "—")}</span>,
    tri: (l) => l.detail ?? "",
  },
  { cle: "duree", libelle: "Durée", rendu: (l) => (l.dureeMs === null ? "—" : `${nombre(l.dureeMs)} ms`), tri: (l) => l.dureeMs ?? -1, numerique: true, secondaire: true },
  {
    cle: "jetons",
    libelle: "Jetons",
    rendu: (l) => (l.tokensEntree === null ? "—" : `${nombre(l.tokensEntree)} / ${nombre(l.tokensSortie ?? 0)}`),
    tri: (l) => (l.tokensEntree ?? 0) + (l.tokensSortie ?? 0),
    export: (l) => (l.tokensEntree === null ? "" : `${l.tokensEntree}/${l.tokensSortie ?? 0}`),
    numerique: true,
    secondaire: true,
  },
]

/** Journal d'usage de Copilot, pour son administration. */
export function JournalCopilot() {
  const configuration = useQuery(api.modules.copilot.conversations.configuration, {})
  const autorise = configuration?.peutSuperviser === true
  const journal = useQuery(api.modules.copilot.conversations.journal, autorise ? {} : "skip")
  const [evenement, setEvenement] = useState("tous")
  const [exemples, setExemples] = useState("sans")
  const [selection, setSelection] = useState<string | null>(null)
  const lignes = journal?.lignes.filter(
    (ligne) => (evenement === "tous" || ligne.evenement === evenement) && (exemples === "avec" || !ligne.exemple)
  )
  const i = journal?.indicateurs
  const choisie = journal?.lignes.find((ligne) => ligne._id === selection)

  return (
    <CadreCopilot
      titre="Journal d'usage"
      description="Questions posées, lectures du SI, refus hors périmètre, erreurs, écritures confirmées et retours des agents. Les conversations d'exemple sont exclues des indicateurs."
      supervision={autorise}
    >
      {configuration === undefined ? (
        <SkeletonLines />
      ) : !autorise ? (
        <InlineMessage tone="warning" title="Accès réservé.">
          Le journal d&apos;usage est réservé à l&apos;administration du module Copilot (niveau Admin ou droit de validation).
        </InlineMessage>
      ) : (
        <>
          {i ? (
            <Indicateurs colonnes={5}>
              <Indicateur libelle="Questions" valeur={nombre(i.questions)} evolution={{ sens: "neutre", texte: `${nombre(i.reponses)} réponses complètes` }} />
              <Indicateur libelle="Lectures du SI" valeur={nombre(i.outils)} evolution={{ sens: i.outilsRefuses ? "vigilance" : "neutre", texte: `${nombre(i.outilsRefuses)} refusées par les droits` }} />
              <Indicateur libelle="Hors périmètre" valeur={nombre(i.refusPerimetre)} />
              <Indicateur
                libelle="Erreurs"
                valeur={nombre(i.erreurs)}
                evolution={{ sens: i.erreurs ? "baisse" : "neutre", texte: i.dureeMoyenneMs ? `Réponse moyenne : ${nombre(i.dureeMoyenneMs)} ms` : "Aucune réponse mesurée" }}
              />
              <Indicateur
                libelle="Retours utiles"
                valeur={nombre(i.utiles)}
                unite={`sur ${nombre(i.utiles + i.pasUtiles)}`}
                remplissage={i.utiles + i.pasUtiles ? i.utiles / (i.utiles + i.pasUtiles) : undefined}
              />
            </Indicateurs>
          ) : null}
          <TableauDonnees
            libelle="Journal d'usage de Copilot"
            colonnes={colonnes}
            lignes={lignes}
            cle={(ligne) => ligne._id}
            surLigne={(ligne) => setSelection(ligne._id)}
            selection={selection ?? undefined}
            recherche={{ placeholder: "Agent, outil, détail…", texte: (ligne) => `${ligne.agent} ${ligne.role} ${ligne.outil ?? ""} ${ligne.detail ?? ""}` }}
            filtres={
              <>
                <SelectFiltre libelle="Événement" value={evenement} onChange={setEvenement}>
                  <option value="tous">Tous les événements</option>
                  {Object.entries(EVENEMENTS).map(([cle, definition]) => (
                    <option key={cle} value={cle}>
                      {definition.libelle}
                    </option>
                  ))}
                </SelectFiltre>
                <SelectFiltre libelle="Exemples" value={exemples} onChange={setExemples}>
                  <option value="sans">Sans les exemples</option>
                  <option value="avec">Avec les exemples</option>
                </SelectFiltre>
              </>
            }
            exportNom="copilot-journal-usage"
            imprimable
            triInitial={{ cle: "at", sens: "desc" }}
            vide={{ titre: "Journal vide", description: "Aucune utilisation de Copilot enregistrée avec ces filtres." }}
          />
          {i ? <small className="text-[12px] text-ink-muted">Jetons consommés (hors exemples) : {nombre(i.tokens)}</small> : null}
          {choisie ? (
            <Panneau
              titre="Détail de l'événement"
              actions={
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelection(null)}>
                  Fermer
                </Button>
              }
            >
              <Fiche
                elements={[
                  ["Quand", <span key="q" className="tabular">{horodatage(choisie.createdAt)}</span>],
                  ["Agent", `${choisie.agent} — ${choisie.role}`],
                  ["Événement", EVENEMENTS[choisie.evenement].libelle],
                  ["Outil", choisie.outil ?? "—"],
                  ["Durée", choisie.dureeMs === null ? "—" : `${nombre(choisie.dureeMs)} ms`],
                  ["Jetons (entrée / sortie)", choisie.tokensEntree === null ? "—" : `${nombre(choisie.tokensEntree)} / ${nombre(choisie.tokensSortie ?? 0)}`],
                  ["Modèle", choisie.model ?? "—"],
                  ["Origine", choisie.exemple ? "Conversation d'exemple" : "Utilisation réelle"],
                ]}
              />
              {choisie.detail ? <p className="text-[14px] whitespace-pre-wrap">{choisie.detail}</p> : null}
              <p className="text-small text-ink-muted">
                Le contenu des conversations reste privé à leur auteur : le journal n&apos;en garde que l&apos;usage.
              </p>
            </Panneau>
          ) : null}
        </>
      )}
    </CadreCopilot>
  )
}
