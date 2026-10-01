"use client"

import { CheckCheck, Construction, Flag, FlagTriangleRight, Layers, PencilLine, Ruler, Undo2 } from "lucide-react"
import { useState } from "react"

import { useMutation } from "@workspace/api/hooks"
import { Checkbox } from "@workspace/ui/components/choice"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"

import { Fiche } from "@/components/charte"
import { champDate, nombre } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire, nombreSaisi, texte } from "@/components/gestion/referentiels/formulaire"

import { infraApi, plagePk, xaf, type DossierChantier } from "../commun"
import { erreurOperation, horodatageDuJour, horodatageEcheance, jourLibreville, moisLibreville, refuser, type Operation } from "../interventions/partage"
import { EditeurFinancements, financementsSaisis, type LigneFinancement } from "./composants"
import { BAILLEURS, NATURES_CHANTIER, STATUTS_CHANTIER, TRANSITIONS_CHANTIER, estBailleur, type Bailleur, type NatureChantier, type StatutChantier } from "./libelles"

type Chantier = DossierChantier["chantier"]
type Lot = DossierChantier["lots"][number]
type Situation = DossierChantier["avancements"][number]
type Jalon = DossierChantier["jalons"][number]

interface Fenetre {
  open: boolean
  onOpenChange: (open: boolean) => void
  operation: Operation
}

const montantSaisi = (donnees: FormData, cle: string) => nombreSaisi(donnees, cle)

/* ============================================================ Chantier */

/**
 * Création d'un chantier du programme (en étude), ou mise à jour de sa fiche.
 * La somme des financements ne dépasse pas le budget : le serveur le vérifie.
 */
