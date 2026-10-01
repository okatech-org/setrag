"use client"

import type { FunctionReturnType } from "convex/server"
import { ArrowRightLeft, BadgeCheck, CalendarPlus, HeartPulse, PencilLine, Plus, RotateCcw, ShieldOff, UserRound } from "lucide-react"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { Chronologie, Fiche, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { Onglets, useOperation } from "@/components/gestion/referentiels/elements"
import { dateHeure } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire, nombreSaisi, texte } from "@/components/gestion/referentiels/formulaire"

import { DialogueProgrammerVisite } from "./aptitude"
import { CadreRh, TagAgent, TagAptitude, TagConge, TagHabilitation, TagService, TagVisite, useAccesRh } from "./cadre-rh"
import { Chargement, Introuvable, Montant, aujourdhui, chronologie, dateIso, type Id } from "./commun"
import { DialogueDemandeConge } from "./conges"
import {
  CATEGORIES,
  CONTRATS,
  DIRECTIONS,
  GARES,
  METIERS,
  MODES_PAIEMENT,
  MOTIFS_SORTIE,
  RESULTATS_APTITUDE,
  SITUATIONS,
  TYPES_CONGE,
  TYPES_HABILITATION,
  TYPES_MOUVEMENT,
  TYPES_SERVICE,
  TYPES_VISITE,
  libelle,
  nomGare,
  type Categorie,
  type Direction,
  type Metier,
  type ModePaiement,
  type MotifSortie,
  type Situation,
  type TypeHabilitation,
} from "./libelles"

type Dossier = NonNullable<FunctionReturnType<typeof api.modules.rh.agents.dossier>>
type Habilitation = Dossier["habilitations"][number]
type Onglet = "dossier" | "habilitations" | "carriere" | "paie" | "conges" | "aptitude" | "roulement" | "historique"

const RETOUR = { href: "/rh/agents", libelle: "Dossiers du personnel" }

