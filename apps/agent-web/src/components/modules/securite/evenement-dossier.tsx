"use client"

import type { FunctionReturnType } from "convex/server"
import {
  Archive,
  CircleCheck,
  FileSearch,
  ListPlus,
  Radio,
  Send,
  ShieldCheck,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"

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
import {
  FenetreFormulaire,
  nombreSaisi,
  texte,
} from "@/components/gestion/referentiels/formulaire"
import {
  AccesRestreint,
  Chargement,
  Introuvable,
  LienDossier,
  aujourdhui,
  ajouterJoursIso,
  chronologie,
  dateIso,
  type Id,
} from "@/components/modules/rh/commun"
import { GARES } from "@/components/modules/rh/libelles"

import { colonnesActions } from "./actions"
import {
  CadreSecurite,
  TagArtf,
  TagEnquete,
  TagEvenement,
  TagGravite,
  TagRetard,
  dateHeureComplete,
  useAccesSecurite,
} from "./cadre-securite"
import { DialogueAction, DialogueTexte } from "./dialogues"
import {
  FAMILLES,
  GRAVITES,
  GRAVITES_INCIDENT,
  NATURES_ARTF,
  TYPES_EVENEMENT,
  familleDe,
  libelleType,
  lieuEtPk,
  maintenant,
  type Famille,
  type Gravite,
  type TypeEvenement,
} from "./libelles"

type Dossier = NonNullable<
  FunctionReturnType<typeof api.modules.securite.evenements.dossier>
>
type Dialogue =
  "qualifier" | "enquete" | "cloturer" | "classer" | "action" | null

const RETOUR = {
  href: "/securite/evenements",
  libelle: "Registre des événements",
}

export function DossierEvenement({ evenementId }: { evenementId: string }) {
  const { peut, acces } = useAccesSecurite()
  const lecture = peut("registre.lire")
  const dossier = useQuery(
    api.modules.securite.evenements.dossier,
    lecture ? { evenementId: evenementId as Id<"securiteEvenements"> } : "skip"
  )
  const [dialogue, setDialogue] = useState<Dialogue>(null)
  const operation = useOperation()
  const cloturer = useMutation(api.modules.securite.evenements.cloturer)
  const classer = useMutation(api.modules.securite.evenements.classer)
  const [instant] = useState(maintenant)

  if (acces && !lecture) {
    return (
      <CadreSecurite titre="Événement de sécurité" retour={RETOUR}>
        <AccesRestreint>
          Votre profil ne consulte pas le registre des événements de sécurité.
        </AccesRestreint>
      </CadreSecurite>
    )
  }
  if (dossier === undefined) {
    return (
      <CadreSecurite titre="Événement de sécurité" retour={RETOUR}>
        <Chargement libelle="Chargement du dossier" />
      </CadreSecurite>
    )
  }
  if (dossier === null) {
    return (
      <CadreSecurite titre="Dossier introuvable" retour={RETOUR}>
        <Introuvable titre="Cet événement n'existe pas" retour={RETOUR} />
      </CadreSecurite>
    )
  }

  const { evenement, obligation, enquete } = dossier
  const ouvert =
    evenement.statut === "declare" || evenement.statut === "qualifie"
  const qualifiable =
    dossier.droits.qualifier &&
    evenement.statut !== "cloture" &&
    evenement.statut !== "classe"
  const peutOuvrirEnquete = dossier.droits.qualifier && ouvert && !enquete
  const peutCloturer =
    dossier.droits.qualifier && evenement.statut === "qualifie"
  const peutClasser = dossier.droits.qualifier && ouvert && !obligation.requise
  const peutAjouterAction =
    dossier.droits.gererActions && evenement.statut !== "classe"
  const notification = dossier.declarations.find(
    (d) => d.nature === "notification_immediate"
  )
  const notificationEnRetard =
    notification &&
    (notification.statut === "a_preparer" || notification.statut === "prete") &&
    notification.echeance < instant

  return (
    <CadreSecurite
      titre={`${evenement.numero} · ${libelleType(evenement.type)}`}
      description={`${dateHeureComplete(evenement.survenuLe)} · ${lieuEtPk(evenement)}${evenement.trainNumber ? ` · train ${evenement.trainNumber}` : ""}`}
      retour={RETOUR}
      actions={
        <>
          {peutClasser ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => setDialogue("classer")}
            >
              <Archive />
              Classer sans suite
            </Button>
          ) : null}
          {peutCloturer ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDialogue("cloturer")}
            >
              <CircleCheck />
              Clôturer sans enquête
            </Button>
          ) : null}
          {qualifiable ? (
            <Button
              type="button"
              variant={evenement.statut === "declare" ? "primary" : "secondary"}
              onClick={() => setDialogue("qualifier")}
            >
              <ShieldCheck />
              {evenement.statut === "declare" ? "Qualifier" : "Requalifier"}
            </Button>
          ) : null}
          {peutOuvrirEnquete ? (
            <Button
              type="button"
              variant={evenement.statut === "declare" ? "secondary" : "primary"}
              onClick={() => setDialogue("enquete")}
            >
              <FileSearch />
              Ouvrir une enquête
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagEvenement statut={evenement.statut} />
        <TagGravite gravite={evenement.gravite} />
        <Tag tone="neutral">{FAMILLES[familleDe(evenement.type)]}</Tag>
        {evenement.zoneLope ? (
          <Tag tone="second">Parc national de la Lopé</Tag>
        ) : null}
      </div>
      <RetourOperation retour={operation.retour} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Panneau titre="Faits">
          <Fiche
            elements={[
              [
                "Survenu le",
                <span key="s" className="tabular">
                  {dateHeureComplete(evenement.survenuLe)}
                </span>,
              ],
              [
                "Déclaré le",
                <span
                  key="d"
                  className="tabular"
                >{`${dateHeureComplete(evenement.declareLe)} · ${evenement.declarantNom}`}</span>,
              ],
              ["Lieu", lieuEtPk(evenement)],
              ["Gare", evenement.gareNom ?? "—"],
              ["Train", evenement.trainNumber ?? "—"],
              dossier.desserte
                ? [
                    "Desserte",
                    `${dossier.desserte.trainNumber} du ${dateIso(dossier.desserte.serviceDate)}`,
                  ]
                : null,
              [
                "Victimes",
                `${evenement.blesses} blessé(s) · ${evenement.deces} décès`,
              ],
              [
                "Interruption",
                evenement.interruptionMinutes !== undefined ? (
                  <span key="i" className="tabular">
                    {evenement.interruptionMinutes} min
                  </span>
                ) : (
                  "—"
                ),
              ],
              ["Dégâts", evenement.degats ?? "—"],
              evenement.qualifieLe
                ? [
                    "Qualifié",
                    `${dateHeureComplete(evenement.qualifieLe)} · ${evenement.qualifieParNom ?? ""}`,
                  ]
                : null,
              evenement.clotureLe
                ? [
                    "Clôture",
                    `${dateHeureComplete(evenement.clotureLe)} · ${evenement.clotureParNom ?? ""}`,
                  ]
                : null,
            ]}
          />
          <div className="grid gap-1 text-[14px]">
            <b>Description</b>
            <p className="whitespace-pre-line">{evenement.description}</p>
          </div>
          {evenement.mesuresImmediates ? (
            <div className="grid gap-1 text-[14px]">
              <b>Mesures immédiates</b>
              <p className="whitespace-pre-line">
                {evenement.mesuresImmediates}
              </p>
            </div>
          ) : null}
          {evenement.noteCloture ? (
            <InlineMessage
              tone="info"
              title={
                evenement.statut === "classe"
                  ? "Motif du classement"
                  : "Note de clôture"
              }
            >
              {evenement.noteCloture}
            </InlineMessage>
          ) : null}
        </Panneau>

        <div className="grid content-start gap-5">
          <Panneau titre="Obligation de déclaration ARTF" icone={Send}>
            <p className="flex flex-wrap items-center gap-2 text-[14px]">
              <Tag tone={obligation.requise ? "warning" : "neutral"}>
                {obligation.requise ? "Déclaration requise" : "Non requise"}
              </Tag>
              <span>{obligation.motif}</span>
            </p>
            {obligation.requise ? (
              <Fiche
                elements={[
                  [
                    "Délai",
                    obligation.delaiHeures
                      ? `${obligation.delaiHeures} h après la survenue`
                      : "—",
                  ],
                  notification
                    ? [
                        "Échéance",
                        <span key="e" className="tabular">
                          {dateHeureComplete(notification.echeance)}
                        </span>,
                      ]
                    : null,
                  notification
                    ? [
                        "État",
                        <span
                          key="t"
                          className="inline-flex flex-wrap justify-end gap-1"
                        >
                          <TagArtf statut={notification.statut} />
                          {notificationEnRetard ? <TagRetard /> : null}
                          {notification.transmiseLe &&
                          notification.transmiseLe > notification.echeance ? (
                            <Tag tone="danger">Hors délai</Tag>
                          ) : null}
                        </span>,
                      ]
                    : null,
                ]}
              />
            ) : null}
          </Panneau>

          <Panneau titre="Enquête" icone={FileSearch}>
            {enquete ? (
              <div className="grid gap-3">
                <p className="flex flex-wrap items-center gap-2 text-[14px]">
                  <LienDossier href={`/securite/enquetes/${enquete._id}`}>
                    {enquete.numero}
                  </LienDossier>
                  <TagEnquete statut={enquete.statut} />
                  {enquete.statut !== "cloturee" &&
                  enquete.echeanceRapport < aujourdhui() ? (
                    <TagRetard />
                  ) : null}
                </p>
                <Fiche
                  elements={[
                    ["Enquêteur", enquete.enqueteurNom],
                    [
                      "Ouverte le",
                      `${dateHeureComplete(enquete.ouverteLe)} · ${enquete.ouverteParNom}`,
                    ],
                    [
                      "Rapport attendu",
                      <span key="r" className="tabular">
                        {dateIso(enquete.echeanceRapport)}
                      </span>,
                    ],
                  ]}
                />
              </div>
            ) : (
              <p className="text-small text-ink-muted">
                Aucune enquête ouverte.
                {peutOuvrirEnquete
                  ? " Un événement grave, ou dont les causes doivent être établies, appelle une enquête."
                  : ""}
              </p>
            )}
          </Panneau>

          {dossier.incident ? (
            <Panneau titre="Incident d'exploitation source" icone={Radio}>
              <Fiche
                elements={[
                  [
                    "N°",
                    dossier.incident.numero ? (
                      <span key="n" className="tabular">
                        {dossier.incident.numero}
                      </span>
                    ) : (
                      "—"
                    ),
                  ],
                  [
                    "Remonté le",
                    <span key="r" className="tabular">
                      {dateHeureComplete(dossier.incident.reportedAt)}
                    </span>,
                  ],
                  [
                    "Gravité terrain",
                    GRAVITES_INCIDENT[dossier.incident.severity],
                  ],
                  [
                    "Suivi exploitation",
                    dossier.incident.status === "resolu"
                      ? "Résolu"
                      : dossier.incident.status === "en_cours"
                        ? "En cours"
                        : "Ouvert",
                  ],
                ]}
              />
              <p className="text-[14px] whitespace-pre-line">
                {dossier.incident.description}
              </p>
            </Panneau>
          ) : null}
        </div>
      </div>

      <Panneau
        titre="Actions correctives"
        sousTitre={
          enquete ? "Actions de l'événement et de son enquête" : undefined
        }
        actions={
          peutAjouterAction ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDialogue("action")}
            >
              <ListPlus />
              Ajouter une action corrective
            </Button>
          ) : null
        }
      >
        <TableauDonnees
          libelle="Actions correctives de l'événement"
          colonnes={colonnesActions()}
          lignes={dossier.actions}
          cle={(a) => a._id}
          lien={(a) => `/securite/actions/${a._id}`}
          exportNom={`actions-${evenement.numero}`}
          triInitial={{ cle: "echeance", sens: "asc" }}
          vide={{
            titre: "Aucune action corrective",
            description:
              "Aucune action n'est encore inscrite pour cet événement.",
          }}
        />
      </Panneau>

      <Panneau titre="Déclarations à l'ARTF" icone={Send}>
        {dossier.declarations.length === 0 ? (
          <p className="text-small text-ink-muted">
            Aucune déclaration n&apos;est rattachée à cet événement.
          </p>
        ) : (
          <ul className="grid divide-y divide-line">
            {dossier.declarations.map((d) => (
              <li
                key={d._id}
                className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2"
              >
                <span className="grid min-w-0 flex-1">
                  {peut("artf.lire") ? (
                    <LienDossier href={`/securite/artf/${d._id}`}>
                      {d.numero}
                    </LienDossier>
                  ) : (
                    <b className="tabular">{d.numero}</b>
                  )}
                  <small className="text-[12.5px] text-ink-muted">
                    {NATURES_ARTF[d.nature]} · échéance{" "}
                    <span className="tabular">
                      {dateHeureComplete(d.echeance)}
                    </span>
                  </small>
                </span>
                {(d.statut === "a_preparer" || d.statut === "prete") &&
                d.echeance < instant ? (
                  <TagRetard />
                ) : null}
                <TagArtf statut={d.statut} />
              </li>
            ))}
          </ul>
        )}
      </Panneau>

      <Panneau titre="Chronologie du dossier">
        <Chronologie
          evenements={chronologie(dossier.chronologie)}
          vide="Aucune action tracée sur ce dossier."
        />
      </Panneau>

      {qualifiable ? (
        <DialogueQualifier
          dossier={dossier}
          open={dialogue === "qualifier"}
          onOpenChange={(o) => setDialogue(o ? "qualifier" : null)}
        />
      ) : null}
      {peutOuvrirEnquete ? (
        <DialogueOuvrirEnquete
          evenementId={evenement._id}
          open={dialogue === "enquete"}
          onOpenChange={(o) => setDialogue(o ? "enquete" : null)}
        />
      ) : null}
      {peutCloturer ? (
        <DialogueTexte
          open={dialogue === "cloturer"}
          onOpenChange={(o) => setDialogue(o ? "cloturer" : null)}
          titre="Clôturer sans enquête"
          description="L'événement est qualifié et n'appelle pas d'enquête. Les déclarations ARTF en attente doivent être transmises avant la clôture."
          libelle="Note de clôture"
          libelleValider="Clôturer l'événement"
          onValider={async (note) => {
            await cloturer({ evenementId: evenement._id, note })
            operation.signaler({ ton: "success", titre: "Événement clôturé" })
          }}
        />
      ) : null}
      {peutClasser ? (
        <DialogueTexte
          open={dialogue === "classer"}
          onOpenChange={(o) => setDialogue(o ? "classer" : null)}
          titre="Classer sans suite"
          description="Réservé aux signalements sans portée de sécurité (fausse alerte, doublon). Le motif est conservé au dossier."
          libelle="Motif du classement"
          libelleValider="Classer sans suite"
          variante="danger"
          onValider={async (motif) => {
            await classer({ evenementId: evenement._id, motif })
            operation.signaler({
              ton: "success",
              titre: "Événement classé sans suite",
            })
          }}
        />
      ) : null}
      {peutAjouterAction ? (
        <DialogueAction
          open={dialogue === "action"}
          onOpenChange={(o) => setDialogue(o ? "action" : null)}
          source={
            enquete
              ? { enqueteId: enquete._id }
              : { evenementId: evenement._id }
          }
          contexte={
            enquete
              ? `Rattachée à l'enquête ${enquete.numero}`
              : `Rattachée à l'événement ${evenement.numero}`
          }
          onCreee={(r) =>
            operation.signaler({
              ton: "success",
              titre: `Action ${r.numero} inscrite au plan`,
            })
          }
        />
      ) : null}
    </CadreSecurite>
  )
}

