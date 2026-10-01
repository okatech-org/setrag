"use client"

import { CalendarClock, History, Link2, ListOrdered, Pause, PencilLine, Play, Plus, ScrollText, TrainFront, Unlink } from "lucide-react"
import { useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Voie } from "@workspace/ui/components/voie"

import { CelluleDouble, Chronologie, Fiche, Indicateur, Indicateurs, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte, dateHeure, nombre } from "@/components/gestion/referentiels/format"
import { TagActif } from "@/components/gestion/referentiels/statuts"

import {
  CadreGmao,
  DossierEnChargement,
  DossierIntrouvable,
  ETATS_ECHEANCE,
  FAMILLES,
  gmaoApi,
  km,
  libelleRestant,
  STATUTS_ENGIN,
  TagEcheance,
  TagEngin,
  useDroitsGmao,
  type DossierPlan,
} from "../commun"
import { evenementsGmao, LienCellule } from "../parc/partage"
import { DialogueDetachement, DialogueModificationPlan, DialogueRattachement } from "./formulaires-plan"
import { ResultatGeneration, seriesPlan, seuilsPlan } from "./preventif"

type EnginPlan = DossierPlan["engins"][number]

const RANG_ECHEANCE = { echue: 0, proche: 1, a_jour: 2 } as const