export function DossierAgent({ agentId }: { agentId: string }) {
  const { peut } = useAccesRh()
  const dossier = useQuery(api.modules.rh.agents.dossier, { agentId: agentId as Id<"rhAgents"> })
  const [onglet, setOnglet] = useState<Onglet>("dossier")
  const [dialogue, setDialogue] = useState<"identite" | "mouvement" | "habilitation" | "conge" | "visite" | null>(null)

  if (dossier === undefined) {
    return (
      <CadreRh titre="Dossier d'un agent" retour={RETOUR}>
        <Chargement libelle="Chargement du dossier" />
      </CadreRh>
    )
  }
  if (dossier === null) {
    return (
      <CadreRh titre="Dossier introuvable" retour={RETOUR}>
        <Introuvable titre="Cet agent n'existe pas" retour={RETOUR} />
      </CadreRh>
    )
  }
  const { agent } = dossier
  const sorti = agent.statut === "sorti"
  const gerer = peut("dossiers.gerer") && !sorti

  const onglets = [
    { cle: "dossier" as const, libelle: "Dossier" },
    { cle: "habilitations" as const, libelle: "Habilitations", compte: dossier.habilitations.filter((h) => h.etat !== "valide").length || undefined },
    { cle: "carriere" as const, libelle: "Carrière", compte: dossier.mouvements.length },
    ...(dossier.bulletins ? [{ cle: "paie" as const, libelle: "Paie", compte: dossier.bulletins.length }] : []),
    ...(dossier.conges ? [{ cle: "conges" as const, libelle: "Congés", compte: dossier.conges.filter((c) => c.statut === "demande").length || undefined }] : []),
    ...(dossier.visites ? [{ cle: "aptitude" as const, libelle: "Aptitude" }] : []),
    ...(dossier.services ? [{ cle: "roulement" as const, libelle: "Roulement", compte: dossier.services.filter((s) => s.statut !== "annule").length }] : []),
    { cle: "historique" as const, libelle: "Historique" },
  ]

  return (
    <CadreRh
      titre={agent.nomComplet}
      description={`${agent.matricule} · ${agent.poste} · ${agent.gareNom} · ${DIRECTIONS[agent.direction]}`}
      retour={RETOUR}
      actions={
        gerer ? (
          <>
            <Button type="button" variant="secondary" onClick={() => setDialogue("identite")}>
              <PencilLine />
              Modifier l&apos;état civil
            </Button>
            <Button type="button" onClick={() => setDialogue("mouvement")}>
              <ArrowRightLeft />
              Enregistrer un mouvement
            </Button>
          </>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagAgent statut={agent.statut} />
        {dossier.aptitude ? <TagAptitude etat={dossier.aptitude.etat} /> : null}
        {agent.aCompte ? (
          <span className="text-small inline-flex items-center gap-1 text-ink-muted">
            <UserRound aria-hidden className="size-4" />
            Compte du portail rattaché
          </span>
        ) : null}
      </div>

      <Onglets libelle="Dossier de l'agent" valeur={onglet} onChange={setOnglet} onglets={onglets} />

      <div role="tabpanel">
        {onglet === "dossier" ? <VoletDossier dossier={dossier} /> : null}
        {onglet === "habilitations" ? <VoletHabilitations dossier={dossier} gerer={gerer} onAjouter={() => setDialogue("habilitation")} /> : null}
        {onglet === "carriere" ? <VoletCarriere dossier={dossier} /> : null}
        {onglet === "paie" && dossier.bulletins ? <VoletPaie bulletins={dossier.bulletins} /> : null}
        {onglet === "conges" && dossier.conges ? (
          <VoletConges dossier={dossier} peutDemander={peut("conges.demander") && !sorti} onDemander={() => setDialogue("conge")} />
        ) : null}
        {onglet === "aptitude" && dossier.visites ? (
          <VoletAptitude dossier={dossier} peutProgrammer={peut("medical.programmer") && !sorti} onProgrammer={() => setDialogue("visite")} />
        ) : null}
        {onglet === "roulement" && dossier.services ? <VoletRoulement services={dossier.services} /> : null}
        {onglet === "historique" ? (
          <Panneau titre="Historique du dossier">
            <Chronologie evenements={chronologie(dossier.chronologie)} vide="Aucune action tracée sur ce dossier." />
          </Panneau>
        ) : null}
      </div>

      {gerer ? (
        <>
          <DialogueIdentite dossier={dossier} open={dialogue === "identite"} onOpenChange={(o) => setDialogue(o ? "identite" : null)} />
          <DialogueMouvement dossier={dossier} open={dialogue === "mouvement"} onOpenChange={(o) => setDialogue(o ? "mouvement" : null)} />
          <DialogueHabilitation agentId={agent._id} open={dialogue === "habilitation"} onOpenChange={(o) => setDialogue(o ? "habilitation" : null)} />
        </>
      ) : null}
      <DialogueDemandeConge agentFixe={{ _id: agent._id, nomComplet: agent.nomComplet }} open={dialogue === "conge"} onOpenChange={(o) => setDialogue(o ? "conge" : null)} />
      <DialogueProgrammerVisite agentFixe={{ _id: agent._id, nomComplet: agent.nomComplet }} open={dialogue === "visite"} onOpenChange={(o) => setDialogue(o ? "visite" : null)} />
    </CadreRh>
  )
}

/* ══════════════════════════════ Volets ══════════════════════════════════ */

function VoletDossier({ dossier }: { dossier: Dossier }) {
  const { agent } = dossier
  const r = agent.remuneration
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panneau titre="Identité">
        <Fiche
          elements={[
            ["Matricule", <span key="m" className="tabular">{agent.matricule}</span>],
            ["Nom et prénom", agent.nomComplet],
            ["Sexe", agent.sexe === "F" ? "Féminin" : "Masculin"],
            ["Naissance", `${dateIso(agent.dateNaissance)}${agent.lieuNaissance ? ` à ${agent.lieuNaissance}` : ""}`],
            ["Situation familiale", `${SITUATIONS[agent.situationFamiliale]} · ${agent.enfantsACharge} enfant(s) à charge`],
            ["Téléphone", agent.telephone ? <span key="t" className="tabular">{agent.telephone}</span> : "—"],
            ["Courriel", agent.email ?? "—"],
            ["Adresse", agent.adresse ?? "—"],
          ]}
        />
      </Panneau>
      <Panneau titre="Poste et contrat">
        <Fiche
          elements={[
            ["Direction", `${agent.direction} · ${DIRECTIONS[agent.direction]}`],
            ["Métier", METIERS[agent.metier]],
            ["Poste", agent.poste],
            ["Gare d'affectation", agent.gareNom],
            ["Catégorie, échelon", `${CATEGORIES[agent.categorie]} · échelon ${agent.echelon}`],
            ["Contrat", `${CONTRATS[agent.contrat]}${agent.dateFinContrat ? ` jusqu'au ${dateIso(agent.dateFinContrat)}` : ""}`],
            ["Embauche", `${dateIso(agent.dateEmbauche)} · ${agent.ancienneteAnnees} an(s) d'ancienneté`],
            agent.dateSortie ? ["Sortie", `${dateIso(agent.dateSortie)} · ${libelle(MOTIFS_SORTIE, agent.motifSortie)}`] : null,
          ]}
        />
      </Panneau>
      {r ? (
        <Panneau titre="Rémunération et protection sociale" sousTitre="Visible du service paie uniquement">
          <Fiche
            elements={[
              ["Salaire de base", <Montant key="s" valeur={r.salaireBaseFcfa} />],
              ["Prime de fonction", <Montant key="f" valeur={r.primeFonctionFcfa} />],
              ["Prime de sujétion", <Montant key="j" valeur={r.primeSujetionFcfa} />],
              ["Paiement", `${MODES_PAIEMENT[r.modePaiement]}${r.comptePaiement ? ` · ${r.comptePaiement}` : ""}`],
              ["N° CNSS", r.numeroCnss ? <span key="c" className="tabular">{r.numeroCnss}</span> : "Non renseigné"],
              ["N° CNAMGS", r.numeroCnamgs ? <span key="a" className="tabular">{r.numeroCnamgs}</span> : "Non renseigné"],
            ]}
          />
        </Panneau>
      ) : null}
      {dossier.aptitude ? (
        <Panneau titre="Aptitude médicale" icone={HeartPulse} sousTitre="Statut seul ; le détail reste au service médical">
          <div className="flex flex-wrap items-center gap-3">
            <TagAptitude etat={dossier.aptitude.etat} />
            {dossier.aptitude.valideJusquau ? <span className="text-small">Jusqu&apos;au {dateIso(dossier.aptitude.valideJusquau)}</span> : null}
          </div>
          {dossier.aptitude.restrictionFonctionnelle ? (
            <InlineMessage tone="info" title="Consigne d'aptitude">
              {dossier.aptitude.restrictionFonctionnelle}
            </InlineMessage>
          ) : null}
        </Panneau>
      ) : null}
    </div>
  )
}

function VoletHabilitations({ dossier, gerer, onAjouter }: { dossier: Dossier; gerer: boolean; onAjouter: () => void }) {
  const [renouveler, setRenouveler] = useState<Habilitation | null>(null)
  const [statut, setStatut] = useState<Habilitation | null>(null)
  const colonnes: ColonneTableau<Habilitation>[] = [
    { cle: "type", libelle: "Habilitation", rendu: (h) => TYPES_HABILITATION[h.type], tri: (h) => TYPES_HABILITATION[h.type] },
    { cle: "numero", libelle: "N°", rendu: (h) => <span className="tabular">{h.numero}</span>, tri: (h) => h.numero, secondaire: true },
    { cle: "delivree", libelle: "Délivrée", rendu: (h) => <span className="tabular">{dateIso(h.delivreeLe)}</span>, tri: (h) => h.delivreeLe, secondaire: true },
    { cle: "expire", libelle: "Échéance", rendu: (h) => <span className="tabular">{dateIso(h.expireLe)}</span>, tri: (h) => h.expireLe },
    { cle: "organisme", libelle: "Organisme", rendu: (h) => h.organisme, tri: (h) => h.organisme, secondaire: true },
    { cle: "etat", libelle: "État", rendu: (h) => <TagHabilitation etat={h.etat} />, tri: (h) => h.etat },
    {
      cle: "actions",
      libelle: "Actions",
      export: false,
      rendu: (h) =>
        gerer && h.statut !== "retiree" ? (
          <span className="flex flex-wrap gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setRenouveler(h)}>
              <RotateCcw />
              Renouveler
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setStatut(h)}>
              <ShieldOff />
              {h.statut === "valide" ? "Suspendre" : "Rétablir"}
            </Button>
          </span>
        ) : null,
    },
  ]
  return (
    <div className="grid gap-3">
      {gerer ? (
        <div>
          <Button type="button" variant="secondary" onClick={onAjouter}>
            <Plus />
            Délivrer une habilitation
          </Button>
        </div>
      ) : null}
      <TableauDonnees
        libelle="Habilitations ferroviaires"
        colonnes={colonnes}
        lignes={dossier.habilitations}
        cle={(h) => h._id}
        exportNom={`habilitations-${dossier.agent.matricule}`}
        triInitial={{ cle: "expire", sens: "asc" }}
        vide={{ titre: "Aucune habilitation", description: "Cet agent ne détient aucune habilitation ferroviaire." }}
      />
      {renouveler ? <DialogueRenouvellement habilitation={renouveler} onClose={() => setRenouveler(null)} /> : null}
      {statut ? <DialogueStatutHabilitation habilitation={statut} onClose={() => setStatut(null)} /> : null}
    </div>
  )
}

function VoletCarriere({ dossier }: { dossier: Dossier }) {
  type Mouvement = Dossier["mouvements"][number]
  const decrire = (m: Mouvement) => {
    const avant = m.avant
    const apres = m.apres
    if (!apres) return m.motif
    const parties: string[] = []
    if (apres.gareCode && avant?.gareCode !== apres.gareCode) parties.push(`${avant?.gareCode ? `${nomGare(avant.gareCode)} → ` : ""}${nomGare(apres.gareCode)}`)
    if (apres.poste && avant?.poste !== apres.poste) parties.push(apres.poste)
    if (apres.echelon !== undefined && avant?.echelon !== apres.echelon) parties.push(`échelon ${avant?.echelon ?? "—"} → ${apres.echelon}`)
    if (apres.salaireBaseFcfa !== undefined && avant?.salaireBaseFcfa !== undefined && avant.salaireBaseFcfa !== apres.salaireBaseFcfa) parties.push("salaire révisé")
    return parties.length > 0 ? parties.join(" · ") : m.motif
  }
  const colonnes: ColonneTableau<Mouvement>[] = [
    { cle: "date", libelle: "Date d'effet", rendu: (m) => <span className="tabular">{dateIso(m.dateEffet)}</span>, tri: (m) => m.dateEffet },
    { cle: "type", libelle: "Mouvement", rendu: (m) => TYPES_MOUVEMENT[m.type], tri: (m) => m.type, export: (m) => TYPES_MOUVEMENT[m.type] },
    { cle: "detail", libelle: "Changement", rendu: decrire, export: decrire },
    { cle: "motif", libelle: "Motif", rendu: (m) => m.motif, tri: (m) => m.motif, secondaire: true },
    { cle: "acteur", libelle: "Saisi par", rendu: (m) => m.acteurNom, tri: (m) => m.acteurNom, secondaire: true },
  ]
  return (
    <TableauDonnees
      libelle="Carrière"
      colonnes={colonnes}
      lignes={dossier.mouvements}
      cle={(m) => m._id}
      exportNom={`carriere-${dossier.agent.matricule}`}
      triInitial={{ cle: "date", sens: "desc" }}
      vide={{ titre: "Aucun mouvement" }}
    />
  )
}

function VoletPaie({ bulletins }: { bulletins: NonNullable<Dossier["bulletins"]> }) {
  type Ligne = (typeof bulletins)[number]
  const colonnes: ColonneTableau<Ligne>[] = [
    { cle: "periode", libelle: "Période", rendu: (b) => b.periodeLibelle, tri: (b) => b.periodeCode },
    { cle: "numero", libelle: "Bulletin", rendu: (b) => <span className="tabular">{b.numero}</span>, tri: (b) => b.numero },
    { cle: "brut", libelle: "Brut", rendu: (b) => <Montant valeur={b.brut} />, tri: (b) => b.brut, numerique: true },
    { cle: "net", libelle: "Net à payer", rendu: (b) => <Montant valeur={b.net} className="font-semibold" />, tri: (b) => b.net, numerique: true },
    { cle: "statut", libelle: "État", rendu: (b) => (b.statut === "valide" ? "Validé" : "Calculé"), tri: (b) => b.statut },
  ]
  return (
    <TableauDonnees
      libelle="Bulletins de paie"
      colonnes={colonnes}
      lignes={bulletins}
      cle={(b) => b._id}
      lien={(b) => `/rh/paie/bulletins/${b._id}`}
      triInitial={{ cle: "periode", sens: "desc" }}
      vide={{ titre: "Aucun bulletin", description: "Aucune paie n'a encore été calculée pour cet agent." }}
    />
  )
}

function VoletConges({ dossier, peutDemander, onDemander }: { dossier: Dossier; peutDemander: boolean; onDemander: () => void }) {
  type Conge = NonNullable<Dossier["conges"]>[number]
  const solde = dossier.soldeConges
  const colonnes: ColonneTableau<Conge>[] = [
    { cle: "numero", libelle: "N°", rendu: (c) => <span className="tabular">{c.numero}</span>, tri: (c) => c.numero },
    { cle: "type", libelle: "Nature", rendu: (c) => TYPES_CONGE[c.type], tri: (c) => c.type, export: (c) => TYPES_CONGE[c.type] },
    { cle: "du", libelle: "Du", rendu: (c) => <span className="tabular">{dateIso(c.du)}</span>, tri: (c) => c.du },
    { cle: "au", libelle: "Au", rendu: (c) => <span className="tabular">{dateIso(c.au)}</span>, tri: (c) => c.au },
    { cle: "jours", libelle: "Jours", rendu: (c) => c.jours, tri: (c) => c.jours, numerique: true },
    { cle: "statut", libelle: "État", rendu: (c) => <TagConge statut={c.statut} />, tri: (c) => c.statut },
  ]
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {solde ? (
          <p className="text-[14px]">
            Congé annuel {solde.annee} : <b className="tabular">{solde.droits}</b> jours acquis, <b className="tabular">{solde.pris}</b> pris,{" "}
            <b className="tabular">{solde.enAttente}</b> en attente — reste <b className="tabular">{solde.droits - solde.pris - solde.enAttente}</b> jours ouvrables.
          </p>
        ) : null}
        {peutDemander ? (
          <Button type="button" variant="secondary" className="ml-auto" onClick={onDemander}>
            <CalendarPlus />
            Saisir une demande
          </Button>
        ) : null}
      </div>
      <TableauDonnees
        libelle="Congés et absences"
        colonnes={colonnes}
        lignes={dossier.conges ?? []}
        cle={(c) => c._id}
        lien={(c) => `/rh/conges/${c._id}`}
        exportNom={`conges-${dossier.agent.matricule}`}
        triInitial={{ cle: "du", sens: "desc" }}
        vide={{ titre: "Aucun congé", description: "Aucune absence n'est enregistrée pour cet agent." }}
      />
    </div>
  )
}

