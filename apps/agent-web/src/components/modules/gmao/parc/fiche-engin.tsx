"use client"

import {
  Activity,
  CalendarClock,
  ClipboardCheck,
  Coins,
  Gauge,
  History,
  IdCard,
  PencilLine,
  Plus,
  RefreshCcw,
  ShieldAlert,
  Timer,
  TriangleAlert,
  Wrench,
} from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Voie } from "@workspace/ui/components/voie"

import { CelluleDouble, Chronologie, Fiche, Indicateur, Indicateurs, LienBouton, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte, dateHeure, heure, nombre } from "@/components/gestion/referentiels/format"

import {
  APTITUDES,
  CadreGmao,
  DossierEnChargement,
  DossierIntrouvable,
  ETATS_ECHEANCE,
  FAMILLES,
  gmaoApi,
  heures,
  km,
  libelleRestant,
  PRIORITES,
  STATUTS_ENGIN,
  STATUTS_OT,
  TagAptitude,
  TagEcheance,
  TagEngin,
  TagOt,
  TagPriorite,
  TagRetard,
  TYPES_OT,
  useDroitsGmao,
  type DossierEngin,
} from "../commun"
import { DialogueNouvelOt } from "../dialogue-nouvel-ot"
import { actionsStatutPossibles, DialogueModificationEngin, DialogueReleve, DialogueStatut } from "./formulaires-engin"
import { evenementsGmao, LienCellule } from "./partage"

type Echeance = DossierEngin["echeances"][number]
type Ordre = DossierEngin["ordres"][number]
type Releve = DossierEngin["releves"][number]
type Visite = DossierEngin["visites"][number]

const CLASSES_VOITURE: Record<string, string> = { VIP: "VIP", PREMIERE: "1re classe", DEUXIEME: "2e classe" }
const SOURCES_RELEVE: Record<string, string> = { saisie: "Saisie", ot: "Clôture d'OT", import: "Import" }
const RANG_ECHEANCE = { echue: 0, proche: 1, a_jour: 2 } as const
const RANG_STATUT_OT = { demande: 0, planifie: 1, en_cours: 2, travaux_termines: 3, cloture: 4, annule: 5 } as const

const colonnesEcheances: ColonneTableau<Echeance>[] = [
  {
    cle: "plan",
    libelle: "Plan",
    rendu: (e) => <CelluleDouble haut={e.planCode} bas={e.planLibelle} mono />,
    tri: (e) => e.planCode,
    export: (e) => `${e.planCode} — ${e.planLibelle}`,
  },
  {
    cle: "seuil",
    libelle: "Intervalle",
    rendu: (e) => <span className="tabular">{[e.seuilKm ? km(e.seuilKm) : null, e.seuilJours ? `${nombre(e.seuilJours)} j` : null].filter(Boolean).join(" ou ")}</span>,
    tri: (e) => e.seuilKm ?? e.seuilJours ?? 0,
    export: (e) => [e.seuilKm ? km(e.seuilKm) : null, e.seuilJours ? `${e.seuilJours} j` : null].filter(Boolean).join(" ou "),
    secondaire: true,
  },
  {
    cle: "etat",
    libelle: "État",
    rendu: (e) => (
      <span className="grid min-w-[150px] gap-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <TagEcheance etat={e.etat} />
          {!e.actif ? <span className="text-[12px] text-ink-muted">plan désactivé</span> : null}
        </span>
        <span className="flex items-center gap-2">
          <Voie rempli={Math.min(1, e.ratio)} />
          <span className="tabular text-[12.5px] text-ink-muted">{Math.round(e.ratio * 100)} %</span>
        </span>
      </span>
    ),
    tri: (e) => RANG_ECHEANCE[e.etat] * 10 - e.ratio,
    export: (e) => `${ETATS_ECHEANCE[e.etat].libelle} (${Math.round(e.ratio * 100)} %)`,
  },
  {
    cle: "restant",
    libelle: "Restant",
    rendu: (e) => <span className="tabular">{libelleRestant({ kmRestants: e.kmRestants ?? null, joursRestants: e.joursRestants ?? null })}</span>,
    tri: (e) => e.ratio,
    export: (e) => libelleRestant({ kmRestants: e.kmRestants ?? null, joursRestants: e.joursRestants ?? null }),
  },
  {
    cle: "derniere",
    libelle: "Dernière réalisation",
    rendu: (e) => <CelluleDouble haut={<span className="tabular">{dateCourte(e.derniereRealisationLe)}</span>} bas={<span className="tabular">{km(e.derniereRealisationKm)}</span>} />,
    tri: (e) => e.derniereRealisationLe,
    export: (e) => `${dateCourte(e.derniereRealisationLe)} à ${km(e.derniereRealisationKm)}`,
    secondaire: true,
  },
  {
    cle: "ot",
    libelle: "OT ouvert",
    rendu: (e) => (e.otOuvertId ? <LienCellule href={`/materiel/ordres/${e.otOuvertId}`}>Voir l’OT</LienCellule> : <span className="text-ink-muted">Aucun</span>),
    tri: (e) => (e.otOuvertId ? 1 : 0),
    export: (e) => (e.otOuvertId ? "oui" : "non"),
  },
]

