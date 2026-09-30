"use client"

import { TriangleAlertIcon } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/choice"
import { Field, Input, Textarea } from "@workspace/ui/components/field"
import { Stepper } from "@workspace/ui/components/stepper"

import { TERRAIN } from "@/composants/boutons"
import { PastilleEnvoi, useEtatEnvoi } from "@/composants/etat-envoi"
import { CartesChoix } from "@/composants/carte-choix"
import { Cases } from "@/composants/cases"
import { Message } from "@/composants/message"
import { Bas, BarreApp, Corps, Note } from "@/coquille/ecran"
import { humanError } from "@/lib/errors"
import { jourHeure, montant, montantCourt } from "@/lib/format"
import { commitOperation, getTicketByNumber, patchRecord } from "@/lib/offline/db"
import { quoteOnboard } from "@/lib/offline/fares"
import { clientId, localNumber, nowMs } from "@/lib/offline/ids"
import type { LocalPenalty, PenaltyScaleRow } from "@/lib/offline/types"
import { arretDeRang, arretsOrdonnes } from "@/lib/position"
import { nomDuTrain, numeroVoiture } from "@/lib/train"

import { useTerminal } from "../terminal/contexte-terminal"
import { ZoneSignature } from "./signature"

/**
 * Verbaliser : le procès-verbal. Motif, montant, signature.
 *
 * L'amende vient du barème embarqué et ne se modifie pas à bord : c'est ce
 * qui rend le procès-verbal opposable et protège le contrôleur d'un
 * marchandage. Le trajet dû s'y ajoute, de la dernière gare atteinte au
 * terminus, en 2e classe, par le même barème que la vente.
 *
 * L'identité est DÉCLARÉE, jamais vérifiée : le terminal consigne ce que le
 * contrevenant annonce, et l'écrit tel quel.
 */

type Etape = 0 | 1 | 2

/** État d'envoi du procès-verbal, et son numéro définitif une fois confirmé. */
function EnvoiDuPv({ pv }: { pv: LocalPenalty }) {
  const lu = useEtatEnvoi<LocalPenalty>("penalty", pv.clientId)
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <PastilleEnvoi etat={lu?.state ?? pv.state} className="h-[30px] text-[13px]" />
        {lu?.serverNumber && (
          <span className="text-[12.5px] font-medium text-ink-muted">
            Numéro définitif <span className="tabular text-ink">{lu.serverNumber}</span>
          </span>
        )}
      </div>
      {!lu?.serverNumber && (
        <Note>Numéro définitif attribué à la synchronisation, dans la numérotation continue du réseau.</Note>
      )}
    </>
  )
}

/** Motif proposé d'après le verdict, quand le procès-verbal vient d'un contrôle. */
const MOTIF_DU_VERDICT: Record<string, PenaltyScaleRow["reason"]> = {
  contrefait: "titre_invalide",
  annule: "titre_invalide",
  rembourse: "titre_invalide",
  expire: "titre_invalide",
  non_paye: "titre_invalide",
  mauvaise_desserte: "titre_invalide",
  hors_segment: "sans_titre",
  inconnu: "sans_titre",
  sans_titre: "sans_titre",
}

