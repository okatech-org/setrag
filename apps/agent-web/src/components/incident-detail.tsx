"use client"

import type { FunctionReturnType } from "convex/server"
import { Check, History, Image as ImageIcon, RotateCcw, TriangleAlert, Wrench } from "lucide-react"
import { useState, type ReactNode } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { Chronologie, Fiche, Panneau, type EvenementChronologie } from "@/components/charte"
import { useDroitsGestion } from "./gestion/referentiels/droits"
import { DateFiltre, RetourOperation, useOperation } from "./gestion/referentiels/elements"
import { agent, aujourdhuiService, dateHeure, dateService, heure, jourMois, libelleDesserte } from "./gestion/referentiels/format"
import { FenetreFormulaire, texte } from "./gestion/referentiels/formulaire"
import { evenementsHistorique } from "./gestion/referentiels/libelles-audit"
import { GRAVITES, TagGravite, TagIncident } from "./gestion/referentiels/statuts"
import { ManagementDetailShell } from "./management-detail-shell"

export type DossierIncident = NonNullable<FunctionReturnType<typeof api.functions.referentiels.incident>>

export const CATEGORIES_INCIDENT = {
  technique: "Technique",
  securite: "Sécurité",
  comportement: "Comportement",
  medical: "Médical",
  autre: "Autre",
} as const

export const CAUSES_INCIDENT = {
  materiel: "Matériel roulant",
  infrastructure: "Voie et infrastructure",
  exploitation: "Exploitation",
  tiers: "Fait d'un tiers",
  voyageur: "Fait d'un voyageur",
  meteo: "Conditions météo",
  autre: "Autre cause",
} as const

/** Chronologie d'un incident : sa déclaration, puis chaque action tracée. */
export function chronologieIncident(dossier: DossierIncident): EvenementChronologie[] {
  const { incident } = dossier
  const traces = evenementsHistorique(dossier.historique)
  const declare = dossier.historique.some((h) => h.action === "incident.declarer")
  return declare
    ? traces
    : [
        ...traces,
        {
          cle: "declaration",
          heure: jourMois(incident.reportedAt),
          titre: incident.offline ? "Signalé depuis le terminal (hors ligne)" : "Signalé depuis le terminal",
          detail: `${heure(incident.reportedAt)} · ${agent(dossier.declarant)}`,
        },
      ]
}

export function FicheIncident({ dossier }: { dossier: DossierIncident }) {
  const { incident } = dossier
  return (
    <Fiche
      elements={[
        ["Nature", CATEGORIES_INCIDENT[incident.category]],
        ["Train", dossier.desserte ? `${libelleDesserte(dossier.desserte)} · ${dateService(dossier.desserte.serviceDate)}` : "Hors desserte"],
        ["Lieu", incident.location ?? dossier.station?.name ?? "Non précisé"],
        ["Signalé par", agent(dossier.declarant)],
        ["Signalé le", <span key="s" className="tabular">{dateHeure(incident.reportedAt)}</span>],
        ["Gravité", <TagGravite key="g" severity={incident.severity} />],
        incident.closureCause ? ["Cause", CAUSES_INCIDENT[incident.closureCause]] : null,
        incident.resolvedAt ? ["Clos par", `${agent(dossier.resolveur)} · ${dateHeure(incident.resolvedAt)}`] : null,
      ]}
    />
  )
}

/**
 * Actions sur un incident : prise en charge, clôture avec cause, réouverture.
 * La clôture est la décision attendue : c'est le bouton principal.
 */
