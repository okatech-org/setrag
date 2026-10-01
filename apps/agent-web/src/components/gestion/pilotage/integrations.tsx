"use client"

import { Activity, History, Plug, RefreshCw, Stethoscope, X } from "lucide-react"
import type { FunctionReturnType } from "convex/server"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"

import {
  CelluleDouble,
  Chronologie,
  EnTetePage,
  Fiche,
  LienBouton,
  Panneau,
  TableauDonnees,
  type ColonneTableau,
} from "@/components/charte"
import { PlatformIntegrationOutbox, shouldLoadIntegrationOutbox } from "@/components/modules/integrations/integration-outbox"
import { PLATFORM_MODULES_API_ENABLED } from "@/lib/platform-modules-runtime"

import { CadrePilotage, messageLectureSeule, usePilotage } from "./cadre"
import { DialogueMotif, ListeEtDossier, PastilleEtat, useExecution, type Forme } from "./elements"
import { dateNumerique, heureDe, horodatage, nombre, pct } from "./format"
import { useSelectionUrl } from "./url"

type Etat = FunctionReturnType<typeof api.functions.pilotage.etatIntegrations>
type Service = Etat["services"][number]
type Detail = NonNullable<FunctionReturnType<typeof api.functions.pilotage.detailIntegration>>
type Evenement = Detail["evenements"][number]

export function formeService(etat: Service["etat"]): Forme {
  switch (etat) {
    case "operationnel":
      return "ok"
    case "degrade":
      return "degrade"
    case "incident":
      return "hs"
    case "non_raccorde":
      return "neutre"
    default:
      return "attente"
  }
}

const RESULTATS_TEST: Record<string, { libelle: string; forme: Forme }> = {
  ok: { libelle: "Réponse correcte", forme: "ok" },
  degrade: { libelle: "Réponse lente", forme: "degrade" },
  echec: { libelle: "Échec", forme: "hs" },
  non_raccorde: { libelle: "Non raccordé", forme: "neutre" },
}