/* ═════════════════════════════ Dialogues ════════════════════════════════ */

function DialogueQualifier({
  dossier,
  open,
  onOpenChange,
}: {
  dossier: Dossier
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qualifier = useMutation(api.modules.securite.evenements.qualifier)
  const operation = useOperation()
  const base = useId()
  const { evenement } = dossier
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre={
        evenement.statut === "declare"
          ? "Qualifier l'événement"
          : "Requalifier l'événement"
      }
      description="Le type, la gravité et les victimes déterminent l'obligation de déclaration à l'ARTF ; elle est recalculée à l'enregistrement."
      libelleValider={
        <>
          <ShieldCheck />
          Enregistrer la qualification
        </>
      }
      enCours={operation.enCours === "qualifier"}
      erreur={
        operation.retour?.ton === "danger" ? operation.retour.detail : null
      }
      onSubmit={async (d) => {
        const resultat = await operation.executer("qualifier", () =>
          qualifier({
            evenementId: evenement._id,
            type: String(d.get("type")) as TypeEvenement,
            gravite: String(d.get("gravite")) as Gravite,
            blesses: nombreSaisi(d, "blesses") ?? 0,
            deces: nombreSaisi(d, "deces") ?? 0,
            gareCode: texte(d, "gareCode"),
            pk: nombreSaisi(d, "pk"),
            lieu: texte(d, "lieu"),
            note: texte(d, "note"),
          })
        )
        if (resultat) onOpenChange(false)
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type d'événement" htmlFor={`${base}-type`}>
          <SelectNative
            id={`${base}-type`}
            name="type"
            defaultValue={evenement.type}
          >
            {(Object.keys(FAMILLES) as Famille[]).map((f) => (
              <optgroup key={f} label={FAMILLES[f]}>
                {(Object.keys(TYPES_EVENEMENT) as TypeEvenement[])
                  .filter((t) => familleDe(t) === f)
                  .map((t) => (
                    <option key={t} value={t}>
                      {libelleType(t)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </SelectNative>
        </Field>
        <Field label="Gravité" htmlFor={`${base}-gravite`}>
          <SelectNative
            id={`${base}-gravite`}
            name="gravite"
            defaultValue={evenement.gravite}
          >
            {(Object.keys(GRAVITES) as Gravite[]).map((g) => (
              <option key={g} value={g}>
                {GRAVITES[g]}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Blessés" htmlFor={`${base}-blesses`}>
          <Input
            id={`${base}-blesses`}
            name="blesses"
            type="number"
            min={0}
            max={1000}
            defaultValue={evenement.blesses}
            inputMode="numeric"
          />
        </Field>
        <Field label="Décès" htmlFor={`${base}-deces`}>
          <Input
            id={`${base}-deces`}
            name="deces"
            type="number"
            min={0}
            max={1000}
            defaultValue={evenement.deces}
            inputMode="numeric"
          />
        </Field>
        <Field
          label="Gare"
          htmlFor={`${base}-gare`}
          hint="Laisser vide conserve la localisation actuelle."
        >
          <SelectNative
            id={`${base}-gare`}
            name="gareCode"
            defaultValue={evenement.gareCode ?? ""}
          >
            <option value="">— Inchangée —</option>
            {GARES.map(([code, nom]) => (
              <option key={code} value={code}>
                {nom}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Point kilométrique" htmlFor={`${base}-pk`}>
          <Input
            id={`${base}-pk`}
            name="pk"
            inputMode="decimal"
            defaultValue={
              evenement.pk !== undefined
                ? String(evenement.pk).replace(".", ",")
                : ""
            }
            autoComplete="off"
          />
        </Field>
        <Field label="Lieu" htmlFor={`${base}-lieu`} className="sm:col-span-2">
          <Input
            id={`${base}-lieu`}
            name="lieu"
            defaultValue={evenement.lieu}
            autoComplete="off"
          />
        </Field>
      </div>
      <Field
        label="Note de qualification"
        htmlFor={`${base}-note`}
        hint="Facultative ; elle figure à la chronologie."
      >
        <Textarea id={`${base}-note`} name="note" rows={3} />
      </Field>
    </FenetreFormulaire>
  )
}

function DialogueOuvrirEnquete({
  evenementId,
  open,
  onOpenChange,
}: {
  evenementId: Id<"securiteEvenements">
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const enqueteurs = useQuery(
    api.modules.securite.evenements.enqueteursPossibles,
    open ? {} : "skip"
  )
  const ouvrir = useMutation(api.modules.securite.evenements.ouvrirEnquete)
  const operation = useOperation()
  const base = useId()
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre="Ouvrir une enquête"
      description="L'enquêteur désigné instruit le rapport ; la clôture revient à un autre inspecteur (séparation des tâches)."
      libelleValider={
        <>
          <FileSearch />
          Ouvrir l&apos;enquête
        </>
      }
      enCours={operation.enCours === "enquete"}
      erreur={
        operation.retour?.ton === "danger" ? operation.retour.detail : null
      }
      onSubmit={async (d) => {
        const resultat = await operation.executer("enquete", () =>
          ouvrir({
            evenementId,
            enqueteurId: String(d.get("enqueteur")) as Id<"users">,
            echeanceRapport: texte(d, "echeance"),
          })
        )
        if (resultat) {
          onOpenChange(false)
          router.push(`/securite/enquetes/${resultat.enqueteId}`)
        }
      }}
    >
      <Field label="Enquêteur désigné" htmlFor={`${base}-enqueteur`}>
        {enqueteurs === undefined ? (
          <p role="status" className="text-small text-ink-muted">
            Chargement des enquêteurs…
          </p>
        ) : enqueteurs.length === 0 ? (
          <p className="text-small text-ink-muted">
            Aucun enquêteur accidents ni inspecteur sécurité actif.
          </p>
        ) : (
          <SelectNative id={`${base}-enqueteur`} name="enqueteur" required>
            {enqueteurs.map((e) => (
              <option key={e._id} value={e._id}>
                {e.nom} ·{" "}
                {e.role === "enqueteur_accidents"
                  ? "Enquêteur accidents"
                  : "Inspecteur sécurité"}
              </option>
            ))}
          </SelectNative>
        )}
      </Field>
      <Field
        label="Rapport attendu le"
        htmlFor={`${base}-echeance`}
        hint="Soixante jours par défaut."
      >
        <Input
          id={`${base}-echeance`}
          name="echeance"
          type="date"
          required
          min={ajouterJoursIso(aujourdhui(), 1)}
          defaultValue={aujourdhui(60)}
        />
      </Field>
    </FenetreFormulaire>
  )
}
