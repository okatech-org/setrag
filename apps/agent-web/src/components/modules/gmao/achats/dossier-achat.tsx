"use client"

import { Ban, CircleCheck, CircleX, FileText, History, PackageCheck, Send, ShoppingCart, Truck, UserCheck, Warehouse, Wrench } from "lucide-react"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { Field, Input, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { Chronologie, Fiche, Panneau } from "@/components/charte"
import { Encart, RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte, nombre } from "@/components/gestion/referentiels/format"
import { CycleVie } from "@/components/gestion/referentiels/statuts"

import { CadreGmao, DossierEnChargement, DossierIntrouvable, gmaoApi, ORIGINES_ACHAT, quantite, STATUTS_ACHAT, TagAchat, useDroitsGmao, xaf, type CapaciteGmao, type DossierAchat } from "../commun"
import { chronologieGmao, FenetreAction, GardeDossier, Horodatage, LienInterne, quantiteSaisie, texteObligatoire } from "../ordres/outils"
import { TagAlerteStock } from "../stock/stock"
import { livraisonEnRetard, TagLivraisonRetard } from "./achats"

const RETOUR = { href: "/materiel/achats", libelle: "Achats" }

/** Mention imposée : aucune commande ne part réellement chez un fournisseur. */
export const MENTION_COMMANDE_SIMULEE = "Commande simulée : aucun système achats n'est raccordé."

export type StatutAchat = DossierAchat["demande"]["statut"]
export type ActionAchat = "valider" | "refuser" | "commander" | "receptionner" | "annuler"

export const LIBELLES_ACTIONS_ACHAT: Record<ActionAchat, string> = {
  valider: "Valider la demande",
  refuser: "Refuser",
  commander: "Passer la commande",
  receptionner: "Réceptionner",
  annuler: "Annuler la demande",
}

/**
 * Actions d'une demande d'achat selon son statut et les droits de l'agent.
 * Une seule principale : l'étape suivante. Le demandeur ne valide pas sa
 * propre demande (séparation des tâches).
 */
export function actionsAchat({ statut, peut, demandeParMoi }: { statut: StatutAchat; peut: (capacite: CapaciteGmao) => boolean; demandeParMoi: boolean }) {
  const autres: ActionAchat[] = []
  let principale: ActionAchat | null = null
  let separationTaches = false
  if (statut === "soumise") {
    if (peut("achat_valider")) {
      if (demandeParMoi) separationTaches = true
      else principale = "valider"
      autres.push("refuser")
    }
    if (peut("achat_demander")) autres.push("annuler")
  } else if (statut === "validee") {
    if (peut("achat_valider")) principale = "commander"
    if (peut("achat_demander")) autres.push("annuler")
  } else if (statut === "commandee") {
    if (peut("stock_mouvementer")) principale = "receptionner"
  }
  return { principale, autres, separationTaches }
}

const ETAPES = ["Soumise", "Validée", "Commandée", "Reçue"] as const
const etape = (statut: StatutAchat) => (statut === "soumise" ? 0 : statut === "validee" ? 1 : statut === "commandee" ? 2 : statut === "recue" ? 3 : -1)

export function PageDossierAchat({ demandeId }: { demandeId: string }) {
  return (
    <GardeDossier
      key={demandeId}
      secours={
        <CadreGmao titre="Demande d'achat" retour={RETOUR}>
          <DossierIntrouvable quoi="Demande d'achat" retour={RETOUR} />
        </CadreGmao>
      }
    >
      <DossierAchatEcran demandeId={demandeId} />
    </GardeDossier>
  )
}

export function DossierAchatEcran({ demandeId }: { demandeId: string }) {
  const dossier = useQuery(gmaoApi.queries.demandeAchat, { demandeId: demandeId as never })
  if (dossier === undefined) {
    return (
      <CadreGmao titre="Demande d'achat" retour={RETOUR}>
        <DossierEnChargement />
      </CadreGmao>
    )
  }
  if (dossier === null) {
    return (
      <CadreGmao titre="Demande d'achat introuvable" retour={RETOUR}>
        <DossierIntrouvable quoi="Demande d'achat" retour={RETOUR} />
      </CadreGmao>
    )
  }
  return <DossierAchatCharge dossier={dossier} />
}

function DossierAchatCharge({ dossier }: { dossier: DossierAchat }) {
  const droits = useDroitsGmao()
  const operation = useOperation()
  const valider = useMutation(gmaoApi.mutations.validerAchat)
  const refuser = useMutation(gmaoApi.mutations.refuserAchat)
  const commander = useMutation(gmaoApi.mutations.commanderAchat)
  const receptionner = useMutation(gmaoApi.mutations.receptionnerAchat)
  const annuler = useMutation(gmaoApi.mutations.annulerAchat)
  const [fenetre, setFenetre] = useState<ActionAchat | null>(null)
  const [recu, setRecu] = useState("")
  const [maintenant] = useState(() => Date.now())
  const { demande, article, atelier, stock, ot } = dossier
  const unite = article?.unite
  const plan = actionsAchat({ statut: demande.statut, peut: droits.peut, demandeParMoi: demande.demandeParMoi })
  const succes = (message: string) => operation.signaler({ ton: "success", titre: message })
  const fermer = (ouvert: boolean) => {
    if (!ouvert) setFenetre(null)
  }
  const enRetard = livraisonEnRetard({ statut: demande.statut, livraisonPrevueLe: demande.commande?.livraisonPrevueLe ?? null }, maintenant)
  const partielle = demande.quantiteRecue !== null && demande.quantiteRecue < demande.quantite
  const saisieRecue = Number(recu.replace(",", "."))
  const receptionPartielle = recu.trim() !== "" && Number.isFinite(saisieRecue) && saisieRecue < demande.quantite

  const icones: Record<ActionAchat, typeof Ban> = { valider: CircleCheck, refuser: CircleX, commander: Send, receptionner: PackageCheck, annuler: Ban }
  const bouton = (action: ActionAchat, variante: "primary" | "secondary" | "ghost") => {
    const Icone = icones[action]
    return (
      <Button key={action} type="button" variant={variante} onClick={() => setFenetre(action)}>
        <Icone />
        {LIBELLES_ACTIONS_ACHAT[action]}
      </Button>
    )
  }

  return (
    <CadreGmao
      titre={`Demande ${demande.numero}`}
      description={article ? `${quantite(demande.quantite, article.unite)} · ${article.reference} — ${article.designation}` : undefined}
      retour={RETOUR}
      actions={
        plan.principale || plan.autres.length > 0 ? (
          <>
            {plan.autres.map((action) => bouton(action, action === "annuler" ? "ghost" : "secondary"))}
            {plan.principale ? bouton(plan.principale, "primary") : null}
          </>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagAchat statut={demande.statut} />
        {enRetard ? <TagLivraisonRetard /> : null}
      </div>

      <RetourOperation retour={operation.retour} />

      {plan.separationTaches ? (
        <Encart icone={UserCheck} titre="Séparation des tâches : un autre agent valide cette demande" ton="vigilance">
          Vous êtes l&apos;auteur de la demande ; sa validation revient à un autre agent habilité. Vous pouvez encore la refuser ou l&apos;annuler.
        </Encart>
      ) : null}

      {demande.statut === "refusee" || demande.statut === "annulee" ? (
        <InlineMessage tone="warning" title={demande.statut === "refusee" ? "Demande refusée" : "Demande annulée"}>
          {demande.motifRefus ?? "Motif non renseigné."}
        </InlineMessage>
      ) : null}

      {etape(demande.statut) >= 0 ? (
        <Panneau titre="Cycle de la demande" icone={ShoppingCart}>
          <CycleVie etapes={ETAPES} courante={etape(demande.statut)} />
          <p className="text-[14px]">
            <b>Étape actuelle : {STATUTS_ACHAT[demande.statut].libelle}.</b>{" "}
            <span className="text-ink-muted">
              {demande.statut === "soumise"
                ? "Validation par un autre agent que le demandeur."
                : demande.statut === "validee"
                  ? "Commande à transmettre au fournisseur."
                  : demande.statut === "commandee"
                    ? "Réception au magasin à l'arrivée de la livraison."
                    : "Pièces entrées en stock."}
            </span>
          </p>
        </Panneau>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="grid min-w-0 content-start gap-5">
          <Panneau titre="Demande" icone={FileText}>
            <Fiche
              elements={[
                ["Numéro", <span key="n" className="tabular">{demande.numero}</span>],
                ["Article", article ? <LienInterne key="a" href={`/materiel/stock/${article.id}`} mono>{article.reference}</LienInterne> : "—"],
                article ? ["Désignation", article.designation] : null,
                ["Magasin", atelier ? `${atelier.code} — ${atelier.nom}` : "—"],
                ["Quantité", <span key="q" className="tabular">{quantite(demande.quantite, unite)}</span>],
                ["Prix unitaire", <span key="pu" className="tabular">{xaf(demande.prixUnitaireFcfa)}</span>],
                ["Montant", <b key="m" className="tabular">{xaf(demande.montantFcfa)}</b>],
                ["Origine", ORIGINES_ACHAT[demande.origine]],
                ["Motif", demande.motif],
                ["Demandée le", <Horodatage key="d" le={demande.demandeLe} />],
                ["Demandeur", demande.demandeur ?? "Génération automatique"],
                demande.valideur ? [demande.statut === "refusee" ? "Refusée par" : "Validée par", demande.valideur] : null,
                demande.valideLe ? [demande.statut === "refusee" ? "Refusée le" : "Validée le", <Horodatage key="v" le={demande.valideLe} />] : null,
              ]}
            />
          </Panneau>

          <Panneau titre="Commande fournisseur" icone={Truck}>
            <InlineMessage tone="info" title={MENTION_COMMANDE_SIMULEE}>
              Le numéro de commande et la date de livraison sont calculés d&apos;après le délai d&apos;approvisionnement de l&apos;article ; rien n&apos;est transmis au fournisseur.
            </InlineMessage>
            {demande.commande ? (
              <Fiche
                elements={[
                  ["N° de commande", <span key="c" className="tabular">{demande.commande.numero}</span>],
                  ["Fournisseur", demande.commande.fournisseur],
                  ["Passée le", <Horodatage key="p" le={demande.commande.passeeLe} />],
                  [
                    "Livraison prévue",
                    <span key="l" className="inline-flex flex-wrap items-center justify-end gap-1.5">
                      <span className="tabular">{dateCourte(demande.commande.livraisonPrevueLe)}</span>
                      {enRetard ? <TagLivraisonRetard /> : null}
                    </span>,
                  ],
                  demande.quantiteRecue !== null ? ["Quantité reçue", <span key="r" className="tabular">{`${quantite(demande.quantiteRecue, unite)} sur ${quantite(demande.quantite, unite)}`}</span>] : null,
                  demande.recueLe ? ["Reçue le", <Horodatage key="rl" le={demande.recueLe} />] : null,
                ]}
              />
            ) : (
              <p className="text-small text-ink-muted">
                {article ? `Fournisseur ${article.fournisseur} · délai ${nombre(article.delaiApproJours)} jours. ` : ""}
                Pas encore commandée.
              </p>
            )}
            {partielle ? (
              <InlineMessage tone="warning" title="Livraison partielle">
                {`${quantite(demande.quantiteRecue, unite)} reçus sur ${quantite(demande.quantite, unite)} : le solde est à redemander.`}
              </InlineMessage>
            ) : null}
          </Panneau>
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <Panneau titre="Stock actuel du magasin" icone={Warehouse}>
            {stock ? (
              <>
                <TagAlerteStock rupture={stock.quantite === 0} sousSeuil={stock.quantite <= stock.seuilReappro} />
                <Fiche
                  elements={[
                    ["En stock", <span key="s" className="tabular">{quantite(stock.quantite, unite)}</span>],
                    ["Seuil de réappro.", <span key="se" className="tabular">{quantite(stock.seuilReappro, unite)}</span>],
                    ["Quantité à commander", <span key="qr" className="tabular">{quantite(stock.quantiteReappro, unite)}</span>],
                  ]}
                />
              </>
            ) : (
              <p className="text-small text-ink-muted">L&apos;article n&apos;est pas encore stocké dans ce magasin : la réception l&apos;y ouvrira.</p>
            )}
          </Panneau>
          <Panneau titre="Ordre de travail lié" icone={Wrench}>
            {ot ? (
              <p className="text-[14px]">
                <LienInterne href={`/materiel/ordres/${ot.id}`} mono>
                  {ot.numero}
                </LienInterne>{" "}
                · {ot.titre}
              </p>
            ) : (
              <p className="text-small text-ink-muted">Aucun : la demande ne vient pas d&apos;un OT.</p>
            )}
          </Panneau>
          <Panneau titre="Chronologie" icone={History}>
            <Chronologie evenements={chronologieGmao(dossier.chronologie)} />
          </Panneau>
        </div>
      </div>

      {fenetre === "valider" ? (
        <FenetreAction
          open
          onOpenChange={fermer}
          titre={`Valider ${demande.numero} ?`}
          description={`Vous engagez ${xaf(demande.montantFcfa)}. La demande pourra ensuite être commandée.`}
          libelleValider="Valider la demande"
          onSucces={succes}
          action={async () => {
            await valider({ demandeId: demande.id })
            return `${demande.numero} validée.`
          }}
        >
          <p className="text-[14px]">{`${quantite(demande.quantite, unite)} · ${article?.reference ?? ""} pour le magasin ${atelier?.code ?? ""}.`}</p>
        </FenetreAction>
      ) : null}
      {fenetre === "refuser" ? (
        <FenetreAction
          open
          onOpenChange={fermer}
          titre={`Refuser ${demande.numero}`}
          libelleValider="Refuser la demande"
          variante="danger"
          onSucces={succes}
          action={async (donnees) => {
            await refuser({ demandeId: demande.id, motif: texteObligatoire(donnees, "motif", "Le motif de refus") })
            return `${demande.numero} refusée.`
          }}
        >
          <Field label="Motif du refus">
            <Textarea name="motif" required maxLength={500} />
          </Field>
        </FenetreAction>
      ) : null}
      {fenetre === "commander" ? (
        <FenetreAction
          open
          onOpenChange={fermer}
          titre={`Commander ${demande.numero}`}
          description={MENTION_COMMANDE_SIMULEE}
          libelleValider="Passer la commande"
          onSucces={succes}
          action={async () => {
            const { commande } = await commander({ demandeId: demande.id })
            return `Commande ${commande.numero} enregistrée (simulée) · livraison prévue le ${dateCourte(commande.livraisonPrevueLe)}.`
          }}
        >
          <p className="text-[14px]">
            {article ? `Fournisseur ${article.fournisseur}, délai ${nombre(article.delaiApproJours)} jours. ` : ""}
            Un numéro de commande est attribué et la livraison est datée d&apos;après ce délai.
          </p>
        </FenetreAction>
      ) : null}
      {fenetre === "receptionner" ? (
        <FenetreAction
          open
          onOpenChange={(ouvert) => {
            fermer(ouvert)
            if (!ouvert) setRecu("")
          }}
          titre={`Réceptionner ${demande.commande?.numero ?? demande.numero}`}
          description={`La quantité reçue entre au magasin ${atelier?.code ?? ""}. Au plus 10 % au-delà de la quantité commandée.`}
          libelleValider="Enregistrer la réception"
          onSucces={succes}
          action={async (donnees) => {
            const q = quantiteSaisie(donnees, "quantite", "La quantité reçue")
            await receptionner({ demandeId: demande.id, quantiteRecue: q })
            return q < demande.quantite ? `Réception partielle : ${quantite(q, unite)} sur ${quantite(demande.quantite, unite)}.` : `Réception de ${quantite(q, unite)} enregistrée.`
          }}
        >
          <Field label="Quantité reçue" hint={`Commandé : ${quantite(demande.quantite, unite)}`}>
            <Input name="quantite" inputMode="decimal" required value={recu} onChange={(event) => setRecu(event.target.value)} className="tabular" />
          </Field>
          {receptionPartielle ? (
            <InlineMessage tone="warning" title="Livraison partielle">
              {`Il manquera ${quantite(Math.round((demande.quantite - saisieRecue) * 100) / 100, unite)} : la demande sera close et le solde à redemander.`}
            </InlineMessage>
          ) : null}
        </FenetreAction>
      ) : null}
      {fenetre === "annuler" ? (
        <FenetreAction
          open
          onOpenChange={fermer}
          titre={`Annuler ${demande.numero} ?`}
          description="Possible tant que la commande n'est pas passée."
          libelleValider="Annuler la demande"
          variante="danger"
          onSucces={succes}
          action={async (donnees) => {
            await annuler({ demandeId: demande.id, motif: texteObligatoire(donnees, "motif", "Le motif") })
            return `${demande.numero} annulée.`
          }}
        >
          <Field label="Motif">
            <Textarea name="motif" required maxLength={500} />
          </Field>
        </FenetreAction>
      ) : null}
    </CadreGmao>
  )
}
