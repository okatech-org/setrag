"use client"

import type { FunctionReturnType } from "convex/server"
import { CalendarPlus, ChevronLeft, ChevronRight, CircleAlert, Megaphone, PencilLine, TriangleAlert, X } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/choice"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

import { CelluleDouble, Chronologie, Fiche, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { DateFiltre, Onglets, RetourOperation, SelectFiltre, useOperation } from "@/components/gestion/referentiels/elements"
import { dateHeure, heure } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire, nombreSaisi, texte } from "@/components/gestion/referentiels/formulaire"

import { CadreRh, TagService, useAccesRh } from "./cadre-rh"
import {
  AccesRestreint,
  Chargement,
  Introuvable,
  LienDossier,
  ajouterJoursIso,
  aujourdhui,
  champDateIso,
  champHeure,
  chronologie,
  dateIso,
  instantLibreville,
  type Id,
} from "./commun"
import { GARES, METIERS, STATUTS_SERVICE, TYPES_SERVICE, nomGare, type TypeService } from "./libelles"

type Planning = FunctionReturnType<typeof api.modules.rh.roulements.planning>
type ServicePlanning = Planning["services"][number]
type AgentPlanning = Planning["agents"][number]
type Conflit = ServicePlanning["conflits"][number]

const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."]
const jourCourt = (date: string) => `${JOURS[new Date(`${date}T12:00:00Z`).getUTCDay()]} ${date.slice(8, 10)}/${date.slice(5, 7)}`

function EtatConflits({ conflits }: { conflits: readonly Conflit[] }) {
  if (conflits.length === 0) return <span className="text-ink-muted">Aucun</span>
  const bloquant = conflits.some((c) => c.bloquant)
  return (
    <Tag tone={bloquant ? "danger" : "warning"} title={conflits.map((c) => c.message).join(" ")}>
      {bloquant ? <CircleAlert aria-hidden /> : <TriangleAlert aria-hidden />}
      {bloquant ? "Bloquant" : `${conflits.length} alerte${conflits.length > 1 ? "s" : ""}`}
    </Tag>
  )
}