function VoletAptitude({ dossier, peutProgrammer, onProgrammer }: { dossier: Dossier; peutProgrammer: boolean; onProgrammer: () => void }) {
  type Visite = NonNullable<Dossier["visites"]>[number]
  const colonnes: ColonneTableau<Visite>[] = [
    { cle: "numero", libelle: "N°", rendu: (v) => <span className="tabular">{v.numero}</span>, tri: (v) => v.numero },
    { cle: "type", libelle: "Visite", rendu: (v) => TYPES_VISITE[v.type], tri: (v) => v.type, export: (v) => TYPES_VISITE[v.type] },
    { cle: "date", libelle: "Date", rendu: (v) => <span className="tabular">{dateIso(v.dateProgrammee)}</span>, tri: (v) => v.dateProgrammee },
    { cle: "statut", libelle: "État", rendu: (v) => <TagVisite statut={v.statut} />, tri: (v) => v.statut },
    { cle: "resultat", libelle: "Décision", rendu: (v) => libelle(RESULTATS_APTITUDE, v.resultat), tri: (v) => v.resultat ?? "" },
    { cle: "echeance", libelle: "Valable jusqu'au", rendu: (v) => <span className="tabular">{dateIso(v.valideJusquau)}</span>, tri: (v) => v.valideJusquau ?? "", secondaire: true },
  ]
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {dossier.aptitude ? <TagAptitude etat={dossier.aptitude.etat} /> : null}
        {dossier.aptitude?.restrictionFonctionnelle ? <span className="text-small">Consigne : {dossier.aptitude.restrictionFonctionnelle}</span> : null}
        {peutProgrammer ? (
          <Button type="button" variant="secondary" className="ml-auto" onClick={onProgrammer}>
            <CalendarPlus />
            Programmer une visite
          </Button>
        ) : null}
      </div>
      <TableauDonnees
        libelle="Visites médicales"
        colonnes={colonnes}
        lignes={dossier.visites ?? []}
        cle={(v) => v._id}
        lien={(v) => `/rh/aptitude/visites/${v._id}`}
        triInitial={{ cle: "date", sens: "desc" }}
        vide={{ titre: "Aucune visite", description: "Aucune visite médicale n'est enregistrée." }}
      />
    </div>
  )
}

