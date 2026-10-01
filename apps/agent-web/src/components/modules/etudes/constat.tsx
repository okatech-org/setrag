"use client"

import { ArrowLeft, History, ListChecks, PenLine, ShieldCheck, Undo2, X } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { Chronologie, Fiche, Panneau } from "@/components/charte"
import { RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte, dateHeure } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire } from "@/components/gestion/referentiels/formulaire"
import { DIRECTIONS, libelleDirection } from "@/components/modules/ged/statuts"
import type { Id } from "@/components/modules/ged/types"
import { ROLE_LABELS } from "@/lib/roles"

import { CadreEtudes } from "./cadre"
import { GRAVITES, STATUTS_CONSTAT, TagGravite, TagStatutConstat, type Gravite, type StatutConstat } from "./statuts"

const jour = (date: string) => dateCourte(Date.parse(`${date}T12:00:00Z`))

type Existant = {
  _id: Id<"etudesConstats">
  titre: string
  constat: string
  recommandation: string
  gravite: Gravite
  direction: string
  responsableId: Id<"users">
  echeance: string
}

/** Création ou modification d'un constat du plan d'actions. */
export function FenetreConstat({
  open,
  onOpenChange,
  source,
  existant,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  source?: { code: string; sections: { ancre: string; titre: string }[] }
  existant?: Existant
}) {
  const router = useRouter()
  const responsables = useQuery(api.modules.etudes.queries.responsables, open ? {} : "skip")
  const creer = useMutation(api.modules.etudes.mutations.creerConstat)
  const modifier = useMutation(api.modules.etudes.mutations.modifierConstat)
  const operation = useOperation()
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre={existant ? "Modifier le constat" : "Inscrire un constat au plan d'actions"}
      description="Chaque changement est horodaté au suivi de l'action et tracé au journal d'audit."
      libelleValider={
        <>
          <ListChecks />
          {existant ? "Enregistrer" : "Inscrire au plan"}
        </>
      }
      enCours={operation.enCours === "constat"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const valeur = (cle: string) => String(donnees.get(cle) ?? "").trim()
        const champs = {
          titre: valeur("titre"),
          constat: valeur("constat"),
          recommandation: valeur("recommandation"),
          gravite: valeur("gravite") as Gravite,
          direction: valeur("direction"),
          responsableId: valeur("responsableId") as Id<"users">,
          echeance: valeur("echeance"),
        }
        if (existant) {
          const resultat = await operation.executer("constat", () => modifier({ constatId: existant._id, ...champs }))
          if (resultat) onOpenChange(false)
          return
        }
        const resultat = await operation.executer("constat", () =>
          creer({ ...champs, code: source?.code, ancre: valeur("ancre") || undefined })
        )
        if (resultat) {
          onOpenChange(false)
          router.push(`/etudes/plan-actions/${resultat.constatId}` as Route)
        }
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Titre" htmlFor="constat-titre" className="md:col-span-2">
          <Input id="constat-titre" name="titre" defaultValue={existant?.titre} required minLength={5} maxLength={160} />
        </Field>
        <Field label="Constat" htmlFor="constat-constat" className="md:col-span-2">
          <Textarea id="constat-constat" name="constat" defaultValue={existant?.constat} required minLength={10} maxLength={3000} />
        </Field>
        <Field label="Recommandation" htmlFor="constat-recommandation" className="md:col-span-2">
          <Textarea id="constat-recommandation" name="recommandation" defaultValue={existant?.recommandation} required minLength={10} maxLength={3000} />
        </Field>
        <Field label="Gravité" htmlFor="constat-gravite">
          <SelectNative id="constat-gravite" name="gravite" defaultValue={existant?.gravite ?? "moderee"}>
            {Object.entries(GRAVITES).map(([cle, definition]) => (
              <option key={cle} value={cle}>
                {definition.libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Direction concernée" htmlFor="constat-direction">
          <SelectNative id="constat-direction" name="direction" defaultValue={existant?.direction ?? "DG"}>
            {Object.entries(DIRECTIONS).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Responsable de l'action" htmlFor="constat-responsable">
          <SelectNative id="constat-responsable" name="responsableId" defaultValue={existant?.responsableId ?? ""} required>
            <option value="">Choisir…</option>
            {(responsables ?? []).map((responsable) => (
              <option key={responsable._id} value={responsable._id}>
                {responsable.nom} — {ROLE_LABELS[responsable.role] ?? responsable.role}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Échéance" htmlFor="constat-echeance">
          <Input id="constat-echeance" name="echeance" type="date" defaultValue={existant?.echeance} className="tabular" required />
        </Field>
        {source && !existant ? (
          <Field label="Section de l'étude (facultative)" htmlFor="constat-ancre" className="md:col-span-2">
            <SelectNative id="constat-ancre" name="ancre" defaultValue="">
              <option value="">Étude entière</option>
              {source.sections.map((section) => (
                <option key={section.ancre} value={section.ancre}>
                  {section.titre}
                </option>
              ))}
            </SelectNative>
          </Field>
        ) : null}
      </div>
    </FenetreFormulaire>
  )
}

const NATURES_SUIVI = {
  creation: "Inscription au plan",
  commentaire: "Commentaire",
  statut: "Changement d'état",
  avancement: "Avancement",
  modification: "Modification",
} as const

export function ConstatDetail({ constatId }: { constatId: string }) {
  const fiche = useQuery(api.modules.etudes.queries.constat, { constatId: constatId as Id<"etudesConstats"> })
  const suivre = useMutation(api.modules.etudes.mutations.suivreConstat)
  const operation = useOperation()
  const [modification, setModification] = useState(false)
  const [avancement, setAvancement] = useState<number | null>(null)
  const [commentaire, setCommentaire] = useState("")

  const retour = (
    <Button asChild variant="ghost" className="-ml-3">
      <Link href={"/etudes/plan-actions" as Route}>
        <ArrowLeft />
        Plan d&apos;actions
      </Link>
    </Button>
  )
  if (fiche === undefined) {
    return (
      <CadreEtudes titre="Action d'audit" eyebrow={retour}>
        <SkeletonLines />
      </CadreEtudes>
    )
  }
  if (fiche === null) {
    return (
      <CadreEtudes titre="Action introuvable" eyebrow={retour}>
        <InlineMessage tone="warning" title="Cette action n'existe pas.">
          Retrouvez-la depuis le plan d&apos;actions.
        </InlineMessage>
      </CadreEtudes>
    )
  }
  const { constat: c, droits } = fiche
  const valeurAvancement = avancement ?? c.avancement

  const changer = (statut: StatutConstat, succes: string) =>
    void operation
      .executer("statut", () => suivre({ constatId: c._id, statut, commentaire: commentaire || undefined }), succes)
      .then((resultat) => {
        if (resultat) setCommentaire("")
      })

  return (
    <CadreEtudes
      titre={c.titre}
      description={`${c.reference} · ${libelleDirection(c.direction)} · responsable : ${c.responsable}`}
      eyebrow={retour}
      actions={
        droits.peutModifier ? (
          <Button type="button" variant="secondary" onClick={() => setModification(true)}>
            <PenLine />
            Modifier
          </Button>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagStatutConstat statut={c.statut} />
        <TagGravite gravite={c.gravite} />
        {c.origine === "demo" ? <small className="text-[12.5px] text-ink-muted">Action d&apos;exemple du jeu de démonstration</small> : null}
      </div>
      {c.enRetard ? (
        <InlineMessage tone="danger" title="Échéance dépassée.">
          L&apos;échéance du {jour(c.echeance)} est passée : mettez à jour l&apos;avancement ou faites revoir l&apos;échéance par l&apos;audit.
        </InlineMessage>
      ) : null}
      <RetourOperation retour={operation.retour} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <div className="grid content-start gap-5">
          <Panneau titre="Constat">
            <p className="text-[15px] whitespace-pre-wrap">{c.constat}</p>
          </Panneau>
          <Panneau titre="Recommandation">
            <p className="text-[15px] whitespace-pre-wrap">{c.recommandation}</p>
          </Panneau>
          {droits.peutFaireAvancer || droits.peutVerifier || droits.peutRouvrir || droits.peutAbandonner ? (
            <Panneau titre="Suivi de l'action">
              <Field label="Commentaire" hint="Obligatoire pour abandonner ou rouvrir l'action.">
                <Textarea value={commentaire} onChange={(event) => setCommentaire(event.target.value)} maxLength={2000} />
              </Field>
              {droits.peutFaireAvancer && (c.statut === "a_lancer" || c.statut === "en_cours") ? (
                <div className="grid gap-2">
                  <label className="grid gap-1.5 text-[13px] font-medium" htmlFor="constat-avancement">
                    Avancement : <span className="tabular">{valeurAvancement} %</span>
                    <input
                      id="constat-avancement"
                      type="range"
                      min={0}
                      max={95}
                      step={5}
                      value={Math.min(valeurAvancement, 95)}
                      onChange={(event) => setAvancement(Number(event.target.value))}
                      className="min-h-11 w-full accent-[var(--c-accent)]"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={valeurAvancement === c.avancement && !commentaire.trim()}
                      loading={operation.enCours === "avancement"}
                      onClick={() =>
                        void operation
                          .executer(
                            "avancement",
                            () =>
                              suivre({
                                constatId: c._id,
                                statut: valeurAvancement > 0 && c.statut === "a_lancer" ? "en_cours" : undefined,
                                avancement: valeurAvancement,
                                commentaire: commentaire || undefined,
                              }),
                            "Suivi enregistré."
                          )
                          .then((resultat) => {
                            if (resultat) {
                              setCommentaire("")
                              setAvancement(null)
                            }
                          })
                      }
                    >
                      Enregistrer le suivi
                    </Button>
                    <Button type="button" size="sm" loading={operation.enCours === "statut"} onClick={() => changer("realisee", "Action déclarée réalisée : l'audit la vérifiera.")}>
                      Déclarer réalisée
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {droits.peutVerifier ? (
                  <Button type="button" loading={operation.enCours === "statut"} onClick={() => changer("verifiee", "Action vérifiée et close.")}>
                    <ShieldCheck />
                    Vérifier et clore
                  </Button>
                ) : null}
                {droits.peutRouvrir ? (
                  <Button type="button" variant="secondary" disabled={commentaire.trim().length < 5} onClick={() => changer("en_cours", "Action rouverte.")}>
                    <Undo2 />
                    Rouvrir
                  </Button>
                ) : null}
                {droits.peutAbandonner ? (
                  <Button type="button" variant="danger" disabled={commentaire.trim().length < 5} onClick={() => changer("abandonnee", "Action abandonnée.")}>
                    <X />
                    Abandonner
                  </Button>
                ) : null}
              </div>
              {droits.estResponsable && c.statut === "realisee" ? (
                <p className="text-small text-ink-muted">Séparation des tâches : la vérification revient à un autre membre de l&apos;audit.</p>
              ) : null}
            </Panneau>
          ) : null}
        </div>
        <div className="grid content-start gap-5">
          <Panneau titre="Fiche">
            <Fiche
              elements={[
                ["Référence", <span key="r" className="tabular">{c.reference}</span>],
                ["État", STATUTS_CONSTAT[c.statut].libelle],
                ["Gravité", GRAVITES[c.gravite].libelle],
                ["Avancement", <span key="a" className="tabular">{c.avancement} %</span>],
                ["Échéance", <span key="e" className="tabular">{jour(c.echeance)}</span>],
                ["Direction", libelleDirection(c.direction)],
                ["Responsable", c.responsable],
                ["Inscrit par", c.creePar],
                ["Inscrit le", <span key="c" className="tabular">{dateHeure(c.createdAt)}</span>],
                c.source
                  ? [
                      "Source",
                      <Link key="s" href={`/etudes/${c.source.code}${c.ancre ? `#${c.ancre}` : ""}` as Route} className="text-accent-ink underline">
                        {c.source.numero} — {c.source.titre}
                      </Link>,
                    ]
                  : null,
              ]}
            />
          </Panneau>
          <Panneau titre="Suivi" icone={History}>
            <Chronologie
              evenements={fiche.suivis.map((suivi) => ({
                cle: suivi._id,
                heure: dateHeure(suivi.at),
                titre: `${NATURES_SUIVI[suivi.nature]}${
                  suivi.avant && suivi.apres
                    ? ` : ${STATUTS_CONSTAT[suivi.avant as StatutConstat]?.libelle ?? suivi.avant} → ${STATUTS_CONSTAT[suivi.apres as StatutConstat]?.libelle ?? suivi.apres}`
                    : ""
                }`,
                detail: [suivi.auteur, suivi.texte].filter(Boolean).join(" — "),
              }))}
            />
          </Panneau>
        </div>
      </div>
      {modification ? (
        <FenetreConstat
          open
          onOpenChange={setModification}
          existant={{
            _id: c._id,
            titre: c.titre,
            constat: c.constat,
            recommandation: c.recommandation,
            gravite: c.gravite,
            direction: c.direction,
            responsableId: c.responsableId,
            echeance: c.echeance,
          }}
        />
      ) : null}
    </CadreEtudes>
  )
}