export function ProcesVerbal() {
  const router = useRouter()
  const parametres = useSearchParams()
  const { manifest, settings, online, refresh, ready } = useTerminal()

  const reference = parametres.get("titre") ?? ""
  const [etape, setEtape] = useState<Etape>(0)
  const [motif, setMotif] = useState<PenaltyScaleRow["reason"]>(
    MOTIF_DU_VERDICT[parametres.get("motif") ?? ""] ?? "sans_titre"
  )
  const [nom, setNom] = useState("")
  const [piece, setPiece] = useState("")
  const [telephone, setTelephone] = useState("")
  const [refus, setRefus] = useState(false)
  const [immediat, setImmediat] = useState(true)
  const [observations, setObservations] = useState("")
  const [dresse, setDresse] = useState<LocalPenalty | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [signature, setSignature] = useState<"signe" | "refuse">("signe")
  const [trace, setTrace] = useState<{ image: string; a: number } | null>(null)

  // Procès-verbal dressé après un contrôle : le nom du porteur du titre est
  // proposé, à faire confirmer par le contrevenant.
  useEffect(() => {
    if (!manifest || !reference) return
    let annule = false
    void getTicketByNumber(manifest.tripId, reference).then((trouve) => {
      if (!annule && trouve) setNom(`${trouve.passenger.lastName} ${trouve.passenger.firstName}`)
    })
    return () => {
      annule = true
    }
  }, [manifest, reference])

  const bareme = manifest?.penalties ?? []
  const ligne = bareme.find((r) => r.reason === motif)

  /**
   * Trajet dû : de la gare atteinte au terminus. Sans barème embarqué, seule
   * l'amende est perçue — l'écran le dit.
   */
  const du = useMemo(() => {
    if (!manifest) return null
    const arrets = arretsOrdonnes(manifest)
    const terminus = arrets[arrets.length - 1]
    if (!terminus || terminus.sequence <= settings.currentStopIndex) return null
    try {
      const devis = quoteOnboard(manifest, {
        fromSequence: settings.currentStopIndex,
        toSequence: terminus.sequence,
        serviceClass: "DEUXIEME",
      })
      const de = arretDeRang(manifest, settings.currentStopIndex)
      return { devis, libelle: `${de?.name ?? "?"} → ${terminus.name} · ${devis.distanceKm} km` }
    } catch {
      return null
    }
  }, [manifest, settings.currentStopIndex])

  const amende = ligne?.amountXaf ?? 0
  const trajet = du?.devis.ttc ?? 0
  const total = amende + trajet

  if (!ready) return null
  if (!manifest) {
    return (
      <>
        <BarreApp retour="/scan" titre="Procès-verbal" />
        <Corps>
          <Message ton="alerte" titre="Aucun manifeste embarqué.">
            Le barème des amendes voyage avec le manifeste de la desserte.
          </Message>
        </Corps>
        <Bas>
          <Button size="lg" block className={TERRAIN} asChild>
            <Link href="/manifeste">Télécharger le manifeste</Link>
          </Button>
        </Bas>
      </>
    )
  }

  const voiture = numeroVoiture(settings.coachLabel)
  const sousTitre = `${nomDuTrain(manifest)} · voiture ${voiture}`

  async function enregistrer() {
    if (!manifest) return
    setEnCours(true)
    try {
      const ticket = reference ? await getTicketByNumber(manifest.tripId, reference) : undefined
      const pv: LocalPenalty = {
        clientId: clientId("pv"),
        tripId: manifest.tripId,
        ticketId: ticket?._id,
        offender: {
          lastName: refus ? undefined : nom.trim() || undefined,
          documentNumber: refus ? undefined : piece.trim() || undefined,
          phone: refus ? undefined : telephone.trim() || undefined,
          declined: refus,
        },
        reason: motif,
        notes: observations.trim() || undefined,
        fineXaf: amende,
        legXaf: trajet,
        legLabel: du?.libelle,
        amountXaf: total,
        paidOnBoard: immediat,
        signature: "aucune",
        issuedAt: nowMs(),
        offline: !online,
        localNumber: localNumber("PV", 4),
        state: "pending",
      }
      // Le procès-verbal et sa mise en file, dans une seule transaction : il
      // existe dès cet instant, réseau ou pas.
      await commitOperation("penalty", pv.clientId, pv)
      await refresh()
      setDresse(pv)
      setEtape(2)
    } catch (error) {
      toast.error(humanError(error))
    } finally {
      setEnCours(false)
    }
  }

  /**
   * La signature complète le procès-verbal sur le terminal. Elle n'en change
   * ni le montant ni le motif, et le serveur n'a pas encore de champ pour la
   * recevoir : elle reste donc locale.
   */
  async function terminer() {
    if (dresse) {
      await patchRecord("penalty", dresse.clientId, {
        signature: signature === "refuse" ? "refuse" : trace ? "signe" : "aucune",
        signatureImage: signature === "signe" ? trace?.image : undefined,
        signedAt: signature === "signe" ? trace?.a : undefined,
      }).catch(() => {})
    }
    router.push("/scan")
  }

  const etapes = <Stepper steps={[{ label: "Motif" }, { label: "Montant" }, { label: "Signature" }]} current={etape} />

  if (etape === 2 && dresse) {
    const identite = dresse.offender.declined
      ? "Identité refusée — consignée comme telle"
      : [dresse.offender.lastName, dresse.offender.documentNumber].filter(Boolean).join(" · ") ||
        "Identité non déclarée"
    return (
      <>
        <BarreApp titre="Procès-verbal" sousTitre={sousTitre} />
        <Corps>
          {etapes}
          <Message ton="ok" titre={`Procès-verbal enregistré — n° ${dresse.localNumber}`}>
            Le procès-verbal existe même s&apos;il n&apos;est pas encore parti.
          </Message>
          {!dresse.paidOnBoard && (
            <Message ton="alerte" titre="Paiement différé — recouvrement à la descente.">
              Rien n&apos;a été encaissé à bord.
            </Message>
          )}
          <div className="grid gap-1 rounded-md bg-surface-sunk px-3.5 py-3 text-[13px] font-medium text-ink-muted">
            <b className="text-[15px] font-bold text-ink">{identite}</b>
            <span>
              {ligne?.label} · {sousTitre} · <span className="tabular text-ink">{jourHeure(dresse.issuedAt)}</span>
            </span>
            <span className="font-mono text-ink">
              Amende {montant(dresse.fineXaf)}
              {dresse.legXaf > 0 && ` + trajet ${montant(dresse.legXaf)}`} = {montant(dresse.amountXaf)}
            </span>
          </div>
          <div className="grid gap-1.5">
            <p className="text-[13px] font-medium">Signature du contrevenant — facultative</p>
            <ZoneSignature
              signeeA={trace?.a}
              inactive={signature === "refuse"}
              onSigner={(image) => setTrace({ image, a: Date.now() })}
            />
          </div>
          <Cases
            label="Signature"
            options={[
              { valeur: "signe", libelle: "Faire signer" },
              { valeur: "refuse", libelle: "Refus de signer" },
            ]}
            valeur={signature}
            onChange={setSignature}
          />
          <EnvoiDuPv pv={dresse} />
        </Corps>
        <Bas>
          <Button size="lg" block className={TERRAIN} onClick={() => void terminer()}>
            Terminer
          </Button>
        </Bas>
      </>
    )
  }

  return (
    <>
      {etape === 1 ? (
        <BarreApp titre="Procès-verbal" sousTitre={sousTitre} onRetour={() => setEtape(0)} />
      ) : (
        <BarreApp titre="Procès-verbal" sousTitre={sousTitre} retour="/scan" />
      )}
      {etape === 0 ? (
        <>
          <Corps>
            {etapes}
            <CartesChoix
              label="Motif"
              valeur={motif}
              onChange={setMotif}
              options={bareme.map((r) => ({
                valeur: r.reason,
                nom: `${r.label}, ${montant(r.amountXaf)}`,
                titre: r.label,
                fin: <span className="font-mono text-[15px] font-bold tabular-nums">{montantCourt(r.amountXaf)}</span>,
              }))}
            />
            <p className="flex items-start gap-1.5 text-[12px] font-medium text-warning-ink">
              <TriangleAlertIcon aria-hidden className="mt-px size-3.5 shrink-0" />
              Barème provisoire du système, en FCFA : montants à arrêter par la direction commerciale.
            </p>
            <Field label="Nom déclaré" htmlFor="pv-nom">
              <Input value={nom} disabled={refus} placeholder="NOM Prénom" onChange={(e) => setNom(e.target.value)} />
            </Field>
            <Field label="Pièce présentée" htmlFor="pv-piece">
              <Input
                value={piece}
                disabled={refus}
                placeholder="CNI 04-889-231"
                className="font-mono"
                onChange={(e) => setPiece(e.target.value)}
              />
            </Field>
            <Field label="Téléphone (facultatif)" htmlFor="pv-telephone">
              <Input
                inputMode="tel"
                value={telephone}
                disabled={refus}
                placeholder="+241 …"
                onChange={(e) => setTelephone(e.target.value)}
              />
            </Field>
            <Checkbox
              label="Le contrevenant refuse de décliner son identité"
              checked={refus}
              onCheckedChange={(coche) => setRefus(coche === true)}
            />
            <Note>
              L&apos;identité est déclarée par le contrevenant, non vérifiée par le
              terminal : elle est consignée comme telle.
            </Note>
          </Corps>
          <Bas>
            <Button size="lg" block className={TERRAIN} disabled={!ligne} onClick={() => setEtape(1)}>
              Continuer
            </Button>
          </Bas>
        </>
      ) : (
        <>
          <Corps>
            {etapes}
            <div className="grid gap-1 rounded-md border border-line bg-surface px-3.5 py-3">
              <div className="flex items-baseline justify-between gap-3 text-[14px] font-medium">
                <span>Amende · {ligne?.label}</span>
                <span className="font-mono text-[16px] font-bold whitespace-nowrap tabular-nums">
                  {montantCourt(amende)}
                </span>
              </div>
              <Note>Barème embarqué, non modifiable par l&apos;agent.</Note>
              {du ? (
                <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-line pt-2 text-[14px] font-medium">
                  <span>Trajet dû · {du.libelle}</span>
                  <span className="font-mono text-[16px] font-bold whitespace-nowrap tabular-nums">
                    {montantCourt(trajet)}
                  </span>
                </div>
              ) : (
                <Note className="mt-1 border-t border-line pt-2">
                  Aucun trajet dû calculable : seule l&apos;amende est perçue.
                </Note>
              )}
            </div>
            <div className="grid gap-1">
              <p className="text-[13px] font-medium">Encaissement</p>
              <Cases
                label="Encaissement"
                options={[
                  { valeur: "immediat", libelle: "Immédiat" },
                  { valeur: "differe", libelle: "Différé" },
                ]}
                valeur={immediat ? "immediat" : "differe"}
                onChange={(v) => setImmediat(v === "immediat")}
              />
              <Note>
                {immediat ? "Immédiat : en espèces, à bord." : "Différé : recouvrement à la descente, rien n'est encaissé à bord."}
              </Note>
            </div>
            <div className="flex items-baseline justify-between gap-3 rounded-md bg-accent-soft px-3.5 py-3 text-[14px] font-semibold text-accent-ink">
              <span>Total à percevoir</span>
              <b className="font-mono text-[24px] font-bold whitespace-nowrap tabular-nums">{montant(total)}</b>
            </div>
            <Field label="Observations (facultatif)" htmlFor="pv-observations">
              <Textarea rows={2} className="min-h-0" value={observations} onChange={(e) => setObservations(e.target.value)} />
            </Field>
          </Corps>
          <Bas>
            <Button
              size="lg"
              block
              className={TERRAIN}
              loading={enCours}
              loadingLabel="Enregistrement…"
              onClick={() => void enregistrer()}
            >
              Enregistrer le procès-verbal
            </Button>
            <Button variant="ghost" block onClick={() => setEtape(0)}>
              Revenir au motif
            </Button>
          </Bas>
        </>
      )}
    </>
  )
}