function VoletRoulement({ services }: { services: NonNullable<Dossier["services"]> }) {
  type Service = (typeof services)[number]
  const colonnes: ColonneTableau<Service>[] = [
    { cle: "debut", libelle: "Prise de service", rendu: (s) => <span className="tabular">{dateHeure(s.debut)}</span>, tri: (s) => s.debut },
    { cle: "fin", libelle: "Fin", rendu: (s) => <span className="tabular">{dateHeure(s.fin)}</span>, tri: (s) => s.fin },
    { cle: "type", libelle: "Service", rendu: (s) => `${TYPES_SERVICE[s.type]}${s.trainNumber ? ` · ${s.trainNumber}` : ""}`, tri: (s) => s.type },
    { cle: "trajet", libelle: "Trajet", rendu: (s) => `${nomGare(s.gareDebutCode)} → ${nomGare(s.gareFinCode)}`, secondaire: true, export: (s) => `${nomGare(s.gareDebutCode)} → ${nomGare(s.gareFinCode)}` },
    { cle: "statut", libelle: "État", rendu: (s) => <TagService statut={s.statut} />, tri: (s) => s.statut },
  ]
  return (
    <TableauDonnees
      libelle="Services de l'agent"
      colonnes={colonnes}
      lignes={services}
      cle={(s) => s._id}
      lien={(s) => `/rh/roulements/${s._id}`}
      triInitial={{ cle: "debut", sens: "asc" }}
      vide={{ titre: "Aucun service planifié", description: "Rien au roulement depuis une semaine." }}
    />
  )
}