export function Integrations() {
  const pilotage = usePilotage()
  const [selection, choisir] = useSelectionUrl(["service"] as const)
  const etat = useQuery(api.functions.pilotage.etatIntegrations, pilotage.voit("integrations") ? {} : "skip")
  const relancer = useMutation(api.functions.management.retryIntegrationFailures)
  const execution = useExecution()
  // Seuls les envois de la file (SAGE, messages) se relancent ; les paiements
  // échoués se reprennent au guichet ou en ligne, pas depuis la supervision.
  const echecs = etat?.services.reduce((t, s) => t + (s.code === "SAGE_X3" || s.code === "SMS" ? s.echecs : 0), 0) ?? 0
  const peutRejouer = pilotage.peut("integrations", "modifier")
  const lectureSeule = pilotage.pret && pilotage.enLigne && !pilotage.voit("integrations") ? messageLectureSeule(pilotage.role, "les intégrations") : false

  const colonnes: ColonneTableau<Service>[] = [
    { cle: "service", libelle: "Service", rendu: (s) => <CelluleDouble haut={s.nom} bas={s.usage} />, tri: (s) => s.nom },
    { cle: "echange", libelle: "Dernier échange", rendu: (s) => <span className="tabular text-[13px]">{horodatage(s.dernierEchange)}</span>, tri: (s) => s.dernierEchange ?? 0 },
    { cle: "file", libelle: "File d’attente", numerique: true, rendu: (s) => (s.fileAttente === null ? "—" : nombre(s.fileAttente)), tri: (s) => s.fileAttente ?? -1 },
    { cle: "reussite", libelle: "Réussite · 30 j", numerique: true, secondaire: true, rendu: (s) => pct(s.reussite30j), tri: (s) => s.reussite30j ?? -1 },
    {
      cle: "etat",
      libelle: "État",
      rendu: (s) => (
        <span className="grid gap-1">
          <PastilleEtat forme={formeService(s.etat)}>{s.libelleEtat}</PastilleEtat>
          {s.simule ? <small className="text-[12px] text-ink-muted">Échanges simulés</small> : null}
        </span>
      ),
      tri: (s) => ["incident", "degrade", "non_raccorde", "inactif", "operationnel"].indexOf(s.etat),
      export: (s) => `${s.libelleEtat}${s.simule ? " (simulé)" : ""}`,
    },
  ]

  return (
    <CadrePilotage lectureSeule={lectureSeule}>
      <EnTetePage
        surtitre="Supervision · services raccordés"
        titre="Intégrations"
        description="Paiement, comptabilité, annuaire, messages, terminaux de bord, journal d’audit. Un service dégradé n’arrête pas la vente : il bascule sur un mode de secours, affiché ici."
        actions={
          pilotage.peut("integrations") && echecs > 0 ? (
            <Button
              type="button"
              variant="secondary"
              loading={execution.enCours === "relancer"}
              onClick={() =>
                execution.executer("relancer", () => relancer({}), (r) =>
                  r.count === 0
                    ? "Aucun échec à relancer."
                    : r.requested
                      ? `${nombre(r.count)} échec(s) signalé(s) à l’administration système pour reprise.`
                      : `${nombre(r.count)} envoi(s) remis en file.`
                )
              }
            >
              <RefreshCw />
              Relancer les échecs ({nombre(echecs)})
            </Button>
          ) : null
        }
      />
      {execution.retour}
      <InlineMessage tone="info" title="Aucun système externe n’est encore raccordé en production.">
        SAGE X3, les opérateurs de paiement, les passerelles SMS et e-mail et l’annuaire Eramet répondent par des simulateurs : les
        échanges, accusés et tests portent la mention « simulé ». Les terminaux de bord et le journal d’audit sont réels.
      </InlineMessage>

      {etat === undefined ? (
        <SkeletonLines />
      ) : (
        <ListeEtDossier
          liste={
            <TableauDonnees
              colonnes={colonnes}
              lignes={etat.services}
              cle={(s) => s.code}
              libelle="Services raccordés"
              surLigne={(s) => choisir({ service: s.code === selection.service ? undefined : s.code })}
              selection={selection.service ?? ""}
              exportNom="setrag-integrations"
              vide={{ titre: "Aucun service" }}
            />
          }
          dossier={
            selection.service ? (
              <DossierService code={selection.service} peutRejouer={peutRejouer} peutTester={pilotage.peut("integrations")} surFermeture={() => choisir({ service: undefined })} />
            ) : (
              <Panneau titre="Service" icone={Plug}>
                <p className="text-small text-ink-muted">
                  Choisissez un service pour voir ses derniers échanges, tester la connexion et rejouer un envoi en échec.
                </p>
                <p className="text-small text-ink-muted">
                  Formes des pastilles : rond plein opérationnel, triangle dégradé, carré hors service, cercle vide non raccordé,
                  cercle pointillé sans activité.
                </p>
                <small className="tabular text-[12.5px] text-ink-muted">Vérifié à {heureDe(etat.verifieLe)}</small>
              </Panneau>
            )
          }
        />
      )}

      {shouldLoadIntegrationOutbox({
        apiEnabled: PLATFORM_MODULES_API_ENABLED,
        isIntegrationSection: true,
        canConsult: pilotage.voit("integrations"),
      }) ? (
        <PlatformIntegrationOutbox canReplay={peutRejouer} online={pilotage.enLigne} />
      ) : null}
    </CadrePilotage>
  )
}