const colonnesOrdres: ColonneTableau<Ordre>[] = [
  { cle: "numero", libelle: "OT", rendu: (o) => <CelluleDouble haut={o.numero} bas={TYPES_OT[o.type]} mono />, tri: (o) => o.numero },
  { cle: "titre", libelle: "Intitulé", rendu: (o) => o.titre, tri: (o) => o.titre },
  {
    cle: "priorite",
    libelle: "Priorité",
    rendu: (o) => <TagPriorite priorite={o.priorite} />,
    tri: (o) => ["urgente", "haute", "normale", "basse"].indexOf(o.priorite),
    export: (o) => PRIORITES[o.priorite].libelle,
    secondaire: true,
  },
  {
    cle: "statut",
    libelle: "Statut",
    rendu: (o) => (
      <span className="flex flex-wrap gap-1.5">
        <TagOt statut={o.statut} />
        {o.enRetard ? <TagRetard /> : null}
      </span>
    ),
    tri: (o) => RANG_STATUT_OT[o.statut],
    export: (o) => `${STATUTS_OT[o.statut].libelle}${o.enRetard ? " — en retard" : ""}`,
  },
  { cle: "demande", libelle: "Demandé le", rendu: (o) => <span className="tabular">{dateCourte(o.demandeLe)}</span>, tri: (o) => o.demandeLe },
  { cle: "cloture", libelle: "Clôturé le", rendu: (o) => <span className="tabular">{dateCourte(o.clotureLe)}</span>, tri: (o) => o.clotureLe ?? 0, secondaire: true },
  { cle: "demandeur", libelle: "Demandeur", rendu: (o) => o.demandeur ?? "—", tri: (o) => o.demandeur ?? "", secondaire: true },
  { cle: "cout", libelle: "Coût (XAF)", rendu: (o) => <span className="tabular">{nombre(o.coutFcfa)}</span>, tri: (o) => o.coutFcfa, numerique: true },
]

const colonnesReleves: ColonneTableau<Releve>[] = [
  { cle: "le", libelle: "Relevé le", rendu: (r) => <span className="tabular">{dateCourte(r.le)} {heure(r.le)}</span>, tri: (r) => r.le },
  { cle: "km", libelle: "Kilométrage", rendu: (r) => <span className="tabular">{km(r.km)}</span>, tri: (r) => r.km, numerique: true },
  { cle: "heures", libelle: "Heures", rendu: (r) => <span className="tabular">{heures(r.heures)}</span>, tri: (r) => r.heures, numerique: true },
  { cle: "source", libelle: "Source", rendu: (r) => SOURCES_RELEVE[r.source] ?? r.source, tri: (r) => SOURCES_RELEVE[r.source] ?? r.source },
  { cle: "auteur", libelle: "Par", rendu: (r) => r.auteur ?? "Système", tri: (r) => r.auteur ?? "", secondaire: true },
]