/* ═════════════════════════════ Dialogues ════════════════════════════════ */

function DialogueIdentite({ dossier, open, onOpenChange }: { dossier: Dossier; open: boolean; onOpenChange: (o: boolean) => void }) {
  const modifier = useMutation(api.modules.rh.agents.modifierIdentite)
  const operation = useOperation()
  const { agent } = dossier
  const r = agent.remuneration
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre="Modifier l'état civil et les coordonnées"
      description="Chaque champ modifié est tracé avec sa valeur antérieure."
      libelleValider="Enregistrer"
      enCours={operation.enCours === "identite"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (d) => {
        const ok = await operation.executer("identite", () =>
          modifier({
            agentId: agent._id,
            nom: String(d.get("nom") ?? ""),
            prenom: String(d.get("prenom") ?? ""),
            sexe: String(d.get("sexe")) as "F" | "M",
            dateNaissance: String(d.get("dateNaissance") ?? ""),
            lieuNaissance: texte(d, "lieuNaissance"),
            telephone: texte(d, "telephone"),
            email: texte(d, "email"),
            adresse: texte(d, "adresse"),
            situationFamiliale: String(d.get("situation")) as Situation,
            enfantsACharge: nombreSaisi(d, "enfants") ?? 0,
            modePaiement: (String(d.get("modePaiement") ?? r?.modePaiement ?? "virement")) as ModePaiement,
            comptePaiement: texte(d, "comptePaiement") ?? r?.comptePaiement,
            numeroCnss: texte(d, "numeroCnss") ?? r?.numeroCnss,
            numeroCnamgs: texte(d, "numeroCnamgs") ?? r?.numeroCnamgs,
          }).then(() => true)
        )
        if (ok) onOpenChange(false)
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom" htmlFor="id-nom">
          <Input id="id-nom" name="nom" required defaultValue={agent.nom} />
        </Field>
        <Field label="Prénom" htmlFor="id-prenom">
          <Input id="id-prenom" name="prenom" required defaultValue={agent.prenom} />
        </Field>
        <Field label="Sexe" htmlFor="id-sexe">
          <SelectNative id="id-sexe" name="sexe" defaultValue={agent.sexe}>
            <option value="M">Masculin</option>
            <option value="F">Féminin</option>
          </SelectNative>
        </Field>
        <Field label="Date de naissance" htmlFor="id-naissance">
          <Input id="id-naissance" name="dateNaissance" type="date" required defaultValue={agent.dateNaissance} />
        </Field>
        <Field label="Lieu de naissance" htmlFor="id-lieu">
          <Input id="id-lieu" name="lieuNaissance" defaultValue={agent.lieuNaissance ?? ""} />
        </Field>
        <Field label="Téléphone" htmlFor="id-tel">
          <Input id="id-tel" name="telephone" type="tel" defaultValue={agent.telephone ?? ""} />
        </Field>
        <Field label="Courriel" htmlFor="id-mail">
          <Input id="id-mail" name="email" type="email" defaultValue={agent.email ?? ""} />
        </Field>
        <Field label="Adresse" htmlFor="id-adresse">
          <Input id="id-adresse" name="adresse" defaultValue={agent.adresse ?? ""} />
        </Field>
        <Field label="Situation familiale" htmlFor="id-situation" hint="Change le nombre de parts IRPP dès la prochaine paie.">
          <SelectNative id="id-situation" name="situation" defaultValue={agent.situationFamiliale}>
            {Object.entries(SITUATIONS).map(([cle, lib]) => (
              <option key={cle} value={cle}>
                {lib}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Enfants à charge" htmlFor="id-enfants">
          <Input id="id-enfants" name="enfants" type="number" min={0} max={20} defaultValue={agent.enfantsACharge} />
        </Field>
        {r ? (
          <>
            <Field label="Mode de paiement" htmlFor="id-paiement">
              <SelectNative id="id-paiement" name="modePaiement" defaultValue={r.modePaiement}>
                {Object.entries(MODES_PAIEMENT).map(([cle, lib]) => (
                  <option key={cle} value={cle}>
                    {lib}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field label="Compte ou numéro (masqué)" htmlFor="id-compte">
              <Input id="id-compte" name="comptePaiement" defaultValue={r.comptePaiement ?? ""} />
            </Field>
            <Field label="N° CNSS" htmlFor="id-cnss">
              <Input id="id-cnss" name="numeroCnss" defaultValue={r.numeroCnss ?? ""} />
            </Field>
            <Field label="N° CNAMGS" htmlFor="id-cnamgs">
              <Input id="id-cnamgs" name="numeroCnamgs" defaultValue={r.numeroCnamgs ?? ""} />
            </Field>
          </>
        ) : null}
      </div>
    </FenetreFormulaire>
  )
}

type TypeMouvement = "mutation" | "promotion" | "revision_salaire" | "suspension" | "reintegration" | "sortie"

function DialogueMouvement({ dossier, open, onOpenChange }: { dossier: Dossier; open: boolean; onOpenChange: (o: boolean) => void }) {
  const enregistrer = useMutation(api.modules.rh.agents.enregistrerMouvement)
  const operation = useOperation()
  const { agent } = dossier
  const types: TypeMouvement[] =
    agent.statut === "suspendu" ? ["reintegration", "sortie"] : ["mutation", "promotion", "revision_salaire", "suspension", "sortie"]
  const [type, setType] = useState<TypeMouvement>(types[0]!)
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre="Enregistrer un mouvement de carrière"
      description="Le dossier est mis à jour à la date d'effet ; l'historique garde la situation antérieure. Une sortie annule les services et congés à venir."
      libelleValider="Enregistrer le mouvement"
      variante={type === "sortie" || type === "suspension" ? "danger" : "primary"}
      enCours={operation.enCours === "mouvement"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (d) => {
        const ok = await operation.executer("mouvement", () =>
          enregistrer({
            agentId: agent._id,
            type,
            dateEffet: String(d.get("dateEffet") ?? ""),
            motif: String(d.get("motif") ?? ""),
            direction: (texte(d, "direction") as Direction | undefined) ?? undefined,
            metier: (texte(d, "metier") as Metier | undefined) ?? undefined,
            poste: texte(d, "poste"),
            gareCode: texte(d, "gareCode"),
            categorie: (texte(d, "categorie") as Categorie | undefined) ?? undefined,
            echelon: nombreSaisi(d, "echelon"),
            salaireBaseFcfa: nombreSaisi(d, "salaire"),
            primeFonctionFcfa: nombreSaisi(d, "primeFonction"),
            motifSortie: (texte(d, "motifSortie") as MotifSortie | undefined) ?? undefined,
          }).then(() => true)
        )
        if (ok) onOpenChange(false)
      }}
    >
      <Field label="Nature du mouvement" htmlFor="mvt-type">
        <SelectNative id="mvt-type" value={type} onChange={(e) => setType(e.target.value as TypeMouvement)}>
          {types.map((t) => (
            <option key={t} value={t}>
              {TYPES_MOUVEMENT[t]}
            </option>
          ))}
        </SelectNative>
      </Field>
      <Field label="Date d'effet" htmlFor="mvt-date">
        <Input id="mvt-date" name="dateEffet" type="date" required defaultValue={aujourdhui()} />
      </Field>
      {type === "mutation" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nouvelle gare" htmlFor="mvt-gare">
            <SelectNative id="mvt-gare" name="gareCode" defaultValue={agent.gareCode}>
              {GARES.map(([code, nom]) => (
                <option key={code} value={code}>
                  {nom}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Direction" htmlFor="mvt-direction">
            <SelectNative id="mvt-direction" name="direction" defaultValue={agent.direction}>
              {Object.entries(DIRECTIONS).map(([cle, lib]) => (
                <option key={cle} value={cle}>
                  {cle} · {lib}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Métier" htmlFor="mvt-metier">
            <SelectNative id="mvt-metier" name="metier" defaultValue={agent.metier}>
              {Object.entries(METIERS).map(([cle, lib]) => (
                <option key={cle} value={cle}>
                  {lib}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Poste" htmlFor="mvt-poste">
            <Input id="mvt-poste" name="poste" defaultValue={agent.poste} />
          </Field>
        </div>
      ) : null}
      {type === "promotion" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Catégorie" htmlFor="mvt-categorie">
            <SelectNative id="mvt-categorie" name="categorie" defaultValue={agent.categorie}>
              {Object.entries(CATEGORIES).map(([cle, lib]) => (
                <option key={cle} value={cle}>
                  {lib}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Échelon" htmlFor="mvt-echelon">
            <Input id="mvt-echelon" name="echelon" type="number" min={1} max={20} defaultValue={agent.echelon + 1} />
          </Field>
          <Field label="Nouveau poste (facultatif)" htmlFor="mvt-poste2">
            <Input id="mvt-poste2" name="poste" />
          </Field>
          <Field label="Nouveau salaire de base (XAF, facultatif)" htmlFor="mvt-salaire2">
            <Input id="mvt-salaire2" name="salaire" inputMode="numeric" />
          </Field>
        </div>
      ) : null}
      {type === "revision_salaire" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Salaire de base (XAF)" htmlFor="mvt-salaire" hint={agent.remuneration ? `Actuel : ${agent.remuneration.salaireBaseFcfa}` : undefined}>
            <Input id="mvt-salaire" name="salaire" inputMode="numeric" defaultValue={agent.remuneration?.salaireBaseFcfa ?? ""} />
          </Field>
          <Field label="Prime de fonction (XAF)" htmlFor="mvt-fonction">
            <Input id="mvt-fonction" name="primeFonction" inputMode="numeric" defaultValue={agent.remuneration?.primeFonctionFcfa ?? ""} />
          </Field>
        </div>
      ) : null}
      {type === "sortie" ? (
        <Field label="Motif de sortie" htmlFor="mvt-sortie">
          <SelectNative id="mvt-sortie" name="motifSortie" defaultValue="demission">
            {Object.entries(MOTIFS_SORTIE).map(([cle, lib]) => (
              <option key={cle} value={cle}>
                {lib}
              </option>
            ))}
          </SelectNative>
        </Field>
      ) : null}
      <Field label="Motif et référence de la décision" htmlFor="mvt-motif">
        <Textarea id="mvt-motif" name="motif" required minLength={3} placeholder="Décision DRH n° 2026-118 du 30 septembre." />
      </Field>
    </FenetreFormulaire>
  )
}

function DialogueHabilitation({ agentId, open, onOpenChange }: { agentId: Id<"rhAgents">; open: boolean; onOpenChange: (o: boolean) => void }) {
  const ajouter = useMutation(api.modules.rh.agents.ajouterHabilitation)
  const operation = useOperation()
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre="Délivrer une habilitation"
      description="Sans échéance saisie, la durée réglementaire de l'habilitation s'applique."
      libelleValider={
        <>
          <BadgeCheck />
          Délivrer
        </>
      }
      enCours={operation.enCours === "habilitation"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (d) => {
        const ok = await operation.executer("habilitation", () =>
          ajouter({
            agentId,
            type: String(d.get("type")) as TypeHabilitation,
            numero: String(d.get("numero") ?? ""),
            delivreeLe: String(d.get("delivreeLe") ?? ""),
            expireLe: texte(d, "expireLe"),
            organisme: String(d.get("organisme") ?? ""),
          }).then(() => true)
        )
        if (ok) onOpenChange(false)
      }}
    >
      <Field label="Habilitation" htmlFor="hab-type">
        <SelectNative id="hab-type" name="type" defaultValue="securite_ferroviaire">
          {Object.entries(TYPES_HABILITATION).map(([cle, lib]) => (
            <option key={cle} value={cle}>
              {lib}
            </option>
          ))}
        </SelectNative>
      </Field>
      <Field label="Numéro du certificat" htmlFor="hab-numero">
        <Input id="hab-numero" name="numero" required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Délivrée le" htmlFor="hab-delivree">
          <Input id="hab-delivree" name="delivreeLe" type="date" required defaultValue={aujourdhui()} />
        </Field>
        <Field label="Échéance (facultatif)" htmlFor="hab-expire">
          <Input id="hab-expire" name="expireLe" type="date" />
        </Field>
      </div>
      <Field label="Organisme" htmlFor="hab-organisme">
        <Input id="hab-organisme" name="organisme" required defaultValue="Centre de formation SETRAG — Owendo" />
      </Field>
    </FenetreFormulaire>
  )
}

function DialogueRenouvellement({ habilitation, onClose }: { habilitation: Habilitation; onClose: () => void }) {
  const renouveler = useMutation(api.modules.rh.agents.renouvelerHabilitation)
  const operation = useOperation()
  return (
    <FenetreFormulaire
      open
      onOpenChange={(o) => !o && onClose()}
      titre={`Renouveler « ${TYPES_HABILITATION[habilitation.type]} »`}
      description={`Échéance actuelle : ${dateIso(habilitation.expireLe)}.`}
      libelleValider="Renouveler"
      enCours={operation.enCours === "renouveler"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (d) => {
        const ok = await operation.executer("renouveler", () =>
          renouveler({
            habilitationId: habilitation._id,
            numero: String(d.get("numero") ?? ""),
            delivreeLe: String(d.get("delivreeLe") ?? ""),
            expireLe: texte(d, "expireLe"),
          }).then(() => true)
        )
        if (ok) onClose()
      }}
    >
      <Field label="Numéro du nouveau certificat" htmlFor="ren-numero">
        <Input id="ren-numero" name="numero" required defaultValue={habilitation.numero} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Délivrée le" htmlFor="ren-delivree">
          <Input id="ren-delivree" name="delivreeLe" type="date" required defaultValue={aujourdhui()} />
        </Field>
        <Field label="Nouvelle échéance (facultatif)" htmlFor="ren-expire">
          <Input id="ren-expire" name="expireLe" type="date" />
        </Field>
      </div>
    </FenetreFormulaire>
  )
}

function DialogueStatutHabilitation({ habilitation, onClose }: { habilitation: Habilitation; onClose: () => void }) {
  const changer = useMutation(api.modules.rh.agents.changerStatutHabilitation)
  const operation = useOperation()
  const valide = habilitation.statut === "valide"
  const [statut, setStatut] = useState<"valide" | "suspendue" | "retiree">(valide ? "suspendue" : "valide")
  return (
    <FenetreFormulaire
      open
      onOpenChange={(o) => !o && onClose()}
      titre={`Habilitation « ${TYPES_HABILITATION[habilitation.type]} »`}
      description="Une habilitation suspendue ou retirée bloque aussitôt les services qui l'exigent."
      libelleValider="Confirmer"
      variante={statut === "valide" ? "primary" : "danger"}
      enCours={operation.enCours === "statut"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (d) => {
        const ok = await operation.executer("statut", () =>
          changer({ habilitationId: habilitation._id, statut, motif: String(d.get("motif") ?? "") }).then(() => true)
        )
        if (ok) onClose()
      }}
    >
      <Field label="Nouvel état" htmlFor="sh-statut">
        <SelectNative id="sh-statut" value={statut} onChange={(e) => setStatut(e.target.value as typeof statut)}>
          {valide ? null : <option value="valide">Rétablir</option>}
          {valide ? <option value="suspendue">Suspendre</option> : null}
          <option value="retiree">Retirer définitivement</option>
        </SelectNative>
      </Field>
      <Field label="Motif" htmlFor="sh-motif">
        <Textarea id="sh-motif" name="motif" required minLength={3} />
      </Field>
    </FenetreFormulaire>
  )
}

