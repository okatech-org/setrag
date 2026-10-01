"use client"

import { CalendarClock, FileClock, Pause, Play, Settings2 } from "lucide-react"
import type { FunctionReturnType } from "convex/server"
import { useState, type FormEvent, type ReactNode } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"

import {
  CelluleDouble,
  EnTetePage,
  Fiche,
  Indicateur,
  Indicateurs,
  Panneau,
  TableauDonnees,
  type ColonneTableau,
} from "@/components/charte"
import { CadrePilotage, messageLectureSeule, usePilotage } from "@/components/gestion/pilotage/cadre"
import { ListeEtDossier, useExecution } from "@/components/gestion/pilotage/elements"
import { horodatage, jourNumerique, nombre } from "@/components/gestion/pilotage/format"
import {
  DossierExecution,
  LIBELLE_FORMAT,
  LIBELLE_FREQUENCE,
  LIBELLE_PROGRAMMATION,
  RAPPORTS,
  TYPES_RAPPORT,
  TagExecution,
  libelleDeclencheur,
  type RunId,
  type TypeProgrammation,
} from "@/components/gestion/pilotage/rapports-communs"

/** En-tête de dossier avec retour à la liste des rapports. */
function Cadre({ titre, lectureSeule, children }: { titre: string; lectureSeule?: string | false; children: ReactNode }) {
  return (
    <CadrePilotage titre={titre} lectureSeule={lectureSeule}>
      <EnTetePage retour={{ href: "/gestion/rapports", libelle: "Retour aux rapports" }} surtitre="Rapport programmé" titre={titre} />
      {children}
    </CadrePilotage>
  )
}

type Execution = FunctionReturnType<typeof api.functions.pilotage.executionsRapport>[number]

/**
 * Dossier d’un rapport programmé : paramètres, exécution immédiate,
 * suspension, historique des exécutions et téléchargement des fichiers.
 */