const colonnesVisites: ColonneTableau<Visite>[] = [
  { cle: "numero", libelle: "Visite", rendu: (v) => <CelluleDouble haut={v.numero} bas={`Convoi ${v.convoi}`} mono />, tri: (v) => v.numero },
  { cle: "debut", libelle: "Le", rendu: (v) => <span className="tabular">{dateHeure(v.debutLe)}</span>, tri: (v) => v.debutLe },
  {
    cle: "aptitude",
    libelle: "Décision",
    rendu: (v) => (v.aptitude ? <TagAptitude aptitude={v.aptitude} /> : <span className="text-ink-muted">Non signée</span>),
    tri: (v) => v.aptitude ?? "",
    export: (v) => (v.aptitude ? APTITUDES[v.aptitude].libelle : "Non signée"),
  },
  { cle: "defauts", libelle: "Défauts sur l'engin", rendu: (v) => <span className="tabular">{nombre(v.defautsEngin)}</span>, tri: (v) => v.defautsEngin, numerique: true },
]

type Dialogue = "ot" | "releve" | "modifier" | "statut" | null

/** Fiche de vie d'un engin : identité, échéances, OT, relevés, visites, journal. */
export function FicheEngin({ equipementId }: { equipementId: string }) {
  const dossier = useQuery(gmaoApi.queries.equipement, { equipementId: equipementId as never })
  const droits = useDroitsGmao()
  const router = useRouter()
  const operation = useOperation()
  const [dialogue, setDialogue] = useState<Dialogue>(null)
  const [ouvertures, setOuvertures] = useState(0)
  const retour = { href: "/materiel/parc", libelle: "Parc" }

  if (dossier === undefined) {
    return (
      <CadreGmao titre="Fiche de l'engin" retour={retour}>
        <DossierEnChargement />
      </CadreGmao>
    )
  }
  if (dossier === null) {
    return (
      <CadreGmao titre="Fiche de l'engin" retour={retour}>
        <DossierIntrouvable quoi="Engin" retour={{ href: "/materiel/parc", libelle: "Revenir au parc" }} />
      </CadreGmao>
    )
  }

  const { engin, indicateurs } = dossier
  const reforme = engin.statut === "reforme"
  const ouvrir = (cle: Exclude<Dialogue, null>) => {
    operation.effacer()
    setOuvertures((n) => n + 1)
    setDialogue(cle)
  }
  const fermer = (ouvert: boolean) => {
    if (!ouvert) setDialogue(null)
  }

  const actions = reforme ? null : (
    <>
      {droits.peut("compteur_relever") ? (
        <Button type="button" variant="secondary" onClick={() => ouvrir("releve")}>
          <Gauge />
          Relever les compteurs
        </Button>
      ) : null}
      {droits.peut("parc_administrer") ? (
        <>
          <Button type="button" variant="secondary" onClick={() => ouvrir("modifier")}>
            <PencilLine />
            Modifier la fiche
          </Button>
          {actionsStatutPossibles(engin).length > 0 ? (
            <Button type="button" variant="ghost" onClick={() => ouvrir("statut")}>
              <RefreshCcw />
              Changer le statut
            </Button>
          ) : null}
        </>
      ) : null}
      {droits.peut("ot_demander") ? (
        <Button type="button" onClick={() => ouvrir("ot")}>
          <Plus />
          Demander un OT
        </Button>
      ) : null}
    </>
  )

  return (
    <CadreGmao
      titre={engin.numero}
      description={`${FAMILLES[engin.famille]} · série ${engin.serie} · ${engin.constructeur} · ${dossier.atelier?.nom ?? "atelier inconnu"}`}
      retour={retour}
      actions={actions}
    >
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <TagEngin statut={engin.statut} />
        <span className="text-ink-muted">
          depuis le <span className="tabular">{dateHeure(engin.statutDepuis)}</span>
        </span>
        {engin.motifStatut ? <span className="text-ink-muted">· {engin.motifStatut}</span> : null}
      </div>
      {engin.immobilisationManuelle ? (
        <InlineMessage tone="warning" title="Immobilisation décidée">
          {engin.immobilisationManuelle}
        </InlineMessage>
      ) : null}
      {reforme ? (
        <InlineMessage tone="info" title="Engin réformé">
          La fiche est conservée pour l’historique ; aucune action n’est plus possible.
        </InlineMessage>
      ) : null}
      <RetourOperation retour={operation.retour} />

      <Indicateurs colonnes={3}>
        <Indicateur libelle="Coût de maintenance cumulé" icone={Coins} valeur={nombre(Math.round(indicateurs.coutCumuleFcfa))} unite="XAF" />
        <Indicateur libelle="OT ouverts" icone={Wrench} valeur={nombre(indicateurs.otOuverts)} />
        <Indicateur libelle="Défaillances · 180 j" icone={TriangleAlert} valeur={nombre(indicateurs.defaillances)} />
        <Indicateur
          libelle="MTBF · 180 j"
          icone={Activity}
          valeur={indicateurs.mtbfJours === null ? "—" : nombre(indicateurs.mtbfJours)}
          unite={indicateurs.mtbfJours === null ? undefined : "jours"}
          evolution={indicateurs.mtbfJours === null ? { sens: "neutre", texte: "Aucune défaillance" } : undefined}
        />
        <Indicateur
          libelle="MTTR · 180 j"
          icone={Timer}
          valeur={indicateurs.mttrHeures === null ? "—" : indicateurs.mttrHeures.toLocaleString("fr-FR")}
          unite={indicateurs.mttrHeures === null ? undefined : "heures"}
          evolution={indicateurs.mttrHeures === null ? { sens: "neutre", texte: "Aucune réparation mesurée" } : undefined}
        />
        <Indicateur
          libelle="Immobilisation cumulée"
          icone={ShieldAlert}
          valeur={indicateurs.joursImmobilisation.toLocaleString("fr-FR")}
          unite="jours"
        />
      </Indicateurs>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <div className="grid min-w-0 content-start gap-5">
          <Panneau titre="Échéances préventives" icone={CalendarClock} sousTitre="Le premier seuil atteint, kilométrique ou calendaire, fait foi">
            <TableauDonnees
              libelle={`Échéances préventives de ${engin.numero}`}
              colonnes={colonnesEcheances}
              lignes={dossier.echeances}
              cle={(e) => e.planEquipementId}
              lien={(e) => `/materiel/preventif/${e.planId}`}
              exportNom={`echeances-${engin.numero}`}
              triInitial={{ cle: "etat", sens: "asc" }}
              vide={{
                titre: "Aucun plan préventif",
                description: "Cet engin n'est rattaché à aucun plan. Rattachez-le depuis un plan de sa famille.",
                action: (
                  <LienBouton href="/materiel/preventif" taille="sm">
                    Voir les plans
                  </LienBouton>
                ),
              }}
            />
          </Panneau>

          <Panneau titre="Ordres de travail" icone={Wrench} sousTitre={`${nombre(dossier.ordres.length)} au total`}>
            <TableauDonnees
              libelle={`Ordres de travail de ${engin.numero}`}
              colonnes={colonnesOrdres}
              lignes={dossier.ordres}
              cle={(o) => o.id}
              lien={(o) => `/materiel/ordres/${o.id}`}
              recherche={{ placeholder: "Numéro, intitulé…", texte: (o) => `${o.numero} ${o.titre} ${o.demandeur ?? ""}` }}
              exportNom={`ot-${engin.numero}`}
              triInitial={{ cle: "demande", sens: "desc" }}
              parPage={10}
              vide={{
                titre: "Aucun ordre de travail",
                description: "Aucune intervention n'a encore été demandée sur cet engin.",
              }}
            />
          </Panneau>

          <Panneau titre="Relevés de compteur" icone={Gauge} sousTitre={`Compteur actuel ${km(engin.compteurKm)} · ${heures(engin.compteurHeures)}`}>
            <TableauDonnees
              libelle={`Relevés de compteur de ${engin.numero}`}
              colonnes={colonnesReleves}
              lignes={dossier.releves}
              cle={(r) => r.id}
              exportNom={`releves-${engin.numero}`}
              triInitial={{ cle: "le", sens: "desc" }}
              parPage={10}
              vide={{ titre: "Aucun relevé", description: "Le premier relevé est enregistré à l'entrée au parc." }}
            />
          </Panneau>

          <Panneau titre="Visites avant départ récentes" icone={ClipboardCheck} sousTitre="60 derniers jours">
            <TableauDonnees
              libelle={`Visites récentes de ${engin.numero}`}
              colonnes={colonnesVisites}
              lignes={dossier.visites}
              cle={(v) => v.id}
              lien={(v) => `/materiel/visites/${v.id}`}
              exportNom={`visites-${engin.numero}`}
              triInitial={{ cle: "debut", sens: "desc" }}
              parPage={10}
              vide={{ titre: "Aucune visite", description: "L'engin n'a figuré dans aucun convoi visité ces 60 derniers jours." }}
            />
          </Panneau>
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <Panneau titre="Identité" icone={IdCard}>
            <Fiche
              elements={[
                ["Numéro", <span key="n" className="tabular">{engin.numero}</span>],
                ["Famille", FAMILLES[engin.famille]],
                ["Série", engin.serie],
                ["Constructeur", engin.constructeur],
                ["Mise en service", <span key="a" className="tabular">{engin.anneeMiseEnService}</span>],
                ["N° de série", engin.numeroSerie ? <span key="s" className="tabular">{engin.numeroSerie}</span> : "—"],
                ["Propriétaire", engin.proprietaire],
                ["Atelier d'attache", dossier.atelier ? `${dossier.atelier.code} — ${dossier.atelier.nom}` : "—"],
                ["Statut", STATUTS_ENGIN[engin.statut].libelle],
                ["Compteur", <span key="k" className="tabular">{km(engin.compteurKm)}</span>],
                ["Heures", <span key="h" className="tabular">{heures(engin.compteurHeures)}</span>],
                ["Dernier relevé", <span key="r" className="tabular">{dateHeure(engin.compteurReleveLe)}</span>],
                ["Tare", engin.tareTonnes === null ? "—" : `${engin.tareTonnes.toLocaleString("fr-FR")} t`],
                ["Charge utile", engin.chargeUtileTonnes === null ? "—" : `${engin.chargeUtileTonnes.toLocaleString("fr-FR")} t`],
                ["Train affecté", dossier.train ? <span key="t"><span className="tabular">{dossier.train.numero}</span> — {dossier.train.nom}</span> : "Aucun"],
                dossier.voiture
                  ? [
                      "Voiture du référentiel",
                      `${dossier.voiture.repere} · ${CLASSES_VOITURE[dossier.voiture.classe] ?? dossier.voiture.classe} · ${nombre(dossier.voiture.places)} places${dossier.voiture.train ? ` · train ${dossier.voiture.train}` : ""}`,
                    ]
                  : null,
                ["Entré au parc", <span key="c" className="tabular">{dateCourte(engin.creeLe)}</span>],
              ]}
            />
            {engin.notes ? <p className="text-small whitespace-pre-line text-ink-muted">{engin.notes}</p> : null}
          </Panneau>

          <Panneau titre="Journal de l'engin" icone={History}>
            <Chronologie evenements={evenementsGmao(dossier.chronologie)} vide="Aucun événement enregistré sur cet engin." />
          </Panneau>
        </div>
      </div>

      <DialogueNouvelOt
        key={`ot-${ouvertures}`}
        open={dialogue === "ot"}
        onOpenChange={fermer}
        equipementId={engin.id}
        onCree={({ otId }) => router.push(`/materiel/ordres/${otId}` as Route)}
      />
      <DialogueReleve
        key={`releve-${ouvertures}`}
        open={dialogue === "releve"}
        onOpenChange={fermer}
        dossier={dossier}
        onReleve={(resultat) => operation.signaler({ ton: "success", titre: `Relevé enregistré : ${km(resultat.km)} · ${heures(resultat.heures)}.` })}
      />
      <DialogueModificationEngin
        key={`modifier-${ouvertures}`}
        open={dialogue === "modifier"}
        onOpenChange={fermer}
        dossier={dossier}
        onModifie={() => operation.signaler({ ton: "success", titre: "Fiche de l'engin mise à jour." })}
      />
      <DialogueStatut
        key={`statut-${ouvertures}`}
        open={dialogue === "statut"}
        onOpenChange={fermer}
        dossier={dossier}
        onChange={(statut) =>
          operation.signaler({
            ton: "success",
            titre: `Statut enregistré : ${STATUTS_ENGIN[statut as keyof typeof STATUTS_ENGIN]?.libelle ?? statut}.`,
          })
        }
      />
    </CadreGmao>
  )
}