export function FenetreChantier({ open, onOpenChange, operation, chantier, onCree }: Fenetre & { chantier?: Chantier; onCree?: (chantierId: string) => void }) {
  const creer = useMutation(infraApi.mutations.creerChantier)
  const modifier = useMutation(infraApi.mutations.modifierChantier)
  const [budget, setBudget] = useState(chantier ? String(chantier.budgetFcfa) : "")
  const [financements, setFinancements] = useState<LigneFinancement[]>(() =>
    (chantier?.financements ?? []).filter((f) => estBailleur(f.bailleur)).map((f, index) => ({ cle: index + 1, bailleur: f.bailleur as Bailleur, montant: String(f.montantFcfa) }))
  )
  const budgetNombre = Number(budget.replace(/\s/g, "").replace(",", "."))

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre={chantier ? `Modifier ${chantier.code}` : "Créer un chantier PRN"}
      description={
        chantier
          ? "Seuls les champs modifiés sont enregistrés ; les valeurs précédentes restent au journal d'audit."
          : "Le chantier entre au programme « en étude ». Il passe en cours au lancement des travaux, et l'avancement se saisit alors par situations mensuelles."
      }
      libelleValider={
        <>
          <Construction />
          {chantier ? "Enregistrer le chantier" : "Créer le chantier"}
        </>
      }
      enCours={operation.enCours === "chantier"}
      erreur={erreurOperation(operation)}
      onSubmit={async (donnees) => {
        if (!Number.isFinite(budgetNombre) || budgetNombre <= 0) return refuser(operation, "Le budget est un montant positif en XAF.")
        const saisis = financementsSaisis(financements)
        if ("erreur" in saisis) return refuser(operation, saisis.erreur)
        const totalFinance = saisis.financements.reduce((s, f) => s + f.montantFcfa, 0)
        if (totalFinance > budgetNombre) return refuser(operation, "La somme des financements dépasse le budget du chantier.")
        const finPrevueLe = horodatageEcheance(String(donnees.get("finPrevueLe") ?? ""))
        if (Number.isNaN(finPrevueLe)) return refuser(operation, "La fin prévue est obligatoire.")

        if (chantier) {
          const patch: Partial<{ libelle: string; description: string; entreprise: string; maitreOeuvre: string; budgetFcfa: number; financements: typeof saisis.financements; finPrevueLe: number }> = {}
          const libelle = texte(donnees, "libelle") ?? ""
          const description = texte(donnees, "description") ?? ""
          const entreprise = texte(donnees, "entreprise") ?? ""
          const maitreOeuvre = texte(donnees, "maitreOeuvre") ?? ""
          if (libelle !== chantier.libelle) patch.libelle = libelle
          if (description !== chantier.description) patch.description = description
          if (entreprise !== chantier.entreprise) patch.entreprise = entreprise
          if (maitreOeuvre !== chantier.maitreOeuvre) patch.maitreOeuvre = maitreOeuvre
          if (budgetNombre !== chantier.budgetFcfa) patch.budgetFcfa = budgetNombre
          const avant = chantier.financements.map((f) => ({ bailleur: f.bailleur, montantFcfa: f.montantFcfa }))
          if (JSON.stringify(avant) !== JSON.stringify(saisis.financements)) patch.financements = saisis.financements
          if (String(donnees.get("finPrevueLe")) !== champDate(chantier.finPrevueLe)) patch.finPrevueLe = finPrevueLe
          if (Object.keys(patch).length === 0) return refuser(operation, "Aucune modification à enregistrer.")
          const ok = await operation.executer("chantier", () => modifier({ chantierId: chantier.id, ...patch }), `Chantier ${chantier.code} mis à jour.`)
          if (ok) onOpenChange(false)
          return
        }

        const pkDebut = nombreSaisi(donnees, "pkDebut")
        const pkFin = nombreSaisi(donnees, "pkFin")
        const quantitePrevue = nombreSaisi(donnees, "quantitePrevue")
        const debutLe = horodatageEcheance(String(donnees.get("debutLe") ?? ""))
        if (pkDebut === undefined || pkFin === undefined || Number.isNaN(pkDebut) || Number.isNaN(pkFin)) return refuser(operation, "Les PK de début et de fin sont des nombres.")
        if (pkFin <= pkDebut) return refuser(operation, "Le PK de fin doit dépasser le PK de début.")
        if (quantitePrevue === undefined || Number.isNaN(quantitePrevue) || quantitePrevue <= 0) return refuser(operation, "La quantité prévue est un nombre positif.")
        if (Number.isNaN(debutLe)) return refuser(operation, "La date de début est obligatoire.")
        if (finPrevueLe <= debutLe) return refuser(operation, "La fin prévue doit suivre le début du chantier.")
        const resultat = await operation.executer(
          "chantier",
          () =>
            creer({
              code: texte(donnees, "code") ?? "",
              libelle: texte(donnees, "libelle") ?? "",
              description: texte(donnees, "description") ?? "",
              nature: String(donnees.get("nature")) as NatureChantier,
              pkDebut,
              pkFin,
              entreprise: texte(donnees, "entreprise") ?? "",
              maitreOeuvre: texte(donnees, "maitreOeuvre") ?? "",
              budgetFcfa: budgetNombre,
              financements: saisis.financements,
              uniteQuantite: texte(donnees, "uniteQuantite") ?? "",
              quantitePrevue,
              debutLe,
              finPrevueLe,
            }),
          "Chantier inscrit au programme, en étude."
        )
        if (resultat) {
          onOpenChange(false)
          onCree?.(resultat.chantierId)
        }
      }}
    >
      {chantier ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" hint="Unique, par exemple PRN-09." htmlFor="chantier-code">
            <Input id="chantier-code" name="code" required maxLength={40} className="tabular uppercase" />
          </Field>
          <Field label="Nature des travaux" htmlFor="chantier-nature">
            <SelectNative id="chantier-nature" name="nature" defaultValue="renouvellement_voie">
              {Object.entries(NATURES_CHANTIER).map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {libelle}
                </option>
              ))}
            </SelectNative>
          </Field>
        </div>
      )}
      <Field label="Libellé" htmlFor="chantier-libelle">
        <Input id="chantier-libelle" name="libelle" required maxLength={200} defaultValue={chantier?.libelle} placeholder="Renouvellement de voie Ndjolé – Booué" />
      </Field>
      <Field label="Description" htmlFor="chantier-description">
        <Textarea id="chantier-description" name="description" required maxLength={3000} defaultValue={chantier?.description} />
      </Field>
      {chantier ? null : (
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="PK de début" htmlFor="chantier-pk-debut">
            <Input id="chantier-pk-debut" name="pkDebut" required inputMode="decimal" className="tabular" />
          </Field>
          <Field label="PK de fin" htmlFor="chantier-pk-fin">
            <Input id="chantier-pk-fin" name="pkFin" required inputMode="decimal" className="tabular" />
          </Field>
          <Field label="Quantité prévue" htmlFor="chantier-quantite">
            <Input id="chantier-quantite" name="quantitePrevue" required inputMode="decimal" className="tabular" />
          </Field>
          <Field label="Unité" hint="km, traverses, m³…" htmlFor="chantier-unite">
            <Input id="chantier-unite" name="uniteQuantite" required maxLength={20} />
          </Field>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Entreprise" htmlFor="chantier-entreprise">
          <Input id="chantier-entreprise" name="entreprise" required maxLength={200} defaultValue={chantier?.entreprise} />
        </Field>
        <Field label="Maître d'œuvre" htmlFor="chantier-moe">
          <Input id="chantier-moe" name="maitreOeuvre" required maxLength={200} defaultValue={chantier?.maitreOeuvre} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Budget (XAF)" htmlFor="chantier-budget">
          <Input id="chantier-budget" required inputMode="decimal" className="tabular" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </Field>
        {chantier ? null : (
          <Field label="Début des travaux" htmlFor="chantier-debut">
            <Input id="chantier-debut" name="debutLe" type="date" required className="tabular" />
          </Field>
        )}
        <Field label="Fin prévue" htmlFor="chantier-fin">
          <Input id="chantier-fin" name="finPrevueLe" type="date" required className="tabular" defaultValue={chantier ? champDate(chantier.finPrevueLe) : undefined} />
        </Field>
      </div>
      <EditeurFinancements lignes={financements} onChange={setFinancements} budget={Number.isFinite(budgetNombre) ? budgetNombre : null} />
    </FenetreFormulaire>
  )
}

