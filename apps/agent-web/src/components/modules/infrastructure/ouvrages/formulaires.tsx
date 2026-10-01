"use client"

import { BrickWall, ClipboardCheck, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { useMutation } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"

import { champDate } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire, nombreSaisi, texte } from "@/components/gestion/referentiels/formulaire"

import { infraApi, type DossierInspection, type LigneOuvrage } from "../commun"
import { erreurOperation as erreurDe, horodatageDuJour, jourLibreville, refuser, type Operation } from "../interventions/partage"
import { COTATIONS, GRAVITES_DESORDRE, ORDRE_COTATIONS, TYPES_INSPECTION, TYPES_OUVRAGE, type Cotation, type GraviteDesordre, type TypeInspection, type TypeOuvrage } from "./libelles"

/* ============================================================== Ouvrage */

/**
 * Inscription d'un ouvrage à l'inventaire, ou mise à jour de sa fiche. Le
 * code, le type et le PK ne changent pas après inscription : ils identifient
 * l'ouvrage dans les inspections et les anomalies.
 */
export function FenetreOuvrage({
  open,
  onOpenChange,
  operation,
  ouvrage,
  onCree,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  operation: Operation
  ouvrage?: LigneOuvrage
  onCree?: (ouvrageId: string) => void
}) {
  const creer = useMutation(infraApi.mutations.creerOuvrage)
  const modifier = useMutation(infraApi.mutations.modifierOuvrage)
  const [anneeCourante] = useState(() => new Date().getFullYear())

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre={ouvrage ? `Modifier ${ouvrage.code}` : "Ajouter un ouvrage d'art"}
      description={
        ouvrage
          ? "Seuls les champs modifiés sont enregistrés ; l'ancienne valeur reste au journal d'audit."
          : "L'ouvrage entre à l'inventaire avec sa cotation initiale. Une première inspection est attendue sous trois mois."
      }
      libelleValider={
        <>
          <BrickWall />
          {ouvrage ? "Enregistrer la fiche" : "Inscrire l'ouvrage"}
        </>
      }
      enCours={operation.enCours === "ouvrage"}
      erreur={erreurDe(operation)}
      onSubmit={async (donnees) => {
        const longueurM = nombreSaisi(donnees, "longueurM")
        const anneeConstruction = nombreSaisi(donnees, "anneeConstruction")
        if (ouvrage) {
          const patch: { nom?: string; longueurM?: number; materiau?: string; anneeConstruction?: number; franchissement?: string } = {}
          const nom = texte(donnees, "nom") ?? ""
          const materiau = texte(donnees, "materiau") ?? ""
          const franchissement = texte(donnees, "franchissement") ?? ""
          if (nom !== ouvrage.nom) patch.nom = nom
          if (materiau !== ouvrage.materiau) patch.materiau = materiau
          if (franchissement !== (ouvrage.franchissement ?? "")) patch.franchissement = franchissement
          if (longueurM !== undefined && longueurM !== ouvrage.longueurM) patch.longueurM = longueurM
          if (anneeConstruction !== undefined && anneeConstruction !== ouvrage.anneeConstruction) patch.anneeConstruction = anneeConstruction
          if (Number.isNaN(longueurM) || Number.isNaN(anneeConstruction)) return refuser(operation, "La longueur et l'année doivent être des nombres.")
          if (Object.keys(patch).length === 0) return refuser(operation, "Aucune modification à enregistrer.")
          const ok = await operation.executer("ouvrage", () => modifier({ ouvrageId: ouvrage.id, ...patch }), `Fiche de ${ouvrage.code} mise à jour.`)
          if (ok) onOpenChange(false)
          return
        }
        const pk = nombreSaisi(donnees, "pk")
        if (pk === undefined || Number.isNaN(pk)) return refuser(operation, "Le PK doit être un nombre (par exemple 182,4).")
        if (longueurM === undefined || Number.isNaN(longueurM)) return refuser(operation, "La longueur doit être un nombre de mètres.")
        if (anneeConstruction === undefined || Number.isNaN(anneeConstruction)) return refuser(operation, "L'année de construction est obligatoire.")
        const resultat = await operation.executer(
          "ouvrage",
          () =>
            creer({
              code: texte(donnees, "code") ?? "",
              nom: texte(donnees, "nom") ?? "",
              type: String(donnees.get("type")) as TypeOuvrage,
              pk,
              longueurM,
              materiau: texte(donnees, "materiau") ?? "",
              anneeConstruction,
              franchissement: texte(donnees, "franchissement"),
              cotation: (texte(donnees, "cotation") as Cotation | undefined) ?? undefined,
            }),
          "Ouvrage inscrit à l'inventaire."
        )
        if (resultat) {
          onOpenChange(false)
          onCree?.(resultat.ouvrageId)
        }
      }}
    >
      {ouvrage ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" hint="Unique, par exemple OA-182." htmlFor="ouvrage-code">
            <Input id="ouvrage-code" name="code" required maxLength={40} className="tabular uppercase" />
          </Field>
          <Field label="Type" htmlFor="ouvrage-type">
            <SelectNative id="ouvrage-type" name="type" defaultValue="pont">
              {Object.entries(TYPES_OUVRAGE).map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {libelle}
                </option>
              ))}
            </SelectNative>
          </Field>
        </div>
      )}
      <Field label="Nom" htmlFor="ouvrage-nom">
        <Input id="ouvrage-nom" name="nom" required maxLength={200} defaultValue={ouvrage?.nom} placeholder="Pont sur l'Ogooué à Ndjolé" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        {ouvrage ? null : (
          <Field label="PK" hint="De 0 (Owendo) à 669 (Franceville)." htmlFor="ouvrage-pk">
            <Input id="ouvrage-pk" name="pk" required inputMode="decimal" className="tabular" />
          </Field>
        )}
        <Field label="Longueur (m)" htmlFor="ouvrage-longueur">
          <Input id="ouvrage-longueur" name="longueurM" required inputMode="decimal" className="tabular" defaultValue={ouvrage?.longueurM} />
        </Field>
        <Field label="Année de construction" htmlFor="ouvrage-annee">
          <Input id="ouvrage-annee" name="anneeConstruction" required inputMode="numeric" min={1880} max={anneeCourante} className="tabular" defaultValue={ouvrage?.anneeConstruction} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Matériau" htmlFor="ouvrage-materiau">
          <Input id="ouvrage-materiau" name="materiau" required maxLength={120} defaultValue={ouvrage?.materiau} placeholder="Béton armé, maçonnerie, acier…" />
        </Field>
        <Field label="Franchissement (facultatif)" htmlFor="ouvrage-franchissement">
          <Input id="ouvrage-franchissement" name="franchissement" maxLength={200} defaultValue={ouvrage?.franchissement ?? ""} placeholder="Rivière Abanga" />
        </Field>
      </div>
      {ouvrage ? null : (
        <Field label="Cotation IQOA initiale" hint="Sans relevé, l'ouvrage est coté 1 jusqu'à sa première inspection." htmlFor="ouvrage-cotation">
          <SelectNative id="ouvrage-cotation" name="cotation" defaultValue="1">
            {ORDRE_COTATIONS.map((cotation) => (
              <option key={cotation} value={cotation}>
                {COTATIONS[cotation]}
              </option>
            ))}
          </SelectNative>
        </Field>
      )}
    </FenetreFormulaire>
  )
}

