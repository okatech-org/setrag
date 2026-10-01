"use client"

import { Briefcase, CreditCard, Download, History, ScanLine, Ticket, UserRound } from "lucide-react"

import { useAction, useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { Chronologie, Fiche, Panneau } from "@/components/charte"
import { useDroitsGestion } from "./gestion/referentiels/droits"
import { Historique, RetourOperation, useOperation } from "./gestion/referentiels/elements"
import { agent, CATEGORIES_REDUCTION, CLASSES, dateHeure, dateService, heure, jourMois, libelleDesserte, montant, MOYENS_PAIEMENT, taux } from "./gestion/referentiels/format"
import { Pastille } from "./gestion/referentiels/statuts"
import { RESULTATS_CONTROLE, TelephoneMasque } from "./gestion/referentiels/voyageurs-commun"
import { ManagementDetailShell } from "./management-detail-shell"

const ETATS_BILLET = {
  en_attente: { libelle: "En attente de paiement", ton: "warning" },
  valide: { libelle: "Valide", ton: "success" },
  utilise: { libelle: "Utilisé", ton: "neutral" },
  annule: { libelle: "Annulé", ton: "danger" },
  rembourse: { libelle: "Remboursé", ton: "danger" },
  expire: { libelle: "Expiré", ton: "neutral" },
} as const

const CANAUX = { guichet: "Guichet", ligne: "En ligne", agence: "Agence", bord: "À bord", manuel: "Ressaisie papier" } as const

export function TravelerTicketDetail({ ticketId }: { ticketId: string }) {
  const droits = useDroitsGestion()
  const dossier = useQuery(api.functions.referentiels.billetVoyageur, { ticketId: ticketId as never })
  const ticketPdf = useAction(api.functions.documents.ticketPdf)
  const reprint = useMutation(api.functions.sales.reprintTicket)
  const operation = useOperation()

  if (dossier === undefined || dossier === null) {
    return (
      <ManagementDetailShell title={dossier === null ? "Billet introuvable" : "Voyageur"} eyebrow="Commercial · voyageurs" backHref="/gestion/voyageurs" verrouillage="aucun">
        {dossier === null ? <InlineMessage tone="danger" title="Ce billet n'existe plus." /> : <SkeletonLines />}
      </ManagementDetailShell>
    )
  }
  const { ticket, vente, desserte } = dossier
  const etat = ETATS_BILLET[ticket.status]
  const p = ticket.passager

  return (
    <ManagementDetailShell
      title={`${p.lastName.toUpperCase()} ${p.firstName}`}
      eyebrow={`Commercial · billet ${ticket.number}`}
      backHref="/gestion/voyageurs"
      verrouillage="aucun"
      description="Les données transactionnelles ne se modifient ni ne se suppriment : annulation et remboursement passent par le guichet, avec leurs écritures liées."
      actions={
        <>
          {droits.may("duplicatas") ? (
            <Button
              type="button"
              variant="secondary"
              loading={operation.enCours === "pdf"}
              onClick={() =>
                void operation.executer("pdf", async () => {
                  const resultat = await ticketPdf({ ticketId: ticket._id })
                  window.open(resultat.url, "_blank", "noopener,noreferrer")
                  return true
                })
              }
            >
              <Download />
              Billet (PDF)
            </Button>
          ) : null}
          {droits.may("duplicatas", "creer") && ticket.status === "valide" ? (
            <Button
              type="button"
              loading={operation.enCours === "duplicata"}
              onClick={() => {
                if (!window.confirm("Émettre un duplicata ? Il porte la mention DUPLICATA et reste au journal.")) return
                void operation.executer("duplicata", () => reprint({ ticketId: ticket._id }), (r) => `${r.mention} enregistré pour ${r.ticketNumber}.`)
              }}
            >
              <Ticket />
              Émettre un duplicata
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Pastille ton={etat.ton}>{etat.libelle}</Pastille>
        {ticket.duplicateCount > 0 ? <Pastille ton="neutral">{ticket.duplicateCount} duplicata(s)</Pastille> : null}
      </div>
      <RetourOperation retour={operation.retour} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panneau titre="Billet" icone={Ticket}>
          <Fiche
            elements={[
              ["Desserte", desserte ? `${libelleDesserte(desserte)}` : "—"],
              ["Date", desserte ? dateService(desserte.serviceDate) : "—"],
              ["Trajet", `${dossier.origine?.name ?? "?"} → ${dossier.destination?.name ?? "?"}`],
              ["Classe", CLASSES[ticket.serviceClass].long],
              ["Place", <span key="p" className="tabular">{ticket.isStanding ? `${ticket.coachLabel ?? "?"} · debout` : `${ticket.coachLabel ?? "?"} · ${ticket.seatLabel ?? "?"}`}</span>],
              ["Catégorie", ticket.fare.discountCode ? `${CATEGORIES_REDUCTION[ticket.fare.discountCode] ?? ticket.fare.discountCode} · −${ticket.fare.discountPct} %` : "Adulte"],
              ["Calcul", <span key="c" className="tabular">{ticket.fare.chargeableKm} km × {taux(ticket.fare.ratePerKm)}</span>],
              ["Prix TTC", <span key="t" className="tabular">{montant(ticket.unitPriceTtc)} XAF</span>],
            ]}
          />
        </Panneau>
        <Panneau titre="Voyageur" icone={UserRound}>
          <Fiche
            elements={[
              ["Nom", `${p.lastName.toUpperCase()} ${p.firstName}`],
              ["Civilité", p.gender === "F" ? "Madame" : "Monsieur"],
              ["Nationalité", p.nationality ?? "—"],
              ["Naissance", p.birthDate ?? "—"],
              ["Pièce", p.documentNumber ? "Renseignée" : "—"],
              ["Téléphone", <TelephoneMasque key="t" ticketId={ticket._id} masque={ticket.telephone} />],
              ["Urgence", <TelephoneMasque key="u" ticketId={ticket._id} masque={ticket.urgence} libelle="le contact d'urgence" />],
            ]}
          />
        </Panneau>
        <Panneau titre="Vente" icone={CreditCard}>
          {vente ? (
            <Fiche
              elements={[
                ["Vente", <span key="v" className="tabular">{vente.number}</span>],
                ["Canal", CANAUX[vente.channel]],
                ["Le", <span key="d" className="tabular">{dateHeure(vente.soldAt)}</span>],
                ["Vendeur", agent(vente.vendeur, "Vente en ligne")],
                ["Point de vente", vente.pointOfSale ? `${vente.pointOfSale.code} · ${vente.pointOfSale.name}` : "—"],
                ["Contact", <TelephoneMasque key="c" ticketId={ticket._id} masque={vente.contactTelephone} libelle="le contact" />],
                ["E-mail", vente.contactEmail ?? "—"],
                ...dossier.paiements.map((paiement) => [`Paiement · ${MOYENS_PAIEMENT[paiement.method]}`, <span key={paiement.id} className="tabular">{montant(paiement.amountXaf)} · {paiement.status}</span>] as const),
              ]}
            />
          ) : (
            <p className="text-small text-ink-muted">Vente introuvable.</p>
          )}
        </Panneau>
        <Panneau titre="Contrôles à bord" icone={ScanLine}>
          <Chronologie
            evenements={dossier.controles.map((scan) => ({
              cle: scan.id,
              heure: jourMois(scan.scannedAt),
              titre: `${RESULTATS_CONTROLE[scan.result]?.libelle ?? scan.result}${scan.conflict ? " · à arbitrer" : ""}`,
              detail: `${heure(scan.scannedAt)} · ${agent(scan.agent)}${scan.offline ? " · hors ligne" : ""}`,
            }))}
            vide="Aucun contrôle enregistré : le voyageur n'est pas encore passé au contrôle."
          />
          {dossier.bagages.length > 0 ? (
            <p className="flex items-center gap-2 text-[13.5px]">
              <Briefcase aria-hidden className="size-4 text-ink-muted" />
              {dossier.bagages.map((b) => `${b.tagNumber} · ${b.weightKg} kg`).join(" ; ")}
            </p>
          ) : null}
        </Panneau>
      </div>
      <Panneau titre="Historique" icone={History}>
        <Historique historique={dossier.historique} vide="Aucune action tracée sur ce billet." />
      </Panneau>
    </ManagementDetailShell>
  )
}
