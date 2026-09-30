"use client"

import {
  CheckCheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CloudOffIcon,
  HourglassIcon,
  LockIcon,
  SendIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Feuille } from "@workspace/ui/components/feuille"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { cn } from "@workspace/ui/lib/utils"

import { INACTIF_EXPLIQUE, TERRAIN } from "@/composants/boutons"
import { Journal, LigneJournal, SeparateurJournal } from "@/composants/journal"
import { Message } from "@/composants/message"
import { TagVerdict } from "@/composants/picto-verdict"
import { Progression } from "@/composants/progression"
import { Bas, BarreApp, Corps, Note, TitreSection } from "@/coquille/ecran"
import { humanError } from "@/lib/errors"
import { heure, montant } from "@/lib/format"
import { listPending, listSales, listScans, purgeLocalData } from "@/lib/offline/db"
import type { LocalSale, LocalScan, QueueEntry, QueueKind } from "@/lib/offline/types"
import { nomDuTrain } from "@/lib/train"
import { FAMILLE_DU_VERDICT, LIBELLE_VERDICT } from "@/lib/verdicts"

import { useTerminal } from "../terminal/contexte-terminal"

type Vue = "file" | "controles"

/** Les lignes de la file, dans l'ordre où elles partent. */
const LIGNES: Array<{ nature: QueueKind; libelle: string }> = [
  { nature: "incident", libelle: "Incidents" },
  { nature: "penalty", libelle: "Procès-verbaux" },
  { nature: "sale", libelle: "Ventes à bord" },
  { nature: "scan", libelle: "Contrôles" },
]

const LIBELLE_NATURE: Record<QueueKind, string> = {
  scan: "Contrôle",
  sale: "Vente à bord",
  penalty: "Procès-verbal",
  incident: "Incident",
}

const GROUPE_EN_COURS: Record<string, QueueKind> = {
  Incidents: "incident",
  "Procès-verbaux": "penalty",
  "Ventes à bord": "sale",
  Contrôles: "scan",
}

/**
 * Historique — la file d'envoi, et le journal des contrôles.
 *
 * Hors ligne, une file qui grossit est le fonctionnement normal : l'écran ne
 * dramatise pas l'attente. Ce qu'il rend visible, c'est ce qui a ÉCHOUÉ, et
 * le fait que rien n'est jamais supprimé après un échec. Le journal, lui,
 * n'offre aucun geste d'édition : un contrôle enregistré ne se réécrit pas.
 */