/* ============================================================== Statut */

export function FenetreStatutChantier({ open, onOpenChange, operation, chantier }: Fenetre & { chantier: Chantier }) {
  const modifier = useMutation(infraApi.mutations.modifierChantier)
  const transitions = TRANSITIONS_CHANTIER[chantier.statut as StatutChantier] ?? []
  const [vers, setVers] = useState<StatutChantier | "">(transitions[0]?.vers ?? "")
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre={`Changer le statut de ${chantier.code}`}
      description={`Statut actuel : ${chantier.statutLibelle}. Une suspension exige un motif ; la réception est définitive.`}
      libelleValider={
        <>
          <Flag />
          Changer le statut
        </>
      }
      enCours={operation.enCours === "statut"}
      erreur={erreurOperation(operation)}
      onSubmit={async (donnees) => {
        if (!vers) return refuser(operation, "Aucune transition possible depuis ce statut.")
        const ok = await operation.executer(
          "statut",
          () => modifier({ chantierId: chantier.id, statut: vers, motif: texte(donnees, "motif") }),
          `Chantier ${chantier.code} : ${STATUTS_CHANTIER[vers].toLowerCase()}.`
        )
        if (ok) onOpenChange(false)
      }}
    >
      <Field label="Nouveau statut" htmlFor="chantier-statut">
        <SelectNative id="chantier-statut" value={vers} onChange={(e) => setVers(e.target.value as StatutChantier)}>
          {transitions.map((t) => (
            <option key={t.vers} value={t.vers}>
              {t.geste} ({STATUTS_CHANTIER[t.vers].toLowerCase()})
            </option>
          ))}
        </SelectNative>
      </Field>
      <Field label={vers === "suspendu" ? "Motif de la suspension" : "Motif ou observation (facultatif)"} htmlFor="chantier-statut-motif">
        <Textarea id="chantier-statut-motif" name="motif" required={vers === "suspendu"} maxLength={500} placeholder={vers === "suspendu" ? "Saison des pluies : accès au chantier impraticable." : "Procès-verbal de réception n° 2026-14."} />
      </Field>
    </FenetreFormulaire>
  )
}

/* ================================================================= Lot */

