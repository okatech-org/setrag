"use client"

import { Ban, CalendarCheck, CalendarX, CircleStop, Play, TrainFront, TriangleAlert, Wrench } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { Field, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { Fiche, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { TYPES_TRAIN, dateService, type TypeTrain } from "@/components/gestion/referentiels/format"
import { FenetreFormulaire, texte } from "@/components/gestion/referentiels/formulaire"

import { CadreInfra, DossierEnChargement, DossierIntrouvable, TagEtat, infraApi, plagePk, useDroitsInfra, type DossierIntervention } from "../commun"
import { regime } from "./libelles"
import { TagRegime } from "./interventions"
import { PanneauChronologie, dateEtHeure, erreurOperation, useAgentConnecte } from "./partage"

const RETOUR = { href: "/infrastructures/interventions", libelle: "Plages travaux" }

type Train = DossierIntervention["trainsImpactes"][number]
type Conflit = DossierIntervention["conflits"][number]
type Geste = "accorder" | "refuser" | "demarrer" | "terminer" | "annuler"

const STATUTS_TRAIN: Record<string, string> = {
  planifie: "Planifié",
  a_lheure: "À l'heure",
  retarde: "Retardé",
  annule: "Supprimé",
  termine: "Terminé",
}

const colonnesTrains: ColonneTableau<Train>[] = [
  { cle: "train", libelle: "Train", rendu: (t) => <span className="tabular font-semibold">{t.trainNumber}</span>, tri: (t) => t.trainNumber },
  { cle: "type", libelle: "Type", rendu: (t) => TYPES_TRAIN[t.trainType as TypeTrain] ?? t.trainType, tri: (t) => t.trainType, secondaire: true },
  { cle: "date", libelle: "Circulation du", rendu: (t) => dateService(t.serviceDate), tri: (t) => t.serviceDate },
  { cle: "relation", libelle: "Relation", rendu: (t) => `${t.origine} → ${t.destination}`, tri: (t) => t.origine },
  { cle: "depart", libelle: "Départ", rendu: (t) => <span className="tabular">{dateEtHeure(t.departureAt)}</span>, tri: (t) => t.departureAt, export: (t) => dateEtHeure(t.departureAt) },
  { cle: "arrivee", libelle: "Arrivée", rendu: (t) => <span className="tabular">{dateEtHeure(t.arrivalAt)}</span>, tri: (t) => t.arrivalAt, export: (t) => dateEtHeure(t.arrivalAt), secondaire: true },
  { cle: "statut", libelle: "État du train", rendu: (t) => STATUTS_TRAIN[t.statut] ?? t.statut, tri: (t) => t.statut, export: (t) => STATUTS_TRAIN[t.statut] ?? t.statut, secondaire: true },
]

const colonnesConflits: ColonneTableau<Conflit>[] = [
  { cle: "numero", libelle: "N°", rendu: (i) => <span className="tabular font-semibold">{i.numero}</span>, tri: (i) => i.numero },
  { cle: "libelle", libelle: "Travaux", rendu: (i) => i.libelle, tri: (i) => i.libelle },
  { cle: "plage", libelle: "Plage PK", rendu: (i) => <span className="tabular">{plagePk(i.pkDebut, i.pkFin)}</span>, tri: (i) => i.pkDebut, export: (i) => plagePk(i.pkDebut, i.pkFin) },
  { cle: "creneau", libelle: "Créneau", rendu: (i) => <span className="tabular">{`${dateEtHeure(i.debutLe)} → ${dateEtHeure(i.finLe)}`}</span>, tri: (i) => i.debutLe, export: (i) => `${dateEtHeure(i.debutLe)} → ${dateEtHeure(i.finLe)}` },
  { cle: "regime", libelle: "Circulation", rendu: (i) => <TagRegime interruption={i.interruption} />, tri: (i) => (i.interruption ? 0 : 1), export: (i) => regime(i.interruption) },
  { cle: "statut", libelle: "Statut", rendu: (i) => <TagEtat valeur={i.statut} libelle={i.statutLibelle} />, tri: (i) => i.statut, export: (i) => i.statutLibelle },
]

const GESTES: Record<Geste, { titre: string; description: string; valider: string; champ?: { libelle: string; nom: string; aide: string; exemple: string }; danger?: boolean; succes: string }> = {
  accorder: {
    titre: "Accorder la plage travaux",
    description: "L'accord engage l'exploitation : la plage est réservée à l'équipe sur son créneau. Il est refusé en cas de conflit avec une coupure de voie active.",
    valider: "Accorder la plage",
    succes: "Plage travaux accordée.",
  },
  refuser: {
    titre: "Refuser la plage travaux",
    description: "Le demandeur verra le motif dans le dossier.",
    valider: "Refuser la demande",
    champ: { libelle: "Motif du refus", nom: "motif", aide: "Obligatoire, 500 caractères au plus.", exemple: "Créneau incompatible avec le minéralier de 14 h ; proposez la nuit." },
    danger: true,
    succes: "Demande refusée.",
  },
  demarrer: {
    titre: "Démarrer les travaux",
    description: "La voie est remise à l'équipe. Le démarrage est possible au plus tôt une heure avant le créneau.",
    valider: "Démarrer les travaux",
    succes: "Travaux démarrés : voie remise à l'équipe.",
  },
  terminer: {
    titre: "Terminer les travaux",
    description: "La voie est restituée à la circulation. Le compte rendu est inscrit au dossier.",
    valider: "Restituer la voie",
    champ: { libelle: "Compte rendu", nom: "compteRendu", aide: "Travaux réalisés, état de la voie à la restitution.", exemple: "48 traverses remplacées, bourrage fait, voie restituée à 16 h 40 sans restriction." },
    succes: "Travaux terminés : voie restituée à la circulation.",
  },
  annuler: {
    titre: "Annuler la plage travaux",
    description: "La plage est libérée. L'annulation est définitive.",
    valider: "Annuler la plage",
    champ: { libelle: "Motif de l'annulation", nom: "motif", aide: "Obligatoire.", exemple: "Engin de bourrage indisponible." },
    danger: true,
    succes: "Plage travaux annulée.",
  },
}

export function InterventionDossier({ interventionId }: { interventionId: string }) {
  const droits = useDroitsInfra()
  const moi = useAgentConnecte()
  const dossier = useQuery(infraApi.queries.intervention, { interventionId: interventionId as DossierIntervention["intervention"]["id"] })
  const operation = useOperation()
  const accorder = useMutation(infraApi.mutations.accorderIntervention)
  const refuser = useMutation(infraApi.mutations.refuserIntervention)
  const demarrer = useMutation(infraApi.mutations.demarrerIntervention)
  const terminer = useMutation(infraApi.mutations.terminerIntervention)
  const annuler = useMutation(infraApi.mutations.annulerIntervention)
  const [geste, setGeste] = useState<Geste | null>(null)

  if (dossier === undefined) {
    return (
      <CadreInfra titre="Plage travaux" retour={RETOUR}>
        <DossierEnChargement />
      </CadreInfra>
    )
  }
  if (dossier === null) {
    return (
      <CadreInfra titre="Plage travaux introuvable" retour={RETOUR}>
        <DossierIntrouvable quoi="Plage travaux" retour={RETOUR} />
      </CadreInfra>
    )
  }

  const { intervention, conflits, trainsImpactes } = dossier
  const id = intervention.id
  const statut = intervention.statut
  const peutAccorder = droits.peut("intervention_accorder")
  const peutDemander = droits.peut("intervention_demander")
  const demandeur = Boolean(moi && intervention.demandeurId === moi)
  const ouvrir = (g: Geste) => {
    operation.effacer()
    setGeste(g)
  }

  const executer = async (g: Geste, valeur: string) => {
    const appel: () => Promise<{ statut: string }> =
      g === "accorder"
        ? () => accorder({ interventionId: id })
        : g === "refuser"
          ? () => refuser({ interventionId: id, motif: valeur })
          : g === "demarrer"
            ? () => demarrer({ interventionId: id })
            : g === "terminer"
              ? () => terminer({ interventionId: id, compteRendu: valeur })
              : () => annuler({ interventionId: id, motif: valeur })
    const resultat = await operation.executer(g, appel, GESTES[g].succes)
    if (resultat) setGeste(null)
  }

  /* Un seul bouton principal : la décision attendue au statut courant. */
  const boutons = (
    <>
      {(statut === "demandee" || statut === "accordee") && peutDemander ? (
        <Button type="button" variant="ghost" onClick={() => ouvrir("annuler")}>
          <CalendarX />
          Annuler
        </Button>
      ) : null}
      {statut === "demandee" && peutAccorder ? (
        <>
          <Button type="button" variant="danger" onClick={() => ouvrir("refuser")}>
            <Ban />
            Refuser
          </Button>
          <Button type="button" onClick={() => ouvrir("accorder")}>
            <CalendarCheck />
            Accorder
          </Button>
        </>
      ) : null}
      {statut === "accordee" && peutDemander ? (
        <Button type="button" onClick={() => ouvrir("demarrer")}>
          <Play />
          Démarrer les travaux
        </Button>
      ) : null}
      {statut === "en_cours" && peutDemander ? (
        <Button type="button" onClick={() => ouvrir("terminer")}>
          <CircleStop />
          Terminer et restituer la voie
        </Button>
      ) : null}
    </>
  )
  const def = geste ? GESTES[geste] : null

  return (
    <CadreInfra
      titre={`${intervention.numero} · ${intervention.libelle}`}
      description={`${intervention.typeLibelle}, ${plagePk(intervention.pkDebut, intervention.pkFin)}, du ${dateEtHeure(intervention.debutLe)} au ${dateEtHeure(intervention.finLe)}.`}
      retour={RETOUR}
      actions={boutons}
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagEtat valeur={statut} libelle={intervention.statutLibelle} />
        <TagRegime interruption={intervention.interruption} />
      </div>
      <RetourOperation retour={operation.retour} />
      {conflits.length > 0 ? (
        <InlineMessage tone="warning" title={`Conflit avec ${conflits.length} plage${conflits.length > 1 ? "s" : ""} active${conflits.length > 1 ? "s" : ""}`}>
          Cette plage recoupe{" "}
          {conflits.map((c, index) => (
            <span key={c.id}>
              {index > 0 ? ", " : ""}
              <Link href={`/infrastructures/interventions/${c.id}` as Route} className="tabular font-semibold underline">
                {c.numero}
              </Link>
            </span>
          ))}{" "}
          sur la même plage PK et le même créneau, avec coupure de voie.{" "}
          {statut === "demandee" ? "Elle ne pourra pas être accordée tant que ces plages restent accordées ou en cours." : "Coordonnez les équipes avant le démarrage."}
        </InlineMessage>
      ) : null}
      {statut === "demandee" && peutAccorder && demandeur ? (
        <InlineMessage tone="info" title="Vous avez demandé cette plage.">
          L&apos;accord revient à un autre agent habilité : le serveur refusera le vôtre.
        </InlineMessage>
      ) : null}
      {statut === "refusee" && intervention.motifRefus ? (
        <InlineMessage tone="danger" title="Demande refusée">
          {intervention.motifRefus}
        </InlineMessage>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <div className="grid content-start gap-5">
          <Panneau titre="Plage travaux" icone={Wrench}>
            <Fiche
              elements={[
                ["Numéro", <span key="n" className="tabular">{intervention.numero}</span>],
                ["Type de travaux", intervention.typeLibelle],
                ["Plage kilométrique", <span key="p" className="tabular">{plagePk(intervention.pkDebut, intervention.pkFin)}</span>],
                ["Début", <span key="d" className="tabular">{dateEtHeure(intervention.debutLe)}</span>],
                ["Fin", <span key="f" className="tabular">{dateEtHeure(intervention.finLe)}</span>],
                ["Durée", <span key="u" className="tabular">{intervention.dureeHeures.toLocaleString("fr-FR")} h</span>],
                ["Circulation", regime(intervention.interruption)],
                ["Équipe", intervention.equipe],
                [
                  "Chantier PRN",
                  dossier.chantier ? (
                    <Link key="c" href={`/infrastructures/prn/${dossier.chantier.id}` as Route} className="font-semibold text-accent-ink underline">
                      {dossier.chantier.code} · {dossier.chantier.libelle}
                    </Link>
                  ) : (
                    "Aucun"
                  ),
                ],
                [
                  "Anomalie traitée",
                  dossier.anomalie ? (
                    <Link key="a" href={`/infrastructures/anomalies/${dossier.anomalie.id}` as Route} className="font-semibold text-accent-ink underline">
                      {dossier.anomalie.numero} · {dossier.anomalie.graviteLibelle}
                    </Link>
                  ) : (
                    "Aucune"
                  ),
                ],
                ["Demandée par", `${intervention.demandeurNom ?? "Agent inconnu"} · ${dateEtHeure(intervention.demandeLe)}`],
                intervention.accordeParNom ? [statut === "refusee" ? "Refusée par" : "Accordée par", `${intervention.accordeParNom} · ${dateEtHeure(intervention.accordeLe)}`] : null,
              ]}
            />
            {intervention.compteRendu ? (
              <InlineMessage tone="success" title="Compte rendu de fin de travaux">
                {intervention.compteRendu}
              </InlineMessage>
            ) : null}
          </Panneau>
          {intervention.interruption ? (
            <Panneau titre="Trains impactés par la coupure" icone={TrainFront} sousTitre={`${trainsImpactes.length} circulation${trainsImpactes.length > 1 ? "s" : ""} sur la plage pendant le créneau`}>
              <TableauDonnees
                libelle={`Trains impactés par ${intervention.numero}`}
                colonnes={colonnesTrains}
                lignes={trainsImpactes}
                cle={(t) => t.id}
                exportNom={`trains-impactes-${intervention.numero}`}
                triInitial={{ cle: "depart", sens: "asc" }}
                parPage={15}
                vide={{ titre: "Aucun train impacté", description: "Aucune circulation programmée ne traverse la plage pendant le créneau." }}
              />
            </Panneau>
          ) : (
            <Panneau titre="Trains impactés" icone={TrainFront}>
              <p className="text-small text-ink-muted">Travaux sous circulation : les trains passent, sous protection de l&apos;équipe. Aucune circulation n&apos;est supprimée.</p>
            </Panneau>
          )}
          <Panneau titre="Conflits avec d'autres plages" icone={TriangleAlert} sousTitre="Plages accordées ou en cours, même plage PK et même créneau, dont l'une coupe la voie">
            <TableauDonnees
              libelle={`Conflits de ${intervention.numero}`}
              colonnes={colonnesConflits}
              lignes={conflits}
              cle={(i) => i.id}
              lien={(i) => `/infrastructures/interventions/${i.id}`}
              exportNom={`conflits-${intervention.numero}`}
              vide={{ titre: "Aucun conflit", description: "Aucune plage active ne recoupe celle-ci avec coupure de voie." }}
            />
          </Panneau>
        </div>
        <div className="grid content-start gap-5">
          <PanneauChronologie evenements={dossier.chronologie} />
        </div>
      </div>

      {def && geste ? (
        <FenetreFormulaire
          open
          onOpenChange={(o) => !o && setGeste(null)}
          titre={`${def.titre} · ${intervention.numero}`}
          description={def.description}
          libelleValider={def.valider}
          variante={def.danger ? "danger" : "primary"}
          enCours={operation.enCours === geste}
          erreur={erreurOperation(operation)}
          onSubmit={async (donnees) => {
            await executer(geste, def.champ ? (texte(donnees, def.champ.nom) ?? "") : "")
          }}
        >
          <Fiche
            elements={[
              ["Plage", <span key="p" className="tabular">{plagePk(intervention.pkDebut, intervention.pkFin)}</span>],
              ["Créneau", <span key="c" className="tabular">{`${dateEtHeure(intervention.debutLe)} → ${dateEtHeure(intervention.finLe)}`}</span>],
              ["Circulation", regime(intervention.interruption)],
              intervention.interruption ? ["Trains impactés", <span key="t" className="tabular">{trainsImpactes.length}</span>] : null,
            ]}
          />
          {geste === "accorder" && conflits.length > 0 ? (
            <InlineMessage tone="warning" title="Conflit signalé">
              Le serveur refusera l&apos;accord tant que {conflits.map((c) => c.numero).join(", ")} reste{conflits.length > 1 ? "nt" : ""} active{conflits.length > 1 ? "s" : ""}.
            </InlineMessage>
          ) : null}
          {def.champ ? (
            <Field label={def.champ.libelle} hint={def.champ.aide} htmlFor={`geste-${def.champ.nom}`}>
              <Textarea id={`geste-${def.champ.nom}`} name={def.champ.nom} required minLength={3} maxLength={def.champ.nom === "compteRendu" ? 3000 : 500} placeholder={def.champ.exemple} />
            </Field>
          ) : null}
        </FenetreFormulaire>
      ) : null}
    </CadreInfra>
  )
}
