"use client"

import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Checkbox } from "@workspace/ui/components/choice"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { aujourdhuiService, debutJour } from "@/components/gestion/referentiels/format"
import { texte } from "@/components/gestion/referentiels/formulaire"

import { gmaoApi, heures, km, PRIORITES, quantite, xaf, type DossierOt } from "../commun"
import { piecesNettes } from "./actions-ot"
import { champDateHeure, FenetreAction, lireDateHeure, quantiteSaisie, texteObligatoire } from "./outils"

/*
 * Fenêtres d'action d'un ordre de travail. Chacune appelle une mutation
 * réelle ; l'erreur du serveur reste affichée dans la fenêtre.
 */

interface ProprietesFenetre {
  dossier: DossierOt
  open: boolean
  onOpenChange: (open: boolean) => void
  onSucces: (message: string) => void
}

/* ============================================================== Modifier */

export function FenetreModifierOt({ dossier, open, onOpenChange, onSucces }: ProprietesFenetre) {
  const modifier = useMutation(gmaoApi.mutations.modifierOt)
  const { ot } = dossier
  const [immobilisant, setImmobilisant] = useState(ot.immobilisant)
  return (
    <FenetreAction
      open={open}
      onOpenChange={onOpenChange}
      titre={`Modifier la demande ${ot.numero}`}
      description="Possible tant que les travaux n'ont pas commencé. La modification est inscrite à la chronologie."
      libelleValider="Enregistrer"
      onSucces={onSucces}
      action={async (donnees) => {
        await modifier({
          otId: ot.id,
          titre: texteObligatoire(donnees, "titre", "L'intitulé"),
          description: texteObligatoire(donnees, "description", "La description"),
          priorite: String(donnees.get("priorite")) as DossierOt["ot"]["priorite"],
          organe: texte(donnees, "organe") ?? "",
          immobilisant,
        })
        return `${ot.numero} modifié.`
      }}
    >
      <Field label="Intitulé">
        <Input name="titre" required maxLength={160} defaultValue={ot.titre} />
      </Field>
      <Field label="Description">
        <Textarea name="description" required maxLength={4000} defaultValue={ot.description} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Priorité">
          <SelectNative name="priorite" defaultValue={ot.priorite}>
            {Object.entries(PRIORITES).map(([cle, def]) => (
              <option key={cle} value={cle}>
                {def.libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Organe concerné (facultatif)">
          <Input name="organe" maxLength={120} defaultValue={ot.organe ?? ""} />
        </Field>
      </div>
      <Checkbox label="L'engin est immobilisé pendant l'intervention" checked={immobilisant} onCheckedChange={(valeur) => setImmobilisant(valeur === true)} />
    </FenetreAction>
  )
}

/* ============================================================= Planifier */

export function FenetrePlanifierOt({ dossier, open, onOpenChange, onSucces }: ProprietesFenetre) {
  const formulaires = useQuery(gmaoApi.queries.formulaires, open ? {} : "skip")
  const planifier = useMutation(gmaoApi.mutations.planifierOt)
  const { ot } = dossier
  const replanification = ot.statut === "planifie"
  return (
    <FenetreAction
      open={open}
      onOpenChange={onOpenChange}
      titre={replanification ? `Replanifier ${ot.numero}` : `Planifier ${ot.numero}`}
      description="Heures de Libreville. Une immobilisation planifiée ne dépasse pas 120 jours."
      libelleValider={replanification ? "Replanifier" : "Planifier l'OT"}
      onSucces={onSucces}
      action={async (donnees) => {
        const debutPrevu = lireDateHeure(String(donnees.get("debutPrevu") ?? ""))
        const finPrevue = lireDateHeure(String(donnees.get("finPrevue") ?? ""))
        if (!Number.isFinite(debutPrevu) || !Number.isFinite(finPrevue)) throw new Error("Renseignez le début et la fin prévus.")
        if (finPrevue <= debutPrevu) throw new Error("La fin prévue doit suivre le début prévu.")
        await planifier({
          otId: ot.id,
          atelierId: texteObligatoire(donnees, "atelierId", "L'atelier") as never,
          equipe: texteObligatoire(donnees, "equipe", "L'équipe"),
          debutPrevu,
          finPrevue,
        })
        return replanification ? `${ot.numero} replanifié.` : `${ot.numero} planifié.`
      }}
    >
      {formulaires === undefined ? (
        <p role="status" className="text-small text-ink-muted">
          Chargement des ateliers…
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Atelier">
              <SelectNative name="atelierId" defaultValue={ot.atelierId} required>
                {formulaires.ateliers.map((atelier) => (
                  <option key={atelier.id} value={atelier.id}>
                    {atelier.nom}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field label="Équipe" hint="Ex. Équipe B — mécanique">
              <Input name="equipe" required maxLength={120} defaultValue={ot.equipe ?? ""} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Début prévu">
              <Input name="debutPrevu" type="datetime-local" required defaultValue={champDateHeure(ot.debutPrevu)} className="tabular" />
            </Field>
            <Field label="Fin prévue">
              <Input name="finPrevue" type="datetime-local" required defaultValue={champDateHeure(ot.finPrevue)} className="tabular" />
            </Field>
          </div>
        </>
      )}
    </FenetreAction>
  )
}

/* ========================================================= Saisir du temps */

export function FenetreTempsOt({ dossier, open, onOpenChange, onSucces }: ProprietesFenetre) {
  const saisir = useMutation(gmaoApi.mutations.saisirTemps)
  const [duree, setDuree] = useState("")
  const { ot } = dossier
  const taux = dossier.atelier?.tauxHoraireFcfa ?? null
  const valeur = Number(duree.replace(",", "."))
  const montant = taux !== null && duree && Number.isFinite(valeur) ? valeur * taux : null
  return (
    <FenetreAction
      open={open}
      onOpenChange={onOpenChange}
      titre={`Saisir du temps sur ${ot.numero}`}
      description="Une ligne par intervenant et par jour, au quart d'heure (0,25), seize heures au plus."
      libelleValider="Enregistrer le temps"
      onSucces={onSucces}
      action={async (donnees) => {
        const jour = texteObligatoire(donnees, "date", "La date")
        const h = quantiteSaisie(donnees, "heures", "Le nombre d'heures")
        if (Math.round(h * 4) !== h * 4) throw new Error("Les heures se saisissent au quart d'heure (0,25).")
        const resultat = await saisir({
          otId: ot.id,
          intervenant: texteObligatoire(donnees, "intervenant", "L'intervenant"),
          matricule: texte(donnees, "matricule"),
          date: debutJour(jour),
          heures: h,
          commentaire: texte(donnees, "commentaire"),
        })
        setDuree("")
        return `${heures(h)} enregistrées · ${xaf(resultat.montantFcfa)} de main-d'œuvre.`
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Intervenant">
          <Input name="intervenant" required maxLength={120} autoComplete="off" />
        </Field>
        <Field label="Matricule (facultatif)">
          <Input name="matricule" maxLength={40} className="tabular" autoComplete="off" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date">
          <Input name="date" type="date" required defaultValue={aujourdhuiService()} max={aujourdhuiService()} className="tabular" />
        </Field>
        <Field label="Heures" hint={montant !== null ? `${xaf(montant)} au taux de l'atelier (${xaf(taux)} / h)` : taux !== null ? `Taux de l'atelier : ${xaf(taux)} / h` : undefined}>
          <Input
            name="heures"
            type="number"
            inputMode="decimal"
            step={0.25}
            min={0.25}
            max={16}
            required
            value={duree}
            onChange={(event) => setDuree(event.target.value)}
            className="tabular"
          />
        </Field>
      </div>
      <Field label="Commentaire (facultatif)">
        <Textarea name="commentaire" maxLength={500} />
      </Field>
    </FenetreAction>
  )
}

/* ====================================================== Consommer une pièce */

export function FenetreConsommerOt({ dossier, open, onOpenChange, onSucces }: ProprietesFenetre) {
  const formulaires = useQuery(gmaoApi.queries.formulaires, open ? {} : "skip")
  const consommer = useMutation(gmaoApi.mutations.consommerPiece)
  const { ot } = dossier
  const [article, setArticle] = useState("")
  const [magasin, setMagasin] = useState<string>(ot.atelierId)
  const [qte, setQte] = useState("")
  const choisi = formulaires?.articles.find((candidat) => candidat.id === article)
  const stockDe = (candidat: NonNullable<typeof choisi>) => candidat.stocks.find((stock) => stock.atelierId === magasin)?.quantite ?? 0
  const disponible = choisi ? stockDe(choisi) : null
  const demande = Number(qte.replace(",", "."))
  const insuffisant = disponible !== null && qte !== "" && Number.isFinite(demande) && demande > disponible

  return (
    <FenetreAction
      open={open}
      onOpenChange={onOpenChange}
      titre={`Consommer une pièce sur ${ot.numero}`}
      description="La pièce sort du magasin choisi et son coût s'impute à l'OT."
      libelleValider="Sortir la pièce"
      onSucces={onSucces}
      action={async (donnees) => {
        const resultat = await consommer({
          otId: ot.id,
          articleId: texteObligatoire(donnees, "articleId", "L'article") as never,
          atelierId: texteObligatoire(donnees, "atelierId", "Le magasin") as never,
          quantite: quantiteSaisie(donnees, "quantite"),
        })
        setQte("")
        return `Pièce sortie · ${xaf(resultat.valeurFcfa)} imputés · reste ${quantite(resultat.quantiteRestante, choisi?.unite)} en magasin.`
      }}
    >
      {formulaires === undefined ? (
        <p role="status" className="text-small text-ink-muted">
          Chargement du stock…
        </p>
      ) : (
        <>
          <Field label="Magasin">
            <SelectNative name="atelierId" value={magasin} onChange={(event) => setMagasin(event.target.value)} required>
              {formulaires.ateliers.map((atelier) => (
                <option key={atelier.id} value={atelier.id}>
                  {atelier.code} — {atelier.nom}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Article" hint="Le stock affiché est celui du magasin choisi">
            <SelectNative name="articleId" value={article} onChange={(event) => setArticle(event.target.value)} required>
              <option value="">Choisir un article…</option>
              {formulaires.articles.map((candidat) => {
                const stock = stockDe(candidat)
                return (
                  <option key={candidat.id} value={candidat.id}>
                    {candidat.reference} — {candidat.designation} · {stock === 0 ? "rupture" : `${quantite(stock, candidat.unite)} en stock`}
                  </option>
                )
              })}
            </SelectNative>
          </Field>
          <Field label="Quantité" hint={choisi ? `En stock dans ce magasin : ${quantite(disponible, choisi.unite)} · ${xaf(choisi.prixUnitaireFcfa)} l'unité` : undefined}>
            <Input name="quantite" inputMode="decimal" required value={qte} onChange={(event) => setQte(event.target.value)} className="tabular" />
          </Field>
          {insuffisant ? (
            <InlineMessage tone="warning" title="Stock insuffisant dans ce magasin">
              {`Il n'en reste que ${quantite(disponible, choisi?.unite)}. Choisissez un autre magasin ou demandez l'achat de la pièce.`}
            </InlineMessage>
          ) : null}
        </>
      )}
    </FenetreAction>
  )
}

/* ====================================================== Retourner une pièce */

export function FenetreRetourOt({ dossier, open, onOpenChange, onSucces }: ProprietesFenetre) {
  const retourner = useMutation(gmaoApi.mutations.retournerPiece)
  const { ot } = dossier
  const nettes = piecesNettes(dossier.pieces)
  const [article, setArticle] = useState("")
  const choisie = nettes.find((ligne) => ligne.articleId === article)
  return (
    <FenetreAction
      open={open}
      onOpenChange={onOpenChange}
      titre={`Retourner une pièce de ${ot.numero}`}
      description="Une pièce sortie mais non montée revient au magasin d'origine ; son coût est retiré de l'OT."
      libelleValider="Enregistrer le retour"
      onSucces={onSucces}
      action={async (donnees) => {
        const q = quantiteSaisie(donnees, "quantite")
        await retourner({ otId: ot.id, articleId: texteObligatoire(donnees, "articleId", "L'article") as never, quantite: q })
        return `Retour de ${quantite(q, choisie?.unite)} enregistré.`
      }}
    >
      {nettes.length === 0 ? (
        <InlineMessage tone="info" title="Aucune pièce à retourner">
          Aucune pièce consommée sur cet OT n&apos;est encore à rendre au magasin.
        </InlineMessage>
      ) : (
        <>
          <Field label="Pièce" hint={choisie ? `Consommé net sur l'OT : ${quantite(choisie.quantite, choisie.unite)}` : undefined}>
            <SelectNative name="articleId" value={article} onChange={(event) => setArticle(event.target.value)} required>
              <option value="">Choisir une pièce…</option>
              {nettes.map((ligne) => (
                <option key={ligne.articleId} value={ligne.articleId}>
                  {ligne.reference} — {ligne.designation} · {quantite(ligne.quantite, ligne.unite)} consommé(s)
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Quantité retournée">
            <Input name="quantite" inputMode="decimal" required className="tabular" />
          </Field>
        </>
      )}
    </FenetreAction>
  )
}

/* =================================================== Prestation externe */

export function FenetreCoutExterneOt({ dossier, open, onOpenChange, onSucces }: ProprietesFenetre) {
  const ajouter = useMutation(gmaoApi.mutations.ajouterCoutExterne)
  const { ot } = dossier
  return (
    <FenetreAction
      open={open}
      onOpenChange={onOpenChange}
      titre={`Prestation externe sur ${ot.numero}`}
      description="Sous-traitance, location d'outillage, expertise : le montant s'ajoute au coût de l'OT."
      libelleValider="Ajouter la prestation"
      onSucces={onSucces}
      action={async (donnees) => {
        const montant = quantiteSaisie(donnees, "montant", "Le montant")
        if (!Number.isInteger(montant) || montant <= 0) throw new Error("Le montant est un nombre entier de XAF, strictement positif.")
        await ajouter({ otId: ot.id, montantFcfa: montant, libelle: texteObligatoire(donnees, "libelle", "Le libellé") })
        return `Prestation de ${xaf(montant)} ajoutée.`
      }}
    >
      <Field label="Prestation" hint="Prestataire et nature des travaux">
        <Input name="libelle" required maxLength={200} />
      </Field>
      <Field label="Montant (XAF)">
        <Input name="montant" inputMode="numeric" required className="tabular" />
      </Field>
    </FenetreAction>
  )
}

/* ====================================================== Travaux terminés */

export function FenetreTerminerOt({ dossier, open, onOpenChange, onSucces }: ProprietesFenetre) {
  const terminer = useMutation(gmaoApi.mutations.terminerTravaux)
  const { ot } = dossier
  return (
    <FenetreAction
      open={open}
      onOpenChange={onOpenChange}
      titre={`Travaux terminés sur ${ot.numero}`}
      description="L'OT passe en réception. Un autre agent que vous prononcera la remise en service."
      libelleValider="Déclarer les travaux terminés"
      onSucces={onSucces}
      action={async (donnees) => {
        await terminer({
          otId: ot.id,
          compteRendu: texteObligatoire(donnees, "compteRendu", "Le compte rendu"),
          organe: texte(donnees, "organe"),
        })
        return `${ot.numero} en attente de réception.`
      }}
    >
      {ot.heuresPassees <= 0 ? (
        <InlineMessage tone="warning" title="Aucun temps saisi">
          Le serveur refuse la fin des travaux tant que le temps passé n&apos;est pas saisi.
        </InlineMessage>
      ) : null}
      <Field label="Compte rendu" hint="Constat, travaux réalisés, pièces remplacées, essais">
        <Textarea name="compteRendu" required maxLength={4000} className="min-h-32" />
      </Field>
      <Field label="Organe réparé (facultatif)">
        <Input name="organe" maxLength={120} defaultValue={ot.organe ?? ""} />
      </Field>
    </FenetreAction>
  )
}

/* ===================================================== Refus de réception */

export function FenetreRefusReceptionOt({ dossier, open, onOpenChange, onSucces }: ProprietesFenetre) {
  const refuser = useMutation(gmaoApi.mutations.refuserReception)
  const { ot } = dossier
  return (
    <FenetreAction
      open={open}
      onOpenChange={onOpenChange}
      titre={`Refuser la réception de ${ot.numero}`}
      description="L'OT revient en cours : les travaux sont à reprendre."
      libelleValider="Refuser la réception"
      variante="danger"
      onSucces={onSucces}
      action={async (donnees) => {
        await refuser({ otId: ot.id, motif: texteObligatoire(donnees, "motif", "Le motif") })
        return `Réception refusée : ${ot.numero} revient en cours.`
      }}
    >
      <Field label="Motif du refus" hint="Ce qui n'est pas conforme à l'essai ou à l'inspection">
        <Textarea name="motif" required maxLength={500} />
      </Field>
    </FenetreAction>
  )
}

/* ====================================================== Remise en service */

export function FenetreCloturerOt({ dossier, open, onOpenChange, onSucces }: ProprietesFenetre) {
  const cloturer = useMutation(gmaoApi.mutations.cloturerOt)
  const { ot, engin } = dossier
  return (
    <FenetreAction
      open={open}
      onOpenChange={onOpenChange}
      titre={`Remettre en service · ${ot.numero}`}
      description="Vous réceptionnez les travaux et clôturez l'OT. L'engin repart en service si aucun autre OT immobilisant n'est ouvert."
      libelleValider="Clôturer et remettre en service"
      onSucces={onSucces}
      action={async (donnees) => {
        const saisi = String(donnees.get("kmCloture") ?? "").trim()
        const kmCloture = saisi ? quantiteSaisie(donnees, "kmCloture", "Le compteur") : undefined
        await cloturer({ otId: ot.id, kmCloture })
        return `${ot.numero} clôturé : engin réceptionné.`
      }}
    >
      <Field label="Compteur à la clôture (facultatif)" hint={engin ? `Dernier relevé : ${km(engin.compteurKm)}. Le compteur ne recule pas.` : undefined}>
        <Input name="kmCloture" inputMode="numeric" className="tabular" />
      </Field>
    </FenetreAction>
  )
}

/* ================================================================ Annuler */

export function FenetreAnnulerOt({ dossier, open, onOpenChange, onSucces }: ProprietesFenetre) {
  const annuler = useMutation(gmaoApi.mutations.annulerOt)
  const { ot } = dossier
  return (
    <FenetreAction
      open={open}
      onOpenChange={onOpenChange}
      titre={`Annuler ${ot.numero} ?`}
      description="Un OT annulé ne peut pas être rouvert. L'engin est libéré si plus rien ne l'immobilise."
      libelleValider="Confirmer l'annulation"
      variante="danger"
      onSucces={onSucces}
      action={async (donnees) => {
        await annuler({ otId: ot.id, motif: texteObligatoire(donnees, "motif", "Le motif d'annulation") })
        return `${ot.numero} annulé.`
      }}
    >
      <Field label="Motif d'annulation">
        <Textarea name="motif" required maxLength={500} />
      </Field>
    </FenetreAction>
  )
}