function colonnesEngins(detacher: ((engin: EnginPlan) => void) | null): ColonneTableau<EnginPlan>[] {
  const colonnes: ColonneTableau<EnginPlan>[] = [
    { cle: "numero", libelle: "Engin", rendu: (e) => <CelluleDouble haut={e.numero} bas={e.serie} mono />, tri: (e) => e.numero },
    {
      cle: "statut",
      libelle: "Statut",
      rendu: (e) => <TagEngin statut={e.statut} />,
      tri: (e) => STATUTS_ENGIN[e.statut].libelle,
      export: (e) => STATUTS_ENGIN[e.statut].libelle,
      secondaire: true,
    },
    {
      cle: "etat",
      libelle: "Échéance",
      rendu: (e) => (
        <span className="grid min-w-[150px] gap-1">
          <TagEcheance etat={e.etat} />
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
      rendu: (e) => <span className="tabular">{libelleRestant({ kmRestants: e.kmRestants, joursRestants: e.joursRestants })}</span>,
      tri: (e) => -e.ratio,
      export: (e) => libelleRestant({ kmRestants: e.kmRestants, joursRestants: e.joursRestants }),
    },
    {
      cle: "prochaine",
      libelle: "Prochaine",
      rendu: (e) => (
        <CelluleDouble
          haut={<span className="tabular">{e.prochainKm !== null ? km(e.prochainKm) : "—"}</span>}
          bas={<span className="tabular">{dateCourte(e.prochaineDate)}</span>}
        />
      ),
      tri: (e) => e.prochaineDate ?? e.prochainKm ?? 0,
      export: (e) => [e.prochainKm !== null ? km(e.prochainKm) : null, e.prochaineDate ? dateCourte(e.prochaineDate) : null].filter(Boolean).join(" / "),
      secondaire: true,
    },
    {
      cle: "derniere",
      libelle: "Dernière réalisation",
      rendu: (e) => (
        <CelluleDouble haut={<span className="tabular">{dateCourte(e.derniereRealisationLe)}</span>} bas={<span className="tabular">{km(e.derniereRealisationKm)}</span>} />
      ),
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
  if (detacher) {
    colonnes.push({
      cle: "action",
      libelle: "Action",
      rendu: (e) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(event) => {
            event.stopPropagation()
            detacher(e)
          }}
          onKeyDown={(event) => event.stopPropagation()}
          aria-label={`Détacher ${e.numero} du plan`}
        >
          <Unlink />
          Détacher
        </Button>
      ),
      export: false,
    })
  }
  return colonnes
}

type Dialogue = "modifier" | "rattacher" | "detacher" | null

/** Dossier d'un plan préventif : gamme, engins suivis et leurs échéances, journal. */
export function DetailPlan({ planId }: { planId: string }) {
  const dossier = useQuery(gmaoApi.queries.plan, { planId: planId as never })
  const droits = useDroitsGmao()
  const modifier = useMutation(gmaoApi.mutations.modifierPlan)
  const generer = useMutation(gmaoApi.mutations.genererOtPreventifs)
  const operation = useOperation()
  const [dialogue, setDialogue] = useState<Dialogue>(null)
  const [ouvertures, setOuvertures] = useState(0)
  const [aDetacher, setADetacher] = useState<EnginPlan | null>(null)
  const [resultat, setResultat] = useState<{ crees: { otId: string; numero: string }[]; ignores: number } | null>(null)
  const retour = { href: "/materiel/preventif", libelle: "Préventif" }

  if (dossier === undefined) {
    return (
      <CadreGmao titre="Plan préventif" retour={retour}>
        <DossierEnChargement />
      </CadreGmao>
    )
  }
  if (dossier === null) {
    return (
      <CadreGmao titre="Plan préventif" retour={retour}>
        <DossierIntrouvable quoi="Plan préventif" retour={{ href: "/materiel/preventif", libelle: "Revenir au préventif" }} />
      </CadreGmao>
    )
  }

  const { plan, engins } = dossier
  const echusSansOt = engins.filter((e) => e.etat === "echue" && e.otOuvertId === null)
  const peutAdministrer = droits.peut("plan_administrer")
  const ouvrir = (cle: Exclude<Dialogue, null>) => {
    operation.effacer()
    setResultat(null)
    setOuvertures((n) => n + 1)
    setDialogue(cle)
  }
  const fermer = (ouvert: boolean) => {
    if (!ouvert) setDialogue(null)
  }
  const basculerActif = () =>
    void operation.executer("actif", () => modifier({ planId: plan.id, isActive: !plan.actif }), plan.actif ? `Plan ${plan.code} désactivé : ses échéances ne sont plus suivies.` : `Plan ${plan.code} réactivé.`)
  const genererEchus = async () => {
    setResultat(null)
    const retourGeneration = await operation.executer("generer", () => generer({ planEquipementIds: echusSansOt.map((e) => e.planEquipementId) }))
    if (retourGeneration) setResultat({ crees: retourGeneration.crees.map((ot) => ({ otId: ot.otId, numero: ot.numero })), ignores: retourGeneration.ignores })
  }

  return (
    <CadreGmao
      titre={`${plan.code} — ${plan.libelle}`}
      description={`${FAMILLES[plan.famille]} · ${seriesPlan(plan.series)} · tous les ${seuilsPlan(plan)}`}
      retour={retour}
      actions={
        <>
          {peutAdministrer ? (
            <>
              <Button type="button" variant="secondary" onClick={() => ouvrir("modifier")}>
                <PencilLine />
                Modifier le plan
              </Button>
              <Button type="button" variant="secondary" onClick={() => ouvrir("rattacher")} disabled={!plan.actif}>
                <Link2 />
                Rattacher des engins
              </Button>
              <Button type="button" variant="ghost" onClick={basculerActif} loading={operation.enCours === "actif"}>
                {plan.actif ? <Pause /> : <Play />}
                {plan.actif ? "Désactiver le plan" : "Réactiver le plan"}
              </Button>
            </>
          ) : null}
          {droits.peut("ot_planifier") && plan.actif && echusSansOt.length > 0 ? (
            <Button type="button" onClick={() => void genererEchus()} loading={operation.enCours === "generer"}>
              <Plus />
              Ouvrir les OT des échéances échues ({echusSansOt.length})
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <TagActif actif={plan.actif} oui="Plan actif" non="Plan désactivé" />
        <span className="text-ink-muted">
          mis à jour le <span className="tabular">{dateHeure(plan.majLe)}</span>
        </span>
      </div>
      {!plan.actif ? (
        <InlineMessage tone="info" title="Plan désactivé">
          Ses échéances ne sont plus calculées et aucun OT préventif ne peut en être tiré. Réactivez-le pour reprendre le suivi.
        </InlineMessage>
      ) : null}
      <RetourOperation retour={operation.retour} />
      <ResultatGeneration resultat={resultat} />

      <Indicateurs colonnes={4}>
        <Indicateur libelle="Engins suivis" icone={TrainFront} valeur={nombre(engins.length)} />
        <Indicateur libelle="Échéances échues" icone={CalendarClock} valeur={nombre(engins.filter((e) => e.etat === "echue").length)} evolution={{ sens: echusSansOt.length > 0 ? "vigilance" : "neutre", texte: `${nombre(echusSansOt.length)} sans OT ouvert` }} />
        <Indicateur libelle="Échéances proches" icone={CalendarClock} valeur={nombre(engins.filter((e) => e.etat === "proche").length)} />
        <Indicateur libelle="Durée d'intervention" icone={ListOrdered} valeur={plan.dureeHeures.toLocaleString("fr-FR")} unite="heures" />
      </Indicateurs>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <div className="grid min-w-0 content-start gap-5">
          <Panneau titre="Engins rattachés" icone={TrainFront} sousTitre="Cliquez une ligne pour ouvrir la fiche de l'engin">
            <TableauDonnees
              libelle={`Engins suivis par le plan ${plan.code}`}
              colonnes={colonnesEngins(
                peutAdministrer
                  ? (engin) => {
                      operation.effacer()
                      setADetacher(engin)
                      setOuvertures((n) => n + 1)
                      setDialogue("detacher")
                    }
                  : null
              )}
              lignes={engins}
              cle={(e) => e.planEquipementId}
              lien={(e) => `/materiel/parc/${e.equipementId}`}
              recherche={{ placeholder: "Numéro, série…", texte: (e) => `${e.numero} ${e.serie}` }}
              exportNom={`plan-${plan.code}-engins`}
              triInitial={{ cle: "etat", sens: "asc" }}
              vide={{
                titre: "Aucun engin rattaché",
                description: "Ce plan ne suit encore aucun engin. Rattachez les engins de la famille concernée.",
                action: peutAdministrer && plan.actif ? (
                  <Button type="button" variant="secondary" size="sm" onClick={() => ouvrir("rattacher")}>
                    Rattacher des engins
                  </Button>
                ) : undefined,
              }}
            />
          </Panneau>

          <Panneau titre="Gamme d'opérations" icone={ScrollText} sousTitre={`${plan.operations.length} opération(s)`}>
            <ol className="grid list-decimal gap-1.5 pl-6 text-[14px]">
              {plan.operations.map((operationGamme, index) => (
                <li key={`${index}-${operationGamme}`}>{operationGamme}</li>
              ))}
            </ol>
          </Panneau>
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <Panneau titre="Paramètres" icone={CalendarClock}>
            <Fiche
              elements={[
                ["Code", <span key="c" className="tabular">{plan.code}</span>],
                ["Famille", FAMILLES[plan.famille]],
                ["Séries", seriesPlan(plan.series)],
                ["Seuil kilométrique", plan.seuilKm ? <span key="k" className="tabular">{km(plan.seuilKm)}</span> : "Aucun"],
                ["Seuil calendaire", plan.seuilJours ? <span key="j" className="tabular">{nombre(plan.seuilJours)} jours</span> : "Aucun"],
                ["Marge d'alerte", <span key="a" className="tabular">{plan.alertePct} %</span>],
                ["Durée estimée", <span key="d" className="tabular">{plan.dureeHeures.toLocaleString("fr-FR")} h</span>],
                ["Immobilise l'engin", plan.immobilisant ? "Oui" : "Non"],
                ["État", plan.actif ? "Actif" : "Désactivé"],
                ["Créé le", <span key="cr" className="tabular">{dateCourte(plan.creeLe)}</span>],
              ]}
            />
          </Panneau>
          <Panneau titre="Journal du plan" icone={History}>
            <Chronologie evenements={evenementsGmao(dossier.chronologie)} vide="Aucun événement enregistré sur ce plan." />
          </Panneau>
        </div>
      </div>

      <DialogueModificationPlan
        key={`modifier-${ouvertures}`}
        open={dialogue === "modifier"}
        onOpenChange={fermer}
        dossier={dossier}
        onModifie={() => operation.signaler({ ton: "success", titre: `Plan ${plan.code} mis à jour.` })}
      />
      <DialogueRattachement
        key={`rattacher-${ouvertures}`}
        open={dialogue === "rattacher"}
        onOpenChange={fermer}
        dossier={dossier}
        onRattache={(ajoutes) => operation.signaler({ ton: "success", titre: `${ajoutes} engin(s) rattaché(s) au plan ${plan.code}.` })}
      />
      <DialogueDetachement
        key={`detacher-${ouvertures}`}
        open={dialogue === "detacher"}
        onOpenChange={fermer}
        engin={aDetacher ? { planEquipementId: aDetacher.planEquipementId, numero: aDetacher.numero } : null}
        planCode={plan.code}
        onDetache={(numero) => operation.signaler({ ton: "success", titre: `${numero} détaché du plan ${plan.code}.` })}
      />
    </CadreGmao>
  )
}
