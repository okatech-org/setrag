"use client"

import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Checkbox } from "@workspace/ui/components/choice"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"

import { messageErreur } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire, texte } from "@/components/gestion/referentiels/formulaire"

import { FAMILLES, gmaoApi, PRIORITES, TYPES_OT } from "./commun"

/**
 * Demande d'ordre de travail : depuis la liste des OT, la fiche d'un engin
 * (engin prérempli) ou un incident technique (incident prérempli).
 */
export function DialogueNouvelOt({
  open,
  onOpenChange,
  equipementId,
  incidentId,
  onCree,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipementId?: string
  incidentId?: string
  onCree?: (resultat: { otId: string; numero: string }) => void
}) {
  const formulaires = useQuery(gmaoApi.queries.formulaires, open ? {} : "skip")
  const creer = useMutation(gmaoApi.mutations.creerOt)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [immobilisant, setImmobilisant] = useState(true)
  const [engin, setEngin] = useState(equipementId ?? "")

  const enginChoisi = formulaires?.engins.find((candidat) => candidat.id === engin)

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={(ouvert) => {
        onOpenChange(ouvert)
        if (!ouvert) setErreur(null)
      }}
      titre="Demander un ordre de travail"
      description="La demande part à l'atelier de l'engin. Un OT urgent et immobilisant rend l'engin indisponible dès maintenant."
      libelleValider="Envoyer la demande"
      enCours={enCours}
      erreur={erreur}
      onSubmit={async (donnees, formulaire) => {
        setErreur(null)
        const equipement = String(donnees.get("equipementId") ?? "")
        if (!equipement) {
          setErreur("Choisissez l'engin concerné.")
          return
        }
        setEnCours(true)
        try {
          const resultat = await creer({
            equipementId: equipement as never,
            type: String(donnees.get("type")) as "correctif",
            priorite: String(donnees.get("priorite")) as "normale",
            titre: texte(donnees, "titre") ?? "",
            description: texte(donnees, "description") ?? "",
            organe: texte(donnees, "organe"),
            atelierId: (texte(donnees, "atelierId") as never) ?? undefined,
            incidentId: (texte(donnees, "incidentId") as never) ?? undefined,
            immobilisant,
          })
          formulaire.reset()
          onOpenChange(false)
          onCree?.({ otId: resultat.otId, numero: resultat.numero })
        } catch (cause) {
          setErreur(messageErreur(cause))
        } finally {
          setEnCours(false)
        }
      }}
    >
      {formulaires === undefined ? (
        <p role="status" className="text-small text-ink-muted">
          Chargement du parc…
        </p>
      ) : (
        <>
          <Field label="Engin" hint={enginChoisi ? `${FAMILLES[enginChoisi.famille]} · ${enginChoisi.serie}` : "Numéro de la locomotive, de la voiture ou du wagon"}>
            <SelectNative name="equipementId" value={engin} onChange={(event) => setEngin(event.target.value)} required>
              <option value="">Choisir un engin…</option>
              {(["locomotive", "voiture", "wagon"] as const).map((famille) => (
                <optgroup key={famille} label={FAMILLES[famille]}>
                  {formulaires.engins
                    .filter((candidat) => candidat.famille === famille)
                    .map((candidat) => (
                      <option key={candidat.id} value={candidat.id}>
                        {candidat.numero} — {candidat.serie}
                      </option>
                    ))}
                </optgroup>
              ))}
            </SelectNative>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nature">
              <SelectNative name="type" defaultValue="correctif">
                {Object.entries(TYPES_OT).map(([cle, libelle]) => (
                  <option key={cle} value={cle}>
                    {libelle}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field label="Priorité" hint="Urgente : prise en compte sous 4 h">
              <SelectNative name="priorite" defaultValue="normale">
                {Object.entries(PRIORITES).map(([cle, def]) => (
                  <option key={cle} value={cle}>
                    {def.libelle}
                  </option>
                ))}
              </SelectNative>
            </Field>
          </div>
          <Field label="Intitulé">
            <Input name="titre" required maxLength={160} placeholder="Ex. Fuite sur la conduite générale" />
          </Field>
          <Field label="Description" hint="Constat, circonstances, premières mesures prises">
            <Textarea name="description" required maxLength={4000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Organe concerné (facultatif)">
              <Input name="organe" maxLength={120} placeholder="Ex. Compresseur principal" />
            </Field>
            <Field label="Atelier" hint="Par défaut, l'atelier d'attache de l'engin">
              <SelectNative name="atelierId" defaultValue="">
                <option value="">Atelier d’attache</option>
                {formulaires.ateliers.map((atelier) => (
                  <option key={atelier.id} value={atelier.id}>
                    {atelier.nom}
                  </option>
                ))}
              </SelectNative>
            </Field>
          </div>
          <Field label="Incident lié (facultatif)" hint="Incidents techniques ou de sécurité encore ouverts">
            <SelectNative name="incidentId" defaultValue={incidentId ?? ""}>
              <option value="">Aucun</option>
              {formulaires.incidents.map((incident) => (
                <option key={incident.id} value={incident.id}>
                  {incident.reference ?? "Incident"} — {incident.description.slice(0, 70)}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Checkbox
            label="L'engin est immobilisé pendant l'intervention"
            checked={immobilisant}
            onCheckedChange={(valeur) => setImmobilisant(valeur === true)}
          />
        </>
      )}
    </FenetreFormulaire>
  )
}