export function PlanningRoulements() {
  const { peut, acces } = useAccesRh()
  const autorise = peut("roulements.lire")
  const [du, setDu] = useState(aujourdhui())
  const au = ajouterJoursIso(du, 13)
  const planning = useQuery(api.modules.rh.roulements.planning, autorise ? { du, au } : "skip")
  const publier = useMutation(api.modules.rh.roulements.publier)
  const operation = useOperation()
  const [onglet, setOnglet] = useState<"grille" | "services" | "conflits">("grille")
  const [metier, setMetier] = useState("tous")
  const [gare, setGare] = useState("toutes")
  const [nouveau, setNouveau] = useState<{ agentId?: string; date?: string } | null>(null)

  const agents = planning?.agents.filter((a) => (metier === "tous" || a.metier === metier) && (gare === "toutes" || a.gareCode === gare))
  const idsAgents = new Set(agents?.map((a) => a._id))
  const services = planning?.services.filter((s) => idsAgents.has(s.agentId))
  const conflits = services?.filter((s) => s.conflits.length > 0)
  const jours = Array.from({ length: 14 }, (_, i) => ajouterJoursIso(du, i))
  const parAgent = new Map<string, Map<string, ServicePlanning[]>>()
  for (const s of services ?? []) {
    const ligne = parAgent.get(s.agentId) ?? new Map<string, ServicePlanning[]>()
    ligne.set(s.date, [...(ligne.get(s.date) ?? []), s])
    parAgent.set(s.agentId, ligne)
  }
  const nomAgent = new Map(planning?.agents.map((a) => [a._id as string, a]))

  const colonnes: ColonneTableau<ServicePlanning>[] = [
    { cle: "debut", libelle: "Prise de service", rendu: (s) => <span className="tabular">{dateHeure(s.debut)}</span>, tri: (s) => s.debut },
    { cle: "fin", libelle: "Fin", rendu: (s) => <span className="tabular">{dateHeure(s.fin)}</span>, tri: (s) => s.fin, secondaire: true },
    { cle: "agent", libelle: "Agent", rendu: (s) => <CelluleDouble haut={nomAgent.get(s.agentId)?.nomComplet ?? "—"} bas={nomAgent.get(s.agentId)?.metierLibelle} />, tri: (s) => nomAgent.get(s.agentId)?.nomComplet, export: (s) => nomAgent.get(s.agentId)?.nomComplet ?? "" },
    { cle: "service", libelle: "Service", rendu: (s) => <CelluleDouble haut={`${TYPES_SERVICE[s.type]}${s.trainNumber ? ` · ${s.trainNumber}` : ""}`} bas={s.desserte} />, tri: (s) => s.type, export: (s) => `${TYPES_SERVICE[s.type]} ${s.trainNumber ?? ""}` },
    { cle: "trajet", libelle: "Trajet", rendu: (s) => `${s.gareDebutNom} → ${s.gareFinNom}${s.decouche ? " · découché" : ""}`, tri: (s) => s.gareDebutNom, secondaire: true },
    { cle: "conflits", libelle: "Conflits", rendu: (s) => <EtatConflits conflits={s.conflits} />, tri: (s) => (s.conflits.some((c) => c.bloquant) ? 0 : s.conflits.length > 0 ? 1 : 2), export: (s) => s.conflits.map((c) => c.message).join(" ") },
    { cle: "statut", libelle: "État", rendu: (s) => <TagService statut={s.statut} />, tri: (s) => s.statut, export: (s) => STATUTS_SERVICE[s.statut] },
  ]

  return (
    <CadreRh
      titre="Roulements des équipes"
      description="Planning des conducteurs, chefs de train et contrôleurs sur les dessertes. Repos de 12 h, conduite continue de 6 h au plus, 48 h sur 7 jours : les conflits se recalculent à chaque changement (congé, aptitude, habilitation)."
      actions={
        peut("roulements.planifier") ? (
          <>
            <Button
              type="button"
              variant="secondary"
              loading={operation.enCours === "publier"}
              loadingLabel="Publication…"
              onClick={() => operation.executer("publier", () => publier({ du, au }), (r) => (r.publies > 0 ? `${r.publies} service(s) publiés aux équipes.` : "Rien à publier : la quinzaine est déjà publiée."))}
            >
              <Megaphone />
              Publier la quinzaine
            </Button>
            <Button type="button" onClick={() => setNouveau({})}>
              <CalendarPlus />
              Planifier un service
            </Button>
          </>
        ) : null
      }
    >
      <RetourOperation retour={operation.retour} />
      {acces && !autorise ? (
        <AccesRestreint>Votre profil ne consulte pas les roulements.</AccesRestreint>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="icon" aria-label="Semaine précédente" onClick={() => setDu(ajouterJoursIso(du, -7))}>
              <ChevronLeft />
            </Button>
            <DateFiltre libelle="Début de la quinzaine" value={du} onChange={(v) => v && setDu(v)} />
            <Button type="button" variant="ghost" size="icon" aria-label="Semaine suivante" onClick={() => setDu(ajouterJoursIso(du, 7))}>
              <ChevronRight />
            </Button>
            <span className="text-small text-ink-muted">au {dateIso(au)}</span>
            <SelectFiltre libelle="Métier" value={metier} onChange={setMetier}>
              <option value="tous">Tout le personnel roulant</option>
              <option value="conducteur_ligne">{METIERS.conducteur_ligne}</option>
              <option value="chef_train">{METIERS.chef_train}</option>
              <option value="controleur_train">{METIERS.controleur_train}</option>
            </SelectFiltre>
            <SelectFiltre libelle="Gare d'attache" value={gare} onChange={setGare}>
              <option value="toutes">Toutes les gares</option>
              {GARES.map(([code, nom]) => (
                <option key={code} value={code}>
                  {nom}
                </option>
              ))}
            </SelectFiltre>
          </div>
          {planning ? (
            <p className="text-small">
              <b className="tabular">{planning.totaux.services}</b> services ·{" "}
              <b className="tabular">{planning.totaux.planifies}</b> à publier ·{" "}
              <b className="tabular">{planning.totaux.conflitsBloquants}</b> en conflit bloquant ·{" "}
              <b className="tabular">{planning.totaux.alertes}</b> avec alerte
            </p>
          ) : null}
          <Onglets
            libelle="Roulements"
            valeur={onglet}
            onChange={setOnglet}
            onglets={[
              { cle: "grille", libelle: "Grille" },
              { cle: "services", libelle: "Services", compte: services?.length },
              { cle: "conflits", libelle: "Conflits", compte: conflits?.length },
            ]}
          />
          <div role="tabpanel">
            {planning === undefined ? (
              <Chargement libelle="Chargement du planning" />
            ) : onglet === "grille" ? (
              <GrillePlanning
                agents={agents ?? []}
                jours={jours}
                parAgent={parAgent}
                onCase={peut("roulements.planifier") ? (agentId, date) => setNouveau({ agentId, date }) : undefined}
              />
            ) : (
              <TableauDonnees
                libelle={onglet === "conflits" ? "Services en conflit" : "Services de la quinzaine"}
                colonnes={colonnes}
                lignes={onglet === "conflits" ? conflits : services}
                cle={(s) => s._id}
                lien={(s) => `/rh/roulements/${s._id}`}
                recherche={{ placeholder: "Agent, train…", texte: (s) => `${nomAgent.get(s.agentId)?.nomComplet ?? ""} ${s.trainNumber ?? ""} ${s.gareDebutNom} ${s.gareFinNom}` }}
                exportNom={onglet === "conflits" ? "conflits-roulement" : "roulement"}
                imprimable
                triInitial={{ cle: onglet === "conflits" ? "conflits" : "debut", sens: "asc" }}
                vide={{ titre: onglet === "conflits" ? "Aucun conflit" : "Aucun service", description: onglet === "conflits" ? "Le planning de la quinzaine respecte les règles." : "Rien n'est planifié sur cette quinzaine." }}
              />
            )}
          </div>
        </>
      )}
      {nouveau && planning ? (
        <DialogueService agents={planning.agents} agentInitial={nouveau.agentId} dateInitiale={nouveau.date} onClose={() => setNouveau(null)} />
      ) : null}
    </CadreRh>
  )
}

