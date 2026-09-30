"use client"

import { CircleAlertIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import type { FunctionReturnType } from "convex/server"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { Tag } from "@workspace/ui/components/tag"

import { TERRAIN } from "@/composants/boutons"
import { Message } from "@/composants/message"
import { TagVerdict } from "@/composants/picto-verdict"
import { Bas, BarreApp, Corps, Note } from "@/coquille/ecran"
import { asAppRole, canArbitrate } from "@/lib/access"
import { humanError } from "@/lib/errors"
import { classeLongue, heure } from "@/lib/format"
import type { ScanResult, Verdict } from "@/lib/offline/types"
import { arretDeRang } from "@/lib/position"
import { nomTrain } from "@/lib/train"
import { FAMILLE_DU_VERDICT, LIBELLE_VERDICT } from "@/lib/verdicts"

import { useSessionControle } from "../session/garde-session"
import { useTerminal } from "../terminal/contexte-terminal"

type Conflit = FunctionReturnType<
  typeof api.functions.control.listConflicts
>[number]

/** Sous dix minutes d'écart, un second contrôle légitime est peu vraisemblable. */
const FENETRE_SUSPECTE_MS = 10 * 60 * 1000

function ecartDe(conflit: Conflit): number {
  const heures = conflit.allScans.map((s) => s.scannedAt).sort((a, b) => a - b)
  return heures.length < 2 ? 0 : heures[heures.length - 1]! - heures[0]!
}

function suspect(conflit: Conflit): boolean {
  return conflit.allScans.length >= 2 && ecartDe(conflit) < FENETRE_SUSPECTE_MS
}

function agent(conflit: Conflit): string {
  const a = conflit.agent as { matricule?: string; lastName?: string } | null
  return a?.matricule ?? a?.lastName ?? "agent inconnu"
}

/** Résultat consigné par le serveur, relu comme un verdict du terminal. */
function verdictDe(resultat: ScanResult): Verdict {
  return resultat === "signature_invalide" ? "contrefait" : resultat
}

function nomDuTitre(conflit: Conflit): string {
  const t = conflit.ticket
  return t
    ? `${t.passenger.lastName} ${t.passenger.firstName}`
    : "Titre inconnu"
}

/**
 * Conflits — un même titre contrôlé sur deux terminaux.
 *
 * Le système ne peut pas distinguer une fraude d'un second contrôle
 * légitime : il SIGNALE, il ne tranche pas. La lecture de l'écart est une
 * aide, jamais un verdict. Le contrôleur signale ; clore le conflit relève du
 * chef de gare, car un contrôle enregistré ne se réécrit pas.
 */
export function Conflits() {
  const { online, authenticated } = useTerminal()
  const { profil } = useSessionControle()
  const arbitre = canArbitrate(asAppRole(profil?.user.role))
  // Les conflits naissent de la confrontation des terminaux : réseau ET
  // session reconnue.
  const pret = online && authenticated
  const conflits = useQuery(
    api.functions.control.listConflicts,
    pret ? {} : "skip"
  )
  const [choisi, setChoisi] = useState<string | null>(null)

  if (!pret) {
    return (
      <>
        <BarreApp retour="/historique" titre="Conflits à arbitrer" />
        <Corps>
          <Message
            ton="alerte"
            titre={
              online
                ? "Liste indisponible tant que la session n'est pas reconnue."
                : "Liste indisponible hors réseau."
            }
          >
            Les conflits naissent de la confrontation des terminaux : ils
            n&apos;apparaissent qu&apos;après synchronisation. Une liste vide
            ici serait trompeuse.
          </Message>
        </Corps>
        <Bas>
          <Button variant="ghost" block asChild>
            <Link href="/historique">Retour à l&apos;historique</Link>
          </Button>
        </Bas>
      </>
    )
  }

  const detail = conflits?.find((c) => c.scan._id === choisi)
  if (detail) {
    return (
      <DetailConflit
        conflit={detail}
        arbitre={arbitre}
        onRetour={() => setChoisi(null)}
      />
    )
  }

  return (
    <>
      <BarreApp
        retour="/historique"
        titre="Conflits à arbitrer"
        sousTitre={
          conflits ? (
            <>
              <span className="tabular">{conflits.length}</span> titre
              {conflits.length > 1 ? "s" : ""} en conflit
            </>
          ) : (
            "Chargement…"
          )
        }
      />
      <Corps>
        {conflits === undefined && <SkeletonLines />}
        {conflits && conflits.length > 0 && (
          <Message
            ton="alerte"
            titre={`${conflits.length} titre${conflits.length > 1 ? "s" : ""} en conflit — arbitrage humain requis.`}
          >
            Un même titre a été contrôlé sur deux terminaux. Le système ne peut
            pas distinguer une fraude d&apos;un second contrôle légitime : il
            signale, il ne tranche pas.
          </Message>
        )}
        {conflits && conflits.length === 0 && (
          <EmptyState
            title="Aucun conflit"
            description="Les contrôles remontés ont été acceptés sans doublon."
          />
        )}
        <ul className="grid gap-2">
          {conflits?.map((conflit) => {
            const autres = conflit.allScans.filter(
              (s) => s._id !== conflit.scan._id
            )
            return (
              <li key={conflit.scan._id}>
                <button
                  type="button"
                  onClick={() => setChoisi(conflit.scan._id)}
                  className="grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-md border border-line bg-surface px-3.5 py-2.5 text-left active:bg-surface-sunk"
                >
                  <b className="truncate text-[15px] font-bold">
                    {nomDuTitre(conflit)}
                  </b>
                  <span className="col-start-2 row-start-1">
                    <Tag tone={suspect(conflit) ? "danger" : "warning"}>
                      <CircleAlertIcon aria-hidden />
                      {suspect(conflit) ? "suspect" : "à arbitrer"}
                    </Tag>
                  </span>
                  <span className="col-span-2 truncate font-mono text-[11.5px] text-ink-muted">
                    {conflit.ticket?.number ?? "—"}
                  </span>
                  <span className="col-span-2 truncate text-[13px] font-medium text-ink-muted">
                    {agent(conflit)} à{" "}
                    <span className="tabular">
                      {heure(conflit.scan.scannedAt)}
                    </span>
                    {autres[0] && (
                      <>
                        {" · autre terminal à "}
                        <span className="tabular">
                          {heure(autres[0].scannedAt)}
                        </span>
                      </>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <Note>
          La liste n&apos;existe qu&apos;après synchronisation : les conflits
          naissent de la confrontation des terminaux.
        </Note>
      </Corps>
      <Bas>
        <Button variant="ghost" block asChild>
          <Link href="/historique">Retour à l&apos;historique</Link>
        </Button>
      </Bas>
    </>
  )
}

function DetailConflit({
  conflit,
  arbitre,
  onRetour,
}: {
  conflit: Conflit
  arbitre: boolean
  onRetour: () => void
}) {
  const { manifest } = useTerminal()
  const resoudre = useMutation(api.functions.control.resolveConflict)
  const signaler = useMutation(api.functions.control.flagConflict)
  const [enCours, setEnCours] = useState<"accepter" | "signaler" | null>(null)
  const passages = [...conflit.allScans].sort(
    (a, b) => a.scannedAt - b.scannedAt
  )
  const ecart = Math.round(ecartDe(conflit) / 60_000)
  const estSuspect = suspect(conflit)
  // Le nom de l'arrêt n'est lisible que si le conflit porte sur la desserte embarquée.
  const memeDesserte =
    manifest && conflit.trip && manifest.tripId === conflit.trip._id
  const ticket = conflit.ticket
  const pv =
    `/pv?titre=${encodeURIComponent(ticket?.number ?? "")}&motif=inconnu` as Route

  async function accepter() {
    setEnCours("accepter")
    try {
      await resoudre({
        scanId: conflit.scan._id,
        accept: true,
        note: "Double contrôle reconnu légitime",
      })
      toast.success("Conflit clos : double contrôle accepté.")
      onRetour()
    } catch (error) {
      toast.error(humanError(error))
    } finally {
      setEnCours(null)
    }
  }

  async function signalerPourEnquete() {
    setEnCours("signaler")
    try {
      const r = await signaler({
        scanId: conflit.scan._id,
        note: "Écart suspect constaté à bord",
      })
      toast.success(
        `Signalé à ${r.notified} chef(s) de gare. Le contrôle reste en conflit.`
      )
      onRetour()
    } catch (error) {
      toast.error(humanError(error))
    } finally {
      setEnCours(null)
    }
  }

  return (
    <>
      <BarreApp
        onRetour={onRetour}
        titre={nomDuTitre(conflit)}
        sousTitre={[
          conflit.trip &&
            nomTrain(conflit.trip.trainType, conflit.trip.trainNumber),
          ticket && classeLongue(ticket.serviceClass),
          ticket?.seatLabel,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      <Corps>
        {estSuspect && (
          <Message
            ton="danger"
            titre={`Écart suspect — ${ecart} min entre les deux contrôles.`}
          >
            Deux personnes ont vraisemblablement présenté le même titre.
          </Message>
        )}
        <table className="w-full text-[13px] font-medium">
          <caption className="sr-only">
            Contrôles enregistrés pour ce titre
          </caption>
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-bold tracking-[0.05em] text-ink-muted uppercase">
              <th scope="col" className="px-2 py-1.5">
                Heure
              </th>
              <th scope="col" className="px-2 py-1.5">
                Arrêt
              </th>
              <th scope="col" className="px-2 py-1.5">
                Résultat
              </th>
            </tr>
          </thead>
          <tbody>
            {passages.map((passage) => {
              const verdict = verdictDe(passage.result)
              const arret =
                memeDesserte && passage.stopIndex !== undefined
                  ? arretDeRang(manifest, passage.stopIndex)?.name
                  : undefined
              return (
                <tr key={passage._id} className="border-b border-line">
                  <td className="px-2 py-2.5 font-mono tabular-nums">
                    {heure(passage.scannedAt)}
                  </td>
                  <td className="px-2 py-2.5">
                    {arret ??
                      (passage.stopIndex !== undefined
                        ? `arrêt n° ${passage.stopIndex + 1}`
                        : "—")}
                  </td>
                  <td className="px-2 py-2.5">
                    <TagVerdict famille={FAMILLE_DU_VERDICT[verdict]}>
                      {LIBELLE_VERDICT[verdict]}
                    </TagVerdict>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <Note>
          {estSuspect
            ? `${ecart} min d'écart : un second contrôle légitime est peu vraisemblable sur un intervalle aussi court.`
            : `${ecart} min d'écart : un second contrôle en tournée croisée est plausible.`}{" "}
          Cette lecture est une aide, pas un verdict.
        </Note>
        {!arbitre && (
          <Message titre="Clore un conflit relève du chef de gare.">
            Un contrôle enregistré ne se réécrit pas depuis le terrain. Vous
            pouvez signaler l&apos;écart, avec votre observation.
          </Message>
        )}
      </Corps>
      <Bas>
        {arbitre ? (
          <>
            <Button
              size="lg"
              block
              className={TERRAIN}
              loading={enCours === "accepter"}
              disabled={Boolean(enCours)}
              onClick={() => void accepter()}
            >
              Accepter — double contrôle légitime
            </Button>
            <Button
              variant="secondary"
              block
              className={TERRAIN}
              loading={enCours === "signaler"}
              disabled={Boolean(enCours)}
              onClick={() => void signalerPourEnquete()}
            >
              Signaler pour enquête
            </Button>
          </>
        ) : (
          <Button
            size="lg"
            block
            className={TERRAIN}
            loading={enCours === "signaler"}
            disabled={Boolean(enCours)}
            onClick={() => void signalerPourEnquete()}
          >
            Signaler pour enquête
          </Button>
        )}
        <Button variant="secondary" block className={TERRAIN} asChild>
          <Link href={pv}>Établir un PV a posteriori</Link>
        </Button>
      </Bas>
    </>
  )
}
