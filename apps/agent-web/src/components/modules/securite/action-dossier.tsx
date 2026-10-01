"use client"

import type { FunctionReturnType } from "convex/server"
import { BadgeCheck, CalendarClock, CircleX, TrendingUp } from "lucide-react"
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

import { Chronologie, Fiche, Panneau } from "@/components/charte"
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
  chronologie,
  dateIso,
  type Id,
} from "@/components/modules/rh/commun"

import {
  Avancement,
  CadreSecurite,
  TagAction,
  TagRetard,
  dateHeureComplete,
  useAccesSecurite,
} from "./cadre-securite"
import { DialogueTexte } from "./dialogues"
import { DIRECTIONS_RESPONSABLES, PRIORITES } from "./libelles"

type Dossier = NonNullable<
  FunctionReturnType<typeof api.modules.securite.actions.dossier>
>
type Dialogue = "avancer" | "verifier" | "replanifier" | "annuler" | null

const RETOUR = {
  href: "/securite/actions",
  libelle: "Plan d'actions correctives",
}

const CHEMINS_SOURCE = {
  enquete: "enquetes",
  inspection: "inspections",
  evenement: "evenements",
} as const
const NATURES_SOURCE = {
  enquete: "Enquête",
  inspection: "Inspection",
  evenement: "Événement",
} as const