export function Historique() {
  const { manifest, queue, online, authenticated, syncing, progress, syncNow, refresh, settings } =
    useTerminal()
  const pret = online && authenticated
  const [vue, setVue] = useState<Vue>("file")
  const [scans, setScans] = useState<LocalScan[]>([])
  const [ventes, setVentes] = useState<LocalSale[]>([])
  const [echecs, setEchecs] = useState<QueueEntry[]>([])
  const [purge, setPurge] = useState(false)
  const [purgeEnCours, setPurgeEnCours] = useState(false)
  const conflits = useQuery(api.functions.control.listConflicts, pret ? {} : "skip")

  const tripId = manifest?.tripId

  useEffect(() => {
    let annule = false
    void (async () => {
      const [lesScans, lesVentes, enAttente] = await Promise.all([
        listScans(tripId),
        listSales(tripId),
        listPending(),
      ])
      if (annule) return
      setScans(lesScans)
      setVentes(lesVentes)
      setEchecs(enAttente.filter((e) => e.state === "failed"))
    })()
    return () => {
      annule = true
    }
  }, [tripId, queue.total, queue.failed, syncing])

  const envoyes =
    queue.byKind.scan.sent + queue.byKind.sale.sent + queue.byKind.penalty.sent + queue.byKind.incident.sent
  const toutEnvoye = queue.total === 0 && envoyes > 0
  const enConflit = conflits?.length ?? 0

  async function purger() {
    setPurgeEnCours(true)
    try {
      await purgeLocalData()
      await refresh()
      setPurge(false)
      toast.success("Données voyageurs effacées de ce terminal.")
    } catch (error) {
      toast.error(humanError(error))
    } finally {
      setPurgeEnCours(false)
    }
  }

  return (
    <>
      <BarreApp
        grandTitre="Historique"
        actions={
          manifest && (
            <span className="px-2 font-mono text-[14px] font-semibold text-ink-muted">{nomDuTrain(manifest)}</span>
          )
        }
      />
      <Corps>
        <SegmentedControl
          label="Vue"
          size="touch"
          options={[
            { value: "file", label: "File d'envoi" },
            { value: "controles", label: "Contrôles" },
          ]}
          value={vue}
          onValueChange={(valeur) => setVue(valeur as Vue)}
          className="w-full"
        />

        {vue === "file" ? (
          <>
            {toutEnvoye && (
              <Message ton="ok" icone={CheckCheckIcon} titre={`Tournée synchronisée — ${envoyes} éléments confirmés.`}>
                La purge des données locales est maintenant possible.
              </Message>
            )}

            {syncing && progress && (
              <Progression
                titre={`Lot ${progress.batch} sur ${progress.batchCount}`}
                fait={progress.sent}
                total={progress.total}
                note={`${progress.label} · les lots sont idempotents : une reprise ne crée pas de doublon.`}
              />
            )}

            {!toutEnvoye && (
              <FileEnvoi
                enCours={syncing && progress ? GROUPE_EN_COURS[progress.label] : undefined}
                critique={queue.criticalPending > 0}
              />
            )}

            {!toutEnvoye && (
              <Note>
                Ordre d&apos;envoi : incidents critiques, procès-verbaux, ventes,
                contrôles. Les ventes partent une par une.
              </Note>
            )}

            {queue.total > 0 && !syncing && (
              <EtatReseau total={queue.total} />
            )}

            {echecs.length > 0 && (
              <>
                <Message
                  ton="danger"
                  titre={`${echecs.length} éléments en échec — conservés localement.`}
                >
                  Rien n&apos;est supprimé après un échec. L&apos;identifiant client
                  de chaque écriture garantit l&apos;absence de doublon à la reprise.
                </Message>
                <Journal>
                  {echecs.slice(0, 8).map((entree) => (
                    <LigneJournal
                      key={entree.id}
                      heure={entree.lastAttemptAt ? heure(entree.lastAttemptAt) : "—"}
                      qui={LIBELLE_NATURE[entree.kind]}
                      reference={`${entree.lastError ?? "motif inconnu"} · ${entree.attempts} tentative(s)`}
                      etat={<Etat icone={CircleAlertIcon} classe="text-danger-ink">échec</Etat>}
                    />
                  ))}
                </Journal>
              </>
            )}

            {ventes.length > 0 && <VentesABord ventes={ventes} />}

            {enConflit > 0 && (
              <Message ton="alerte" titre={`${enConflit} titre${enConflit > 1 ? "s" : ""} en conflit.`}>
                Un même titre a été contrôlé sur deux terminaux. L&apos;arbitrage est humain.
              </Message>
            )}
          </>
        ) : (
          <JournalControles scans={scans} derniereSynchro={settings.lastSyncAt} />
        )}
      </Corps>

      {vue === "file" && (
        <Bas avecOnglets>
          {queue.total > 0 ? (
            <Button
              size="lg"
              block
              className={cn(TERRAIN, INACTIF_EXPLIQUE)}
              loading={syncing}
              disabled={!pret}
              onClick={() => void syncNow()}
            >
              {!online
                ? "Envoi impossible sans réseau"
                : !authenticated
                  ? "Envoi en attente de la session"
                  : echecs.length > 0
                    ? "Réessayer maintenant"
                    : "Envoyer sans attendre"}
            </Button>
          ) : enConflit > 0 ? (
            <Button size="lg" block className={TERRAIN} asChild>
              <Link href="/conflits">{enConflit > 1 ? "Voir les conflits" : "Voir le conflit"}</Link>
            </Button>
          ) : null}
          {enConflit === 0 && (
            <Button variant="ghost" block asChild>
              <Link href="/conflits">Voir les conflits</Link>
            </Button>
          )}
          {toutEnvoye && (
            <Button variant="danger" size="lg" block className={TERRAIN} onClick={() => setPurge(true)}>
              Purger les données locales
            </Button>
          )}
        </Bas>
      )}

      <Feuille
        open={purge}
        onOpenChange={setPurge}
        titre="Effacer les données voyageurs de ce terminal ?"
        description="Tout est confirmé par le système : les contrôles restent journalisés côté serveur."
        pied={
          <div className="grid gap-2">
            <Button
              variant="danger"
              size="lg"
              block
              className={TERRAIN}
              loading={purgeEnCours}
              loadingLabel="Effacement…"
              onClick={() => void purger()}
            >
              Effacer les données voyageurs
            </Button>
            <Button variant="ghost" block onClick={() => setPurge(false)}>
              Annuler
            </Button>
          </div>
        }
      >
        <p className="pb-3 text-small text-ink-muted">
          Manifeste, titres, contrôles, ventes, procès-verbaux et photos sont
          effacés du terminal. Les réglages et le code de reprise sont conservés.
        </p>
      </Feuille>
    </>
  )
}

