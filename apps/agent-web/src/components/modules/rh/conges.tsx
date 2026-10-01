"use client"

import type { FunctionReturnType } from "convex/server"
import { CalendarPlus, Check, Search, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { CelluleDouble, Chronologie, Fiche, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { RetourOperation, SelectFiltre, useOperation } from "@/components/gestion/referentiels/elements"
import { dateHeure } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire, texte } from "@/components/gestion/referentiels/formulaire"

import { CadreRh, TagConge, useAccesRh } from "./cadre-rh"
import { AccesRestreint, Chargement, Introuvable, LienDossier, aujourdhui, chronologie, dateIso, type Id } from "./commun"
import { STATUTS_CONGE, TYPES_CONGE, TYPES_SERVICE, type TypeConge } from "./libelles"

type Conge = FunctionReturnType<typeof api.modules.rh.conges.lister>[number]

const colonnes: ColonneTableau<Conge>[] = [
  { cle: "numero", libelle: "N°", rendu: (c) => <span className="tabular font-semibold">{c.numero}</span>, tri: (c) => c.numero },
  { cle: "agent", libelle: "Agent", rendu: (c) => <CelluleDouble haut={c.agent?.nomComplet ?? "—"} bas={c.agent ? `${c.agent.matricule} · ${c.agent.gareNom}` : undefined} />, tri: (c) => c.agent?.nomComplet, export: (c) => c.agent?.nomComplet ?? "" },
  { cle: "type", libelle: "Nature", rendu: (c) => TYPES_CONGE[c.type], tri: (c) => c.type, export: (c) => TYPES_CONGE[c.type] },
  { cle: "du", libelle: "Du", rendu: (c) => <span className="tabular">{dateIso(c.du)}</span>, tri: (c) => c.du },
  { cle: "au", libelle: "Au", rendu: (c) => <span className="tabular">{dateIso(c.au)}</span>, tri: (c) => c.au, secondaire: true },
  { cle: "jours", libelle: "Jours", rendu: (c) => c.jours, tri: (c) => c.jours, numerique: true },
  { cle: "demande", libelle: "Saisie", rendu: (c) => <span className="tabular">{dateHeure(c.demandeLe)}</span>, tri: (c) => c.demandeLe, secondaire: true },
  { cle: "statut", libelle: "État", rendu: (c) => <TagConge statut={c.statut} />, tri: (c) => ["demande", "valide", "refuse", "annule"].indexOf(c.statut), export: (c) => STATUTS_CONGE[c.statut] },
]

export function ListeConges() {
  const router = useRouter()
  const { peut, acces } = useAccesRh()
  const autorise = peut("conges.lire")
  const conges = useQuery(api.modules.rh.conges.lister, autorise ? {} : "skip")
  const [statut, setStatut] = useState("demande")
  const [type, setType] = useState("tous")
  const [demande, setDemande] = useState(false)
  const filtres = conges?.filter((c) => (statut === "tous" || c.statut === statut) && (type === "tous" || c.type === type))

  return (
    <CadreRh
      titre="Congés et absences"
      description="Demandes, validations et soldes. Un congé validé bloque aussitôt les services prévus au roulement ; une absence non payée est déduite à la paie."
      actions={
        peut("conges.demander") ? (
          <Button type="button" onClick={() => setDemande(true)}>
            <CalendarPlus />
            Saisir une demande
          </Button>
        ) : null
      }
    >
      {acces && !autorise ? (
        <AccesRestreint>Votre profil ne consulte pas les congés du personnel.</AccesRestreint>
      ) : (
        <TableauDonnees
          libelle="Congés et absences"
          colonnes={colonnes}
          lignes={filtres}
          cle={(c) => c._id}
          lien={(c) => `/rh/conges/${c._id}`}
          recherche={{ placeholder: "Agent, matricule, n°…", texte: (c) => `${c.numero} ${c.agent?.nomComplet ?? ""} ${c.agent?.matricule ?? ""}` }}
          filtres={
            <>
              <SelectFiltre libelle="État" value={statut} onChange={setStatut}>
                <option value="tous">Tous les états</option>
                {Object.entries(STATUTS_CONGE).map(([cle, lib]) => (
                  <option key={cle} value={cle}>
                    {lib}
                  </option>
                ))}
              </SelectFiltre>
              <SelectFiltre libelle="Nature" value={type} onChange={setType}>
                <option value="tous">Toutes natures</option>
                {Object.entries(TYPES_CONGE).map(([cle, lib]) => (
                  <option key={cle} value={cle}>
                    {lib}
                  </option>
                ))}
              </SelectFiltre>
            </>
          }
          exportNom="conges"
          triInitial={{ cle: "du", sens: "asc" }}
          vide={{ titre: statut === "demande" ? "Aucune demande en attente" : "Aucun congé", description: "Changez de filtre pour voir l'historique." }}
        />
      )}
      <DialogueDemandeConge open={demande} onOpenChange={setDemande} onCree={(id) => router.push(`/rh/conges/${id}`)} />
    </CadreRh>
  )
}

/**
 * Saisie d'une demande de congé ou d'absence, pour un agent choisi ou fixé
 * (depuis son dossier). Le solde de l'année est rappelé avant l'envoi.
 */
export function DialogueDemandeConge({
  open,
  onOpenChange,
  agentFixe,
  onCree,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  agentFixe?: { _id: Id<"rhAgents">; nomComplet: string }
  onCree?: (id: string) => void
}) {
  const { peut } = useAccesRh()
  const demander = useMutation(api.modules.rh.conges.demander)
  const operation = useOperation()
  const agents = useQuery(api.modules.rh.agents.lister, open && !agentFixe && peut("dossiers.lire") ? {} : "skip")
  const [filtre, setFiltre] = useState("")
  const [agentId, setAgentId] = useState<string>("")
  const [du, setDu] = useState(aujourdhui(7))
  const [type, setType] = useState<TypeConge>("annuel")
  const choisi = agentFixe?._id ?? (agentId ? (agentId as Id<"rhAgents">) : undefined)
  const solde = useQuery(api.modules.rh.conges.solde, open && choisi ? { agentId: choisi, annee: Number(du.slice(0, 4)) || new Date().getFullYear() } : "skip")
  const candidats = useMemo(() => {
    const q = filtre.trim().toLowerCase()
    return (agents ?? []).filter((a) => a.statut !== "sorti" && (!q || `${a.nomComplet} ${a.matricule}`.toLowerCase().includes(q))).slice(0, 80)
  }, [agents, filtre])

  if (!peut("conges.demander")) return null
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre={agentFixe ? `Demande de congé · ${agentFixe.nomComplet}` : "Saisir une demande de congé"}
      description="Le congé annuel se compte en jours ouvrables (lundi au samedi) ; les autres absences en jours calendaires. La demande est validée par une autre personne."
      libelleValider={
        <>
          <CalendarPlus />
          Enregistrer la demande
        </>
      }
      enCours={operation.enCours === "demande"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (d) => {
        if (!choisi) {
          operation.signaler({ ton: "danger", titre: "Action refusée", detail: "Choisissez l'agent concerné." })
          return
        }
        const resultat = await operation.executer("demande", () =>
          demander({ agentId: choisi, type, du: String(d.get("du") ?? ""), au: String(d.get("au") ?? ""), motif: texte(d, "motif") })
        )
        if (resultat) {
          onOpenChange(false)
          onCree?.(resultat.congeId)
        }
      }}
    >
      {agentFixe ? null : (
        <div className="grid gap-2">
          <label className="flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 focus-within:border-accent-base">
            <Search aria-hidden className="size-4 text-ink-muted" />
            <span className="sr-only">Chercher un agent</span>
            <input value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Nom ou matricule…" className="min-w-0 flex-1 bg-transparent py-2 outline-none" />
          </label>
          <Field label="Agent" htmlFor="cg-agent">
            <SelectNative id="cg-agent" value={agentId} onChange={(e) => setAgentId(e.target.value)} required>
              <option value="" disabled>
                {agents === undefined ? "Chargement…" : `Choisir parmi ${candidats.length} agent(s)`}
              </option>
              {candidats.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.nomComplet} · {a.matricule}
                </option>
              ))}
            </SelectNative>
          </Field>
        </div>
      )}
      <Field label="Nature" htmlFor="cg-type">
        <SelectNative id="cg-type" value={type} onChange={(e) => setType(e.target.value as TypeConge)}>
          {Object.entries(TYPES_CONGE).map(([cle, lib]) => (
            <option key={cle} value={cle}>
              {lib}
            </option>
          ))}
        </SelectNative>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Du" htmlFor="cg-du">
          <Input id="cg-du" name="du" type="date" required value={du} onChange={(e) => setDu(e.target.value)} />
        </Field>
        <Field label="Au (inclus)" htmlFor="cg-au">
          <Input id="cg-au" name="au" type="date" required min={du} defaultValue={du} />
        </Field>
      </div>
      <Field label={type === "annuel" || type === "recuperation" ? "Motif (facultatif)" : "Motif ou justificatif"} htmlFor="cg-motif">
        <Textarea id="cg-motif" name="motif" placeholder={type === "maladie" ? "Certificat médical du CHU d'Owendo" : ""} />
      </Field>
      {solde ? (
        <InlineMessage tone={solde.disponible > 0 ? "info" : "warning"} title={`Congé annuel ${solde.annee}`}>
          {solde.droits} jours acquis, {solde.pris} pris, {solde.enAttente} en attente : {Math.max(0, solde.disponible)} jours disponibles.
        </InlineMessage>
      ) : null}
    </FenetreFormulaire>
  )
}

