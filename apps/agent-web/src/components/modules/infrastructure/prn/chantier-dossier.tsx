"use client"

import { Banknote, CalendarPlus, CheckCheck, ClipboardList, Construction, Flag, FlagTriangleRight, HandCoins, Layers, Map as IconeCarte, PencilLine, Plus, Ruler, Undo2, Wallet, Wrench } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { Fiche, Indicateur, Indicateurs, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { Remplissage, RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte, nombre } from "@/components/gestion/referentiels/format"

import { CadreInfra, DossierEnChargement, DossierIntrouvable, TagEtat, TagRetard, infraApi, pct, plagePk, useDroitsInfra, xaf, xafCompact, type DossierChantier } from "../commun"
import { colonnesInterventions, zonesTravaux } from "../interventions/interventions"
import { FenetreDemandeIntervention } from "../interventions/formulaire"
import { PanneauChronologie, dateEtHeure, useAgentConnecte, useGaresLigne, useMaintenant } from "../interventions/partage"
import { SchemaVoie } from "../schema-voie"
import { Avancement, RepartitionBailleurs } from "./composants"
import { FenetreChantier, FenetreDecisionSituation, FenetreJalon, FenetreJalonAtteint, FenetreLot, FenetreSituation, FenetreStatutChantier } from "./formulaires"
import { TRANSITIONS_CHANTIER, type StatutChantier } from "./libelles"

const RETOUR = { href: "/infrastructures/prn", libelle: "Programme PRN" }

type Lot = DossierChantier["lots"][number]
type Situation = DossierChantier["avancements"][number]
type Jalon = DossierChantier["jalons"][number]
type Mode =
  | { type: "modifier" | "statut" | "lot" | "situation" | "jalon" | "intervention" }
  | { type: "valider" | "rejeter"; situation: Situation }
  | { type: "atteint"; jalon: Jalon }

const ORDRE_JALONS = { en_retard: 0, a_venir: 1, atteint: 2 } as const

export function ChantierDossier({ chantierId }: { chantierId: string }) {
  const router = useRouter()
  const droits = useDroitsInfra()
  const moi = useAgentConnecte()
  const maintenant = useMaintenant()
  const gares = useGaresLigne()
  const dossier = useQuery(infraApi.queries.chantier, { chantierId: chantierId as DossierChantier["chantier"]["id"] })
  const operation = useOperation()
  const [mode, setMode] = useState<Mode | null>(null)
  const [cleFenetre, setCleFenetre] = useState(0)

  if (dossier === undefined) {
    return (
      <CadreInfra titre="Chantier PRN" retour={RETOUR}>
        <DossierEnChargement />
      </CadreInfra>
    )
  }
  if (dossier === null) {
    return (
      <CadreInfra titre="Chantier introuvable" retour={RETOUR}>
        <DossierIntrouvable quoi="Chantier" retour={RETOUR} />
      </CadreInfra>
    )
  }

  const { chantier, lots, avancements, jalons, interventions } = dossier
  const ouvert = chantier.statut !== "receptionne"
  const peutGerer = droits.peut("prn_gerer") && ouvert
  const peutSaisir = droits.peut("prn_avancement_saisir") && chantier.statut === "en_cours"
  const peutValider = droits.peut("prn_valider")
  const peutDemander = droits.peut("intervention_demander") && ouvert
  const transitions = TRANSITIONS_CHANTIER[chantier.statut as StatutChantier] ?? []
  const ouvrir = (m: Mode) => {
    setCleFenetre((c) => c + 1)
    operation.effacer()
    setMode(m)
  }
  const fermer = (o: boolean) => {
    if (!o) setMode(null)
  }
  const totalFinance = chantier.financements.reduce((s, f) => s + f.montantFcfa, 0)
  const totalLots = lots.reduce((s, l) => s + l.montantFcfa, 0)
  const zones = zonesTravaux(interventions, maintenant)

  const colonnesLots: ColonneTableau<Lot>[] = [
    { cle: "code", libelle: "Lot", rendu: (l) => <span className="tabular font-semibold">{l.code}</span>, tri: (l) => l.code },
    { cle: "libelle", libelle: "Libellé", rendu: (l) => l.libelle, tri: (l) => l.libelle },
    { cle: "entreprise", libelle: "Entreprise", rendu: (l) => l.entreprise, tri: (l) => l.entreprise, secondaire: true },
    { cle: "plage", libelle: "Plage PK", rendu: (l) => <span className="tabular whitespace-nowrap">{plagePk(l.pkDebut, l.pkFin)}</span>, tri: (l) => l.pkDebut, export: (l) => plagePk(l.pkDebut, l.pkFin) },
    { cle: "montant", libelle: "Montant", rendu: (l) => <span className="tabular">{xafCompact(l.montantFcfa)}</span>, tri: (l) => l.montantFcfa, export: (l) => l.montantFcfa, numerique: true },
    {
      cle: "quantite",
      libelle: `Réalisé / prévu (${chantier.uniteQuantite})`,
      rendu: (l) => <span className="tabular">{`${nombre(l.quantiteRealisee)} / ${nombre(l.quantitePrevue)}`}</span>,
      tri: (l) => l.quantiteRealisee,
      export: (l) => `${l.quantiteRealisee} / ${l.quantitePrevue}`,
      numerique: true,
      secondaire: true,
    },
    { cle: "physique", libelle: "Physique", rendu: (l) => <Avancement valeur={l.avancementPhysiquePct} libelle={`Avancement physique du lot ${l.code}`} />, tri: (l) => l.avancementPhysiquePct, export: (l) => l.avancementPhysiquePct },
    { cle: "financier", libelle: "Financier", rendu: (l) => <Avancement valeur={l.avancementFinancierPct} libelle={`Avancement financier du lot ${l.code}`} />, tri: (l) => l.avancementFinancierPct, export: (l) => l.avancementFinancierPct },
  ]

  const colonnesSituations: ColonneTableau<Situation>[] = [
    { cle: "periode", libelle: "Période", rendu: (s) => <span className="tabular font-semibold">{s.periode}</span>, tri: (s) => s.periode },
    { cle: "lot", libelle: "Lot", rendu: (s) => <span className="tabular">{s.lotCode ?? "Chantier"}</span>, tri: (s) => s.lotCode },
    { cle: "quantite", libelle: `Quantité (${chantier.uniteQuantite})`, rendu: (s) => nombre(s.quantite), tri: (s) => s.quantite, numerique: true },
    { cle: "travaux", libelle: "Travaux (XAF)", rendu: (s) => nombre(s.montantTravauxFcfa), tri: (s) => s.montantTravauxFcfa, numerique: true },
    { cle: "paye", libelle: "Payé (XAF)", rendu: (s) => nombre(s.montantPayeFcfa), tri: (s) => s.montantPayeFcfa, numerique: true },
    { cle: "bailleur", libelle: "Bailleur", rendu: (s) => s.bailleurLibelle ?? "—", tri: (s) => s.bailleurLibelle, secondaire: true },
    {
      cle: "statut",
      libelle: "Statut",
      rendu: (s) => (
        <span className="grid gap-1">
          <TagEtat valeur={s.statut} libelle={s.statutLibelle} />
          {s.motifRejet ? <small className="text-[12px] text-ink-muted">Motif : {s.motifRejet}</small> : null}
        </span>
      ),
      tri: (s) => s.statut,
      export: (s) => `${s.statutLibelle}${s.motifRejet ? ` (${s.motifRejet})` : ""}`,
    },
    {
      cle: "saisi",
      libelle: "Saisie par",
      rendu: (s) => (
        <span className="grid text-[13px]">
          <span>{s.saisiParNom ?? "—"}</span>
          <span className="tabular text-ink-muted">{dateCourte(s.saisiLe)}</span>
        </span>
      ),
      tri: (s) => s.saisiLe,
      export: (s) => `${s.saisiParNom ?? ""} (${dateCourte(s.saisiLe)})`,
      secondaire: true,
    },
    {
      cle: "decision",
      libelle: "Décision",
      rendu: (s) =>
        s.statut === "saisie" && peutValider ? (
          <span className="flex flex-wrap gap-1.5">
            <Button type="button" variant="secondary" size="sm" onClick={() => ouvrir({ type: "valider", situation: s })} aria-label={`Valider la situation ${s.periode}${s.lotCode ? ` du lot ${s.lotCode}` : ""}`}>
              <CheckCheck />
              Valider
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => ouvrir({ type: "rejeter", situation: s })} aria-label={`Rejeter la situation ${s.periode}${s.lotCode ? ` du lot ${s.lotCode}` : ""}`}>
              <Undo2 />
              Rejeter
            </Button>
            {moi && s.saisiParId === moi ? <small className="w-full text-[12px] text-ink-muted">Votre saisie : un autre agent valide.</small> : null}
          </span>
        ) : s.valideParNom ? (
          <span className="text-[13px] text-ink-muted">
            {s.valideParNom} · <span className="tabular">{dateCourte(s.valideLe)}</span>
          </span>
        ) : (
          <span className="text-[13px] text-ink-muted">En attente</span>
        ),
      export: (s) => (s.valideParNom ? `${s.valideParNom} (${dateCourte(s.valideLe)})` : ""),
    },
  ]

  const colonnesJalons: ColonneTableau<Jalon>[] = [
    { cle: "libelle", libelle: "Jalon", rendu: (j) => <span className="font-semibold">{j.libelle}</span>, tri: (j) => j.libelle },
    { cle: "prevu", libelle: "Prévu le", rendu: (j) => <span className="tabular">{dateCourte(j.prevuLe)}</span>, tri: (j) => j.prevuLe, export: (j) => dateCourte(j.prevuLe) },
    { cle: "statut", libelle: "Statut", rendu: (j) => <TagEtat valeur={j.statut} libelle={j.statutLibelle} />, tri: (j) => ORDRE_JALONS[j.statut], export: (j) => j.statutLibelle },
    {
      cle: "decaissement",
      libelle: "Décaissement",
      rendu: (j) => (j.conditionDecaissement ? <span>Conditionne un décaissement{j.bailleurLibelle ? ` · ${j.bailleurLibelle}` : ""}</span> : <span className="text-ink-muted">Non</span>),
      tri: (j) => (j.conditionDecaissement ? 0 : 1),
      export: (j) => (j.conditionDecaissement ? `Oui${j.bailleurLibelle ? ` (${j.bailleurLibelle})` : ""}` : "Non"),
    },
    { cle: "atteint", libelle: "Atteint le", rendu: (j) => <span className="tabular">{dateCourte(j.atteintLe)}</span>, tri: (j) => j.atteintLe, export: (j) => dateCourte(j.atteintLe), secondaire: true },
    {
      cle: "preuve",
      libelle: "Preuve",
      rendu: (j) =>
        j.preuve ? (
          <span className="text-[13px]">{j.preuve}</span>
        ) : droits.peut("prn_gerer") && j.statut !== "atteint" ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => ouvrir({ type: "atteint", jalon: j })} aria-label={`Marquer atteint : ${j.libelle}`}>
            <Flag />
            Marquer atteint
          </Button>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
      tri: (j) => j.preuve,
    },
  ]

  return (
    <CadreInfra
      titre={`${chantier.code} · ${chantier.libelle}`}
      description={`${chantier.natureLibelle}, ${plagePk(chantier.pkDebut, chantier.pkFin)}, ${chantier.entreprise}.`}
      retour={RETOUR}
      actions={
        <>
          {peutGerer ? (
            <Button type="button" variant="secondary" onClick={() => ouvrir({ type: "modifier" })}>
              <PencilLine />
              Modifier le chantier
            </Button>
          ) : null}
          {peutGerer && transitions.length > 0 ? (
            <Button type="button" variant={peutSaisir ? "secondary" : "primary"} onClick={() => ouvrir({ type: "statut" })}>
              <Flag />
              Changer le statut
            </Button>
          ) : null}
          {peutSaisir ? (
            <Button type="button" onClick={() => ouvrir({ type: "situation" })}>
              <Ruler />
              Saisir une situation
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagEtat valeur={chantier.statut} libelle={chantier.statutLibelle} />
        {chantier.jalonsEnRetard > 0 ? <TagRetard texte={`${chantier.jalonsEnRetard} jalon${chantier.jalonsEnRetard > 1 ? "s" : ""} en retard`} /> : null}
        {chantier.situationsEnAttente > 0 ? <TagEtat valeur="saisie" libelle={`${chantier.situationsEnAttente} situation${chantier.situationsEnAttente > 1 ? "s" : ""} à valider`} /> : null}
      </div>
      <RetourOperation retour={operation.retour} />
      {droits.peut("prn_avancement_saisir") && chantier.statut !== "en_cours" && ouvert ? (
        <InlineMessage tone="info" title={`Chantier ${chantier.statutLibelle.toLowerCase()}`}>
          L&apos;avancement se saisit sur un chantier en cours.
        </InlineMessage>
      ) : null}

      <Panneau titre="Emprise sur la ligne" icone={IconeCarte} sousTitre={`${plagePk(chantier.pkDebut, chantier.pkFin)} · plages travaux accordées sur 7 jours`}>
        {gares === undefined ? (
          <p role="status" className="text-small text-ink-muted">
            Chargement de la ligne…
          </p>
        ) : (
          <SchemaVoie gares={gares} zones={zones} segment={[chantier.pkDebut, chantier.pkFin]} />
        )}
      </Panneau>

      <Indicateurs>
        <Indicateur libelle="Budget" icone={Wallet} valeur={xafCompact(chantier.budgetFcfa)} evolution={{ sens: "neutre", texte: `${xafCompact(totalFinance)} financés` }} />
        <Indicateur libelle="Engagé" icone={HandCoins} valeur={xafCompact(chantier.engageFcfa)} evolution={{ sens: "neutre", texte: "Travaux des situations validées" }} />
        <Indicateur
          libelle="Avancement physique"
          icone={Ruler}
          valeur={pct(chantier.avancementPhysiquePct)}
          remplissage={chantier.avancementPhysiquePct / 100}
          evolution={{ sens: "neutre", texte: `${nombre(chantier.quantiteRealisee)} / ${nombre(chantier.quantitePrevue)} ${chantier.uniteQuantite}` }}
        />
        <Indicateur libelle="Avancement financier" icone={Banknote} valeur={pct(chantier.avancementFinancierPct)} remplissage={chantier.avancementFinancierPct / 100} evolution={{ sens: "neutre", texte: `${xafCompact(chantier.payeFcfa)} payés` }} />
      </Indicateurs>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <div className="grid content-start gap-5">
          <Panneau titre="Fiche du chantier" icone={Construction}>
            <p className="text-[14.5px] whitespace-pre-line">{chantier.description}</p>
            <Fiche
              elements={[
                ["Code", <span key="c" className="tabular">{chantier.code}</span>],
                ["Nature", chantier.natureLibelle],
                ["Plage kilométrique", <span key="p" className="tabular">{plagePk(chantier.pkDebut, chantier.pkFin)}</span>],
                ["Entreprise", chantier.entreprise],
                ["Maître d'œuvre", chantier.maitreOeuvre],
                ["Responsable PRN", chantier.responsableNom ?? "—"],
                ["Début", <span key="d" className="tabular">{dateCourte(chantier.debutLe)}</span>],
                ["Fin prévue", <span key="f" className="tabular">{dateCourte(chantier.finPrevueLe)}</span>],
                chantier.finReelleLe ? ["Réception", <span key="r" className="tabular">{dateCourte(chantier.finReelleLe)}</span>] : null,
                ["Statut", chantier.statutLibelle],
                ["Fiche mise à jour", <span key="m" className="tabular">{dateEtHeure(chantier.majLe)}</span>],
              ]}
            />
          </Panneau>

          <Panneau
            titre="Lots"
            icone={Layers}
            sousTitre={`${lots.length} lot${lots.length > 1 ? "s" : ""}, ${xafCompact(totalLots)} sur ${xafCompact(chantier.budgetFcfa)}`}
            actions={
              peutGerer ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => ouvrir({ type: "lot" })}>
                  <Plus />
                  Ajouter un lot
                </Button>
              ) : null
            }
          >
            {lots.length > 0 ? (
              <ul className="grid gap-3" aria-label="Avancement physique par lot">
                {lots.map((l) => (
                  <Remplissage key={l.id} libelle={`${l.code} · ${l.libelle}`} detail={`${nombre(l.quantiteRealisee)} / ${nombre(l.quantitePrevue)} ${chantier.uniteQuantite}`} part={l.avancementPhysiquePct / 100} valeur={pct(l.avancementPhysiquePct)} />
                ))}
              </ul>
            ) : null}
            <TableauDonnees
              libelle={`Lots de ${chantier.code}`}
              colonnes={colonnesLots}
              lignes={lots}
              cle={(l) => l.id}
              exportNom={`lots-${chantier.code}`}
              vide={{ titre: "Aucun lot", description: "Le chantier est suivi d'un seul tenant ; ajoutez des lots pour suivre l'avancement par tronçon ou par marché." }}
            />
          </Panneau>

          <Panneau titre="Situations d'avancement" icone={ClipboardList} sousTitre="Seules les situations validées comptent dans l'avancement">
            <TableauDonnees
              libelle={`Situations d'avancement de ${chantier.code}`}
              colonnes={colonnesSituations}
              lignes={avancements}
              cle={(s) => s.id}
              exportNom={`situations-${chantier.code}`}
              triInitial={{ cle: "periode", sens: "desc" }}
              parPage={12}
              vide={{
                titre: "Aucune situation saisie",
                description: chantier.statut === "en_cours" ? "La première situation mensuelle lancera le suivi de l'avancement." : "L'avancement se saisit une fois le chantier en cours.",
                action: peutSaisir ? (
                  <Button type="button" variant="secondary" size="sm" onClick={() => ouvrir({ type: "situation" })}>
                    <Ruler />
                    Saisir une situation
                  </Button>
                ) : undefined,
              }}
            />
          </Panneau>

          <Panneau
            titre="Jalons"
            icone={FlagTriangleRight}
            sousTitre="Dont ceux qui conditionnent un décaissement"
            actions={
              peutGerer ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => ouvrir({ type: "jalon" })}>
                  <Plus />
                  Ajouter un jalon
                </Button>
              ) : null
            }
          >
            <TableauDonnees
              libelle={`Jalons de ${chantier.code}`}
              colonnes={colonnesJalons}
              lignes={jalons}
              cle={(j) => j.id}
              exportNom={`jalons-${chantier.code}`}
              triInitial={{ cle: "prevu", sens: "asc" }}
              vide={{ titre: "Aucun jalon", description: "Les jalons fixent les étapes contractuelles et les conditions de décaissement." }}
            />
          </Panneau>

          <Panneau
            titre="Plages travaux du chantier"
            icone={Wrench}
            actions={
              peutDemander ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => ouvrir({ type: "intervention" })}>
                  <CalendarPlus />
                  Demander une plage
                </Button>
              ) : null
            }
          >
            <TableauDonnees
              libelle={`Plages travaux de ${chantier.code}`}
              colonnes={colonnesInterventions}
              lignes={interventions}
              cle={(i) => i.id}
              lien={(i) => `/infrastructures/interventions/${i.id}`}
              exportNom={`plages-travaux-${chantier.code}`}
              triInitial={{ cle: "debut", sens: "desc" }}
              parPage={10}
              vide={{ titre: "Aucune plage travaux", description: "Les plages demandées pour ce chantier apparaîtront ici." }}
            />
          </Panneau>
        </div>

        <div className="grid content-start gap-5">
          <Panneau titre="Financements" icone={HandCoins} sousTitre={totalFinance < chantier.budgetFcfa ? `Reste à financer : ${xaf(chantier.budgetFcfa - totalFinance)}` : "Budget entièrement financé"}>
            <RepartitionBailleurs parts={chantier.financements} legende={`Financements du chantier ${chantier.code}`} />
          </Panneau>
          <PanneauChronologie evenements={dossier.chronologie} />
        </div>
      </div>

      {mode?.type === "modifier" ? <FenetreChantier key={cleFenetre} open onOpenChange={fermer} operation={operation} chantier={chantier} /> : null}
      {mode?.type === "statut" ? <FenetreStatutChantier key={cleFenetre} open onOpenChange={fermer} operation={operation} chantier={chantier} /> : null}
      {mode?.type === "lot" ? <FenetreLot key={cleFenetre} open onOpenChange={fermer} operation={operation} chantier={chantier} /> : null}
      {mode?.type === "situation" ? <FenetreSituation key={cleFenetre} open onOpenChange={fermer} operation={operation} chantier={chantier} lots={lots} /> : null}
      {mode?.type === "jalon" ? <FenetreJalon key={cleFenetre} open onOpenChange={fermer} operation={operation} chantier={chantier} /> : null}
      {mode?.type === "valider" || mode?.type === "rejeter" ? (
        <FenetreDecisionSituation key={cleFenetre} open onOpenChange={fermer} operation={operation} chantier={chantier} situation={mode.situation} decision={mode.type} />
      ) : null}
      {mode?.type === "atteint" ? <FenetreJalonAtteint key={cleFenetre} open onOpenChange={fermer} operation={operation} jalon={mode.jalon} /> : null}
      {mode?.type === "intervention" ? (
        <FenetreDemandeIntervention
          key={cleFenetre}
          open
          onOpenChange={fermer}
          operation={operation}
          chantierInitial={{ id: chantier.id, pkDebut: chantier.pkDebut, pkFin: chantier.pkFin }}
          onCree={(id) => router.push(`/infrastructures/interventions/${id}` as Route)}
        />
      ) : null}
    </CadreInfra>
  )
}
