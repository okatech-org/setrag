"use client"

import { useId, useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Checkbox } from "@workspace/ui/components/choice"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { messageErreur } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire, nombreSaisi, texte } from "@/components/gestion/referentiels/formulaire"

import { FAMILLES, gmaoApi, km, STATUTS_ENGIN, type DossierEngin, type FamilleEngin } from "../commun"

/** Nombre facultatif d'un formulaire : `undefined` si vide, erreur lisible si illisible. */
export function lireNombre(donnees: FormData, cle: string, libelle: string) {
  const valeur = nombreSaisi(donnees, cle)
  if (valeur !== undefined && Number.isNaN(valeur)) throw new Error(`${libelle} n'est pas un nombre.`)
  return valeur
}

/** Champ `datetime-local` (heure de Libreville) → horodatage. */
export function horodatageLocal(valeur: string) {
  return Date.parse(`${valeur}:00+01:00`)
}

/** Horodatage → valeur d'un champ `datetime-local` à l'heure de Libreville. */
export function valeurLocale(horodatage: number) {
  const parties = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Africa/Libreville",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(horodatage)
  const partie = (type: string) => parties.find((element) => element.type === type)?.value ?? "00"
  return `${partie("year")}-${partie("month")}-${partie("day")}T${partie("hour")}:${partie("minute")}`
}

/* ============================================================ Création */