function Etat({
  icone: Icone,
  classe,
  children,
}: {
  icone: LucideIcon
  classe: string
  children: React.ReactNode
}) {
  return (
    <span className={cn("inline-flex items-center gap-[5px] text-[12.5px] font-semibold", classe)}>
      <Icone aria-hidden className="size-[15px]" />
      {children}
    </span>
  )
}

/** La file, nature par nature, dans l'ordre d'envoi. */
function FileEnvoi({ enCours, critique }: { enCours?: QueueKind; critique: boolean }) {
  const { queue } = useTerminal()
  return (
    <table className="w-full overflow-hidden rounded-md border border-line bg-surface text-[13.5px] font-medium">
      <caption className="sr-only">File d&apos;envoi du terminal</caption>
      <thead className="bg-surface-sunk">
        <tr className="text-[11px] font-bold tracking-[0.05em] text-ink-muted uppercase">
          <th scope="col" className="px-3 py-2 text-left">
            Élément
          </th>
          <th scope="col" className="px-3 py-2 text-right">
            Nb
          </th>
          <th scope="col" className="px-3 py-2 text-left">
            État
          </th>
        </tr>
      </thead>
      <tbody>
        {LIGNES.map(({ nature, libelle }) => {
          const n = queue.byKind[nature]
          const attente = n.pending + n.failed
          const total = attente + n.sent
          return (
            <tr key={nature} className="h-[46px] border-t border-line">
              <th scope="row" className="px-3 text-left font-medium">
                {libelle}
              </th>
              <td className="px-3 text-right font-mono font-semibold tabular-nums">{total}</td>
              <td className="w-[124px] px-3">
                {total === 0 ? (
                  // Une ligne vide n'a rien « envoyé » : le dire serait un faux
                  // acquittement.
                  <span className="text-[12.5px] text-ink-muted">aucun</span>
                ) : n.failed > 0 ? (
                  <Etat icone={CircleAlertIcon} classe="text-danger-ink">
                    {n.failed} en échec
                  </Etat>
                ) : enCours === nature ? (
                  <Etat icone={SendIcon} classe="text-warning-ink">
                    en cours
                  </Etat>
                ) : attente > 0 ? (
                  nature === "incident" && critique ? (
                    <Etat icone={HourglassIcon} classe="text-warning-ink">
                      priorité
                    </Etat>
                  ) : (
                    <Etat icone={HourglassIcon} classe="text-ink-muted">
                      en attente
                    </Etat>
                  )
                ) : (
                  <Etat icone={CircleCheckIcon} classe="text-success-ink">
                    envoyé
                  </Etat>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Ce que le réseau permet, en une phrase : l'envoi part seul. */
function EtatReseau({ total }: { total: number }) {
  const { online, authenticated } = useTerminal()
  if (!online) {
    return (
      <Message
        ton="alerte"
        icone={CloudOffIcon}
        titre="Aucun réseau — l'envoi partira automatiquement dès le retour du signal."
      >
        C&apos;est le cas nominal en pleine voie : rien n&apos;est perdu, tout est
        écrit dans la base du terminal.
      </Message>
    )
  }
  if (!authenticated) {
    return (
      <Message ton="alerte" titre="Session non reconnue — l'envoi reprendra dès qu'elle sera rétablie.">
        Rien n&apos;est perdu : les écritures attendent dans la base du terminal.
      </Message>
    )
  }
  return (
    <Note>
      Envoi automatique : {total} élément{total > 1 ? "s" : ""} en attente de
      confirmation. Aucune action n&apos;est requise : l&apos;application les
      transmet et réessaie seule. Le bouton ne sert qu&apos;à forcer une reprise.
    </Note>
  )
}

/**
 * Les ventes à bord, avec leur numéro définitif une fois confirmées — et
 * l'ancien numéro provisoire à côté, pour retrouver la vente faite. Si le
 * serveur a recalculé un autre prix, les deux montants s'affichent.
 */
function VentesABord({ ventes }: { ventes: LocalSale[] }) {
  const ecart = ventes.some((v) => v.serverXaf !== undefined && v.serverXaf !== v.quotedXaf)
  return (
    <>
      <TitreSection className="mt-1">Ventes à bord</TitreSection>
      <Journal>
        {ventes.map((vente) => (
          <LigneJournal
            key={vente.clientSaleId}
            heure={heure(vente.soldAt)}
            qui={`${vente.originName} → ${vente.destinationName}`}
            reference={
              vente.serverSaleNumber
                ? `${vente.serverSaleNumber} · était ${vente.localRef}`
                : `${vente.localRef} · provisoire`
            }
            etat={
              <span className="grid justify-items-end">
                <span className="font-mono text-[13px] font-bold tabular-nums">{montant(vente.quotedXaf)}</span>
                {vente.serverXaf !== undefined && vente.serverXaf !== vente.quotedXaf && (
                  <span className="font-mono text-[11.5px] font-semibold text-warning-ink tabular-nums">
                    facturé {montant(vente.serverXaf)}
                  </span>
                )}
              </span>
            }
          />
        ))}
      </Journal>
      {ecart && (
        <Message ton="alerte" titre="Écart de tarification.">
          Un montant recalculé par le système diffère de celui encaissé à bord.
          Signalez-le à votre caisse : l&apos;écart doit être justifié, pas absorbé.
        </Message>
      )}
    </>
  )
}

/** Qui a été contrôlé : le nom, ou ce que dit le code quand il n'y a pas de nom. */
function quiDuControle(scan: LocalScan): string {
  if (scan.passengerName) return scan.passengerName
  if (scan.verdict === "contrefait") return "Code non SETRAG"
  if (scan.verdict === "mauvaise_desserte") return "Autre circulation"
  if (scan.verdict === "illisible") return "Code illisible"
  if (scan.subscriptionId) return "Abonnement"
  return "Titre hors manifeste"
}

/**
 * Le journal des contrôles : ce qui attend l'envoi, puis ce que le système a
 * confirmé. Aucune ligne n'offre de modification ni de suppression.
 */
function JournalControles({ scans, derniereSynchro }: { scans: LocalScan[]; derniereSynchro?: number }) {
  if (scans.length === 0) {
    return <Note>Aucun contrôle enregistré sur cette tournée.</Note>
  }
  const enAttente = scans.filter((s) => s.state !== "sent")
  const confirmes = scans.filter((s) => s.state === "sent")
  const ligne = (scan: LocalScan) => (
    <LigneJournal
      key={scan.clientScanId}
      heure={heure(scan.scannedAt)}
      qui={quiDuControle(scan)}
      reference={scan.ticketNumber ?? "—"}
      etat={<TagVerdict famille={FAMILLE_DU_VERDICT[scan.verdict]}>{LIBELLE_VERDICT[scan.verdict]}</TagVerdict>}
    />
  )
  return (
    <>
      <Journal>
        {enAttente.map(ligne)}
        {confirmes.length > 0 && (
          <SeparateurJournal icone={CheckCheckIcon}>
            Confirmés{derniereSynchro ? ` à ${heure(derniereSynchro)}` : ""} · {confirmes.length} contrôle
            {confirmes.length > 1 ? "s" : ""}
          </SeparateurJournal>
        )}
        {confirmes.map(ligne)}
      </Journal>
      <p className="flex items-start gap-2 text-[12.5px] leading-[1.4] font-medium text-ink-muted">
        <LockIcon aria-hidden className="mt-px size-[15px] shrink-0" />
        Un contrôle enregistré ne se modifie pas et ne se supprime pas depuis le
        terminal. Un doute se signale ; il ne se corrige pas.
      </p>
    </>
  )
}
