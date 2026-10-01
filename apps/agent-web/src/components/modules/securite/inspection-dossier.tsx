"use client"

import type { FunctionReturnType } from "convex/server"
import {
  CalendarClock,
  CircleX,
  ClipboardPen,
  ListPlus,
  Plus,
  Trash2,
} from "lucide-react"
import { useId, useRef, useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  Input,
  SelectNative,
  Textarea,
} from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"

import {
  Chronologie,
  Fiche,
  Panneau,
  TableauDonnees,
} from "@/components/charte"
import {
  RetourOperation,
  useOperation,
} from "@/components/gestion/referentiels/elements"
import { FenetreFormulaire } from "@/components/gestion/referentiels/formulaire"
import {
  AccesRestreint,
  Chargement,
  Introuvable,
  LienDossier,
  aujourdhui,
  chronologie,
  dateIso,
  type Id,
} from "@/components/modules/rh/commun"

import { colonnesActions } from "./actions"
import {
  CadreSecurite,
  TagGraviteNc,
  TagInspection,
  TagResultat,
  TagRetard,
  dateHeureComplete,
  useAccesSecurite,
} from "./cadre-securite"
import { DialogueAction, DialogueTexte } from "./dialogues"
import {
  GRAVITES_NC,
  RESULTATS_INSPECTION,
  TYPES_INSPECTION,
  lieuEtPk,
  type GraviteNc,
  type ResultatInspection,
} from "./libelles"

type Dossier = NonNullable<
  FunctionReturnType<typeof api.modules.securite.inspections.dossier>
>
type NonConformite = Dossier["inspection"]["nonConformites"][number]
type Dialogue = "resultat" | "reprogrammer" | "annuler" | null

const RETOUR = {
  href: "/securite/inspections",
  libelle: "Inspections et audits",
}

