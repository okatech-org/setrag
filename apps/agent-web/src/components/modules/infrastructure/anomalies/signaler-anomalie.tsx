"use client"

import type { Route } from "next"
import { Flag } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { useOperation } from "@/components/gestion/referentiels/elements"
import { FenetreFormulaire, nombreSaisi, texte } from "@/components/gestion/referentiels/formulaire"
import { signalerNavigation } from "@/coquille/filet-navigation"

import { infraApi, pk as fmtPk } from "../commun"
import {
  AIDE_PK,
  CATEGORIES_ANOMALIE,
  GRAVITES,
  LONGUEUR_LIGNE_KM,
  ORDRE_GRAVITES,
  sectionDuPk,
  type CategorieAnomalie,
  type Gravite,
} from "../accueil/partage"
import { ChoixPhotos, useTeleversement } from "./photos"

/**
 * Signalement d'une anomalie terrain. Le serveur rattache la section du PK,
 * numérote (« AN-2026-0042 ») et fixe l'échéance selon la gravité ; les
 * photos sont téléversées avant l'enregistrement, puis on ouvre le dossier.
 */
export function DialogueSignalement({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const formulaires = useQuery(infraApi.queries.formulaires, open ? {} : "skip")
  const signaler = useMutation(infraApi.mutations.signalerAnomalie)
  const { televerser, progression } = useTeleversement()
  const operation = useOperation()
  const [gravite, setGravite] = useState<Gravite>("moyenne")
  const [pkSaisi, setPkSaisi] = useState("")
  const [photos, setPhotos] = useState<File[]>([])

  const longueur = formulaires?.sections.reduce((max, s) => Math.max(max, s.pkFin), 0) || LONGUEUR_LIGNE_KM
  const pkNombre = pkSaisi.trim() === "" ? null : Number(pkSaisi.replace(",", "."))
  const pkValide = pkNombre !== null && Number.isFinite(pkNombre) && pkNombre >= 0 && pkNombre <= longueur
  const section = pkValide && formulaires ? sectionDuPk(formulaires.sections, pkNombre) : undefined

  const fermer = (ouvert: boolean) => {
    if (!ouvert) {
      operation.effacer()
      setPhotos([])
      setPkSaisi("")
      setGravite("moyenne")
    }
    onOpenChange(ouvert)
  }

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={fermer}
      large
      titre="Signaler une anomalie"
      description="L'anomalie reçoit son numéro et son échéance de traitement. Une anomalie critique doit être traitée sous 24 heures."
      libelleValider={
        <>
          <Flag />
          Signaler l&apos;anomalie
        </>
      }
      enCours={operation.enCours === "signaler"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const pk = nombreSaisi(donnees, "pk")
        if (pk === undefined || Number.isNaN(pk) || pk < 0 || pk > longueur) {
          operation.signaler({ ton: "danger", titre: "Action refusée", detail: `Le PK doit être compris entre 0 et ${longueur}.` })
          return
        }
        const resultat = await operation.executer("signaler", async () => {
          const photoIds = photos.length > 0 ? await televerser(photos) : undefined
          return await signaler({
            pk,
            categorie: String(donnees.get("categorie")) as CategorieAnomalie,
            gravite,
            description: String(donnees.get("description") ?? ""),
            brigade: texte(donnees, "brigade"),
            ouvrageId: texte(donnees, "ouvrageId") as never,
            equipementId: texte(donnees, "equipementId") as never,
            incidentId: texte(donnees, "incidentId") as never,
            photoIds,
          })
        })
        if (resultat) {
          fermer(false)
          signalerNavigation()
          router.push(`/infrastructures/anomalies/${resultat.anomalieId}` as Route)
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Point kilométrique" htmlFor="anomalie-pk" hint={pkValide && section ? `${AIDE_PK} · section ${section.code} — ${section.libelle}` : AIDE_PK}>
          <Input
            id="anomalie-pk"
            name="pk"
            inputMode="decimal"
            required
            value={pkSaisi}
            onChange={(event) => setPkSaisi(event.target.value)}
            placeholder="201,4"
            className="tabular"
            autoComplete="off"
          />
        </Field>
        <Field label="Catégorie" htmlFor="anomalie-categorie">
          <SelectNative id="anomalie-categorie" name="categorie" defaultValue="rail">
            {Object.entries(CATEGORIES_ANOMALIE).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
      </div>
      <Field label="Gravité" htmlFor="anomalie-gravite" hint={`Gravité ${GRAVITES[gravite].libelle.toLowerCase()} : ${GRAVITES[gravite].delai}.`}>
        <SelectNative id="anomalie-gravite" name="gravite" value={gravite} onChange={(event) => setGravite(event.target.value as Gravite)}>
          {ORDRE_GRAVITES.map((valeur) => (
            <option key={valeur} value={valeur}>
              {GRAVITES[valeur].libelle} — {GRAVITES[valeur].delai}
            </option>
          ))}
        </SelectNative>
      </Field>
      {gravite === "critique" ? (
        <InlineMessage tone="warning" title="Anomalie critique">
          Prévenez aussi le régulateur : si la circulation est menacée, une limitation de vitesse se pose depuis le dossier.
        </InlineMessage>
      ) : null}
      <Field label="Description" htmlFor="anomalie-description">
        <Textarea
          id="anomalie-description"
          name="description"
          required
          minLength={5}
          maxLength={2000}
          placeholder="Rail fissuré en file gauche, sur 30 cm, à la sortie de la courbe."
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Brigade (facultatif)" htmlFor="anomalie-brigade" hint={section ? `Par défaut, la brigade de la section ${section.code}.` : "Par défaut, la brigade de la section du PK."}>
          <Input id="anomalie-brigade" name="brigade" maxLength={120} placeholder="Brigade de Ndjolé" />
        </Field>
        <Field label="Ouvrage concerné (facultatif)" htmlFor="anomalie-ouvrage">
          <SelectNative id="anomalie-ouvrage" name="ouvrageId" defaultValue="">
            <option value="">Aucun</option>
            {formulaires?.ouvrages.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} · {o.nom} · {fmtPk(o.pk)}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Équipement concerné (facultatif)" htmlFor="anomalie-equipement">
          <SelectNative id="anomalie-equipement" name="equipementId" defaultValue="">
            <option value="">Aucun</option>
            {formulaires?.equipements.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} · {e.libelle} · {fmtPk(e.pk)}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Incident d'exploitation lié (facultatif)" htmlFor="anomalie-incident">
          <SelectNative id="anomalie-incident" name="incidentId" defaultValue="">
            <option value="">Aucun</option>
            {formulaires?.incidents.map((i) => (
              <option key={i.id} value={i.id}>
                {i.number ?? "Incident"} · {i.description.length > 60 ? `${i.description.slice(0, 58)}…` : i.description}
              </option>
            ))}
          </SelectNative>
        </Field>
      </div>
      <ChoixPhotos fichiers={photos} onChange={setPhotos} desactive={operation.enCours === "signaler"} />
      {progression ? (
        <p role="status" className="text-small tabular text-ink-muted">
          Envoi des photos : {progression.fait} sur {progression.total}…
        </p>
      ) : null}
    </FenetreFormulaire>
  )
}