export function useActionsIncident(dossier: DossierIncident | null | undefined) {
  const droits = useDroitsGestion()
  const operation = useOperation()
  const changer = useMutation(api.functions.control.setIncidentStatus)
  const clore = useMutation(api.functions.referentiels.cloreIncident)
  const [mode, setMode] = useState<"prise" | "rouvrir" | null>(null)
  const peut = droits.may("incidents", "modifier") && Boolean(dossier)
  const status = dossier?.incident.status

  const formulaireCloture = dossier && peut && status !== "resolu" ? (
    <form
      className="grid gap-3"
      onSubmit={async (event) => {
        event.preventDefault()
        const donnees = new FormData(event.currentTarget)
        const formulaire = event.currentTarget
        const ok = await operation.executer(
          "clore",
          () => clore({ incidentId: dossier.incident._id, cause: String(donnees.get("cause")) as keyof typeof CAUSES_INCIDENT, note: String(donnees.get("note") ?? "") }).then(() => true),
          `${dossier.reference} clos.`
        )
        if (ok) formulaire.reset()
      }}
    >
      <Field label="Cause" hint="À renseigner pour clore." htmlFor={`cause-${dossier.incident._id}`}>
        <SelectNative id={`cause-${dossier.incident._id}`} name="cause" defaultValue="" required>
          <option value="" disabled>
            Choisir la cause
          </option>
          {Object.entries(CAUSES_INCIDENT).map(([valeur, libelle]) => (
            <option key={valeur} value={valeur}>
              {libelle}
            </option>
          ))}
        </SelectNative>
      </Field>
      <Field label="Note de clôture" htmlFor={`note-${dossier.incident._id}`}>
        <Textarea id={`note-${dossier.incident._id}`} name="note" required minLength={3} placeholder="Terminal de relève remis en gare de Ndjolé." className="min-h-20" />
      </Field>
      <Button type="submit" block loading={operation.enCours === "clore"} loadingLabel="Clôture…">
        <Check />
        Clore l’incident
      </Button>
    </form>
  ) : null

  const boutons: ReactNode =
    dossier && peut ? (
      status === "ouvert" ? (
        <Button type="button" variant="secondary" onClick={() => setMode("prise")}>
          <Wrench />
          Prendre en charge
        </Button>
      ) : status === "resolu" ? (
        <Button type="button" variant="secondary" onClick={() => setMode("rouvrir")}>
          <RotateCcw />
          Rouvrir
        </Button>
      ) : null
    ) : null

  const dialogue = dossier ? (
    <FenetreFormulaire
      open={mode !== null}
      onOpenChange={(o) => !o && setMode(null)}
      titre={mode === "rouvrir" ? `Rouvrir ${dossier.reference}` : `Prendre en charge ${dossier.reference}`}
      description="La note est inscrite à la chronologie et au journal."
      libelleValider={mode === "rouvrir" ? "Rouvrir l'incident" : "Passer en cours"}
      enCours={operation.enCours === "statut"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const ok = await operation.executer(
          "statut",
          () => changer({ incidentId: dossier.incident._id, status: "en_cours", resolutionNote: String(donnees.get("note") ?? "") }).then(() => true),
          mode === "rouvrir" ? "Incident rouvert." : "Incident pris en charge."
        )
        if (ok) setMode(null)
      }}
    >
      <Field label="Note obligatoire" htmlFor="incident-note-statut">
        <Textarea id="incident-note-statut" name="note" required minLength={3} placeholder={mode === "rouvrir" ? "Nouvel élément : la panne est revenue à Booué." : "Terminal de relève demandé en gare de Ndjolé."} />
      </Field>
    </FenetreFormulaire>
  ) : null

  return { operation, boutons, formulaireCloture, dialogue }
}