function DossierService({
  code,
  peutRejouer,
  peutTester,
  surFermeture,
}: {
  code: string
  peutRejouer: boolean
  peutTester: boolean
  surFermeture: () => void
}) {
  const detail = useQuery(api.functions.pilotage.detailIntegration, { code })
  const tester = useMutation(api.functions.pilotage.testerConnexion)
  const rejouer = useMutation(api.functions.pilotage.rejouerEvenement)
  const execution = useExecution()
  const [aRejouer, setARejouer] = useState<Evenement | null>(null)

  if (detail === undefined) {
    return (
      <Panneau titre="Service" icone={Plug}>
        <SkeletonLines />
      </Panneau>
    )
  }
  if (detail === null) {
    return (
      <Panneau titre="Service" icone={Plug}>
        <EmptyState title="Service inconnu" />
      </Panneau>
    )
  }

  const colonnes: ColonneTableau<Evenement>[] = [
    {
      cle: "evenement",
      libelle: "Événement",
      rendu: (e) => <CelluleDouble haut={e.titre} bas={e.detail ?? undefined} />,
      tri: (e) => e.titre,
    },
    { cle: "le", libelle: "Le", rendu: (e) => <span className="tabular text-[13px]">{horodatage(e.at)}</span>, tri: (e) => e.at },
    {
      cle: "statut",
      libelle: "État",
      rendu: (e) =>
        e.rejouable && peutRejouer ? (
          <Button type="button" variant="secondary" onClick={() => setARejouer(e)} aria-label={`Rejouer : ${e.titre}`}>
            <RefreshCw />
            Rejouer
          </Button>
        ) : (
          <PastilleEtat forme={e.statut === "ok" ? "ok" : e.statut === "echec" ? "hs" : e.statut === "attente" ? "attente" : "neutre"}>
            {e.statut === "ok" ? "Acquitté" : e.statut === "echec" ? "Échec" : e.statut === "attente" ? "En attente" : "Info"}
          </PastilleEtat>
        ),
      tri: (e) => e.statut,
      export: (e) => e.statut,
    },
  ]

  return (
    <>
      <Panneau
        titre={detail.nom}
        icone={Activity}
        sousTitre={detail.usage}
        actions={
          <Button type="button" variant="ghost" size="icon" aria-label="Fermer le dossier" onClick={surFermeture}>
            <X />
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <PastilleEtat forme={formeService(detail.etat)}>{detail.libelleEtat}</PastilleEtat>
          {detail.simule ? <Tag tone="neutral">Simulé</Tag> : <Tag tone="second">Réel</Tag>}
        </div>
        <Fiche
          elements={[
            ["Dernier échange", <span key="d" className="tabular">{horodatage(detail.dernierEchange)}</span>],
            ["File d’attente", detail.fileAttente === null ? "—" : <span key="f" className="tabular">{nombre(detail.fileAttente)}</span>],
            ["Échecs", <span key="e" className="tabular">{nombre(detail.echecs)}</span>],
            ["Réussite sur 30 jours", pct(detail.reussite30j)],
            detail.dernierTest
              ? ["Dernier test", `${RESULTATS_TEST[detail.dernierTest.result]?.libelle ?? detail.dernierTest.result} · ${horodatage(detail.dernierTest.at)}`]
              : ["Dernier test", "Jamais testé"],
          ]}
        />
        {execution.retour}
        {peutTester ? (
          <Button
            type="button"
            variant="secondary"
            block
            loading={execution.enCours === "tester"}
            loadingLabel="Test en cours…"
            onClick={() =>
              execution.executer("tester", () => tester({ code: detail.code }), (r) => ({
                titre: `${RESULTATS_TEST[r.result]?.libelle ?? r.result} (test simulé).`,
                detail: r.message,
              }))
            }
          >
            <Stethoscope />
            Tester la connexion
          </Button>
        ) : null}
        {detail.code === "SAGE_X3" ? <LienBouton href="/gestion/comptabilite">Ouvrir la comptabilité</LienBouton> : null}
      </Panneau>

      <Panneau titre="Derniers échanges" icone={History} sousTitre={`${nombre(detail.evenements.length)} au plus récent`}>
        <TableauDonnees
          colonnes={colonnes}
          lignes={detail.evenements}
          cle={(e) => e._id}
          libelle={`Échanges du service ${detail.nom}`}
          exportNom={`setrag-echanges-${detail.code.toLowerCase()}`}
          parPage={8}
          triInitial={{ cle: "le", sens: "desc" }}
          vide={{
            titre: detail.etat === "non_raccorde" ? "Service non raccordé" : "Aucun échange",
            description: detail.etat === "non_raccorde" ? "Aucun échange ne peut avoir lieu tant que le raccordement n’est pas fait." : "Les échanges apparaîtront ici dès le premier envoi.",
          }}
        />
      </Panneau>

      <Panneau titre="Tests de connexion" icone={Stethoscope}>
        <Chronologie
          vide="Aucun test enregistré."
          evenements={detail.tests.map((t) => ({
            cle: t._id,
            heure: heureDe(t.at),
            titre: `${RESULTATS_TEST[t.result]?.libelle ?? t.result}${t.latencyMs !== null ? ` · ${nombre(t.latencyMs)} ms` : ""}`,
            detail: `${dateNumerique(t.at)} · ${t.by}${t.simulated ? " · simulé" : ""} · ${t.message}`,
          }))}
        />
      </Panneau>

      <DialogueMotif
        ouvert={aRejouer !== null}
        surFermeture={() => setARejouer(null)}
        titre="Rejouer l’envoi"
        description={aRejouer ? `${aRejouer.titre} — l’envoi repart en file d’attente. Le motif est tracé au journal d’audit.` : ""}
        libelleAction="Rejouer"
        enCours={execution.enCours === "rejouer"}
        surConfirmation={async (motif) => {
          if (!aRejouer) return
          const r = await execution.executer("rejouer", () => rejouer({ eventId: aRejouer._id as never, motif }), () => "Envoi remis en file.")
          if (r) setARejouer(null)
        }}
      />
    </>
  )
}
