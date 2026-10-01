"use client"

import type { FunctionReturnType } from "convex/server"
import { Ban, Coins, FileText, Flag, History, RotateCcw } from "lucide-react"
import { useState, type ReactNode } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { Chronologie, Fiche, Panneau, type EvenementChronologie } from "@/components/charte"
import { useDroitsGestion } from "./gestion/referentiels/droits"
import { RetourOperation, useOperation } from "./gestion/referentiels/elements"
import { agent, dateHeure, dateService, heure, jourMois, libelleDesserte, montant, MOYENS_PAIEMENT } from "./gestion/referentiels/format"
import { FenetreFormulaire, texte } from "./gestion/referentiels/formulaire"
import { evenementsHistorique } from "./gestion/referentiels/libelles-audit"
import { TagPv } from "./gestion/referentiels/statuts"
import { ManagementDetailShell } from "./management-detail-shell"

export type DossierPv = NonNullable<FunctionReturnType<typeof api.functions.referentiels.penalite>>

export const MOTIFS_PV = {
  sans_titre: "Voyageur sans titre",
  titre_invalide: "Titre invalide",
  classe_superieure: "Surclassement",
  autre: "Autre irrégularité",
} as const

export function chronologiePv(dossier: DossierPv): EvenementChronologie[] {
  const { penalty } = dossier
  return [
    ...evenementsHistorique(dossier.historique.filter((h) => h.action !== "pv.synchroniser")),
    {
      cle: "emission",
      heure: jourMois(penalty.issuedAt),
      titre: penalty.status === "paye" && !dossier.historique.some((h) => h.action === "pv.encaisser") ? "Dressé et payé à bord" : "Procès-verbal dressé à bord",
      detail: `${heure(penalty.issuedAt)} · ${agent(dossier.agent)}${penalty.offline ? " · saisi hors ligne" : ""}`,
    },
  ]
}

export function FichePv({ dossier }: { dossier: DossierPv }) {
  const { penalty } = dossier
  const o = penalty.offender
  return (
    <Fiche
      elements={[
        ["Motif", MOTIFS_PV[penalty.reason]],
        ["Montant", <span key="m" className="tabular">{montant(penalty.amountXaf)} XAF</span>],
        ["Contrevenant", o.declined ? "Identité refusée" : [o.firstName, o.lastName?.toUpperCase()].filter(Boolean).join(" ") || "Non renseigné"],
        ["Téléphone", <span key="t" className="tabular">{o.phone ?? "—"}</span>],
        ["Train", dossier.desserte ? `${libelleDesserte(dossier.desserte)} · ${dateService(dossier.desserte.serviceDate)}` : "—"],
        ["Dressé par", agent(dossier.agent)],
        ["Le", <span key="l" className="tabular">{dateHeure(penalty.issuedAt)}</span>],
        dossier.billet ? ["Billet lié", <span key="b" className="tabular">{dossier.billet.number}</span>] : null,
        dossier.paiement
          ? ["Paiement", `${MOYENS_PAIEMENT[dossier.paiement.method]} · ${dateHeure(dossier.paiement.settledAt)}${dossier.paiement.reference ? ` · réf. ${dossier.paiement.reference}` : ""}`]
          : null,
      ]}
    />
  )
}

const MOYENS_PV = ["especes", "airtel_money", "moov_money", "clickpay", "visa", "mastercard"] as const

/**
 * Traitement d'un PV : l'encaissement au guichet est la décision attendue
 * (bouton principal) ; la contestation et l'annulation exigent un motif.
 */