function GrillePlanning({
  agents,
  jours,
  parAgent,
  onCase,
}: {
  agents: readonly AgentPlanning[]
  jours: readonly string[]
  parAgent: Map<string, Map<string, ServicePlanning[]>>
  onCase?: (agentId: string, date: string) => void
}) {
  if (agents.length === 0) return <p className="text-small text-ink-muted">Aucun agent pour ces filtres.</p>
  const aujourdhuiIso = aujourdhui()
  return (
    <div className="relative overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full border-collapse text-[13px]" aria-label="Grille du roulement">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 min-w-[200px] bg-surface-sunk px-3 py-2 text-left text-[11.5px] font-semibold tracking-[0.05em] text-ink-muted uppercase">
              Agent
            </th>
            {jours.map((jour) => (
              <th key={jour} scope="col" className={cn("min-w-[104px] bg-surface-sunk px-2 py-2 text-left text-[12px] font-semibold whitespace-nowrap text-ink-muted", jour === aujourdhuiIso && "text-ink")}>
                {jourCourt(jour)}
                {jour === aujourdhuiIso ? <span className="sr-only"> (aujourd&apos;hui)</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <tr key={agent._id} className="border-t border-line">
              <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-left font-normal">
                <Link href={`/rh/agents/${agent._id}` as Route} className="grid min-w-0 hover:underline">
                  <span className="truncate font-semibold">{agent.nomComplet}</span>
                  <small className="text-[12px] text-ink-muted">
                    {agent.metierLibelle} · {agent.gareNom}
                  </small>
                </Link>
              </th>
              {jours.map((jour) => {
                const services = parAgent.get(agent._id)?.get(jour) ?? []
                return (
                  <td key={jour} className="border-l border-line px-1 py-1 align-top">
                    <div className="grid gap-1">
                      {services.map((s) => {
                        const bloquant = s.conflits.some((c) => c.bloquant)
                        const alerte = s.conflits.length > 0
                        return (
                          <Link
                            key={s._id}
                            href={`/rh/roulements/${s._id}` as Route}
                            title={s.conflits.map((c) => c.message).join(" ") || undefined}
                            className={cn(
                              "grid min-h-11 rounded-sm border px-1.5 py-1 leading-tight",
                              bloquant ? "border-danger/50 bg-danger-soft text-danger-ink" : alerte ? "border-warning/50 bg-warning-soft text-warning-ink" : "border-line bg-surface-sunk",
                              s.statut === "planifie" && "border-dashed"
                            )}
                          >
                            <span className="tabular font-semibold">
                              {heure(s.debut)}–{heure(s.fin)}
                            </span>
                            <span className="truncate">
                              {s.trainNumber ?? TYPES_SERVICE[s.type]}
                              {bloquant ? " · bloquant" : alerte ? " · alerte" : ""}
                            </span>
                          </Link>
                        )
                      })}
                      {onCase && services.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => onCase(agent._id, jour)}
                          className="min-h-11 rounded-sm text-[12px] text-ink-faint hover:bg-surface-sunk hover:text-ink"
                          aria-label={`Planifier ${agent.nomComplet} le ${dateIso(jour)}`}
                        >
                          +
                        </button>
                      ) : null}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-small border-t border-line px-3 py-2 text-ink-muted">
        Bordure pointillée : service planifié, pas encore publié. « bloquant » et « alerte » sont écrits dans la case.
      </p>
    </div>
  )
}

/* ══════════════════════════ Saisie d'un service ═════════════════════════ */

interface ServiceExistant {
  _id: Id<"rhServices">
  agentId: Id<"rhAgents">
  debut: number
  fin: number
  type: TypeService
  pauseMinutes: number
  trainNumber?: string
  desserte?: string
  gareDebutCode: string
  gareFinCode: string
  decouche: boolean
  derogation?: string
}

export function DialogueService({
  agents,
  agentInitial,
  dateInitiale,
  existant,
  onClose,
}: {
  agents: readonly { _id: string; nomComplet: string; metier: string; gareCode: string; matricule: string }[]
  agentInitial?: string
  dateInitiale?: string
  existant?: ServiceExistant
  onClose: () => void
}) {
  const router = useRouter()
  const planifier = useMutation(api.modules.rh.roulements.planifier)
  const modifier = useMutation(api.modules.rh.roulements.modifier)
  const operation = useOperation()
  const agentDefaut = agents.find((a) => a._id === (existant?.agentId ?? agentInitial))
  const [agentId, setAgentId] = useState<string>(existant?.agentId ?? agentInitial ?? "")
  const [date, setDate] = useState(existant ? champDateIso(existant.debut) : (dateInitiale ?? aujourdhui(1)))
  const [debut, setDebut] = useState(existant ? champHeure(existant.debut) : "07:40")
  const [fin, setFin] = useState(existant ? champHeure(existant.fin) : "13:10")
  const [type, setType] = useState<TypeService>(existant?.type ?? (agentDefaut?.metier === "chef_train" ? "accompagnement" : agentDefaut?.metier === "controleur_train" ? "controle" : "conduite"))
  const [pause, setPause] = useState(String(existant?.pauseMinutes ?? 0))
  const [gareDebut, setGareDebut] = useState(existant?.gareDebutCode ?? agentDefaut?.gareCode ?? "OWE")
  const [gareFin, setGareFin] = useState(existant?.gareFinCode ?? "BOO")
  const [train, setTrain] = useState(existant?.trainNumber ?? "")
  const [desserte, setDesserte] = useState(existant?.desserte ?? "")
  const [tripId, setTripId] = useState<string>("")
  const dessertes = useQuery(api.modules.rh.roulements.dessertes, date ? { date } : "skip")

  const instantDebut = instantLibreville(date, debut)
  let instantFin = instantLibreville(date, fin)
  if (instantFin <= instantDebut) instantFin += 86_400_000
  const pauseMinutes = Number(pause) || 0
  const apercu = useQuery(
    api.modules.rh.roulements.previsualiser,
    agentId && Number.isFinite(instantDebut) && Number.isFinite(instantFin)
      ? { agentId: agentId as Id<"rhAgents">, debut: instantDebut, fin: instantFin, type, pauseMinutes, serviceId: existant?._id }
      : "skip"
  )
  const bloquants = apercu?.conflits.filter((c) => c.bloquant) ?? []
  const alertes = apercu?.conflits.filter((c) => !c.bloquant) ?? []

  return (
    <FenetreFormulaire
      open
      onOpenChange={(o) => !o && onClose()}
      large
      titre={existant ? "Modifier le service" : "Planifier un service"}
      description="Les règles sont contrôlées en direct : un conflit bloquant (aptitude, habilitation, congé, chevauchement) refuse le service ; une alerte (repos, conduite continue, durée) exige une dérogation écrite."
      libelleValider={existant ? "Enregistrer" : "Planifier"}
      enCours={operation.enCours === "service"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (d) => {
        if (!agentId) {
          operation.signaler({ ton: "danger", titre: "Action refusée", detail: "Choisissez l'agent." })
          return
        }
        const valeur = {
          agentId: agentId as Id<"rhAgents">,
          debut: instantDebut,
          fin: instantFin,
          type,
          pauseMinutes: nombreSaisi(d, "pause") ?? 0,
          trainNumber: train.trim() || undefined,
          desserte: desserte.trim() || undefined,
          tripId: tripId ? (tripId as Id<"trips">) : undefined,
          gareDebutCode: gareDebut,
          gareFinCode: gareFin,
          decouche: d.get("decouche") === "on",
          derogation: texte(d, "derogation"),
        }
        const resultat = await operation.executer("service", () => (existant ? modifier({ serviceId: existant._id, ...valeur }) : planifier(valeur)))
        if (resultat) {
          onClose()
          if (!existant) router.push(`/rh/roulements/${resultat.serviceId}`)
        }
      }}
    >
      <Field label="Agent" htmlFor="sv-agent">
        <SelectNative id="sv-agent" value={agentId} onChange={(e) => setAgentId(e.target.value)} required>
          <option value="" disabled>
            Choisir un agent
          </option>
          {agents.map((a) => (
            <option key={a._id} value={a._id}>
              {a.nomComplet} · {METIERS[a.metier as keyof typeof METIERS] ?? a.metier} · {nomGare(a.gareCode)}
            </option>
          ))}
        </SelectNative>
      </Field>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Jour" htmlFor="sv-date">
          <Input id="sv-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Prise de service" htmlFor="sv-debut">
          <Input id="sv-debut" type="time" required value={debut} onChange={(e) => setDebut(e.target.value)} />
        </Field>
        <Field label="Fin" htmlFor="sv-fin" hint={instantFin - instantDebut > 0 && fin <= debut ? "Le lendemain" : undefined}>
          <Input id="sv-fin" type="time" required value={fin} onChange={(e) => setFin(e.target.value)} />
        </Field>
        <Field label="Pause (min)" htmlFor="sv-pause">
          <Input id="sv-pause" name="pause" type="number" min={0} inputMode="numeric" value={pause} onChange={(e) => setPause(e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nature du service" htmlFor="sv-type">
          <SelectNative id="sv-type" value={type} onChange={(e) => setType(e.target.value as TypeService)}>
            {Object.entries(TYPES_SERVICE).map(([cle, lib]) => (
              <option key={cle} value={cle}>
                {lib}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Desserte du jour" htmlFor="sv-desserte" hint={dessertes && dessertes.length === 0 ? "Aucune desserte commerciale ce jour : saisissez le train." : undefined}>
          <SelectNative
            id="sv-desserte"
            value={tripId}
            onChange={(e) => {
              setTripId(e.target.value)
              const choisie = dessertes?.find((t) => t._id === e.target.value)
              if (choisie) {
                setTrain(choisie.trainNumber)
                setDesserte(`${choisie.trainNumber} ${choisie.origine} → ${choisie.destination}`)
                if (choisie.origineCode) setGareDebut(choisie.origineCode)
                if (choisie.destinationCode) setGareFin(choisie.destinationCode)
              }
            }}
          >
            <option value="">Hors desserte commerciale</option>
            {(dessertes ?? []).map((t) => (
              <option key={t._id} value={t._id}>
                {t.trainNumber} · {heure(t.departureAt)} · {t.origine} → {t.destination}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Train" htmlFor="sv-train">
          <Input id="sv-train" value={train} onChange={(e) => setTrain(e.target.value)} placeholder="TR-201, MIN-704…" />
        </Field>
        <Field label="Libellé de la desserte" htmlFor="sv-libelle">
          <Input id="sv-libelle" value={desserte} onChange={(e) => setDesserte(e.target.value)} placeholder="Express Owendo → Franceville" />
        </Field>
        <Field label="Gare de prise" htmlFor="sv-gare-debut">
          <SelectNative id="sv-gare-debut" value={gareDebut} onChange={(e) => setGareDebut(e.target.value)}>
            {GARES.map(([code, nom]) => (
              <option key={code} value={code}>
                {nom}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Gare de fin" htmlFor="sv-gare-fin">
          <SelectNative id="sv-gare-fin" value={gareFin} onChange={(e) => setGareFin(e.target.value)}>
            {GARES.map(([code, nom]) => (
              <option key={code} value={code}>
                {nom}
              </option>
            ))}
          </SelectNative>
        </Field>
      </div>
      <Checkbox name="decouche" defaultChecked={existant?.decouche ?? false} label="Découché (nuit hors de la gare d'attache)" />

      {apercu?.erreur ? (
        <InlineMessage tone="warning" title="Horaires à corriger">
          {apercu.erreur}
        </InlineMessage>
      ) : null}
      {bloquants.length > 0 ? (
        <InlineMessage tone="danger" title="Service impossible">
          {bloquants.map((c) => c.message).join(" ")}
        </InlineMessage>
      ) : null}
      {alertes.length > 0 ? (
        <>
          <InlineMessage tone="warning" title="Dérogation nécessaire">
            {alertes.map((c) => c.message).join(" ")}
          </InlineMessage>
          <Field label="Justification de la dérogation" htmlFor="sv-derogation">
            <Textarea id="sv-derogation" name="derogation" required defaultValue={existant?.derogation ?? ""} placeholder="Remplacement imprévu ; aucun autre conducteur disponible à Booué." />
          </Field>
        </>
      ) : null}
      {apercu && apercu.conflits.length === 0 && !apercu.erreur ? (
        <InlineMessage tone="success" title="Règles respectées">
          Repos, durée et aptitude conformes pour ce service.
        </InlineMessage>
      ) : null}
    </FenetreFormulaire>
  )
}

/* ══════════════════════════════ Service ═════════════════════════════════ */

const RETOUR = { href: "/rh/roulements", libelle: "Roulements" }

export function DossierService({ serviceId }: { serviceId: string }) {
  const { peut } = useAccesRh()
  const dossier = useQuery(api.modules.rh.roulements.service, peut("roulements.lire") ? { serviceId: serviceId as Id<"rhServices"> } : "skip")
  const annuler = useMutation(api.modules.rh.roulements.annuler)
  const operation = useOperation()
  const [dialogue, setDialogue] = useState<"modifier" | "annuler" | null>(null)
  const [maintenant] = useState(() => Date.now())

  if (dossier === undefined) {
    return (
      <CadreRh titre="Service" retour={RETOUR}>
        <Chargement />
      </CadreRh>
    )
  }
  if (dossier === null) {
    return (
      <CadreRh titre="Service introuvable" retour={RETOUR}>
        <Introuvable titre="Ce service n'existe pas" retour={RETOUR} />
      </CadreRh>
    )
  }
  const { service, agent } = dossier
  const modifiable = peut("roulements.planifier") && service.statut !== "annule" && service.fin > maintenant

  return (
    <CadreRh
      titre={`${TYPES_SERVICE[service.type]}${service.trainNumber ? ` · ${service.trainNumber}` : ""} · ${agent.nomComplet}`}
      description={`${dateHeure(service.debut)} → ${dateHeure(service.fin)} · ${service.gareDebutNom} → ${service.gareFinNom}`}
      retour={RETOUR}
      actions={
        modifiable ? (
          <>
            <Button type="button" variant="danger" onClick={() => setDialogue("annuler")}>
              <X />
              Annuler le service
            </Button>
            <Button type="button" onClick={() => setDialogue("modifier")}>
              <PencilLine />
              Modifier ou réaffecter
            </Button>
          </>
        ) : null
      }
    >
      <div className="flex flex-wrap gap-2">
        <TagService statut={service.statut} />
        <EtatConflits conflits={dossier.conflits} />
      </div>
      <RetourOperation retour={operation.retour} />
      {dossier.conflits.length > 0 ? (
        <InlineMessage tone={dossier.conflits.some((c) => c.bloquant) ? "danger" : "warning"} title={dossier.conflits.some((c) => c.bloquant) ? "Conflit bloquant : à résoudre avant publication" : "Alerte de roulement"}>
          {dossier.conflits.map((c) => c.message).join(" ")}
        </InlineMessage>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-2">
        <Panneau titre="Service">
          <Fiche
            elements={[
              ["Agent", <LienDossier key="a" href={`/rh/agents/${agent._id}`}>{`${agent.nomComplet} · ${agent.matricule}`}</LienDossier>],
              ["Métier", `${agent.metierLibelle} · attaché à ${agent.gareNom}`],
              ["Nature", TYPES_SERVICE[service.type]],
              ["Prise de service", <span key="d" className="tabular">{dateHeure(service.debut)}</span>],
              ["Fin de service", <span key="f" className="tabular">{dateHeure(service.fin)}</span>],
              ["Pause", `${service.pauseMinutes} min`],
              ["Train", service.trainNumber ?? "—"],
              ["Desserte", service.desserte ?? "—"],
              ["Trajet", `${service.gareDebutNom} → ${service.gareFinNom}`],
              ["Découché", service.decouche ? "Oui" : "Non"],
              service.derogation ? ["Dérogation", service.derogation] : null,
              service.motifAnnulation ? ["Motif d'annulation", service.motifAnnulation] : null,
              ["Planifié par", `${service.creeParNom} · ${dateHeure(service.createdAt)}`],
            ]}
          />
        </Panneau>
        <div className="grid content-start gap-5">
          {dossier.servicesLies.length > 0 ? (
            <Panneau titre="Services en cause">
              <ul className="grid gap-1.5">
                {dossier.servicesLies.map((s) => (
                  <li key={s._id}>
                    <LienDossier href={`/rh/roulements/${s._id}`}>
                      <span className="tabular">{dateHeure(s.debut)}</span>–<span className="tabular">{heure(s.fin)}</span> · {TYPES_SERVICE[s.type]}
                      {s.trainNumber ? ` · ${s.trainNumber}` : ""}
                    </LienDossier>
                  </li>
                ))}
              </ul>
            </Panneau>
          ) : null}
          <Panneau titre="Historique">
            <Chronologie evenements={chronologie(dossier.chronologie)} />
          </Panneau>
        </div>
      </div>

      {dialogue === "modifier" ? <ModifierService service={service} agentId={agent._id} onClose={() => setDialogue(null)} /> : null}
      <FenetreFormulaire
        open={dialogue === "annuler"}
        onOpenChange={(o) => !o && setDialogue(null)}
        titre="Annuler le service"
        libelleValider="Annuler le service"
        variante="danger"
        enCours={operation.enCours === "annuler"}
        erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
        onSubmit={async (d) => {
          const ok = await operation.executer("annuler", () => annuler({ serviceId: service._id, motif: String(d.get("motif") ?? "") }).then(() => true), "Service annulé.")
          if (ok) setDialogue(null)
        }}
      >
        <Field label="Motif" htmlFor="an-motif">
          <Textarea id="an-motif" name="motif" required minLength={3} placeholder="Train supprimé pour travaux sur la section Ndjolé — Booué." />
        </Field>
      </FenetreFormulaire>
    </CadreRh>
  )
}

function ModifierService({ service, agentId, onClose }: { service: NonNullable<FunctionReturnType<typeof api.modules.rh.roulements.service>>["service"]; agentId: Id<"rhAgents">; onClose: () => void }) {
  const planning = useQuery(api.modules.rh.roulements.planning, { du: champDateIso(service.debut), au: champDateIso(service.debut) })
  if (!planning) return null
  return (
    <DialogueService
      agents={planning.agents}
      existant={{ ...service, agentId, _id: service._id }}
      onClose={onClose}
    />
  )
}
