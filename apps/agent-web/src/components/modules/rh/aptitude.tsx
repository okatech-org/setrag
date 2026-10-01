"use client"

import type { FunctionReturnType } from "convex/server"
import { CalendarPlus, ClipboardPlus, Eye, Gavel, Lock, Search, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { CelluleDouble, Chronologie, Fiche, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { Onglets, RetourOperation, SelectFiltre, useOperation } from "@/components/gestion/referentiels/elements"
import { dateHeure } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire, nombreSaisi, texte } from "@/components/gestion/referentiels/formulaire"

import { CadreRh, TagAptitude, TagVisite, useAccesRh } from "./cadre-rh"
import { AccesRestreint, Chargement, Introuvable, LienDossier, TableSimple, aujourdhui, chronologie, dateIso, type Id } from "./commun"
import { ETATS_APTITUDE, METIERS, RESULTATS_APTITUDE, STATUTS_VISITE, TYPES_VISITE, libelle, type ResultatAptitude, type TypeVisite } from "./libelles"

type Suivi = FunctionReturnType<typeof api.modules.rh.aptitude.suivi>["agents"][number]
type Visite = FunctionReturnType<typeof api.modules.rh.aptitude.listerVisites>[number]

const LIEUX = ["Centre médical SETRAG — Owendo", "Antenne médicale — Booué", "Antenne médicale — Franceville"] as const
const ORDRE_ETATS = ["expiree", "inapte_temporaire", "inapte_definitif", "a_renouveler", "aucune", "apte_restriction", "apte"]

const colonnesSuivi: ColonneTableau<Suivi>[] = [
  { cle: "agent", libelle: "Agent", rendu: (a) => <CelluleDouble haut={a.nomComplet} bas={`${a.matricule} · ${a.metierLibelle}`} />, tri: (a) => a.nomComplet, export: (a) => a.nomComplet },
  { cle: "matricule", libelle: "Matricule", rendu: (a) => <span className="tabular">{a.matricule}</span>, tri: (a) => a.matricule, secondaire: true },
  { cle: "gare", libelle: "Gare", rendu: (a) => a.gareNom, tri: (a) => a.gareNom, secondaire: true },
  { cle: "securite", libelle: "Poste", rendu: (a) => (a.posteSecurite ? "Sécurité" : "Standard"), tri: (a) => (a.posteSecurite ? 0 : 1), secondaire: true },
  { cle: "etat", libelle: "Aptitude", rendu: (a) => <TagAptitude etat={a.etat} />, tri: (a) => ORDRE_ETATS.indexOf(a.etat), export: (a) => ETATS_APTITUDE[a.etat] },
  { cle: "echeance", libelle: "Échéance", rendu: (a) => <span className="tabular">{dateIso(a.valideJusquau)}</span>, tri: (a) => a.valideJusquau ?? "" },
  { cle: "consigne", libelle: "Consigne", rendu: (a) => a.restrictionFonctionnelle ?? "—", tri: (a) => a.restrictionFonctionnelle ?? "", secondaire: true },
  {
    cle: "prochaine",
    libelle: "Prochaine visite",
    rendu: (a) => (a.prochaineVisite ? <LienDossier href={`/rh/aptitude/visites/${a.prochaineVisite._id}`}>{dateIso(a.prochaineVisite.date)}</LienDossier> : <span className="text-ink-muted">Non programmée</span>),
    tri: (a) => a.prochaineVisite?.date ?? "",
    export: (a) => a.prochaineVisite?.date ?? "",
  },
]

const colonnesVisites: ColonneTableau<Visite>[] = [
  { cle: "numero", libelle: "N°", rendu: (v) => <span className="tabular font-semibold">{v.numero}</span>, tri: (v) => v.numero },
  { cle: "agent", libelle: "Agent", rendu: (v) => <CelluleDouble haut={v.agent?.nomComplet ?? "—"} bas={v.agent?.metierLibelle} />, tri: (v) => v.agent?.nomComplet, export: (v) => v.agent?.nomComplet ?? "" },
  { cle: "type", libelle: "Visite", rendu: (v) => TYPES_VISITE[v.type], tri: (v) => v.type, export: (v) => TYPES_VISITE[v.type], secondaire: true },
  { cle: "date", libelle: "Date", rendu: (v) => <span className="tabular">{dateIso(v.dateProgrammee)}{v.heureProgrammee ? ` ${v.heureProgrammee}` : ""}</span>, tri: (v) => `${v.dateProgrammee} ${v.heureProgrammee ?? ""}` },
  { cle: "lieu", libelle: "Lieu", rendu: (v) => v.lieu, tri: (v) => v.lieu, secondaire: true },
  { cle: "statut", libelle: "État", rendu: (v) => <TagVisite statut={v.statut} />, tri: (v) => v.statut, export: (v) => STATUTS_VISITE[v.statut] },
  { cle: "resultat", libelle: "Décision", rendu: (v) => libelle(RESULTATS_APTITUDE, v.resultat), tri: (v) => v.resultat ?? "" },
]

export function SuiviAptitude() {
  const router = useRouter()
  const { peut, acces } = useAccesRh()
  const autorise = peut("aptitude.lire")
  const suivi = useQuery(api.modules.rh.aptitude.suivi, autorise ? {} : "skip")
  const visites = useQuery(api.modules.rh.aptitude.listerVisites, autorise ? {} : "skip")
  const [onglet, setOnglet] = useState<"suivi" | "visites">("suivi")
  const [etat, setEtat] = useState("alertes")
  const [statut, setStatut] = useState("programmee")
  const [programmer, setProgrammer] = useState(false)

  const lignesSuivi = suivi?.agents.filter((a) =>
    etat === "tous" ? true : etat === "alertes" ? a.posteSecurite && a.etat !== "apte" && a.etat !== "apte_restriction" : a.etat === etat
  )
  const lignesVisites = visites?.filter((v) => statut === "tous" || v.statut === statut)

  return (
    <CadreRh
      titre="Aptitude médicale"
      description="Statut d'aptitude des agents et visites du service de santé au travail. Hors du service médical, seuls le statut, l'échéance et la consigne fonctionnelle sont visibles."
      actions={
        peut("medical.programmer") ? (
          <Button type="button" onClick={() => setProgrammer(true)}>
            <CalendarPlus />
            Programmer une visite
          </Button>
        ) : null
      }
    >
      {acces && !autorise ? (
        <AccesRestreint>Votre profil ne consulte pas l&apos;aptitude médicale du personnel.</AccesRestreint>
      ) : (
        <>
          <Onglets
            libelle="Aptitude"
            valeur={onglet}
            onChange={setOnglet}
            onglets={[
              { cle: "suivi", libelle: "Suivi des aptitudes", compte: suivi?.agents.filter((a) => a.posteSecurite && a.etat !== "apte" && a.etat !== "apte_restriction").length },
              { cle: "visites", libelle: "Visites", compte: visites?.filter((v) => v.statut === "programmee").length },
            ]}
          />
          <div role="tabpanel">
            {onglet === "suivi" ? (
              <TableauDonnees
                libelle="Suivi des aptitudes"
                colonnes={colonnesSuivi}
                lignes={lignesSuivi}
                cle={(a) => a._id}
                lien={(a) => `/rh/agents/${a._id}`}
                recherche={{ placeholder: "Nom, matricule…", texte: (a) => `${a.nomComplet} ${a.matricule} ${a.gareNom}` }}
                filtres={
                  <SelectFiltre libelle="Aptitude" value={etat} onChange={setEtat}>
                    <option value="alertes">Postes de sécurité à traiter</option>
                    <option value="tous">Tous les agents</option>
                    {Object.entries(ETATS_APTITUDE).map(([cle, lib]) => (
                      <option key={cle} value={cle}>
                        {lib}
                      </option>
                    ))}
                  </SelectFiltre>
                }
                exportNom="aptitudes"
                triInitial={{ cle: "etat", sens: "asc" }}
                vide={{ titre: "Aucun agent à traiter", description: "Toutes les aptitudes des postes de sécurité sont à jour." }}
              />
            ) : (
              <TableauDonnees
                libelle="Visites médicales"
                colonnes={colonnesVisites}
                lignes={lignesVisites}
                cle={(v) => v._id}
                lien={(v) => `/rh/aptitude/visites/${v._id}`}
                recherche={{ placeholder: "Agent, n° de visite…", texte: (v) => `${v.numero} ${v.agent?.nomComplet ?? ""} ${v.agent?.matricule ?? ""}` }}
                filtres={
                  <SelectFiltre libelle="État" value={statut} onChange={setStatut}>
                    <option value="tous">Toutes les visites</option>
                    {Object.entries(STATUTS_VISITE).map(([cle, lib]) => (
                      <option key={cle} value={cle}>
                        {lib}
                      </option>
                    ))}
                  </SelectFiltre>
                }
                exportNom="visites-medicales"
                triInitial={{ cle: "date", sens: statut === "programmee" ? "asc" : "desc" }}
                vide={{ titre: "Aucune visite", description: "Aucune visite ne correspond à ce filtre." }}
              />
            )}
          </div>
        </>
      )}
      <DialogueProgrammerVisite open={programmer} onOpenChange={setProgrammer} onCree={(id) => router.push(`/rh/aptitude/visites/${id}`)} />
    </CadreRh>
  )
}

export function DialogueProgrammerVisite({
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
  const programmer = useMutation(api.modules.rh.aptitude.programmer)
  const operation = useOperation()
  const agents = useQuery(api.modules.rh.agents.lister, open && !agentFixe && peut("dossiers.lire") ? {} : "skip")
  const [filtre, setFiltre] = useState("")
  const [agentId, setAgentId] = useState("")
  const candidats = useMemo(() => {
    const q = filtre.trim().toLowerCase()
    return (agents ?? []).filter((a) => a.statut !== "sorti" && (!q || `${a.nomComplet} ${a.matricule}`.toLowerCase().includes(q))).slice(0, 80)
  }, [agents, filtre])
  if (!peut("medical.programmer")) return null
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre={agentFixe ? `Programmer une visite · ${agentFixe.nomComplet}` : "Programmer une visite médicale"}
      description="Une seule visite peut être programmée à la fois par agent."
      libelleValider={
        <>
          <CalendarPlus />
          Programmer
        </>
      }
      enCours={operation.enCours === "programmer"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (d) => {
        const cible = agentFixe?._id ?? (agentId as Id<"rhAgents">)
        if (!cible) {
          operation.signaler({ ton: "danger", titre: "Action refusée", detail: "Choisissez l'agent." })
          return
        }
        const resultat = await operation.executer("programmer", () =>
          programmer({
            agentId: cible,
            type: String(d.get("type")) as TypeVisite,
            dateProgrammee: String(d.get("date") ?? ""),
            heureProgrammee: texte(d, "heure"),
            lieu: String(d.get("lieu") ?? ""),
          })
        )
        if (resultat) {
          onOpenChange(false)
          onCree?.(resultat.visiteId)
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
          <Field label="Agent" htmlFor="vm-agent">
            <SelectNative id="vm-agent" value={agentId} onChange={(e) => setAgentId(e.target.value)} required>
              <option value="" disabled>
                {agents === undefined ? "Chargement…" : `Choisir parmi ${candidats.length} agent(s)`}
              </option>
              {candidats.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.nomComplet} · {a.matricule} · {METIERS[a.metier]}
                </option>
              ))}
            </SelectNative>
          </Field>
        </div>
      )}
      <Field label="Nature de la visite" htmlFor="vm-type">
        <SelectNative id="vm-type" name="type" defaultValue="periodique">
          {Object.entries(TYPES_VISITE).map(([cle, lib]) => (
            <option key={cle} value={cle}>
              {lib}
            </option>
          ))}
        </SelectNative>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date" htmlFor="vm-date">
          <Input id="vm-date" name="date" type="date" required min={aujourdhui()} defaultValue={aujourdhui(3)} />
        </Field>
        <Field label="Heure" htmlFor="vm-heure">
          <Input id="vm-heure" name="heure" type="time" defaultValue="08:30" />
        </Field>
      </div>
      <Field label="Lieu" htmlFor="vm-lieu">
        <SelectNative id="vm-lieu" name="lieu" defaultValue={LIEUX[0]}>
          {LIEUX.map((lieu) => (
            <option key={lieu} value={lieu}>
              {lieu}
            </option>
          ))}
        </SelectNative>
      </Field>
    </FenetreFormulaire>
  )
}