export function ReportScheduleDetail({ scheduleId }: { scheduleId: string }) {
  const pilotage = usePilotage()
  const schedule = useQuery(api.functions.reportSchedules.get, { scheduleId: scheduleId as never })
  const executions = useQuery(api.functions.pilotage.executionsRapport, schedule ? { scheduleId: schedule._id, limit: 50 } : "skip")
  const updateSchedule = useMutation(api.functions.reportSchedules.update)
  const setActive = useMutation(api.functions.reportSchedules.setActive)
  const runNow = useMutation(api.functions.reportSchedules.runNow)
  const execution = useExecution()
  const [choisie, setChoisie] = useState<RunId | null>(null)

  const peutModifier = pilotage.peut("rapports", "modifier")
  const peutExecuter = pilotage.peut("rapports", "creer")

  async function enregistrer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await execution.executer(
      "enregistrer",
      () =>
        updateSchedule({
          scheduleId: scheduleId as never,
          label: String(data.get("label") ?? ""),
          reportType: String(data.get("reportType")) as TypeProgrammation,
          frequency: String(data.get("frequency")) as "quotidien" | "hebdomadaire" | "mensuel",
          format: String(data.get("format")) as "csv" | "xlsx" | "pdf",
          recipients: String(data.get("recipients") ?? "")
            .split(/[,\n;]/)
            .map((recipient) => recipient.trim())
            .filter(Boolean),
        }),
      () => "La programmation a été mise à jour."
    )
  }

  if (schedule === undefined) {
    return (
      <Cadre titre="Rapport programmé">
        <SkeletonLines />
      </Cadre>
    )
  }

  if (schedule === null) {
    return (
      <Cadre titre="Programmation introuvable">
        <EmptyState title="Cette programmation n’existe plus." description="Elle a pu être supprimée d’un environnement de test." />
      </Cadre>
    )
  }

  const derniere = executions?.find((e) => e.status === "produit")
  const colonnes: ColonneTableau<Execution>[] = [
    { cle: "etat", libelle: "État", rendu: (e) => <TagExecution statut={e.status} />, tri: (e) => e.status },
    { cle: "periode", libelle: "Période", rendu: (e) => <span className="tabular">{`${jourNumerique(e.from)} → ${jourNumerique(e.to)}`}</span>, tri: (e) => e.from },
    { cle: "lignes", libelle: "Lignes", numerique: true, rendu: (e) => nombre(e.rowCount), tri: (e) => e.rowCount },
    { cle: "envoi", libelle: "Envoi", secondaire: true, rendu: (e) => e.delivery?.message ?? "—", tri: (e) => e.delivery?.status ?? "" },
    { cle: "le", libelle: "Le", rendu: (e) => <CelluleDouble haut={horodatage(e.requestedAt)} bas={libelleDeclencheur(e.trigger)} />, tri: (e) => e.requestedAt, export: (e) => horodatage(e.requestedAt) },
  ]

  return (
    <Cadre
      titre={schedule.label}
      lectureSeule={pilotage.pret && pilotage.enLigne && !peutExecuter && !peutModifier ? messageLectureSeule(pilotage.role, "ce rapport") : false}
    >
      {execution.retour}

      <Indicateurs colonnes={4}>
        <Indicateur icone={CalendarClock} libelle="État" valeur={schedule.isActive ? "Active" : "Suspendue"} evolution={{ sens: "neutre", texte: LIBELLE_FREQUENCE[schedule.frequency] ?? schedule.frequency }} />
        <Indicateur libelle="Prochaine exécution" valeur={<span className="tabular text-[22px]">{schedule.isActive ? horodatage(schedule.nextRunAt) : "—"}</span>} />
        <Indicateur libelle="Dernière exécution" valeur={<span className="tabular text-[22px]">{horodatage(schedule.lastRunAt)}</span>} />
        <Indicateur icone={FileClock} libelle="Exécutions conservées" valeur={executions ? nombre(executions.length) : "—"} evolution={derniere ? { sens: "neutre", texte: `dernier fichier : ${nombre(derniere.rowCount)} lignes` } : undefined} />
      </Indicateurs>

      <div className="flex flex-wrap gap-2">
        {peutExecuter ? (
          <Button
            type="button"
            loading={execution.enCours === "maintenant"}
            loadingLabel="Lancement…"
            onClick={() =>
              execution.executer(
                "maintenant",
                () => runNow({ scheduleId: schedule._id }),
                (r) => {
                  setChoisie(r.runId)
                  return "Exécution lancée : le fichier est produit puis envoyé aux destinataires."
                }
              )
            }
          >
            <Play />
            Exécuter maintenant
          </Button>
        ) : null}
        {peutModifier ? (
          <Button
            type="button"
            variant="secondary"
            loading={execution.enCours === "actif"}
            onClick={() =>
              execution.executer(
                "actif",
                () => setActive({ scheduleId: schedule._id, isActive: !schedule.isActive }),
                () => (schedule.isActive ? "La programmation est suspendue." : "La programmation est réactivée.")
              )
            }
          >
            {schedule.isActive ? <Pause /> : <Play />}
            {schedule.isActive ? "Suspendre" : "Réactiver"}
          </Button>
        ) : null}
      </div>

      <ListeEtDossier
        liste={
          <>
            <Panneau titre="Historique des exécutions" icone={FileClock}>
              <TableauDonnees
                colonnes={colonnes}
                lignes={executions}
                cle={(e) => e._id}
                libelle="Exécutions de la programmation"
                surLigne={(e) => setChoisie(e._id === choisie ? null : e._id)}
                selection={choisie ?? ""}
                exportNom={`setrag-executions-${schedule._id}`}
                parPage={10}
                triInitial={{ cle: "le", sens: "desc" }}
                vide={{ titre: "Jamais exécuté", description: "La première exécution aura lieu à la date prévue, ou tout de suite avec « Exécuter maintenant »." }}
              />
            </Panneau>
            <Panneau titre="Paramètres" icone={Settings2}>
              <Fiche
                elements={[
                  ["État produit", LIBELLE_PROGRAMMATION[schedule.reportType]],
                  ["Période couverte", schedule.frequency === "quotidien" ? "La veille" : schedule.frequency === "hebdomadaire" ? "Les 7 jours précédents" : "Les 30 jours précédents"],
                  ["Format", LIBELLE_FORMAT[schedule.format] ?? schedule.format],
                  ["Destinataires", schedule.recipients.join(", ")],
                ]}
              />
              {peutModifier ? (
                <form className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2" onSubmit={enregistrer}>
                  <Field label="Nom" className="sm:col-span-2">
                    <Input name="label" defaultValue={schedule.label} required />
                  </Field>
                  <Field label="État">
                    <SelectNative name="reportType" defaultValue={schedule.reportType}>
                      {TYPES_RAPPORT.map((t) => (
                        <option key={t} value={t}>
                          {RAPPORTS[t].titre}
                        </option>
                      ))}
                      {TYPES_RAPPORT.includes(schedule.reportType as never) ? null : (
                        <option value={schedule.reportType}>{LIBELLE_PROGRAMMATION[schedule.reportType]}</option>
                      )}
                    </SelectNative>
                  </Field>
                  <Field label="Fréquence">
                    <SelectNative name="frequency" defaultValue={schedule.frequency}>
                      <option value="quotidien">Quotidienne</option>
                      <option value="hebdomadaire">Hebdomadaire</option>
                      <option value="mensuel">Mensuelle</option>
                    </SelectNative>
                  </Field>
                  <Field label="Format">
                    <SelectNative name="format" defaultValue={schedule.format}>
                      {Object.entries(LIBELLE_FORMAT).map(([valeur, libelle]) => (
                        <option key={valeur} value={valeur}>
                          {libelle}
                        </option>
                      ))}
                    </SelectNative>
                  </Field>
                  <Field label="Destinataires" hint="Séparez les adresses par une virgule." className="sm:col-span-2">
                    <Textarea name="recipients" rows={2} defaultValue={schedule.recipients.join(", ")} required />
                  </Field>
                  <div className="sm:col-span-2">
                    <Button type="submit" variant="secondary" loading={execution.enCours === "enregistrer"}>
                      Enregistrer les modifications
                    </Button>
                  </div>
                </form>
              ) : (
                <InlineMessage tone="info" title="Consultation seule : votre rôle ne permet pas de modifier cette programmation." />
              )}
            </Panneau>
          </>
        }
        dossier={
          choisie ?? derniere?._id ? (
            <DossierExecution runId={(choisie ?? derniere!._id) as RunId} surFermeture={choisie ? () => setChoisie(null) : undefined} />
          ) : (
            <Panneau titre="Dernier fichier" icone={FileClock}>
              <p className="text-small text-ink-muted">Aucun fichier produit pour l’instant.</p>
              {schedule.isActive ? <Tag tone="info">Prochaine exécution le {horodatage(schedule.nextRunAt)}</Tag> : null}
            </Panneau>
          )
        }
      />
    </Cadre>
  )
}