/* =========================================================== Inspection */

interface LigneDesordre {
  cle: number
  partie: string
  description: string
  gravite: GraviteDesordre
}

type InspectionSaisie = DossierInspection["inspection"]

/**
 * Rédaction d'une inspection (brouillon) ou modification du brouillon. Les
 * désordres s'ajoutent et se retirent ligne à ligne. L'inspecteur est l'agent
 * connecté : le serveur l'inscrit lui-même.
 */
export function FenetreInspection({
  open,
  onOpenChange,
  operation,
  ouvrage,
  inspection,
  onCree,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  operation: Operation
  ouvrage: { id: LigneOuvrage["id"]; code: string; nom: string; cotation: Cotation }
  inspection?: InspectionSaisie
  onCree?: (inspectionId: string) => void
}) {
  const creer = useMutation(infraApi.mutations.creerInspection)
  const modifier = useMutation(infraApi.mutations.modifierInspection)
  const [aujourdhui] = useState(() => jourLibreville())
  const [desordres, setDesordres] = useState<LigneDesordre[]>(() =>
    (inspection?.desordres ?? []).map((d, index) => ({ cle: index, partie: d.partie, description: d.description, gravite: d.gravite }))
  )
  const [prochaineCle, setProchaineCle] = useState(() => (inspection?.desordres.length ?? 0) + 1)

  const ajouter = () => {
    setDesordres((liste) => [...liste, { cle: prochaineCle, partie: "", description: "", gravite: "moyenne" }])
    setProchaineCle((cle) => cle + 1)
  }
  const changer = (cle: number, champ: Partial<LigneDesordre>) => setDesordres((liste) => liste.map((d) => (d.cle === cle ? { ...d, ...champ } : d)))
  const retirer = (cle: number) => setDesordres((liste) => liste.filter((d) => d.cle !== cle))

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre={inspection ? `Modifier le brouillon ${inspection.numero}` : `Nouvelle inspection · ${ouvrage.code}`}
      description={
        inspection
          ? "Le brouillon reste modifiable par son inspecteur jusqu'à sa validation."
          : `${ouvrage.nom}. L'inspection est enregistrée en brouillon : un autre agent habilité la valide, et c'est alors que la cotation de l'ouvrage change.`
      }
      libelleValider={
        <>
          <ClipboardCheck />
          {inspection ? "Enregistrer le brouillon" : "Enregistrer l'inspection"}
        </>
      }
      enCours={operation.enCours === "inspection"}
      erreur={erreurDe(operation)}
      onSubmit={async (donnees) => {
        const jour = String(donnees.get("dateInspection") ?? "")
        const dateInspection = horodatageDuJour(jour)
        if (Number.isNaN(dateInspection)) return refuser(operation, "La date d'inspection est obligatoire.")
        const lignes = desordres.map(({ partie, description, gravite }) => ({ partie: partie.trim(), description: description.trim(), gravite }))
        const incomplet = lignes.findIndex((d) => !d.partie || !d.description)
        if (incomplet >= 0) return refuser(operation, `Le désordre ${incomplet + 1} est incomplet : partie d'ouvrage et description sont obligatoires.`)
        const type = String(donnees.get("type")) as TypeInspection
        const cotationProposee = String(donnees.get("cotationProposee")) as Cotation
        const constats = texte(donnees, "constats") ?? ""
        const recommandations = texte(donnees, "recommandations") ?? ""
        if (inspection) {
          const patch: Partial<{ type: TypeInspection; dateInspection: number; constats: string; desordres: typeof lignes; cotationProposee: Cotation; recommandations: string }> = {}
          if (type !== inspection.type) patch.type = type
          if (jour !== champDate(inspection.dateInspection)) patch.dateInspection = dateInspection
          if (constats !== inspection.constats) patch.constats = constats
          if (JSON.stringify(lignes) !== JSON.stringify(inspection.desordres.map(({ partie, description, gravite }) => ({ partie, description, gravite })))) patch.desordres = lignes
          if (cotationProposee !== inspection.cotationProposee) patch.cotationProposee = cotationProposee
          if (recommandations !== (inspection.recommandations ?? "")) patch.recommandations = recommandations
          if (Object.keys(patch).length === 0) return refuser(operation, "Aucune modification à enregistrer.")
          const ok = await operation.executer("inspection", () => modifier({ inspectionId: inspection.id, ...patch }), `Brouillon ${inspection.numero} enregistré.`)
          if (ok) onOpenChange(false)
          return
        }
        const resultat = await operation.executer(
          "inspection",
          () =>
            creer({
              ouvrageId: ouvrage.id,
              type,
              dateInspection,
              constats,
              desordres: lignes,
              cotationProposee,
              recommandations: recommandations || undefined,
            }),
          (r) => `Inspection ${r.numero} enregistrée en brouillon.`
        )
        if (resultat) {
          onOpenChange(false)
          onCree?.(resultat.inspectionId)
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type d'inspection" htmlFor="inspection-type">
          <SelectNative id="inspection-type" name="type" defaultValue={inspection?.type ?? "visite_annuelle"}>
            {Object.entries(TYPES_INSPECTION).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Date de l'inspection" htmlFor="inspection-date">
          <Input id="inspection-date" name="dateInspection" type="date" required max={aujourdhui} defaultValue={inspection ? champDate(inspection.dateInspection) : aujourdhui} className="tabular" />
        </Field>
      </div>
      <p className="text-small text-ink-muted">
        Inspecteur : {inspection ? inspection.inspecteurNom : "vous-même, agent connecté"}. Cotation actuelle de l&apos;ouvrage : <span className="tabular font-semibold">IQOA {ouvrage.cotation}</span>.
      </p>
      <Field label="Constats" htmlFor="inspection-constats">
        <Textarea id="inspection-constats" name="constats" required maxLength={5000} defaultValue={inspection?.constats} placeholder="Appareils d'appui visités, culées sèches, garde-corps complets…" />
      </Field>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-[13px] font-medium">
          Désordres relevés <span className="tabular text-ink-muted">({desordres.length})</span>
        </legend>
        {desordres.length === 0 ? <p className="text-small text-ink-muted">Aucun désordre : ajoutez-en un par partie d&apos;ouvrage concernée.</p> : null}
        {desordres.map((desordre, index) => (
          <div key={desordre.cle} className="grid gap-3 rounded-md border border-line bg-surface-sunk p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_150px_auto] sm:items-end">
            <Field label={`Partie d'ouvrage · désordre ${index + 1}`} htmlFor={`desordre-partie-${desordre.cle}`}>
              <Input id={`desordre-partie-${desordre.cle}`} value={desordre.partie} maxLength={120} onChange={(e) => changer(desordre.cle, { partie: e.target.value })} placeholder="Pile P2" />
            </Field>
            <Field label="Description" htmlFor={`desordre-description-${desordre.cle}`}>
              <Input id={`desordre-description-${desordre.cle}`} value={desordre.description} maxLength={1000} onChange={(e) => changer(desordre.cle, { description: e.target.value })} placeholder="Affouillement en pied de pile" />
            </Field>
            <Field label="Gravité" htmlFor={`desordre-gravite-${desordre.cle}`}>
              <SelectNative id={`desordre-gravite-${desordre.cle}`} value={desordre.gravite} onChange={(e) => changer(desordre.cle, { gravite: e.target.value as GraviteDesordre })}>
                {Object.entries(GRAVITES_DESORDRE).map(([valeur, libelle]) => (
                  <option key={valeur} value={valeur}>
                    {libelle}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Button type="button" variant="ghost" size="icon" aria-label={`Retirer le désordre ${index + 1}`} onClick={() => retirer(desordre.cle)}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={ajouter} disabled={desordres.length >= 50}>
            <Plus />
            Ajouter un désordre
          </Button>
        </div>
      </fieldset>

      <Field label="Cotation IQOA proposée" hint="Elle ne s'applique à l'ouvrage qu'à la validation de l'inspection." htmlFor="inspection-cotation">
        <SelectNative id="inspection-cotation" name="cotationProposee" defaultValue={inspection?.cotationProposee ?? ouvrage.cotation}>
          {ORDRE_COTATIONS.map((cotation) => (
            <option key={cotation} value={cotation}>
              {COTATIONS[cotation]}
            </option>
          ))}
        </SelectNative>
      </Field>
      <Field label="Recommandations (facultatif)" htmlFor="inspection-recommandations">
        <Textarea id="inspection-recommandations" name="recommandations" maxLength={3000} defaultValue={inspection?.recommandations ?? ""} placeholder="Enrochement à programmer avant la saison des pluies." />
      </Field>
    </FenetreFormulaire>
  )
}