/** Entrée d'un engin au parc : les plans préventifs de sa série s'appliquent aussitôt. */
export function DialogueCreationEngin({
  open,
  onOpenChange,
  onCree,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCree: (resultat: { equipementId: string; numero: string; plansRattaches: number }) => void
}) {
  const formulaires = useQuery(gmaoApi.queries.formulaires, open ? {} : "skip")
  const creer = useMutation(gmaoApi.mutations.creerEquipement)
  const [famille, setFamille] = useState<FamilleEngin>("locomotive")
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const idSeries = useId()

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={(ouvert) => {
        onOpenChange(ouvert)
        if (!ouvert) setErreur(null)
      }}
      titre="Ajouter un engin au parc"
      description="Le numéro est unique dans le parc. Les plans préventifs actifs de la famille et de la série sont rattachés dès l'enregistrement."
      libelleValider="Enregistrer l'engin"
      enCours={enCours}
      erreur={erreur}
      large
      onSubmit={async (donnees, formulaire) => {
        setErreur(null)
        try {
          const atelierId = texte(donnees, "atelierId")
          if (!atelierId) throw new Error("Choisissez l'atelier d'attache.")
          const annee = lireNombre(donnees, "anneeMiseEnService", "L'année de mise en service")
          if (annee === undefined) throw new Error("Indiquez l'année de mise en service.")
          const compteurKm = lireNombre(donnees, "compteurKm", "Le compteur kilométrique")
          if (compteurKm === undefined) throw new Error("Indiquez le compteur kilométrique actuel.")
          setEnCours(true)
          const resultat = await creer({
            numero: texte(donnees, "numero") ?? "",
            famille,
            serie: texte(donnees, "serie") ?? "",
            constructeur: texte(donnees, "constructeur") ?? "",
            anneeMiseEnService: annee,
            numeroSerie: texte(donnees, "numeroSerie"),
            atelierId: atelierId as never,
            proprietaire: texte(donnees, "proprietaire") ?? "",
            compteurKm,
            compteurHeures: lireNombre(donnees, "compteurHeures", "Le compteur horaire"),
            tareTonnes: lireNombre(donnees, "tareTonnes", "La tare"),
            chargeUtileTonnes: lireNombre(donnees, "chargeUtileTonnes", "La charge utile"),
            trainId: (texte(donnees, "trainId") as never) ?? undefined,
            coachId: famille === "voiture" ? ((texte(donnees, "coachId") as never) ?? undefined) : undefined,
            notes: texte(donnees, "notes"),
          })
          formulaire.reset()
          onOpenChange(false)
          onCree({ equipementId: resultat.equipementId, numero: resultat.numero, plansRattaches: resultat.plansRattaches })
        } catch (cause) {
          setErreur(messageErreur(cause))
        } finally {
          setEnCours(false)
        }
      }}
    >
      {formulaires === undefined ? (
        <p role="status" className="text-small text-ink-muted">
          Chargement des ateliers et des trains…
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Numéro de l'engin" hint="Ex. CC 2201, VY 112, WT 4508">
              <Input name="numero" required maxLength={40} autoComplete="off" />
            </Field>
            <Field label="Famille">
              <SelectNative name="famille" value={famille} onChange={(event) => setFamille(event.target.value as FamilleEngin)}>
                {Object.entries(FAMILLES).map(([cle, libelle]) => (
                  <option key={cle} value={cle}>
                    {libelle}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field label="Série" hint="Une série existante rattache ses plans préventifs">
              <Input name="serie" required maxLength={80} list={idSeries} autoComplete="off" />
            </Field>
            <datalist id={idSeries}>
              {formulaires.series
                .filter((serie) => serie.famille === famille)
                .map((serie) => (
                  <option key={serie.serie} value={serie.serie} />
                ))}
            </datalist>
            <Field label="Constructeur">
              <Input name="constructeur" required maxLength={80} />
            </Field>
            <Field label="Année de mise en service">
              <Input name="anneeMiseEnService" required inputMode="numeric" maxLength={4} placeholder="AAAA" />
            </Field>
            <Field label="N° de série constructeur (facultatif)">
              <Input name="numeroSerie" maxLength={80} />
            </Field>
            <Field label="Atelier d'attache">
              <SelectNative name="atelierId" required defaultValue="">
                <option value="">Choisir un atelier…</option>
                {formulaires.ateliers.map((atelier) => (
                  <option key={atelier.id} value={atelier.id}>
                    {atelier.code} — {atelier.nom}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field label="Propriétaire" hint="SETRAG, ou le chargeur pour un wagon privé">
              <Input name="proprietaire" required maxLength={80} defaultValue="SETRAG" />
            </Field>
            <Field label="Compteur kilométrique (km)">
              <Input name="compteurKm" required inputMode="numeric" className="tabular" />
            </Field>
            <Field label="Compteur horaire (h, facultatif)">
              <Input name="compteurHeures" inputMode="decimal" className="tabular" />
            </Field>
            <Field label="Tare (t, facultatif)">
              <Input name="tareTonnes" inputMode="decimal" className="tabular" />
            </Field>
            <Field label="Charge utile (t, facultatif)">
              <Input name="chargeUtileTonnes" inputMode="decimal" className="tabular" />
            </Field>
          </div>
          {famille === "voiture" ? (
            <Field
              label="Voiture du référentiel commercial (facultatif)"
              hint={formulaires.voituresReferentiel.length === 0 ? "Toutes les voitures des compositions sont déjà suivies au parc." : "Relie la fiche à la voiture vendue en billetterie (plan de places)."}
            >
              <SelectNative name="coachId" defaultValue="" disabled={formulaires.voituresReferentiel.length === 0}>
                <option value="">Voiture hors composition</option>
                {formulaires.voituresReferentiel.map((voiture) => (
                  <option key={voiture.id} value={voiture.id}>
                    {voiture.train ?? "Train"} · {voiture.repere} · {voiture.classe === "VIP" ? "VIP" : voiture.classe === "PREMIERE" ? "1re classe" : "2e classe"}
                  </option>
                ))}
              </SelectNative>
            </Field>
          ) : null}
          <Field label="Train d'affectation (facultatif)">
            <SelectNative name="trainId" defaultValue="">
              <option value="">Aucun train</option>
              {formulaires.trains.map((train) => (
                <option key={train.id} value={train.id}>
                  {train.numero} — {train.nom}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Notes (facultatif)">
            <Textarea name="notes" maxLength={2000} />
          </Field>
        </>
      )}
    </FenetreFormulaire>
  )
}

/* ========================================================= Modification */

export function DialogueModificationEngin({
  open,
  onOpenChange,
  dossier,
  onModifie,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  dossier: DossierEngin
  onModifie: () => void
}) {
  const formulaires = useQuery(gmaoApi.queries.formulaires, open ? {} : "skip")
  const modifier = useMutation(gmaoApi.mutations.modifierEquipement)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const engin = dossier.engin
  const idSeries = useId()

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={(ouvert) => {
        onOpenChange(ouvert)
        if (!ouvert) setErreur(null)
      }}
      titre={`Modifier la fiche de ${engin.numero}`}
      description="Le numéro et la famille ne changent pas : un engin renuméroté entre au parc sous une nouvelle fiche."
      libelleValider="Enregistrer les modifications"
      enCours={enCours}
      erreur={erreur}
      large
      onSubmit={async (donnees) => {
        setErreur(null)
        try {
          const trainId = String(donnees.get("trainId") ?? "")
          setEnCours(true)
          await modifier({
            equipementId: engin.id,
            serie: texte(donnees, "serie") ?? "",
            constructeur: texte(donnees, "constructeur") ?? "",
            numeroSerie: String(donnees.get("numeroSerie") ?? ""),
            atelierId: (texte(donnees, "atelierId") as never) ?? undefined,
            proprietaire: texte(donnees, "proprietaire") ?? "",
            trainId: trainId === "" ? null : (trainId as never),
            tareTonnes: lireNombre(donnees, "tareTonnes", "La tare"),
            chargeUtileTonnes: lireNombre(donnees, "chargeUtileTonnes", "La charge utile"),
            notes: String(donnees.get("notes") ?? ""),
          })
          onOpenChange(false)
          onModifie()
        } catch (cause) {
          setErreur(messageErreur(cause))
        } finally {
          setEnCours(false)
        }
      }}
    >
      {formulaires === undefined ? (
        <p role="status" className="text-small text-ink-muted">
          Chargement des ateliers et des trains…
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Série">
              <Input name="serie" required maxLength={80} defaultValue={engin.serie} list={idSeries} autoComplete="off" />
            </Field>
            <datalist id={idSeries}>
              {formulaires.series
                .filter((serie) => serie.famille === engin.famille)
                .map((serie) => (
                  <option key={serie.serie} value={serie.serie} />
                ))}
            </datalist>
            <Field label="Constructeur">
              <Input name="constructeur" required maxLength={80} defaultValue={engin.constructeur} />
            </Field>
            <Field label="N° de série constructeur (facultatif)">
              <Input name="numeroSerie" maxLength={80} defaultValue={engin.numeroSerie ?? ""} />
            </Field>
            <Field label="Propriétaire">
              <Input name="proprietaire" required maxLength={80} defaultValue={engin.proprietaire} />
            </Field>
            <Field label="Atelier d'attache">
              <SelectNative name="atelierId" defaultValue={engin.atelierId}>
                {formulaires.ateliers.map((atelier) => (
                  <option key={atelier.id} value={atelier.id}>
                    {atelier.code} — {atelier.nom}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field label="Train d'affectation" hint="« Aucun train » retire l'engin de son affectation">
              <SelectNative name="trainId" defaultValue={engin.trainId ?? ""}>
                <option value="">Aucun train</option>
                {formulaires.trains.map((train) => (
                  <option key={train.id} value={train.id}>
                    {train.numero} — {train.nom}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field label="Tare (t)">
              <Input name="tareTonnes" inputMode="decimal" className="tabular" defaultValue={engin.tareTonnes?.toString().replace(".", ",") ?? ""} />
            </Field>
            <Field label="Charge utile (t)">
              <Input
                name="chargeUtileTonnes"
                inputMode="decimal"
                className="tabular"
                defaultValue={engin.chargeUtileTonnes?.toString().replace(".", ",") ?? ""}
              />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea name="notes" maxLength={2000} defaultValue={engin.notes ?? ""} />
          </Field>
        </>
      )}
    </FenetreFormulaire>
  )
}

/* ============================================================== Relevé */

export function DialogueReleve({
  open,
  onOpenChange,
  dossier,
  onReleve,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  dossier: DossierEngin
  onReleve: (resultat: { km: number; heures: number }) => void
}) {
  const relever = useMutation(gmaoApi.mutations.releverCompteurs)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [maintenant] = useState(() => Date.now())
  const engin = dossier.engin

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={(ouvert) => {
        onOpenChange(ouvert)
        if (!ouvert) setErreur(null)
      }}
      titre={`Relever les compteurs de ${engin.numero}`}
      description={`Dernier relevé : ${km(engin.compteurKm)} et ${engin.compteurHeures.toLocaleString("fr-FR")} h. Un compteur ne recule jamais.`}
      libelleValider="Enregistrer le relevé"
      enCours={enCours}
      erreur={erreur}
      onSubmit={async (donnees) => {
        setErreur(null)
        try {
          const kmReleve = lireNombre(donnees, "km", "Le compteur kilométrique")
          if (kmReleve === undefined) throw new Error("Indiquez le compteur kilométrique.")
          const le = String(donnees.get("releveLe") ?? "")
          const releveLe = le ? horodatageLocal(le) : undefined
          if (releveLe !== undefined && Number.isNaN(releveLe)) throw new Error("La date du relevé est illisible.")
          setEnCours(true)
          const resultat = await relever({
            equipementId: engin.id,
            km: kmReleve,
            heures: lireNombre(donnees, "heures", "Le compteur horaire"),
            releveLe,
          })
          onOpenChange(false)
          onReleve({ km: resultat.km, heures: resultat.heures })
        } catch (cause) {
          setErreur(messageErreur(cause))
        } finally {
          setEnCours(false)
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Compteur kilométrique (km)" hint={`Au moins ${km(engin.compteurKm)}`}>
          <Input name="km" required inputMode="numeric" className="tabular" defaultValue={String(engin.compteurKm)} />
        </Field>
        <Field label="Compteur horaire (h, facultatif)" hint="Vide : inchangé">
          <Input name="heures" inputMode="decimal" className="tabular" />
        </Field>
      </div>
      <Field label="Date et heure du relevé" hint="Heure de Libreville · jamais dans le futur">
        <Input name="releveLe" type="datetime-local" className="tabular" defaultValue={valeurLocale(maintenant)} required />
      </Field>
    </FenetreFormulaire>
  )
}

/* ============================================================== Statut */

type ActionStatut = "immobilise" | "en_service" | "reforme"

const ACTIONS_STATUT: Record<ActionStatut, { libelle: string; aide: string }> = {
  immobilise: {
    libelle: "Immobiliser l'engin",
    aide: "L'engin sort du parc disponible jusqu'à la levée de la décision. Un convoi qui le compte est bloqué au départ.",
  },
  en_service: {
    libelle: "Remettre en service",
    aide: "Refusé tant qu'un OT immobilisant reste ouvert : clôturez-le d'abord.",
  },
  reforme: {
    libelle: "Réformer l'engin",
    aide: "Définitif : l'engin quitte le parc, ses plans préventifs sont détachés et il ne reçoit plus d'OT. Refusé si un OT est ouvert.",
  },
}

/** Actions de statut admises pour l'engin dans son état actuel. */
export function actionsStatutPossibles(engin: Pick<DossierEngin["engin"], "statut" | "immobilisationManuelle">): ActionStatut[] {
  if (engin.statut === "reforme") return []
  const actions: ActionStatut[] = []
  if (!engin.immobilisationManuelle) actions.push("immobilise")
  if (engin.statut !== "en_service") actions.push("en_service")
  actions.push("reforme")
  return actions
}

export function DialogueStatut({
  open,
  onOpenChange,
  dossier,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  dossier: DossierEngin
  onChange: (statut: string) => void
}) {
  const changer = useMutation(gmaoApi.mutations.changerStatutEquipement)
  const engin = dossier.engin
  const possibles = actionsStatutPossibles(engin)
  const [choix, setAction] = useState<ActionStatut>(possibles[0] ?? "immobilise")
  // Le statut a pu changer depuis l'ouverture : on retombe sur une décision admise.
  const action = possibles.includes(choix) ? choix : (possibles[0] ?? choix)
  const [confirme, setConfirme] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const reforme = action === "reforme"

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={(ouvert) => {
        onOpenChange(ouvert)
        if (!ouvert) {
          setErreur(null)
          setConfirme(false)
        }
      }}
      titre={`Changer le statut de ${engin.numero}`}
      description={`Statut actuel : ${STATUTS_ENGIN[engin.statut].libelle}${engin.motifStatut ? ` — ${engin.motifStatut}` : ""}.`}
      libelleValider={ACTIONS_STATUT[action].libelle}
      variante={reforme ? "danger" : "primary"}
      enCours={enCours}
      erreur={erreur}
      onSubmit={async (donnees) => {
        setErreur(null)
        const motif = texte(donnees, "motif")
        if (!motif) {
          setErreur("Le motif est obligatoire : il est inscrit au journal de l'engin.")
          return
        }
        if (reforme && !confirme) {
          setErreur("Cochez la confirmation : la réforme est irréversible.")
          return
        }
        setEnCours(true)
        try {
          const resultat = await changer({ equipementId: engin.id, statut: action, motif })
          onOpenChange(false)
          setConfirme(false)
          onChange(resultat.statut)
        } catch (cause) {
          setErreur(messageErreur(cause))
        } finally {
          setEnCours(false)
        }
      }}
    >
      <Field label="Décision">
        <SelectNative
          name="action"
          value={action}
          onChange={(event) => {
            setAction(event.target.value as ActionStatut)
            setConfirme(false)
          }}
        >
          {possibles.map((cle) => (
            <option key={cle} value={cle}>
              {ACTIONS_STATUT[cle].libelle}
            </option>
          ))}
        </SelectNative>
      </Field>
      <p className="text-small text-ink-muted">{ACTIONS_STATUT[action].aide}</p>
      {engin.immobilisationManuelle ? (
        <InlineMessage tone="info" title="Immobilisation décidée en cours">
          {engin.immobilisationManuelle}
        </InlineMessage>
      ) : null}
      <Field label="Motif" hint="Inscrit au journal de l'engin et à l'audit">
        <Textarea name="motif" required maxLength={500} />
      </Field>
      {reforme ? (
        <>
          <InlineMessage tone="danger" title="Réforme irréversible">
            Un engin réformé ne revient jamais au parc. Pour le réintégrer, il faudra créer une nouvelle fiche.
          </InlineMessage>
          <Checkbox
            label={`Je confirme la réforme définitive de ${engin.numero}`}
            checked={confirme}
            onCheckedChange={(valeur) => setConfirme(valeur === true)}
          />
        </>
      ) : null}
    </FenetreFormulaire>
  )
}