/* ═════════════════════════════ Visite ══════════════════════════════════ */

const RETOUR = { href: "/rh/aptitude", libelle: "Aptitude médicale" }
type Examens = FunctionReturnType<typeof api.modules.rh.aptitude.consulterExamens>

export function DossierVisite({ visiteId }: { visiteId: string }) {
  const { peut } = useAccesRh()
  const dossier = useQuery(api.modules.rh.aptitude.visite, peut("aptitude.lire") ? { visiteId: visiteId as Id<"rhVisitesMedicales"> } : "skip")
  const consulter = useMutation(api.modules.rh.aptitude.consulterExamens)
  const operation = useOperation()
  const [dialogue, setDialogue] = useState<"examens" | "prononcer" | "reprogrammer" | "annuler" | null>(null)
  const [examens, setExamens] = useState<Examens | null>(null)

  if (dossier === undefined) {
    return (
      <CadreRh titre="Visite médicale" retour={RETOUR}>
        <Chargement />
      </CadreRh>
    )
  }
  if (dossier === null) {
    return (
      <CadreRh titre="Visite introuvable" retour={RETOUR}>
        <Introuvable titre="Cette visite n'existe pas" retour={RETOUR} />
      </CadreRh>
    )
  }
  const { visite, agent } = dossier
  const programmee = visite.statut === "programmee"
  const passee = visite.dateProgrammee <= aujourdhui()
  const medical = peut("medical.detail")

  return (
    <CadreRh
      titre={`${TYPES_VISITE[visite.type]} · ${agent.nomComplet}`}
      description={`${visite.numero} · ${dateIso(visite.dateProgrammee)}${visite.heureProgrammee ? ` à ${visite.heureProgrammee}` : ""} · ${visite.lieu}`}
      retour={RETOUR}
      actions={
        programmee && peut("medical.programmer") ? (
          <>
            <Button type="button" variant="ghost" onClick={() => setDialogue("annuler")}>
              <X />
              Annuler
            </Button>
            <Button type="button" variant="secondary" onClick={() => setDialogue("reprogrammer")}>
              Reporter
            </Button>
            <Button type="button" variant={peut("medical.prononcer") ? "secondary" : "primary"} onClick={() => setDialogue("examens")}>
              <ClipboardPlus />
              {dossier.examensSaisis ? "Compléter les examens" : "Saisir les examens"}
            </Button>
            {peut("medical.prononcer") && passee ? (
              <Button type="button" onClick={() => setDialogue("prononcer")}>
                <Gavel />
                Prononcer l&apos;aptitude
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      <div className="flex flex-wrap gap-2">
        <TagVisite statut={visite.statut} />
        {visite.resultat ? <span className="text-small font-semibold">Décision : {RESULTATS_APTITUDE[visite.resultat]}</span> : null}
      </div>
      <RetourOperation retour={operation.retour} />
      {programmee && !passee && peut("medical.prononcer") ? (
        <InlineMessage tone="info" title="Visite à venir">
          L&apos;aptitude se prononce le jour de la visite ou après.
        </InlineMessage>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-2">
        <Panneau titre="Visite">
          <Fiche
            elements={[
              ["Agent", <LienDossier key="a" href={`/rh/agents/${agent._id}`}>{`${agent.nomComplet} · ${agent.matricule}`}</LienDossier>],
              ["Métier", `${agent.metierLibelle}${agent.posteSecurite ? " · poste de sécurité" : ""}`],
              ["Nature", TYPES_VISITE[visite.type]],
              ["Date", `${dateIso(visite.dateProgrammee)}${visite.heureProgrammee ? ` à ${visite.heureProgrammee}` : ""}`],
              ["Lieu", visite.lieu],
              ["Périodicité", `${dossier.periodiciteMois} mois`],
              visite.realiseeLe ? ["Prononcée le", `${dateHeure(visite.realiseeLe)} · ${visite.prononceeParNom ?? "—"}`] : null,
              visite.resultat ? ["Décision", RESULTATS_APTITUDE[visite.resultat]] : null,
              visite.valideJusquau ? ["Valable jusqu'au", dateIso(visite.valideJusquau)] : null,
              visite.restrictionFonctionnelle ? ["Consigne", visite.restrictionFonctionnelle] : null,
              visite.motifAnnulation ? ["Motif d'annulation", visite.motifAnnulation] : null,
            ]}
          />
        </Panneau>
        <Panneau titre="Aptitude en vigueur" sousTitre="Dernière décision prononcée">
          <div className="flex flex-wrap items-center gap-3">
            <TagAptitude etat={dossier.aptitudeCourante.etat} />
            {dossier.aptitudeCourante.valideJusquau ? <span className="text-small">jusqu&apos;au {dateIso(dossier.aptitudeCourante.valideJusquau)}</span> : null}
          </div>
          <TableSimple
            libelle="Historique des visites"
            colonnes={[{ libelle: "Visite" }, { libelle: "Date" }, { libelle: "État" }]}
            lignes={dossier.historique.map((h) => [
              <LienDossier key="n" href={`/rh/aptitude/visites/${h._id}`}>{h.numero}</LienDossier>,
              <span key="d" className="tabular">{dateIso(h.dateProgrammee)}</span>,
              h.resultat ? RESULTATS_APTITUDE[h.resultat] : STATUTS_VISITE[h.statut],
            ])}
          />
        </Panneau>

        <Panneau titre="Volet médical" icone={Lock} sousTitre="Secret médical — service de santé au travail">
          {medical ? (
            examens ? (
              <VoletExamens examens={examens} />
            ) : (
              <div className="grid gap-3">
                <p className="text-small text-ink-muted">
                  {dossier.examensSaisis ? "Des examens sont saisis pour cette visite." : "Aucun examen n'est encore saisi pour cette visite."} La consultation du dossier médical de l&apos;agent est inscrite au journal d&apos;audit.
                </p>
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    loading={operation.enCours === "consulter"}
                    onClick={async () => {
                      const resultat = await operation.executer("consulter", () => consulter({ agentId: agent._id }))
                      if (resultat) setExamens(resultat)
                    }}
                  >
                    <Eye />
                    Ouvrir le dossier médical
                  </Button>
                </div>
              </div>
            )
          ) : (
            <p className="text-small text-ink-muted">Constantes, examens et observations ne sont accessibles qu&apos;au médecin et à l&apos;infirmier du travail.</p>
          )}
        </Panneau>

        <Panneau titre="Historique">
          <Chronologie evenements={chronologie(dossier.chronologie)} />
        </Panneau>
      </div>

      {dialogue === "examens" ? <DialogueExamens visiteId={visite._id} onClose={() => setDialogue(null)} onEnregistre={() => setExamens(null)} /> : null}
      {dialogue === "prononcer" ? (
        <DialoguePrononcer visiteId={visite._id} posteSecurite={agent.posteSecurite} periodicite={dossier.periodiciteMois} onClose={() => setDialogue(null)} />
      ) : null}
      {dialogue === "reprogrammer" || dialogue === "annuler" ? (
        <DialogueReprogrammer visite={visite} lieux={dossier.lieux} mode={dialogue} onClose={() => setDialogue(null)} />
      ) : null}
    </CadreRh>
  )
}

function VoletExamens({ examens }: { examens: Examens }) {
  if (examens.length === 0) return <p className="text-small text-ink-muted">Aucun examen n&apos;est enregistré pour cet agent.</p>
  const normal = (v?: string) => (v === "normale" ? "Normale" : v === "anomalie" ? "Anomalie" : v === "deficit_leger" ? "Déficit léger" : v === "deficit" ? "Déficit" : "—")
  const depistage = (v?: string) => (v === "negatif" ? "Négatif" : v === "positif" ? "Positif" : v === "non_realise" ? "Non réalisé" : "—")
  return (
    <div className="grid gap-4">
      {examens.map((e) => (
        <div key={e._id} className="grid gap-2 rounded-md border border-line p-3">
          <b className="text-[14px]">
            {e.visite ? `${e.visite.numero} · ${TYPES_VISITE[e.visite.type]} · ${dateIso(e.visite.dateProgrammee)}` : "Visite"}
          </b>
          <Fiche
            elements={[
              ["Acuité visuelle", e.acuiteVisuelle ?? "—"],
              ["Vision des couleurs", normal(e.visionCouleurs)],
              ["Audition", normal(e.audition)],
              ["Tension artérielle", e.tensionArterielle ? <span key="t" className="tabular">{e.tensionArterielle}</span> : "—"],
              ["Fréquence cardiaque", e.frequenceCardiaque ? <span key="f" className="tabular">{e.frequenceCardiaque} /min</span> : "—"],
              ["Glycémie", e.glycemie ?? "—"],
              ["Dépistage alcool", depistage(e.depistageAlcool)],
              ["Dépistage stupéfiants", depistage(e.depistageStupefiants)],
              ["Observations", e.observations ?? "—"],
              ["Saisi par", `${e.saisiParNom} · ${dateHeure(e.saisiLe)}`],
            ]}
          />
        </div>
      ))}
    </div>
  )
}

function DialogueExamens({ visiteId, onClose, onEnregistre }: { visiteId: Id<"rhVisitesMedicales">; onClose: () => void; onEnregistre: () => void }) {
  const saisir = useMutation(api.modules.rh.aptitude.saisirExamens)
  const operation = useOperation()
  const choix = (d: FormData, cle: string) => (texte(d, cle) as never) ?? undefined
  return (
    <FenetreFormulaire
      open
      onOpenChange={(o) => !o && onClose()}
      large
      titre="Examens de la visite"
      description="Données couvertes par le secret médical : elles ne sortent pas du service de santé au travail."
      libelleValider="Enregistrer les examens"
      enCours={operation.enCours === "examens"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (d) => {
        const ok = await operation.executer("examens", () =>
          saisir({
            visiteId,
            acuiteVisuelle: texte(d, "acuite"),
            visionCouleurs: choix(d, "couleurs"),
            audition: choix(d, "audition"),
            tensionArterielle: texte(d, "tension"),
            frequenceCardiaque: nombreSaisi(d, "frequence"),
            glycemie: texte(d, "glycemie"),
            depistageAlcool: choix(d, "alcool"),
            depistageStupefiants: choix(d, "stupefiants"),
            observations: texte(d, "observations"),
          }).then(() => true)
        )
        if (ok) {
          onEnregistre()
          onClose()
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Acuité visuelle (OD — OG)" htmlFor="ex-acuite">
          <Input id="ex-acuite" name="acuite" placeholder="10/10 — 9/10" />
        </Field>
        <Field label="Vision des couleurs" htmlFor="ex-couleurs">
          <SelectNative id="ex-couleurs" name="couleurs" defaultValue="">
            <option value="">Non évaluée</option>
            <option value="normale">Normale</option>
            <option value="anomalie">Anomalie</option>
          </SelectNative>
        </Field>
        <Field label="Audition" htmlFor="ex-audition">
          <SelectNative id="ex-audition" name="audition" defaultValue="">
            <option value="">Non évaluée</option>
            <option value="normale">Normale</option>
            <option value="deficit_leger">Déficit léger</option>
            <option value="deficit">Déficit</option>
          </SelectNative>
        </Field>
        <Field label="Tension artérielle" htmlFor="ex-tension" hint="Format 120/80">
          <Input id="ex-tension" name="tension" placeholder="120/80" />
        </Field>
        <Field label="Fréquence cardiaque (/min)" htmlFor="ex-frequence">
          <Input id="ex-frequence" name="frequence" type="number" min={20} max={250} inputMode="numeric" />
        </Field>
        <Field label="Glycémie" htmlFor="ex-glycemie">
          <Input id="ex-glycemie" name="glycemie" placeholder="0,95 g/l" />
        </Field>
        <Field label="Dépistage alcool" htmlFor="ex-alcool">
          <SelectNative id="ex-alcool" name="alcool" defaultValue="">
            <option value="">Non renseigné</option>
            <option value="negatif">Négatif</option>
            <option value="positif">Positif</option>
            <option value="non_realise">Non réalisé</option>
          </SelectNative>
        </Field>
        <Field label="Dépistage stupéfiants" htmlFor="ex-stup">
          <SelectNative id="ex-stup" name="stupefiants" defaultValue="">
            <option value="">Non renseigné</option>
            <option value="negatif">Négatif</option>
            <option value="positif">Positif</option>
            <option value="non_realise">Non réalisé</option>
          </SelectNative>
        </Field>
      </div>
      <Field label="Observations médicales" htmlFor="ex-observations">
        <Textarea id="ex-observations" name="observations" />
      </Field>
    </FenetreFormulaire>
  )
}

function DialoguePrononcer({ visiteId, posteSecurite, periodicite, onClose }: { visiteId: Id<"rhVisitesMedicales">; posteSecurite: boolean; periodicite: number; onClose: () => void }) {
  const prononcer = useMutation(api.modules.rh.aptitude.prononcer)
  const operation = useOperation()
  const [resultat, setResultat] = useState<ResultatAptitude>("apte")
  return (
    <FenetreFormulaire
      open
      onOpenChange={(o) => !o && onClose()}
      titre="Prononcer l'aptitude"
      description={`Seuls la décision, l'échéance et la consigne fonctionnelle sont communiqués hors du service médical. Sans échéance saisie : ${periodicite} mois.${posteSecurite ? " Poste de sécurité : les examens doivent être saisis." : ""}`}
      libelleValider={
        <>
          <Gavel />
          Prononcer
        </>
      }
      variante={resultat.startsWith("inapte") ? "danger" : "primary"}
      enCours={operation.enCours === "prononcer"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (d) => {
        const ok = await operation.executer("prononcer", () =>
          prononcer({ visiteId, resultat, restrictionFonctionnelle: texte(d, "restriction"), valideJusquau: texte(d, "echeance") }).then(() => true)
        )
        if (ok) onClose()
      }}
    >
      <Field label="Décision" htmlFor="pr-resultat">
        <SelectNative id="pr-resultat" value={resultat} onChange={(e) => setResultat(e.target.value as ResultatAptitude)}>
          {Object.entries(RESULTATS_APTITUDE).map(([cle, lib]) => (
            <option key={cle} value={cle}>
              {lib}
            </option>
          ))}
        </SelectNative>
      </Field>
      {resultat === "apte_restriction" ? (
        <Field label="Consigne fonctionnelle" htmlFor="pr-restriction" hint="Sans motif médical : « Pas de conduite de nuit ».">
          <Input id="pr-restriction" name="restriction" required />
        </Field>
      ) : null}
      {resultat !== "inapte_definitif" ? (
        <Field
          label={resultat === "inapte_temporaire" ? "Date de réexamen" : "Échéance de l'aptitude (facultatif)"}
          htmlFor="pr-echeance"
        >
          <Input id="pr-echeance" name="echeance" type="date" required={resultat === "inapte_temporaire"} min={aujourdhui(1)} />
        </Field>
      ) : null}
      {resultat.startsWith("inapte") ? (
        <InlineMessage tone="warning" title="Effet immédiat">
          Les services de sécurité de l&apos;agent passent en conflit bloquant au roulement jusqu&apos;à une nouvelle décision.
        </InlineMessage>
      ) : null}
    </FenetreFormulaire>
  )
}

function DialogueReprogrammer({
  visite,
  lieux,
  mode,
  onClose,
}: {
  visite: { _id: Id<"rhVisitesMedicales">; dateProgrammee: string; heureProgrammee?: string; lieu: string }
  lieux: readonly string[]
  mode: "reprogrammer" | "annuler"
  onClose: () => void
}) {
  const reprogrammer = useMutation(api.modules.rh.aptitude.reprogrammer)
  const annuler = useMutation(api.modules.rh.aptitude.annuler)
  const operation = useOperation()
  return (
    <FenetreFormulaire
      open
      onOpenChange={(o) => !o && onClose()}
      titre={mode === "annuler" ? "Annuler la visite" : "Reporter la visite"}
      libelleValider={mode === "annuler" ? "Annuler la visite" : "Reporter"}
      variante={mode === "annuler" ? "danger" : "primary"}
      enCours={operation.enCours === mode}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (d) => {
        const motif = String(d.get("motif") ?? "")
        const ok =
          mode === "annuler"
            ? await operation.executer(mode, () => annuler({ visiteId: visite._id, motif }).then(() => true))
            : await operation.executer(mode, () =>
                reprogrammer({ visiteId: visite._id, dateProgrammee: String(d.get("date") ?? ""), heureProgrammee: texte(d, "heure"), lieu: String(d.get("lieu") ?? visite.lieu), motif }).then(() => true)
              )
        if (ok) onClose()
      }}
    >
      {mode === "reprogrammer" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nouvelle date" htmlFor="rp-date">
              <Input id="rp-date" name="date" type="date" required min={aujourdhui()} defaultValue={visite.dateProgrammee >= aujourdhui() ? visite.dateProgrammee : aujourdhui(1)} />
            </Field>
            <Field label="Heure" htmlFor="rp-heure">
              <Input id="rp-heure" name="heure" type="time" defaultValue={visite.heureProgrammee ?? "08:30"} />
            </Field>
          </div>
          <Field label="Lieu" htmlFor="rp-lieu">
            <SelectNative id="rp-lieu" name="lieu" defaultValue={visite.lieu}>
              {lieux.map((lieu) => (
                <option key={lieu} value={lieu}>
                  {lieu}
                </option>
              ))}
            </SelectNative>
          </Field>
        </>
      ) : null}
      <Field label="Motif" htmlFor="rp-motif">
        <Textarea id="rp-motif" name="motif" required minLength={3} />
      </Field>
    </FenetreFormulaire>
  )
}