export function FenetreLot({ open, onOpenChange, operation, chantier }: Fenetre & { chantier: Chantier }) {
  const ajouter = useMutation(infraApi.mutations.ajouterLot)
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre={`Ajouter un lot · ${chantier.code}`}
      description={`La plage du lot reste dans celle du chantier (${plagePk(chantier.pkDebut, chantier.pkFin)}) et la somme des lots dans son budget (${xaf(chantier.budgetFcfa)}).`}
      libelleValider={
        <>
          <Layers />
          Ajouter le lot
        </>
      }
      enCours={operation.enCours === "lot"}
      erreur={erreurOperation(operation)}
      onSubmit={async (donnees) => {
        const montantFcfa = montantSaisi(donnees, "montantFcfa")
        const pkDebut = nombreSaisi(donnees, "pkDebut")
        const pkFin = nombreSaisi(donnees, "pkFin")
        const quantitePrevue = nombreSaisi(donnees, "quantitePrevue")
        if (montantFcfa === undefined || Number.isNaN(montantFcfa) || montantFcfa <= 0) return refuser(operation, "Le montant du lot est un nombre positif de XAF.")
        if (pkDebut === undefined || pkFin === undefined || Number.isNaN(pkDebut) || Number.isNaN(pkFin)) return refuser(operation, "Les PK de début et de fin sont des nombres.")
        if (quantitePrevue === undefined || Number.isNaN(quantitePrevue) || quantitePrevue <= 0) return refuser(operation, "La quantité prévue est un nombre positif.")
        const ok = await operation.executer(
          "lot",
          () =>
            ajouter({
              chantierId: chantier.id,
              code: texte(donnees, "code") ?? "",
              libelle: texte(donnees, "libelle") ?? "",
              entreprise: texte(donnees, "entreprise") ?? "",
              montantFcfa,
              pkDebut,
              pkFin,
              quantitePrevue,
            }),
          "Lot ajouté au chantier."
        )
        if (ok) onOpenChange(false)
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
        <Field label="Code du lot" htmlFor="lot-code">
          <Input id="lot-code" name="code" required maxLength={40} className="tabular uppercase" placeholder="L3" />
        </Field>
        <Field label="Libellé" htmlFor="lot-libelle">
          <Input id="lot-libelle" name="libelle" required maxLength={200} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Entreprise" htmlFor="lot-entreprise">
          <Input id="lot-entreprise" name="entreprise" required maxLength={200} defaultValue={chantier.entreprise} />
        </Field>
        <Field label="Montant (XAF)" htmlFor="lot-montant">
          <Input id="lot-montant" name="montantFcfa" required inputMode="decimal" className="tabular" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="PK de début" htmlFor="lot-pk-debut">
          <Input id="lot-pk-debut" name="pkDebut" required inputMode="decimal" className="tabular" defaultValue={chantier.pkDebut} />
        </Field>
        <Field label="PK de fin" htmlFor="lot-pk-fin">
          <Input id="lot-pk-fin" name="pkFin" required inputMode="decimal" className="tabular" defaultValue={chantier.pkFin} />
        </Field>
        <Field label={`Quantité prévue (${chantier.uniteQuantite})`} htmlFor="lot-quantite">
          <Input id="lot-quantite" name="quantitePrevue" required inputMode="decimal" className="tabular" />
        </Field>
      </div>
    </FenetreFormulaire>
  )
}

/* ========================================================== Situation */

export function FenetreSituation({ open, onOpenChange, operation, chantier, lots }: Fenetre & { chantier: Chantier; lots: readonly Lot[] }) {
  const saisir = useMutation(infraApi.mutations.saisirAvancement)
  const [mois] = useState(() => moisLibreville())
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre={`Saisir une situation · ${chantier.code}`}
      description="La situation reste « saisie » jusqu'à sa validation par un autre agent habilité. Seules les situations validées comptent dans l'avancement et le rapport aux bailleurs."
      libelleValider={
        <>
          <Ruler />
          Enregistrer la situation
        </>
      }
      enCours={operation.enCours === "situation"}
      erreur={erreurOperation(operation)}
      onSubmit={async (donnees) => {
        const quantite = nombreSaisi(donnees, "quantite") ?? 0
        const montantTravauxFcfa = montantSaisi(donnees, "montantTravauxFcfa") ?? 0
        const montantPayeFcfa = montantSaisi(donnees, "montantPayeFcfa") ?? 0
        if ([quantite, montantTravauxFcfa, montantPayeFcfa].some((n) => Number.isNaN(n) || n < 0)) return refuser(operation, "Quantité et montants sont des nombres positifs ou nuls.")
        const bailleur = texte(donnees, "bailleur")
        const ok = await operation.executer(
          "situation",
          () =>
            saisir({
              chantierId: chantier.id,
              lotId: texte(donnees, "lotId") as Lot["id"] | undefined,
              periode: String(donnees.get("periode") ?? ""),
              quantite,
              montantTravauxFcfa,
              montantPayeFcfa,
              bailleur: bailleur && estBailleur(bailleur) ? bailleur : undefined,
              commentaire: texte(donnees, "commentaire"),
            }),
          "Situation enregistrée, en attente de validation."
        )
        if (ok) onOpenChange(false)
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Période (mois)" hint="Format AAAA-MM ; pas de période future." htmlFor="situation-periode">
          <Input id="situation-periode" name="periode" type="month" required max={mois} defaultValue={mois} className="tabular" />
        </Field>
        <Field label="Lot (facultatif)" htmlFor="situation-lot">
          <SelectNative id="situation-lot" name="lotId" defaultValue="">
            <option value="">Chantier entier</option>
            {lots.map((lot) => (
              <option key={lot.id} value={lot.id}>
                {lot.code} · {lot.libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={`Quantité réalisée (${chantier.uniteQuantite})`} hint={`Prévu : ${nombre(chantier.quantitePrevue)} ; validé : ${nombre(chantier.quantiteRealisee)}.`} htmlFor="situation-quantite">
          <Input id="situation-quantite" name="quantite" inputMode="decimal" className="tabular" defaultValue="0" />
        </Field>
        <Field label="Montant des travaux (XAF)" hint="Travaux exécutés sur la période." htmlFor="situation-travaux">
          <Input id="situation-travaux" name="montantTravauxFcfa" inputMode="decimal" className="tabular" defaultValue="0" />
        </Field>
        <Field label="Montant payé (XAF)" hint={`Déjà payé : ${xaf(chantier.payeFcfa)}.`} htmlFor="situation-paye">
          <Input id="situation-paye" name="montantPayeFcfa" inputMode="decimal" className="tabular" defaultValue="0" />
        </Field>
      </div>
      <Field label="Bailleur payeur (facultatif)" htmlFor="situation-bailleur">
        <SelectNative id="situation-bailleur" name="bailleur" defaultValue="">
          <option value="">Non précisé</option>
          {chantier.financements.map((f) => (
            <option key={f.bailleur} value={f.bailleur}>
              {f.bailleurLibelle}
            </option>
          ))}
        </SelectNative>
      </Field>
      <Field label="Commentaire (facultatif)" htmlFor="situation-commentaire">
        <Textarea id="situation-commentaire" name="commentaire" maxLength={1000} placeholder="Attachement n° 7 signé par le maître d'œuvre." />
      </Field>
    </FenetreFormulaire>
  )
}

/** Valider ou rejeter une situation saisie : séparation des tâches côté serveur. */
export function FenetreDecisionSituation({
  open,
  onOpenChange,
  operation,
  chantier,
  situation,
  decision,
}: Fenetre & { chantier: Chantier; situation: Situation; decision: "valider" | "rejeter" }) {
  const valider = useMutation(infraApi.mutations.validerAvancement)
  const rejeter = useMutation(infraApi.mutations.rejeterAvancement)
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre={decision === "valider" ? `Valider la situation ${situation.periode}` : `Rejeter la situation ${situation.periode}`}
      description={
        decision === "valider"
          ? "La situation validée entre dans l'avancement physique et financier du chantier et dans le rapport aux bailleurs."
          : "La situation rejetée reste au registre avec son motif ; l'auteur peut en saisir une nouvelle."
      }
      variante={decision === "rejeter" ? "danger" : "primary"}
      libelleValider={
        decision === "valider" ? (
          <>
            <CheckCheck />
            Valider la situation
          </>
        ) : (
          <>
            <Undo2 />
            Rejeter la situation
          </>
        )
      }
      enCours={operation.enCours === "decision"}
      erreur={erreurOperation(operation)}
      onSubmit={async (donnees) => {
        const ok =
          decision === "valider"
            ? await operation.executer("decision", () => valider({ avancementId: situation.id }), `Situation ${situation.periode} validée.`)
            : await operation.executer("decision", () => rejeter({ avancementId: situation.id, motif: texte(donnees, "motif") ?? "" }), `Situation ${situation.periode} rejetée.`)
        if (ok) onOpenChange(false)
      }}
    >
      <Fiche
        elements={[
          ["Période", <span key="p" className="tabular">{situation.periode}</span>],
          ["Lot", situation.lotCode ?? "Chantier entier"],
          ["Quantité", <span key="q" className="tabular">{`${nombre(situation.quantite)} ${chantier.uniteQuantite}`}</span>],
          ["Montant des travaux", <span key="t" className="tabular">{xaf(situation.montantTravauxFcfa)}</span>],
          ["Montant payé", <span key="m" className="tabular">{xaf(situation.montantPayeFcfa)}</span>],
          ["Bailleur", situation.bailleurLibelle ?? "Non précisé"],
          ["Saisie par", situation.saisiParNom ?? "—"],
        ]}
      />
      {decision === "rejeter" ? (
        <Field label="Motif du rejet" htmlFor="situation-motif">
          <Textarea id="situation-motif" name="motif" required minLength={3} maxLength={500} placeholder="Quantité non conforme à l'attachement signé." />
        </Field>
      ) : null}
    </FenetreFormulaire>
  )
}

/* =============================================================== Jalons */

export function FenetreJalon({ open, onOpenChange, operation, chantier }: Fenetre & { chantier: Chantier }) {
  const ajouter = useMutation(infraApi.mutations.ajouterJalon)
  const [condition, setCondition] = useState(false)
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre={`Ajouter un jalon · ${chantier.code}`}
      description="Un jalon de décaissement conditionne le versement d'un bailleur : il désigne ce bailleur, et sa preuve est exigée quand il est atteint."
      libelleValider={
        <>
          <FlagTriangleRight />
          Ajouter le jalon
        </>
      }
      enCours={operation.enCours === "jalon"}
      erreur={erreurOperation(operation)}
      onSubmit={async (donnees) => {
        const prevuLe = horodatageEcheance(String(donnees.get("prevuLe") ?? ""))
        if (Number.isNaN(prevuLe)) return refuser(operation, "La date prévue est obligatoire.")
        const bailleur = texte(donnees, "bailleur")
        if (condition && !bailleur) return refuser(operation, "Un jalon de décaissement doit désigner le bailleur concerné.")
        const ok = await operation.executer(
          "jalon",
          () =>
            ajouter({
              chantierId: chantier.id,
              libelle: texte(donnees, "libelle") ?? "",
              prevuLe,
              conditionDecaissement: condition,
              bailleur: bailleur && estBailleur(bailleur) ? bailleur : undefined,
            }),
          "Jalon ajouté au chantier."
        )
        if (ok) onOpenChange(false)
      }}
    >
      <Field label="Libellé" htmlFor="jalon-libelle">
        <Input id="jalon-libelle" name="libelle" required maxLength={200} placeholder="Réception provisoire du lot 2" />
      </Field>
      <Field label="Prévu le" htmlFor="jalon-date">
        <Input id="jalon-date" name="prevuLe" type="date" required className="tabular" />
      </Field>
      <Checkbox label="Conditionne un décaissement de bailleur" checked={condition} onCheckedChange={(v) => setCondition(v === true)} />
      <Field label={condition ? "Bailleur concerné" : "Bailleur concerné (facultatif)"} htmlFor="jalon-bailleur">
        <SelectNative id="jalon-bailleur" name="bailleur" defaultValue="" required={condition}>
          <option value="">{condition ? "Choisir le bailleur" : "Aucun"}</option>
          {chantier.financements.map((f) => (
            <option key={f.bailleur} value={f.bailleur}>
              {f.bailleurLibelle ?? BAILLEURS[f.bailleur as Bailleur]}
            </option>
          ))}
        </SelectNative>
      </Field>
    </FenetreFormulaire>
  )
}

export function FenetreJalonAtteint({ open, onOpenChange, operation, jalon }: Fenetre & { jalon: Jalon }) {
  const atteindre = useMutation(infraApi.mutations.atteindreJalon)
  const [aujourdhui] = useState(() => jourLibreville())
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre="Marquer le jalon atteint"
      description={`${jalon.libelle}${jalon.conditionDecaissement ? ` — conditionne un décaissement${jalon.bailleurLibelle ? ` de ${jalon.bailleurLibelle}` : ""}` : ""}. La preuve est communiquée aux bailleurs.`}
      libelleValider={
        <>
          <PencilLine />
          Marquer atteint
        </>
      }
      enCours={operation.enCours === "atteint"}
      erreur={erreurOperation(operation)}
      onSubmit={async (donnees) => {
        const atteintLe = horodatageDuJour(String(donnees.get("atteintLe") ?? ""))
        if (Number.isNaN(atteintLe)) return refuser(operation, "La date d'atteinte est obligatoire.")
        const ok = await operation.executer("atteint", () => atteindre({ jalonId: jalon.id, atteintLe, preuve: texte(donnees, "preuve") ?? "" }), `Jalon « ${jalon.libelle} » atteint.`)
        if (ok) onOpenChange(false)
      }}
    >
      <Field label="Atteint le" htmlFor="jalon-atteint">
        <Input id="jalon-atteint" name="atteintLe" type="date" required max={aujourdhui} defaultValue={aujourdhui} className="tabular" />
      </Field>
      <Field label="Preuve" hint="Procès-verbal, référence d'attachement, rapport du maître d'œuvre…" htmlFor="jalon-preuve">
        <Textarea id="jalon-preuve" name="preuve" required minLength={3} maxLength={1000} />
      </Field>
    </FenetreFormulaire>
  )
}
