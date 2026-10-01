"use client"

import { Activity, RadioTower, Wrench } from "lucide-react"
import { useState } from "react"

import { useMutation } from "@workspace/api/hooks"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"

import { FenetreFormulaire, nombreSaisi, texte } from "@/components/gestion/referentiels/formulaire"

import { infraApi, type LigneEquipementInfra } from "../commun"
import { erreurOperation, horodatageDuJour, jourLibreville, refuser, type Operation } from "../interventions/partage"
import { CATEGORIES_EQUIPEMENT, ETATS_EQUIPEMENT, TYPES_SUGGERES, type CategorieEquipement, type EtatEquipement } from "./libelles"

/* ============================================================ Création */

/**
 * Inscription d'un équipement à l'inventaire. Les catégories proposées sont
 * celles que la fonction de l'agent permet de gérer.
 */
export function FenetreEquipement({
  open,
  onOpenChange,
  operation,
  categories,
  categorieInitiale,
  onCree,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  operation: Operation
  categories: readonly CategorieEquipement[]
  categorieInitiale?: CategorieEquipement
  onCree?: (equipementId: string) => void
}) {
  const creer = useMutation(infraApi.mutations.creerEquipement)
  const [categorie, setCategorie] = useState<CategorieEquipement>(categorieInitiale && categories.includes(categorieInitiale) ? categorieInitiale : (categories[0] ?? "signalisation"))
  const lineaire = categorie === "telecoms"

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre="Ajouter un équipement"
      description="L'équipement entre à l'inventaire en service. Sa périodicité fixe l'échéance des maintenances préventives."
      libelleValider={
        <>
          <RadioTower />
          Inscrire l&apos;équipement
        </>
      }
      enCours={operation.enCours === "equipement"}
      erreur={erreurOperation(operation)}
      onSubmit={async (donnees) => {
        const pk = nombreSaisi(donnees, "pk")
        const pkFin = nombreSaisi(donnees, "pkFin")
        const periodiciteJours = nombreSaisi(donnees, "periodiciteJours")
        if (pk === undefined || Number.isNaN(pk)) return refuser(operation, "Le PK doit être un nombre (par exemple 182,4).")
        if (Number.isNaN(pkFin)) return refuser(operation, "Le PK de fin doit être un nombre.")
        if (pkFin !== undefined && pkFin <= pk) return refuser(operation, "Le PK de fin doit dépasser le PK de début.")
        if (periodiciteJours === undefined || Number.isNaN(periodiciteJours) || !Number.isInteger(periodiciteJours)) return refuser(operation, "La périodicité est un nombre entier de jours.")
        const resultat = await operation.executer(
          "equipement",
          () =>
            creer({
              code: texte(donnees, "code") ?? "",
              libelle: texte(donnees, "libelle") ?? "",
              categorie,
              type: texte(donnees, "type") ?? "",
              pk,
              pkFin,
              alimentation: texte(donnees, "alimentation"),
              periodiciteJours,
              notes: texte(donnees, "notes"),
            }),
          "Équipement inscrit à l'inventaire."
        )
        if (resultat) {
          onOpenChange(false)
          onCree?.(resultat.equipementId)
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Catégorie" htmlFor="equipement-categorie">
          <SelectNative id="equipement-categorie" name="categorie" value={categorie} onChange={(e) => setCategorie(e.target.value as CategorieEquipement)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {CATEGORIES_EQUIPEMENT[c]}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Code" hint="Unique, par exemple SIG-NDJ-E1." htmlFor="equipement-code">
          <Input id="equipement-code" name="code" required maxLength={40} className="tabular uppercase" />
        </Field>
      </div>
      <Field label="Libellé" htmlFor="equipement-libelle">
        <Input id="equipement-libelle" name="libelle" required maxLength={200} placeholder="Signal d'entrée de Ndjolé côté Owendo" />
      </Field>
      <Field label="Type" hint="Choisissez une suggestion ou saisissez le type exact." htmlFor="equipement-type">
        <Input id="equipement-type" name="type" required maxLength={120} list="equipement-types" />
      </Field>
      <datalist id="equipement-types">
        {TYPES_SUGGERES[categorie].map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={lineaire ? "PK de début" : "PK"} hint="De 0 (Owendo) à 669 (Franceville)." htmlFor="equipement-pk">
          <Input id="equipement-pk" name="pk" required inputMode="decimal" className="tabular" />
        </Field>
        <Field label={lineaire ? "PK de fin (câble, fibre)" : "PK de fin (facultatif)"} hint="Pour un équipement linéaire seulement." htmlFor="equipement-pk-fin">
          <Input id="equipement-pk-fin" name="pkFin" inputMode="decimal" className="tabular" />
        </Field>
        <Field label="Périodicité (jours)" hint="Entre 1 et 1 830 jours." htmlFor="equipement-periodicite">
          <Input id="equipement-periodicite" name="periodiciteJours" required inputMode="numeric" defaultValue={categorie === "passage_niveau" ? 30 : 90} className="tabular" />
        </Field>
      </div>
      <Field label="Alimentation (facultatif)" htmlFor="equipement-alimentation">
        <Input id="equipement-alimentation" name="alimentation" maxLength={120} placeholder="Secteur SEEG, panneau solaire, batterie…" />
      </Field>
      <Field label="Notes (facultatif)" htmlFor="equipement-notes">
        <Textarea id="equipement-notes" name="notes" maxLength={2000} />
      </Field>
    </FenetreFormulaire>
  )
}

/* =============================================================== État */

export function FenetreEtatEquipement({
  open,
  onOpenChange,
  operation,
  equipement,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  operation: Operation
  equipement: LigneEquipementInfra
}) {
  const changer = useMutation(infraApi.mutations.majEtatEquipement)
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre={`Changer l'état de ${equipement.code}`}
      description={`État actuel : ${equipement.etatLibelle}. Le changement est inscrit à la chronologie de l'équipement.`}
      libelleValider={
        <>
          <Activity />
          Enregistrer l&apos;état
        </>
      }
      enCours={operation.enCours === "etat"}
      erreur={erreurOperation(operation)}
      onSubmit={async (donnees) => {
        const etat = String(donnees.get("etat")) as EtatEquipement
        const ok = await operation.executer("etat", () => changer({ equipementId: equipement.id, etat, notes: texte(donnees, "notes") }), `État de ${equipement.code} : ${ETATS_EQUIPEMENT[etat].toLowerCase()}.`)
        if (ok) onOpenChange(false)
      }}
    >
      <Field label="Nouvel état" htmlFor="equipement-etat">
        <SelectNative id="equipement-etat" name="etat" defaultValue={equipement.etat}>
          {Object.entries(ETATS_EQUIPEMENT).map(([valeur, libelle]) => (
            <option key={valeur} value={valeur}>
              {libelle}
            </option>
          ))}
        </SelectNative>
      </Field>
      <Field label="Notes" hint="Constat, cause, mesure conservatoire. Obligatoire si l'état ne change pas." htmlFor="equipement-etat-notes">
        <Textarea id="equipement-etat-notes" name="notes" maxLength={2000} defaultValue="" placeholder="Lampe rouge grillée, signal fermé par défaut." />
      </Field>
    </FenetreFormulaire>
  )
}

/* ========================================================= Maintenance */

export function FenetreMaintenance({
  open,
  onOpenChange,
  operation,
  equipement,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  operation: Operation
  equipement: LigneEquipementInfra
}) {
  const enregistrer = useMutation(infraApi.mutations.enregistrerMaintenanceEquipement)
  const [aujourdhui] = useState(() => jourLibreville())
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre={`Enregistrer une maintenance · ${equipement.code}`}
      description="La date de maintenance relance la périodicité. L'état constaté à la fin de l'intervention remplace l'état courant."
      libelleValider={
        <>
          <Wrench />
          Enregistrer la maintenance
        </>
      }
      enCours={operation.enCours === "maintenance"}
      erreur={erreurOperation(operation)}
      onSubmit={async (donnees) => {
        const realiseeLe = horodatageDuJour(String(donnees.get("realiseeLe") ?? ""))
        if (Number.isNaN(realiseeLe)) return refuser(operation, "La date de maintenance est obligatoire.")
        const etat = String(donnees.get("etat")) as EtatEquipement
        const ok = await operation.executer(
          "maintenance",
          () => enregistrer({ equipementId: equipement.id, realiseeLe, compteRendu: texte(donnees, "compteRendu") ?? "", etat }),
          `Maintenance de ${equipement.code} enregistrée.`
        )
        if (ok) onOpenChange(false)
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Réalisée le" htmlFor="maintenance-date">
          <Input id="maintenance-date" name="realiseeLe" type="date" required max={aujourdhui} defaultValue={aujourdhui} className="tabular" />
        </Field>
        <Field label="État en fin d'intervention" htmlFor="maintenance-etat">
          <SelectNative id="maintenance-etat" name="etat" defaultValue="en_service">
            {Object.entries(ETATS_EQUIPEMENT).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
      </div>
      <Field label="Compte rendu" htmlFor="maintenance-compte-rendu">
        <Textarea id="maintenance-compte-rendu" name="compteRendu" required maxLength={3000} placeholder="Nettoyage des optiques, contrôle des tensions, essai de fermeture concluant." />
      </Field>
    </FenetreFormulaire>
  )
}
