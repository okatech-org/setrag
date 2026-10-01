"use client"

import { FileText, History, Mail, Reply } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { Chronologie, Fiche, Panneau } from "@/components/charte"
import { RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte, dateHeure } from "@/components/gestion/referentiels/format"

import { CadreGed } from "./cadre"
import { FenetreCourrier } from "./courrier"
import { DIRECTIONS, STATUTS_COURRIER, TagCourrier, TagDemo, type StatutCourrier } from "./statuts"
import type { Id } from "./types"

const jour = (date: string | null) => (date ? dateCourte(Date.parse(`${date}T12:00:00Z`)) : "—")

export function CourrierDetail({ courrierId }: { courrierId: string }) {
  const fiche = useQuery(api.modules.ged.queries.courrier, { courrierId: courrierId as Id<"gedCourriers"> })
  const mettreAJour = useMutation(api.modules.ged.mutations.mettreAJourCourrier)
  const operation = useOperation()
  const [reponse, setReponse] = useState(false)
  const [statut, setStatut] = useState<StatutCourrier | "">("")
  const [direction, setDirection] = useState("")
  const [commentaire, setCommentaire] = useState("")

  if (fiche === undefined) {
    return (
      <CadreGed titre="Courrier" retour={{ href: "/bureautique/courrier", libelle: "Registre du courrier" }}>
        <SkeletonLines />
      </CadreGed>
    )
  }
  if (fiche === null) {
    return (
      <CadreGed titre="Courrier" retour={{ href: "/bureautique/courrier", libelle: "Registre du courrier" }}>
        <InlineMessage tone="warning" title="Ce courrier n'existe pas.">
          Vérifiez le numéro dans le registre.
        </InlineMessage>
      </CadreGed>
    )
  }

  const statutChoisi = statut || fiche.statut
  const directionChoisie = direction || fiche.directionAffectee
  const modifie = statutChoisi !== fiche.statut || directionChoisie !== fiche.directionAffectee || commentaire.trim() !== ""
  const peutRepondre = fiche.peutMettreAJour && fiche.sens === "arrivee" && fiche.statut !== "repondu" && fiche.statut !== "clos"

  return (
    <CadreGed
      titre={fiche.objet}
      titreDossier={fiche.numero}
      retour={{ href: "/bureautique/courrier", libelle: "Registre du courrier" }}
      description={
        <>
          <span className="tabular font-semibold text-ink">{fiche.numero}</span> · {fiche.sens === "arrivee" ? "Courrier arrivé de" : "Courrier envoyé à"}{" "}
          {fiche.correspondant}
        </>
      }
      actions={
        peutRepondre ? (
          <Button type="button" onClick={() => setReponse(true)}>
            <Reply />
            Enregistrer la réponse
          </Button>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagCourrier statut={fiche.statut} enRetard={fiche.enRetard} />
        <TagDemo origine={fiche.origine} />
        {fiche.priorite === "urgente" ? <b className="text-small text-danger-ink">Priorité urgente</b> : null}
      </div>
      {fiche.enRetard ? (
        <InlineMessage tone="danger" title="Réponse en retard.">
          L’échéance du {jour(fiche.echeanceReponse)} est dépassée : enregistrez la réponse ou mettez à jour le suivi.
        </InlineMessage>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <div className="grid content-start gap-5">
          <Panneau titre="Fiche du registre" icone={Mail}>
            <Fiche
              elements={[
                ["N° d'ordre", <span key="n" className="tabular">{fiche.numero}</span>],
                ["Sens", fiche.sens === "arrivee" ? "Arrivée" : "Départ"],
                ["Date du courrier", <span key="d" className="tabular">{jour(fiche.dateCourrier)}</span>],
                ["Enregistré le", <span key="e" className="tabular">{dateHeure(fiche.enregistreLe)}</span>],
                ["Enregistré par", fiche.enregistrePar],
                [fiche.sens === "arrivee" ? "Expéditeur" : "Destinataire", fiche.correspondant],
                fiche.referenceExterne ? ["Référence externe", fiche.referenceExterne] : null,
                ["Direction affectée", fiche.directionLibelle],
                ["Échéance de réponse", <span key="ec" className="tabular">{jour(fiche.echeanceReponse)}</span>],
                fiche.traitePar ? ["Dernier suivi par", fiche.traitePar] : null,
              ]}
            />
            {fiche.commentaire ? <p className="text-[14px] text-ink-muted">Suivi : {fiche.commentaire}</p> : null}
          </Panneau>

          <Panneau titre="Pièces liées" icone={FileText}>
            {fiche.piece ? (
              fiche.piece.visible ? (
                <Link
                  href={`/bureautique/documents/${fiche.piece._id}` as Route}
                  className="grid min-h-11 content-center rounded-md border border-line px-3 py-2 hover:bg-surface-sunk"
                >
                  <span className="tabular text-[12.5px] text-ink-muted">{fiche.piece.reference}</span>
                  <b className="text-[14px] font-semibold">{fiche.piece.titre}</b>
                </Link>
              ) : (
                <p className="text-small text-ink-muted">Une pièce est rattachée, mais elle vous est fermée.</p>
              )
            ) : (
              <p className="text-small text-ink-muted">Aucune pièce numérisée rattachée.</p>
            )}
            {fiche.reponse ? (
              <p className="text-[14px]">
                Réponse :{" "}
                <Link href={`/bureautique/courrier/${fiche.reponse._id}` as Route} className="font-semibold text-accent-ink underline">
                  <span className="tabular">{fiche.reponse.numero}</span> — {fiche.reponse.objet}
                </Link>
              </p>
            ) : null}
            {fiche.reponseA.map((origine) => (
              <p key={origine._id} className="text-[14px]">
                Répond au{" "}
                <Link href={`/bureautique/courrier/${origine._id}` as Route} className="font-semibold text-accent-ink underline">
                  <span className="tabular">{origine.numero}</span> — {origine.objet}
                </Link>
              </p>
            ))}
          </Panneau>
        </div>

        <div className="grid content-start gap-5">
          {fiche.peutMettreAJour && fiche.statut !== "clos" ? (
            <Panneau titre="Suivi">
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  void operation
                    .executer(
                      "suivi",
                      () =>
                        mettreAJour({
                          courrierId: fiche._id,
                          statut: statutChoisi,
                          directionAffectee: directionChoisie,
                          commentaire: commentaire || undefined,
                        }),
                      "Suivi enregistré."
                    )
                    .then((resultat) => {
                      if (resultat) {
                        setCommentaire("")
                        setStatut("")
                        setDirection("")
                      }
                    })
                }}
              >
                <Field label="État">
                  <SelectNative value={statutChoisi} onChange={(event) => setStatut(event.target.value as StatutCourrier)}>
                    {(Object.keys(STATUTS_COURRIER) as StatutCourrier[]).map((cle) => (
                      <option key={cle} value={cle}>
                        {STATUTS_COURRIER[cle].libelle}
                      </option>
                    ))}
                  </SelectNative>
                </Field>
                <Field label="Direction affectée">
                  <SelectNative value={directionChoisie} onChange={(event) => setDirection(event.target.value)}>
                    {Object.entries(DIRECTIONS).map(([cle, libelle]) => (
                      <option key={cle} value={cle}>
                        {libelle}
                      </option>
                    ))}
                  </SelectNative>
                </Field>
                <Field label="Commentaire de suivi">
                  <Input value={commentaire} onChange={(event) => setCommentaire(event.target.value)} maxLength={1000} />
                </Field>
                <div>
                  <Button type="submit" variant="secondary" disabled={!modifie} loading={operation.enCours === "suivi"}>
                    Enregistrer le suivi
                  </Button>
                </div>
                <RetourOperation retour={operation.retour} />
              </form>
            </Panneau>
          ) : null}
          <Panneau titre="Chronologie" icone={History}>
            <Chronologie
              evenements={fiche.chronologie.map((evenement) => ({
                cle: evenement.cle,
                heure: dateHeure(evenement.at),
                titre: evenement.titre,
                detail: evenement.detail || undefined,
              }))}
            />
          </Panneau>
        </div>
      </div>
      {reponse ? (
        <FenetreCourrier
          open
          onOpenChange={setReponse}
          reponseA={{
            _id: fiche._id,
            numero: fiche.numero,
            correspondant: fiche.correspondant,
            objet: fiche.objet,
            directionAffectee: fiche.directionAffectee,
          }}
        />
      ) : null}
    </CadreGed>
  )
}