export function DossierAction({ actionId }: { actionId: string }) {
  const { peut, acces } = useAccesSecurite()
  const lecture = peut("registre.lire")
  const dossier = useQuery(
    api.modules.securite.actions.dossier,
    lecture ? { actionId: actionId as Id<"securiteActions"> } : "skip"
  )
  const replanifier = useMutation(api.modules.securite.actions.replanifier)
  const annuler = useMutation(api.modules.securite.actions.annuler)
  const operation = useOperation()
  const [dialogue, setDialogue] = useState<Dialogue>(null)

  if (acces && !lecture) {
    return (
      <CadreSecurite titre="Action corrective" retour={RETOUR}>
        <AccesRestreint>
          Votre profil ne consulte pas le plan d&apos;actions correctives.
        </AccesRestreint>
      </CadreSecurite>
    )
  }
  if (dossier === undefined) {
    return (
      <CadreSecurite titre="Action corrective" retour={RETOUR}>
        <Chargement libelle="Chargement de l'action" />
      </CadreSecurite>
    )
  }
  if (dossier === null) {
    return (
      <CadreSecurite titre="Action introuvable" retour={RETOUR}>
        <Introuvable titre="Cette action n'existe pas" retour={RETOUR} />
      </CadreSecurite>
    )
  }

  const { action, source, droits } = dossier
  const enCours = action.statut === "planifiee" || action.statut === "en_cours"
  const peutAvancer = droits.gerer && enCours
  const peutVerifier = droits.verifier && action.statut === "realisee"
  const peutAnnuler =
    droits.gerer && action.statut !== "verifiee" && action.statut !== "annulee"

  return (
    <CadreSecurite
      titre={`Action ${action.numero}`}
      description={action.libelle}
      retour={RETOUR}
      actions={
        <>
          {peutAnnuler ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => setDialogue("annuler")}
            >
              <CircleX />
              Annuler l&apos;action
            </Button>
          ) : null}
          {peutAvancer ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDialogue("replanifier")}
              >
                <CalendarClock />
                Replanifier
              </Button>
              <Button type="button" onClick={() => setDialogue("avancer")}>
                <TrendingUp />
                Mettre à jour l&apos;avancement
              </Button>
            </>
          ) : null}
          {peutVerifier ? (
            <Button type="button" onClick={() => setDialogue("verifier")}>
              <BadgeCheck />
              Vérifier l&apos;efficacité
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagAction statut={action.statut} />
        {dossier.enRetard ? <TagRetard /> : null}
        {action.priorite === "haute" ? (
          <Tag tone="warning">Priorité haute</Tag>
        ) : null}
      </div>
      <RetourOperation retour={operation.retour} />
      {action.statut === "annulee" && action.motifAnnulation ? (
        <InlineMessage tone="info" title="Action annulée">
          {action.motifAnnulation}
        </InlineMessage>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <Panneau titre="Action">
          <Fiche
            elements={[
              ["Libellé", action.libelle],
              [
                "Source",
                source ? (
                  <LienDossier
                    key="s"
                    href={`/securite/${CHEMINS_SOURCE[source.nature]}/${source.id}`}
                  >
                    {NATURES_SOURCE[source.nature]} {source.numero}
                  </LienDossier>
                ) : (
                  "—"
                ),
              ],
              source && source.nature === "enquete" && source.evenementId
                ? [
                    "Événement",
                    <LienDossier
                      key="e"
                      href={`/securite/evenements/${source.evenementId}`}
                    >
                      Dossier de l&apos;événement
                    </LienDossier>,
                  ]
                : null,
              ["Responsable", action.responsableNom],
              [
                "Direction",
                `${action.responsableDirection} · ${DIRECTIONS_RESPONSABLES[action.responsableDirection]}`,
              ],
              ["Priorité", PRIORITES[action.priorite]],
              [
                "Échéance",
                <span key="e" className="tabular">
                  {dateIso(action.echeance)}
                </span>,
              ],
              [
                "Inscrite le",
                <span key="c" className="tabular">
                  {dateHeureComplete(action.createdAt)}
                </span>,
              ],
            ]}
          />
        </Panneau>
        <Panneau titre="Avancement et preuve">
          <Avancement valeur={action.avancement} />
          <Fiche
            elements={[
              ["Commentaire", action.commentaire ?? "—"],
              ["Preuve de réalisation", action.preuve ?? "—"],
              action.realiseeLe
                ? [
                    "Réalisée le",
                    <span key="r" className="tabular">
                      {dateHeureComplete(action.realiseeLe)}
                    </span>,
                  ]
                : null,
              action.verifieeLe
                ? [
                    "Vérifiée le",
                    <span
                      key="v"
                      className="tabular"
                    >{`${dateHeureComplete(action.verifieeLe)} · ${action.verifieeParNom ?? ""}`}</span>,
                  ]
                : null,
            ]}
          />
          {action.statut === "realisee" && !droits.verifier ? (
            <p className="text-small text-ink-muted">
              Réalisée : l&apos;efficacité doit être vérifiée par
              l&apos;inspection sécurité ou l&apos;audit des risques.
            </p>
          ) : null}
        </Panneau>
      </div>

      <Panneau titre="Chronologie de l'action">
        <Chronologie
          evenements={chronologie(dossier.chronologie)}
          vide="Aucune action tracée."
        />
      </Panneau>

      {peutAvancer ? (
        <DialogueAvancement
          dossier={dossier}
          open={dialogue === "avancer"}
          onOpenChange={(o) => setDialogue(o ? "avancer" : null)}
        />
      ) : null}
      {peutVerifier ? (
        <DialogueVerification
          actionId={action._id}
          open={dialogue === "verifier"}
          onOpenChange={(o) => setDialogue(o ? "verifier" : null)}
        />
      ) : null}
      {peutAvancer ? (
        <DialogueTexte
          open={dialogue === "replanifier"}
          onOpenChange={(o) => setDialogue(o ? "replanifier" : null)}
          titre="Replanifier l'action"
          description={`Échéance actuelle : ${dateIso(action.echeance)}. Le report et son motif sont tracés.`}
          libelle="Motif du report"
          libelleValider={
            <>
              <CalendarClock />
              Reporter
            </>
          }
          enPlus={
            <Field label="Nouvelle échéance" htmlFor="replanifier-echeance">
              <Input
                id="replanifier-echeance"
                name="echeance"
                type="date"
                required
                min={aujourdhui()}
                defaultValue={
                  action.echeance < aujourdhui()
                    ? aujourdhui(15)
                    : action.echeance
                }
              />
            </Field>
          }
          onValider={async (motif, d) => {
            const resultat = await replanifier({
              actionId: action._id,
              echeance: String(d.get("echeance") ?? ""),
              motif,
            })
            operation.signaler({
              ton: "success",
              titre: `Échéance reportée au ${dateIso(resultat.echeance)}`,
            })
          }}
        />
      ) : null}
      {peutAnnuler ? (
        <DialogueTexte
          open={dialogue === "annuler"}
          onOpenChange={(o) => setDialogue(o ? "annuler" : null)}
          titre="Annuler l'action"
          description="Une action annulée sort du plan ; le motif est conservé."
          libelle="Motif de l'annulation"
          libelleValider="Annuler l'action"
          variante="danger"
          onValider={async (motif) => {
            await annuler({ actionId: action._id, motif })
            operation.signaler({ ton: "success", titre: "Action annulée" })
          }}
        />
      ) : null}
    </CadreSecurite>
  )
}

function DialogueAvancement({
  dossier,
  open,
  onOpenChange,
}: {
  dossier: Dossier
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const mettreAJour = useMutation(api.modules.securite.actions.mettreAJour)
  const operation = useOperation()
  const base = useId()
  const [statut, setStatut] = useState<"en_cours" | "realisee">("en_cours")
  const { action } = dossier
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre="Mettre à jour l'avancement"
      description="Une action déclarée réalisée est avancée à 100 % et porte sa preuve ; son efficacité sera ensuite vérifiée."
      libelleValider="Enregistrer"
      enCours={operation.enCours === "avancer"}
      erreur={
        operation.retour?.ton === "danger" ? operation.retour.detail : null
      }
      onSubmit={async (d) => {
        const resultat = await operation.executer("avancer", () =>
          mettreAJour({
            actionId: action._id,
            statut,
            avancement:
              statut === "realisee"
                ? 100
                : (nombreSaisi(d, "avancement") ?? action.avancement),
            commentaire: texte(d, "commentaire"),
            preuve: texte(d, "preuve"),
          })
        )
        if (resultat) onOpenChange(false)
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="État" htmlFor={`${base}-statut`}>
          <SelectNative
            id={`${base}-statut`}
            value={statut}
            onChange={(e) =>
              setStatut(e.target.value as "en_cours" | "realisee")
            }
          >
            <option value="en_cours">En cours</option>
            <option value="realisee">Réalisée</option>
          </SelectNative>
        </Field>
        {statut === "en_cours" ? (
          <Field label="Avancement (%)" htmlFor={`${base}-avancement`}>
            <Input
              id={`${base}-avancement`}
              name="avancement"
              type="number"
              min={0}
              max={99}
              required
              defaultValue={Math.min(99, action.avancement)}
              inputMode="numeric"
            />
          </Field>
        ) : (
          <p className="text-small self-end pb-3 text-ink-muted">
            Avancement porté à 100 %.
          </p>
        )}
      </div>
      <Field label="Commentaire" htmlFor={`${base}-commentaire`}>
        <Textarea id={`${base}-commentaire`} name="commentaire" rows={3} />
      </Field>
      {statut === "realisee" ? (
        <Field
          label="Preuve de réalisation"
          htmlFor={`${base}-preuve`}
          hint="Procès-verbal, photo, attestation, référence du document en GED…"
        >
          <Textarea
            id={`${base}-preuve`}
            name="preuve"
            rows={3}
            required
            defaultValue={action.preuve}
          />
        </Field>
      ) : null}
    </FenetreFormulaire>
  )
}

function DialogueVerification({
  actionId,
  open,
  onOpenChange,
}: {
  actionId: Id<"securiteActions">
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const verifier = useMutation(api.modules.securite.actions.verifier)
  const operation = useOperation()
  const base = useId()
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre="Vérifier l'efficacité"
      description="Efficace : l'action est soldée. Insuffisante : elle est rouverte à 75 % pour être complétée."
      libelleValider={
        <>
          <BadgeCheck />
          Enregistrer la vérification
        </>
      }
      enCours={operation.enCours === "verifier"}
      erreur={
        operation.retour?.ton === "danger" ? operation.retour.detail : null
      }
      onSubmit={async (d) => {
        const resultat = await operation.executer("verifier", () =>
          verifier({
            actionId,
            efficace: String(d.get("efficace")) === "oui",
            commentaire: String(d.get("commentaire") ?? ""),
          })
        )
        if (resultat) onOpenChange(false)
      }}
    >
      <Field label="L'action est-elle efficace ?" htmlFor={`${base}-efficace`}>
        <SelectNative
          id={`${base}-efficace`}
          name="efficace"
          defaultValue="oui"
        >
          <option value="oui">Oui, efficace : solder l&apos;action</option>
          <option value="non">Non, insuffisante : rouvrir l&apos;action</option>
        </SelectNative>
      </Field>
      <Field label="Constat de vérification" htmlFor={`${base}-commentaire`}>
        <Textarea
          id={`${base}-commentaire`}
          name="commentaire"
          rows={4}
          required
        />
      </Field>
    </FenetreFormulaire>
  )
}