/** Déclaration d'un incident depuis le portail. */
export function DialogueDeclaration({ open, onOpenChange, onDeclare }: { open: boolean; onOpenChange: (open: boolean) => void; onDeclare?: (id: string) => void }) {
  const [date, setDate] = useState(aujourdhuiService())
  const dessertes = useQuery(api.functions.referentiels.dessertes, open ? { serviceDate: date, pour: "incidents" } : "skip")
  const stations = useQuery(api.functions.referential.listStations, open ? {} : "skip")
  const declarer = useMutation(api.functions.referentiels.declarerIncident)
  const operation = useOperation()
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre="Déclarer un incident"
      description="L'incident reçoit sa référence et entre au suivi. Un incident critique alerte aussitôt les chefs de gare."
      libelleValider={
        <>
          <TriangleAlert />
          Déclarer l’incident
        </>
      }
      enCours={operation.enCours === "declarer"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const resultat = await operation.executer("declarer", () =>
          declarer({
            tripId: texte(donnees, "tripId") as never,
            stationId: texte(donnees, "stationId") as never,
            location: texte(donnees, "location"),
            category: String(donnees.get("category")) as keyof typeof CATEGORIES_INCIDENT,
            severity: String(donnees.get("severity")) as keyof typeof GRAVITES,
            description: String(donnees.get("description") ?? ""),
          })
        )
        if (resultat) {
          onOpenChange(false)
          onDeclare?.(resultat.id)
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nature" htmlFor="incident-categorie">
          <SelectNative id="incident-categorie" name="category" defaultValue="technique">
            {Object.entries(CATEGORIES_INCIDENT).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Gravité" htmlFor="incident-gravite">
          <SelectNative id="incident-gravite" name="severity" defaultValue="important">
            {Object.entries(GRAVITES).map(([valeur, def]) => (
              <option key={valeur} value={valeur}>
                {def.libelle}
              </option>
            ))}
          </SelectNative>
        </Field>
      </div>
      <div className="grid gap-2">
        <span className="text-[13px] font-medium">Train concerné (facultatif)</span>
        <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
          <DateFiltre libelle="Date de circulation" value={date} onChange={setDate} />
          <SelectNative name="tripId" aria-label="Desserte" defaultValue="">
            <option value="">Hors desserte</option>
            {dessertes?.map((d) => (
              <option key={d.id} value={d.id}>
                {libelleDesserte(d)}
              </option>
            ))}
          </SelectNative>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Gare (facultatif)" htmlFor="incident-gare">
          <SelectNative id="incident-gare" name="stationId" defaultValue="">
            <option value="">Aucune</option>
            {stations?.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Lieu précis (facultatif)" htmlFor="incident-lieu">
          <Input id="incident-lieu" name="location" placeholder="Entre Ntoum et Andem" />
        </Field>
      </div>
      <Field label="Description" htmlFor="incident-description">
        <Textarea id="incident-description" name="description" required minLength={5} placeholder="Lecteur de billets indisponible en V3 : la caméra ne lit plus." />
      </Field>
    </FenetreFormulaire>
  )
}

export function IncidentDetail({ incidentId }: { incidentId: string }) {
  const droits = useDroitsGestion()
  const dossier = useQuery(api.functions.referentiels.incident, { incidentId: incidentId as never })
  const actions = useActionsIncident(dossier)

  if (dossier === undefined || dossier === null) {
    return (
      <ManagementDetailShell title={dossier === null ? "Incident introuvable" : "Incident"} eyebrow="Supervision · incident" backHref="/gestion/incidents" verrouillage="aucun">
        {dossier === null ? <InlineMessage tone="danger" title="Ce signalement n'existe plus." /> : <SkeletonLines />}
      </ManagementDetailShell>
    )
  }
  const { incident } = dossier

  return (
    <ManagementDetailShell
      title={dossier.reference}
      eyebrow={`Supervision · incident ${CATEGORIES_INCIDENT[incident.category].toLowerCase()}`}
      backHref="/gestion/incidents"
      verrouillage="aucun"
      lectureSeule={!droits.chargement && !droits.may("incidents", "modifier")}
      description={incident.description}
      actions={actions.boutons}
    >
      <div className="flex flex-wrap gap-2">
        <TagIncident status={incident.status} />
        <TagGravite severity={incident.severity} />
      </div>
      <RetourOperation retour={actions.operation.retour} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <div className="grid content-start gap-5">
          <Panneau titre="Signalement" icone={TriangleAlert}>
            <FicheIncident dossier={dossier} />
            {incident.resolutionNote ? (
              <InlineMessage tone={incident.status === "resolu" ? "success" : "info"} title={incident.status === "resolu" ? "Note de clôture" : "Dernière note"}>
                {incident.resolutionNote}
              </InlineMessage>
            ) : null}
            {dossier.photoUrls.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {dossier.photoUrls.map((url, index) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-accent-line px-4 text-[14px] font-semibold text-accent-ink hover:bg-accent-soft">
                    <ImageIcon aria-hidden className="size-4" />
                    Photo {index + 1}
                  </a>
                ))}
              </div>
            ) : null}
          </Panneau>
          <Panneau titre="Chronologie" icone={History}>
            <Chronologie evenements={chronologieIncident(dossier)} />
          </Panneau>
        </div>
        <div className="grid content-start gap-4">
          {actions.formulaireCloture ? (
            <Panneau titre="Clore l'incident" icone={Check}>
              {actions.formulaireCloture}
            </Panneau>
          ) : incident.status === "resolu" ? (
            <InlineMessage tone="success" title={`Clos · ${incident.closureCause ? CAUSES_INCIDENT[incident.closureCause] : "cause non renseignée"}`}>
              {dateHeure(incident.resolvedAt)} · {agent(dossier.resolveur)}
            </InlineMessage>
          ) : null}
        </div>
      </div>
      {actions.dialogue}
    </ManagementDetailShell>
  )
}