const RETOUR = { href: "/rh/conges", libelle: "Congés et absences" }

export function DossierConge({ congeId }: { congeId: string }) {
  const { peut } = useAccesRh()
  const dossier = useQuery(api.modules.rh.conges.conge, peut("conges.lire") ? { congeId: congeId as Id<"rhConges"> } : "skip")
  const statuer = useMutation(api.modules.rh.conges.statuer)
  const annuler = useMutation(api.modules.rh.conges.annuler)
  const operation = useOperation()
  const [mode, setMode] = useState<"refus" | "annulation" | null>(null)

  if (dossier === undefined) {
    return (
      <CadreRh titre="Congé" retour={RETOUR}>
        <Chargement />
      </CadreRh>
    )
  }
  if (dossier === null) {
    return (
      <CadreRh titre="Congé introuvable" retour={RETOUR}>
        <Introuvable titre="Ce congé n'existe pas" retour={RETOUR} />
      </CadreRh>
    )
  }
  const { conge, agent, solde } = dossier
  const annulable = peut("conges.demander") && (conge.statut === "demande" || (conge.statut === "valide" && conge.du > aujourdhui()))

  return (
    <CadreRh
      titre={`${TYPES_CONGE[conge.type]} · ${agent.nomComplet}`}
      description={`${conge.numero} · du ${dateIso(conge.du)} au ${dateIso(conge.au)} · ${conge.jours} jour(s)`}
      retour={RETOUR}
      actions={
        <>
          {annulable ? (
            <Button type="button" variant="ghost" onClick={() => setMode("annulation")}>
              <X />
              Annuler le congé
            </Button>
          ) : null}
          {dossier.peutStatuer ? (
            <>
              <Button type="button" variant="danger" onClick={() => setMode("refus")}>
                Refuser
              </Button>
              <Button
                type="button"
                loading={operation.enCours === "valider"}
                loadingLabel="Validation…"
                onClick={() => operation.executer("valider", () => statuer({ congeId: conge._id, decision: "valide" }), (r) => (r.servicesEnConflit > 0 ? `Congé validé. ${r.servicesEnConflit} service(s) planifié(s) sont à réaffecter.` : "Congé validé."))}
              >
                <Check />
                Valider le congé
              </Button>
            </>
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <TagConge statut={conge.statut} />
      </div>
      <RetourOperation retour={operation.retour} />
      {conge.statut === "demande" && dossier.estDemandeur && peut("conges.valider") ? (
        <InlineMessage tone="info" title="Séparation des tâches">
          Vous avez saisi cette demande : une autre personne habilitée doit la valider.
        </InlineMessage>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-2">
        <Panneau titre="Demande">
          <Fiche
            elements={[
              ["Agent", <LienDossier key="a" href={`/rh/agents/${agent._id}`}>{`${agent.nomComplet} · ${agent.matricule}`}</LienDossier>],
              ["Poste", `${agent.metierLibelle} · ${agent.gareNom}`],
              ["Nature", TYPES_CONGE[conge.type]],
              ["Période", `du ${dateIso(conge.du)} au ${dateIso(conge.au)}`],
              ["Décompte", `${conge.jours} jour(s) ${conge.type === "annuel" ? "ouvrables" : "calendaires"}`],
              ["Motif", conge.motif ?? "—"],
              ["Saisie", `${dateHeure(conge.demandeLe)} · ${conge.demandeParNom}`],
              conge.decisionLe ? ["Décision", `${dateHeure(conge.decisionLe)} · ${conge.decisionParNom ?? "—"}`] : null,
              conge.decisionNote ? ["Note", conge.decisionNote] : null,
            ]}
          />
        </Panneau>
        <Panneau titre={`Solde de congé annuel ${solde.annee}`}>
          <Fiche
            elements={[
              ["Jours acquis", <span key="d" className="tabular">{solde.droits}</span>],
              ["Jours pris", <span key="p" className="tabular">{solde.pris}</span>],
              ["En attente", <span key="e" className="tabular">{solde.enAttente}</span>],
              ["Disponibles", <b key="r" className="tabular">{Math.max(0, solde.disponible)}</b>],
            ]}
          />
        </Panneau>
        {dossier.servicesImpactes ? (
          <Panneau titre="Services au roulement sur la période" sousTitre={dossier.servicesImpactes.length > 0 ? "À réaffecter si le congé est validé" : undefined}>
            {dossier.servicesImpactes.length === 0 ? (
              <p className="text-small text-ink-muted">Aucun service planifié pendant ce congé.</p>
            ) : (
              <ul className="grid gap-1.5">
                {dossier.servicesImpactes.map((s) => (
                  <li key={s._id}>
                    <LienDossier href={`/rh/roulements/${s._id}`}>
                      <span className="tabular">{dateHeure(s.debut)}</span> · {TYPES_SERVICE[s.type]}
                      {s.trainNumber ? ` · ${s.trainNumber}` : ""}
                    </LienDossier>
                  </li>
                ))}
              </ul>
            )}
          </Panneau>
        ) : null}
        <Panneau titre="Historique">
          <Chronologie evenements={chronologie(dossier.chronologie)} />
        </Panneau>
      </div>

      <FenetreFormulaire
        open={mode !== null}
        onOpenChange={(o) => !o && setMode(null)}
        titre={mode === "refus" ? "Refuser le congé" : "Annuler le congé"}
        description={mode === "refus" ? "Le refus doit être motivé ; l'agent en est informé par son responsable." : "L'annulation est tracée avec son motif."}
        libelleValider={mode === "refus" ? "Refuser" : "Annuler le congé"}
        variante="danger"
        enCours={operation.enCours === "refus" || operation.enCours === "annulation"}
        erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
        onSubmit={async (d) => {
          const note = String(d.get("note") ?? "")
          const ok =
            mode === "refus"
              ? await operation.executer("refus", () => statuer({ congeId: conge._id, decision: "refuse", note }).then(() => true), "Congé refusé.")
              : await operation.executer("annulation", () => annuler({ congeId: conge._id, motif: note }).then(() => true), "Congé annulé.")
          if (ok) setMode(null)
        }}
      >
        <Field label="Motif" htmlFor="cg-note">
          <Textarea id="cg-note" name="note" required minLength={3} />
        </Field>
      </FenetreFormulaire>
    </CadreRh>
  )
}
