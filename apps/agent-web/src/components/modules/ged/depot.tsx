"use client"

import { FileUp, Plus, X } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { isInternalRole } from "@workspace/backend/permissions"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { Panneau } from "@/components/charte"
import { messageErreur } from "@/components/gestion/referentiels/format"
import { ROLES } from "@/lib/roles"

import { CadreGed } from "./cadre"
import { TYPES_ACCEPTES, useTeleversement, verifierFichier } from "./fichiers"
import { CLASSIFICATIONS, TYPES_DOCUMENT, taille, type Classification, type TypeDocument } from "./statuts"
import type { Id } from "./types"

export type Acces = { userId?: Id<"users">; role?: string; droit: "lecture" | "edition"; libelle: string }

const aujourdhui = () => new Intl.DateTimeFormat("fr-CA", { timeZone: "Africa/Libreville" }).format(new Date())

/** Éditeur des accès nominatifs ou par fonction, partagé avec la fiche. */
export function EditeurAcces({ acces, onChange }: { acces: readonly Acces[]; onChange: (acces: Acces[]) => void }) {
  const signataires = useQuery(api.modules.ged.queries.signataires, {})
  const [personne, setPersonne] = useState("")
  const [fonction, setFonction] = useState("")
  const [droit, setDroit] = useState<"lecture" | "edition">("lecture")
  const ajouter = (entree: Acces) => {
    if (acces.some((existant) => (entree.userId ? existant.userId === entree.userId : existant.role === entree.role))) return
    onChange([...acces, entree])
  }
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px]">
        <Field label="Ajouter une personne">
          <SelectNative value={personne} onChange={(event) => setPersonne(event.target.value)}>
            <option value="">Choisir…</option>
            {(signataires ?? []).map((signataire) => (
              <option key={signataire._id} value={signataire._id}>
                {signataire.nom}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Ou une fonction">
          <SelectNative value={fonction} onChange={(event) => setFonction(event.target.value)}>
            <option value="">Choisir…</option>
            {ROLES.filter(([role]) => isInternalRole(role)).map(([role, libelle]) => (
              <option key={role} value={role}>
                {libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Droit">
          <SelectNative value={droit} onChange={(event) => setDroit(event.target.value as "lecture" | "edition")}>
            <option value="lecture">Lecture</option>
            <option value="edition">Édition</option>
          </SelectNative>
        </Field>
      </div>
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!personne && !fonction}
          onClick={() => {
            if (personne) {
              const signataire = signataires?.find((candidat) => candidat._id === personne)
              ajouter({ userId: personne as Id<"users">, droit, libelle: signataire?.nom ?? "Personne" })
            }
            if (fonction) {
              ajouter({ role: fonction, droit, libelle: ROLES.find(([role]) => role === fonction)?.[1] ?? fonction })
            }
            setPersonne("")
            setFonction("")
          }}
        >
          <Plus />
          Ajouter l’accès
        </Button>
      </div>
      {acces.length === 0 ? (
        <p className="text-small text-ink-muted">Aucun accès particulier : la classification seule s’applique.</p>
      ) : (
        <ul className="grid gap-2" aria-label="Accès accordés">
          {acces.map((entree) => (
            <li
              key={entree.userId ?? `role-${entree.role}`}
              className="flex min-h-11 items-center gap-3 rounded-md border border-line px-3 text-[14px]"
            >
              <span className="min-w-0 flex-1">
                <b className="font-semibold">{entree.libelle}</b>
                <small className="ml-2 text-ink-muted">
                  {entree.userId ? "personne" : "fonction"} · {entree.droit === "edition" ? "édition" : "lecture"}
                </small>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Retirer l'accès de ${entree.libelle}`}
                onClick={() => onChange(acces.filter((autre) => autre !== entree))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Dépôt d'une pièce : métadonnées, classement, fichier et accès. */
export function DepotDocument() {
  const router = useRouter()
  const droits = useQuery(api.modules.ged.queries.mesDroits, {})
  const plan = useQuery(api.modules.ged.queries.planClassement, {})
  const deposer = useMutation(api.modules.ged.mutations.deposerDocument)
  const televerser = useTeleversement()

  const [titre, setTitre] = useState("")
  const [type, setType] = useState<TypeDocument>("rapport")
  const [classementId, setClassementId] = useState("")
  const [dateDocument, setDateDocument] = useState(aujourdhui)
  const [classification, setClassification] = useState<Classification>("interne")
  const [correspondant, setCorrespondant] = useState("")
  const [description, setDescription] = useState("")
  const [motsCles, setMotsCles] = useState("")
  const [fichier, setFichier] = useState<File | null>(null)
  const [acces, setAcces] = useState<Acces[]>([])
  const [erreurs, setErreurs] = useState<Record<string, string>>({})
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const series = plan?.series.filter((serie) => serie.actif) ?? []
  const courrier = type === "courrier_entrant" || type === "courrier_sortant"

  const valider = () => {
    const suivantes: Record<string, string> = {}
    if (titre.trim().length < 3) suivantes.titre = "Le titre compte au moins 3 caractères."
    if (!classementId) suivantes.classementId = "Choisissez la série du plan de classement."
    if (!dateDocument) suivantes.dateDocument = "La date de la pièce est obligatoire."
    if (fichier) {
      const probleme = verifierFichier(fichier)
      if (probleme) suivantes.fichier = probleme
    }
    setErreurs(suivantes)
    return Object.keys(suivantes).length === 0
  }

  const soumettre = async (event: FormEvent) => {
    event.preventDefault()
    if (!valider()) return
    setEnCours(true)
    setErreur(null)
    try {
      const fichierStocke = fichier ? await televerser(fichier) : undefined
      const { documentId } = await deposer({
        titre,
        description: description || undefined,
        type,
        classementId: classementId as Id<"gedClassement">,
        motsCles: motsCles.split(/[,;]/).map((mot) => mot.trim()).filter(Boolean),
        classification,
        dateDocument,
        correspondant: correspondant || undefined,
        fichier: fichierStocke,
        acces: acces.map((entree) => ({
          ...(entree.userId ? { userId: entree.userId } : { role: entree.role as never }),
          droit: entree.droit,
        })),
      })
      router.push(`/bureautique/documents/${documentId}` as Route)
    } catch (cause) {
      setErreur(messageErreur(cause, "Le dépôt a échoué."))
      setEnCours(false)
    }
  }

  if (droits && !droits.peutCreer) {
    return (
      <CadreGed titre="Déposer une pièce" retour={{ href: "/bureautique/documents", libelle: "Documents" }}>
        <InlineMessage tone="warning" title="Dépôt réservé.">
          Votre habilitation GED est en lecture : demandez le niveau « Utilisation » du module à l’administration.
        </InlineMessage>
      </CadreGed>
    )
  }

  return (
    <CadreGed
      titre="Déposer une pièce"
      description="La pièce reçoit une référence chronologique, sa durée de conservation est calculée depuis sa série. Une fois en circuit ou validée, elle n'est plus modifiable."
      retour={{ href: "/bureautique/documents", libelle: "Documents" }}
    >
      {plan === undefined ? (
        <SkeletonLines />
      ) : series.length === 0 ? (
        <InlineMessage tone="warning" title="Aucun plan de classement.">
          Le plan de classement n’est pas encore chargé : faites charger le jeu de référence GED avant le premier dépôt.
        </InlineMessage>
      ) : (
        <form onSubmit={(event) => void soumettre(event)} className="grid gap-5" noValidate>
          <Panneau titre="Pièce">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Titre" error={erreurs.titre} className="md:col-span-2">
                <Input value={titre} onChange={(event) => setTitre(event.target.value)} maxLength={200} required />
              </Field>
              <Field label="Type">
                <SelectNative value={type} onChange={(event) => setType(event.target.value as TypeDocument)}>
                  {Object.entries(TYPES_DOCUMENT).map(([cle, libelle]) => (
                    <option key={cle} value={cle}>
                      {libelle}
                    </option>
                  ))}
                </SelectNative>
              </Field>
              <Field label="Date de la pièce" error={erreurs.dateDocument}>
                <Input type="date" value={dateDocument} onChange={(event) => setDateDocument(event.target.value)} className="tabular" />
              </Field>
              <Field
                label="Série du plan de classement"
                error={erreurs.classementId}
                hint="Elle fixe la direction et la durée de conservation."
                className="md:col-span-2"
              >
                <SelectNative
                  value={classementId}
                  onChange={(event) => {
                    setClassementId(event.target.value)
                    const serie = series.find((candidate) => candidate._id === event.target.value)
                    if (serie) setClassification(serie.classificationParDefaut)
                  }}
                >
                  <option value="">Choisir une série…</option>
                  {series.map((serie) => (
                    <option key={serie._id} value={serie._id}>
                      {serie.code} — {serie.libelle} ({serie.conservationAnnees === null ? "conservation définitive" : `${serie.conservationAnnees} ans`})
                    </option>
                  ))}
                </SelectNative>
              </Field>
              {courrier ? (
                <Field label={type === "courrier_entrant" ? "Expéditeur" : "Destinataire"} className="md:col-span-2">
                  <Input value={correspondant} onChange={(event) => setCorrespondant(event.target.value)} maxLength={200} />
                </Field>
              ) : null}
              <Field label="Description" hint="Facultative ; elle entre dans la recherche." className="md:col-span-2">
                <Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} />
              </Field>
              <Field label="Mots-clés" hint="Séparés par des virgules, douze au plus." className="md:col-span-2">
                <Input value={motsCles} onChange={(event) => setMotsCles(event.target.value)} placeholder="minerai, avenant, comilog" />
              </Field>
            </div>
          </Panneau>

          <Panneau titre="Fichier" icone={FileUp} sousTitre="PDF, image, texte, CSV ou bureautique, 25 Mo au plus">
            <Field
              label="Fichier de la pièce"
              error={erreurs.fichier}
              hint="Facultatif au dépôt, obligatoire avant de lancer un circuit de validation."
            >
              <Input
                type="file"
                accept={TYPES_ACCEPTES.join(",")}
                onChange={(event) => setFichier(event.target.files?.[0] ?? null)}
                className="h-auto py-3"
              />
            </Field>
            {fichier ? (
              <p className="text-small text-ink-muted">
                {fichier.name} · <span className="tabular">{taille(fichier.size)}</span>
              </p>
            ) : null}
          </Panneau>

          <Panneau titre="Accès" sousTitre="Qui peut ouvrir la pièce">
            <Field label="Classification">
              <SelectNative value={classification} onChange={(event) => setClassification(event.target.value as Classification)}>
                {Object.entries(CLASSIFICATIONS).map(([cle, definition]) => (
                  <option key={cle} value={cle}>
                    {definition.libelle}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <p className="text-small text-ink-muted">
              Public et interne : tout lecteur du module. Confidentiel : vous, les intervenants du circuit, les accès ci-dessous
              et les gestionnaires documentaires. Restreint : vous, les intervenants et les personnes nommées ci-dessous seulement.
            </p>
            <EditeurAcces acces={acces} onChange={setAcces} />
          </Panneau>

          {erreur ? <InlineMessage tone="danger" title="Dépôt refusé.">{erreur}</InlineMessage> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => router.push("/bureautique/documents" as Route)}>
              Annuler
            </Button>
            <Button type="submit" loading={enCours} loadingLabel="Enregistrement…">
              Enregistrer la pièce
            </Button>
          </div>
        </form>
      )}
    </CadreGed>
  )
}