export function DossierInspection({ inspectionId }: { inspectionId: string }) {
  const { peut, acces } = useAccesSecurite()
  const lecture = peut("registre.lire") || peut("environnement.lire")
  const dossier = useQuery(
    api.modules.securite.inspections.dossier,
    lecture
      ? { inspectionId: inspectionId as Id<"securiteInspections"> }
      : "skip"
  )
  const reprogrammer = useMutation(
    api.modules.securite.inspections.reprogrammer
  )
  const annuler = useMutation(api.modules.securite.inspections.annuler)
  const operation = useOperation()
  const [dialogue, setDialogue] = useState<Dialogue>(null)
  const [ncAction, setNcAction] = useState<NonConformite | null>(null)

  if (acces && !lecture) {
    return (
      <CadreSecurite titre="Inspection" retour={RETOUR}>
        <AccesRestreint>
          Votre profil ne consulte pas les inspections de sécurité.
        </AccesRestreint>
      </CadreSecurite>
    )
  }
  if (dossier === undefined) {
    return (
      <CadreSecurite titre="Inspection" retour={RETOUR}>
        <Chargement libelle="Chargement de l'inspection" />
      </CadreSecurite>
    )
  }
  if (dossier === null) {
    return (
      <CadreSecurite titre="Inspection introuvable" retour={RETOUR}>
        <Introuvable titre="Cette inspection n'existe pas" retour={RETOUR} />
      </CadreSecurite>
    )
  }

  const { inspection, droits } = dossier
  const programmee = inspection.statut === "programmee"
  const echue = inspection.dateProgrammee <= aujourdhui()
  const peutSaisir = droits.gerer && programmee && echue
  const peutModifier = droits.gerer && programmee
  const actionDe = (nc: NonConformite) =>
    nc.actionId ? dossier.actions.find((a) => a._id === nc.actionId) : undefined

  return (
    <CadreSecurite
      titre={`${inspection.numero} · ${inspection.objet}`}
      description={`${TYPES_INSPECTION[inspection.type]} · ${lieuEtPk(inspection)} · ${dateIso(inspection.dateProgrammee)}`}
      retour={RETOUR}
      actions={
        peutModifier ? (
          <>
            <Button
              type="button"
              variant="danger"
              onClick={() => setDialogue("annuler")}
            >
              <CircleX />
              Annuler
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDialogue("reprogrammer")}
            >
              <CalendarClock />
              Reprogrammer
            </Button>
            {peutSaisir ? (
              <Button type="button" onClick={() => setDialogue("resultat")}>
                <ClipboardPen />
                Saisir le résultat
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagInspection statut={inspection.statut} />
        {inspection.resultat ? (
          <TagResultat resultat={inspection.resultat} />
        ) : null}
        {dossier.enRetard ? <TagRetard libelle="Résultat en retard" /> : null}
        {inspection.zoneLope ? (
          <Tag tone="second">Parc national de la Lopé</Tag>
        ) : null}
      </div>
      <RetourOperation retour={operation.retour} />
      {peutModifier && !echue ? (
        <p className="text-small text-ink-muted">
          Le résultat se saisit à partir du {dateIso(inspection.dateProgrammee)}
          , une fois l&apos;inspection réalisée.
        </p>
      ) : null}
      {inspection.statut === "annulee" && inspection.motifAnnulation ? (
        <InlineMessage tone="info" title="Inspection annulée">
          {inspection.motifAnnulation}
        </InlineMessage>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <Panneau titre="Inspection">
          <Fiche
            elements={[
              ["Type", TYPES_INSPECTION[inspection.type]],
              ["Objet", inspection.objet],
              ["Lieu", lieuEtPk(inspection)],
              ["Gare", inspection.gareNom ?? "—"],
              [
                "Date programmée",
                <span key="d" className="tabular">
                  {dateIso(inspection.dateProgrammee)}
                </span>,
              ],
              ["Inspecteur", inspection.inspecteurNom],
              inspection.realiseeLe
                ? [
                    "Résultat saisi le",
                    <span key="r" className="tabular">
                      {dateHeureComplete(inspection.realiseeLe)}
                    </span>,
                  ]
                : null,
            ]}
          />
        </Panneau>
        <Panneau titre="Constats">
          {inspection.constats ? (
            <p className="text-[14px] whitespace-pre-line">
              {inspection.constats}
            </p>
          ) : (
            <p className="text-small text-ink-muted">
              Résultat non encore saisi.
            </p>
          )}
        </Panneau>
      </div>

      <Panneau
        titre="Non-conformités"
        sousTitre={
          inspection.nonConformites.length > 0
            ? `${inspection.nonConformites.length} relevée(s)`
            : undefined
        }
      >
        {inspection.nonConformites.length === 0 ? (
          <p className="text-small text-ink-muted">
            Aucune non-conformité relevée.
          </p>
        ) : (
          <ul className="grid divide-y divide-line">
            {inspection.nonConformites.map((nc) => {
              const action = actionDe(nc)
              return (
                <li
                  key={nc.code}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5"
                >
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <b className="tabular text-[13px]">{nc.code}</b>
                    <span className="text-[14px]">{nc.description}</span>
                  </span>
                  <TagGraviteNc gravite={nc.gravite} />
                  {action ? (
                    <LienDossier href={`/securite/actions/${action._id}`}>
                      Action {action.numero}
                    </LienDossier>
                  ) : nc.actionId ? (
                    <span className="text-small text-ink-muted">
                      Action ouverte
                    </span>
                  ) : droits.gererActions ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setNcAction(nc)}
                    >
                      <ListPlus />
                      Créer l&apos;action corrective
                    </Button>
                  ) : (
                    <Tag tone="warning">Sans action</Tag>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panneau>

      <Panneau titre="Actions correctives">
        <TableauDonnees
          libelle="Actions correctives de l'inspection"
          colonnes={colonnesActions()}
          lignes={dossier.actions}
          cle={(a) => a._id}
          lien={
            peut("registre.lire")
              ? (a) => `/securite/actions/${a._id}`
              : undefined
          }
          exportNom={`actions-${inspection.numero}`}
          triInitial={{ cle: "echeance", sens: "asc" }}
          vide={{
            titre: "Aucune action corrective",
            description:
              "Les non-conformités se traduisent en actions depuis la liste ci-dessus.",
          }}
        />
      </Panneau>

      <Panneau titre="Chronologie de l'inspection">
        <Chronologie
          evenements={chronologie(dossier.chronologie)}
          vide="Aucune action tracée."
        />
      </Panneau>

      {peutSaisir ? (
        <DialogueResultat
          inspectionId={inspection._id}
          open={dialogue === "resultat"}
          onOpenChange={(o) => setDialogue(o ? "resultat" : null)}
          onEnregistre={(n) =>
            operation.signaler({
              ton: "success",
              titre: "Résultat enregistré",
              detail: `${n} non-conformité(s) relevée(s).`,
            })
          }
        />
      ) : null}
      {peutModifier ? (
        <>
          <DialogueTexte
            open={dialogue === "reprogrammer"}
            onOpenChange={(o) => setDialogue(o ? "reprogrammer" : null)}
            titre="Reprogrammer l'inspection"
            description={`Date actuelle : ${dateIso(inspection.dateProgrammee)}.`}
            libelle="Motif du report"
            libelleValider="Reprogrammer"
            enPlus={
              <Field label="Nouvelle date" htmlFor="reprogrammer-date">
                <Input
                  id="reprogrammer-date"
                  name="date"
                  type="date"
                  required
                  min={aujourdhui()}
                  defaultValue={aujourdhui(7)}
                />
              </Field>
            }
            onValider={async (motif, d) => {
              const resultat = await reprogrammer({
                inspectionId: inspection._id,
                dateProgrammee: String(d.get("date") ?? ""),
                motif,
              })
              operation.signaler({
                ton: "success",
                titre: `Inspection reportée au ${dateIso(resultat.dateProgrammee)}`,
              })
            }}
          />
          <DialogueTexte
            open={dialogue === "annuler"}
            onOpenChange={(o) => setDialogue(o ? "annuler" : null)}
            titre="Annuler l'inspection"
            libelle="Motif de l'annulation"
            libelleValider="Annuler l'inspection"
            variante="danger"
            onValider={async (motif) => {
              await annuler({ inspectionId: inspection._id, motif })
              operation.signaler({
                ton: "success",
                titre: "Inspection annulée",
              })
            }}
          />
        </>
      ) : null}
      {droits.gererActions && ncAction ? (
        <DialogueAction
          key={ncAction.code}
          open
          onOpenChange={(o) => {
            if (!o) setNcAction(null)
          }}
          source={{
            inspectionId: inspection._id,
            nonConformiteCode: ncAction.code,
          }}
          contexte={`Non-conformité ${ncAction.code} (${GRAVITES_NC[ncAction.gravite].toLowerCase()})`}
          libelleInitial={ncAction.description}
          onCreee={(r) =>
            operation.signaler({
              ton: "success",
              titre: `Action ${r.numero} ouverte pour ${ncAction.code}`,
            })
          }
        />
      ) : null}
    </CadreSecurite>
  )
}

interface NcSaisie {
  cle: number
  description: string
  gravite: GraviteNc
}

function DialogueResultat({
  inspectionId,
  open,
  onOpenChange,
  onEnregistre,
}: {
  inspectionId: Id<"securiteInspections">
  open: boolean
  onOpenChange: (o: boolean) => void
  onEnregistre: (nonConformites: number) => void
}) {
  const enregistrer = useMutation(
    api.modules.securite.inspections.enregistrerResultat
  )
  const operation = useOperation()
  const base = useId()
  const compteur = useRef(0)
  const [resultat, setResultat] = useState<ResultatInspection>("conforme")
  const [ncs, setNcs] = useState<NcSaisie[]>([])
  const ajouter = () => {
    compteur.current += 1
    const cle = compteur.current
    setNcs((liste) => [...liste, { cle, description: "", gravite: "mineure" }])
  }
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre="Saisir le résultat de l'inspection"
      description="Une inspection conforme ne porte aucune non-conformité ; avec réserves, seulement des non-conformités mineures."
      libelleValider="Enregistrer le résultat"
      enCours={operation.enCours === "resultat"}
      erreur={
        operation.retour?.ton === "danger" ? operation.retour.detail : null
      }
      onSubmit={async (d) => {
        const retour = await operation.executer("resultat", () =>
          enregistrer({
            inspectionId,
            resultat,
            constats: String(d.get("constats") ?? ""),
            nonConformites: ncs.map(({ description, gravite }) => ({
              description,
              gravite,
            })),
          })
        )
        if (retour) {
          onOpenChange(false)
          onEnregistre(retour.nonConformites)
        }
      }}
    >
      <Field label="Résultat" htmlFor={`${base}-resultat`}>
        <SelectNative
          id={`${base}-resultat`}
          value={resultat}
          onChange={(e) => {
            const valeur = e.target.value as ResultatInspection
            setResultat(valeur)
            if (valeur !== "conforme" && ncs.length === 0) ajouter()
          }}
        >
          {Object.entries(RESULTATS_INSPECTION).map(([cle, lib]) => (
            <option key={cle} value={cle}>
              {lib}
            </option>
          ))}
        </SelectNative>
      </Field>
      <Field label="Constats" htmlFor={`${base}-constats`}>
        <Textarea id={`${base}-constats`} name="constats" rows={4} required />
      </Field>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-[14px] font-bold">Non-conformités</legend>
        {ncs.length === 0 ? (
          <p className="text-small text-ink-muted">Aucune non-conformité.</p>
        ) : null}
        <ol className="grid gap-3">
          {ncs.map((nc, index) => (
            <li
              key={nc.cle}
              className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end"
            >
              <Field
                label={`Non-conformité n° ${index + 1}`}
                htmlFor={`${base}-nc-${nc.cle}`}
              >
                <Input
                  id={`${base}-nc-${nc.cle}`}
                  required
                  value={nc.description}
                  onChange={(e) =>
                    setNcs((liste) =>
                      liste.map((x) =>
                        x.cle === nc.cle
                          ? { ...x, description: e.target.value }
                          : x
                      )
                    )
                  }
                />
              </Field>
              <Field label="Gravité" htmlFor={`${base}-nc-${nc.cle}-gravite`}>
                <SelectNative
                  id={`${base}-nc-${nc.cle}-gravite`}
                  value={nc.gravite}
                  onChange={(e) =>
                    setNcs((liste) =>
                      liste.map((x) =>
                        x.cle === nc.cle
                          ? { ...x, gravite: e.target.value as GraviteNc }
                          : x
                      )
                    )
                  }
                >
                  {Object.entries(GRAVITES_NC).map(([cle, lib]) => (
                    <option key={cle} value={cle}>
                      {lib}
                    </option>
                  ))}
                </SelectNative>
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Retirer la non-conformité n° ${index + 1}`}
                onClick={() =>
                  setNcs((liste) => liste.filter((x) => x.cle !== nc.cle))
                }
              >
                <Trash2 />
                Retirer
              </Button>
            </li>
          ))}
        </ol>
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={ajouter}>
            <Plus />
            Ajouter une non-conformité
          </Button>
        </div>
      </fieldset>
    </FenetreFormulaire>
  )
}