export function useActionsPv(dossier: DossierPv | null | undefined) {
  const droits = useDroitsGestion()
  const operation = useOperation()
  const encaisser = useMutation(api.functions.referentiels.encaisserPv)
  const changer = useMutation(api.functions.control.setPenaltyStatus)
  const [dialogue, setDialogue] = useState<"encaisser" | "conteste" | "annule" | "emis" | null>(null)
  const [moyen, setMoyen] = useState<(typeof MOYENS_PV)[number]>("especes")
  const peut = droits.may("proces_verbaux", "modifier") && Boolean(dossier)
  const status = dossier?.penalty.status
  const ouvert = status === "emis" || status === "conteste"

  const boutons = (options: { principal?: boolean } = {}): ReactNode =>
    dossier && peut && ouvert ? (
      <>
        {status === "emis" ? (
          <Button type="button" variant="ghost" onClick={() => setDialogue("conteste")}>
            <Flag />
            Contester
          </Button>
        ) : (
          <Button type="button" variant="ghost" onClick={() => setDialogue("emis")}>
            <RotateCcw />
            Maintenir le PV
          </Button>
        )}
        <Button type="button" variant="danger" onClick={() => setDialogue("annule")}>
          <Ban />
          Annuler
        </Button>
        <Button type="button" variant={options.principal === false ? "secondary" : "primary"} onClick={() => setDialogue("encaisser")}>
          <Coins />
          Encaisser {montant(dossier.penalty.amountXaf)} XAF
        </Button>
      </>
    ) : null

  const fenetre = dossier ? (
    dialogue === "encaisser" ? (
      <FenetreFormulaire
        open
        onOpenChange={(o) => !o && setDialogue(null)}
        titre={`Encaisser ${dossier.penalty.number}`}
        description={`${montant(dossier.penalty.amountXaf)} XAF. Le paiement est enregistré et le procès-verbal soldé dans la même opération.`}
        libelleValider={
          <>
            <Coins />
            Encaisser
          </>
        }
        enCours={operation.enCours === "encaisser"}
        erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
        onSubmit={async (donnees) => {
          const ok = await operation.executer(
            "encaisser",
            () => encaisser({ penaltyId: dossier.penalty._id, method: moyen, reference: texte(donnees, "reference"), note: texte(donnees, "note") }),
            `${dossier.penalty.number} encaissé et soldé.`
          )
          if (ok) setDialogue(null)
        }}
      >
        <Field label="Moyen de paiement" htmlFor="pv-moyen">
          <SelectNative id="pv-moyen" value={moyen} onChange={(event) => setMoyen(event.target.value as typeof moyen)}>
            {MOYENS_PV.map((m) => (
              <option key={m} value={m}>
                {MOYENS_PAIEMENT[m]}
              </option>
            ))}
          </SelectNative>
        </Field>
        {moyen !== "especes" ? (
          <Field label="Référence de la transaction" htmlFor="pv-reference">
            <Input id="pv-reference" name="reference" required className="tabular" />
          </Field>
        ) : null}
        <Field label="Note (facultatif)" htmlFor="pv-note">
          <Textarea id="pv-note" name="note" placeholder="Réglé au guichet 2 d'Owendo, reçu remis." />
        </Field>
      </FenetreFormulaire>
    ) : dialogue ? (
      <FenetreFormulaire
        open
        onOpenChange={(o) => !o && setDialogue(null)}
        titre={dialogue === "conteste" ? "Contester le procès-verbal" : dialogue === "annule" ? "Annuler le procès-verbal" : "Maintenir le procès-verbal"}
        description="Le motif reste au journal et à la chronologie du dossier."
        variante={dialogue === "annule" ? "danger" : "primary"}
        libelleValider={dialogue === "conteste" ? "Enregistrer la contestation" : dialogue === "annule" ? "Annuler le PV" : "Maintenir le PV"}
        enCours={operation.enCours === "statut"}
        erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
        onSubmit={async (donnees) => {
          const ok = await operation.executer(
            "statut",
            () => changer({ penaltyId: dossier.penalty._id, status: dialogue, resolutionNote: String(donnees.get("motif") ?? "") }).then(() => true),
            dialogue === "annule" ? "Procès-verbal annulé." : dialogue === "conteste" ? "Contestation enregistrée." : "Procès-verbal maintenu : il reste à encaisser."
          )
          if (ok) setDialogue(null)
        }}
      >
        <Field label="Motif" htmlFor="pv-motif">
          <Textarea id="pv-motif" name="motif" required minLength={3} placeholder={dialogue === "annule" ? "Titre retrouvé : le voyageur avait un billet valide." : "Le voyageur conteste les faits."} />
        </Field>
      </FenetreFormulaire>
    ) : null
  ) : null

  return { operation, boutons, fenetre }
}

export function PenaltyDetail({ penaltyId }: { penaltyId: string }) {
  const droits = useDroitsGestion()
  const dossier = useQuery(api.functions.referentiels.penalite, { penaltyId: penaltyId as never })
  const actions = useActionsPv(dossier)

  if (dossier === undefined || dossier === null) {
    return (
      <ManagementDetailShell title={dossier === null ? "Procès-verbal introuvable" : "Procès-verbal"} eyebrow="Supervision · procès-verbal" backHref="/gestion/incidents?onglet=pv" verrouillage="aucun">
        {dossier === null ? <InlineMessage tone="danger" title="Ce procès-verbal n'existe plus." /> : <SkeletonLines />}
      </ManagementDetailShell>
    )
  }
  const { penalty } = dossier
  return (
    <ManagementDetailShell
      title={penalty.number}
      eyebrow="Supervision · procès-verbal"
      backHref="/gestion/incidents?onglet=pv"
      verrouillage="aucun"
      lectureSeule={!droits.chargement && !droits.may("proces_verbaux", "modifier")}
      description={MOTIFS_PV[penalty.reason]}
      actions={actions.boutons()}
    >
      <div className="flex flex-wrap gap-2">
        <TagPv status={penalty.status} />
      </div>
      <RetourOperation retour={actions.operation.retour} />
      {penalty.status === "emis" ? (
        <InlineMessage tone="info" title="Non payé à bord.">
          Le procès-verbal s’encaisse au guichet : le paiement est enregistré et le PV soldé d’un seul geste.
        </InlineMessage>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panneau titre="Procès-verbal" icone={FileText}>
          <FichePv dossier={dossier} />
          {penalty.notes ? (
            <InlineMessage tone="info" title="Notes du contrôleur">
              {penalty.notes}
            </InlineMessage>
          ) : null}
          {penalty.resolutionNote ? (
            <InlineMessage tone="info" title={`Dernier motif · ${agent(dossier.resolveur)}`}>
              {penalty.resolutionNote}
            </InlineMessage>
          ) : null}
        </Panneau>
        <Panneau titre="Chronologie" icone={History}>
          <Chronologie evenements={chronologiePv(dossier)} />
        </Panneau>
      </div>
      {actions.fenetre}
    </ManagementDetailShell>
  )
}
