"use client"

import {
  Ban,
  CalendarClock,
  ClipboardList,
  Coins,
  FileText,
  Flag,
  History,
  Package,
  PencilLine,
  Play,
  Printer,
  Receipt,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Timer,
  Undo2,
  UserCheck,
  Wrench,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useState, type ReactNode } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { Chronologie, Fiche, LienBouton, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { Encart, RetourOperation, useOperation } from "@/components/gestion/referentiels/elements"
import { dateCourte, dateHeure } from "@/components/gestion/referentiels/format"
import { CycleVie, Pastille } from "@/components/gestion/referentiels/statuts"

import { DialogueDemandeAchat } from "../achats/dialogues-achat"
import {
  CadreGmao,
  DossierEnChargement,
  DossierIntrouvable,
  FAMILLES,
  gmaoApi,
  heures,
  km,
  ORIGINES_OT,
  quantite,
  STATUTS_ACHAT,
  STATUTS_OT,
  TagAchat,
  TagEngin,
  TagOt,
  TagPriorite,
  TagRetard,
  TYPES_OT,
  useDroitsGmao,
  xaf,
  type DossierOt,
} from "../commun"
import { actionsOt, ETAPES_OT, etapeOt, LIBELLES_ACTIONS_OT, PROCHAINE_ETAPE_OT, piecesNettes, type ActionOt } from "./actions-ot"
import {
  FenetreAnnulerOt,
  FenetreCloturerOt,
  FenetreConsommerOt,
  FenetreCoutExterneOt,
  FenetreModifierOt,
  FenetrePlanifierOt,
  FenetreRefusReceptionOt,
  FenetreRetourOt,
  FenetreTempsOt,
  FenetreTerminerOt,
} from "./fenetres-ot"
import { chronologieGmao, duree, GardeDossier, Horodatage, LienInterne } from "./outils"

type Temps = DossierOt["temps"][number]
type Piece = DossierOt["pieces"][number]
type AchatLie = DossierOt["achats"][number]

const RETOUR = { href: "/materiel/ordres", libelle: "Ordres de travail" }

const ICONES_ACTIONS: Record<ActionOt, typeof Wrench> = {
  planifier: CalendarClock,
  replanifier: CalendarClock,
  modifier: PencilLine,
  demarrer: Play,
  saisir_temps: Timer,
  consommer: Package,
  retourner: Undo2,
  cout_externe: Receipt,
  demander_achat: ShoppingCart,
  terminer: Flag,
  refuser_reception: RotateCcw,
  cloturer: ShieldCheck,
  annuler: Ban,
}

/* ============================================================ Colonnes */

const colonnesTemps: ColonneTableau<Temps>[] = [
  { cle: "date", libelle: "Date", rendu: (t) => <span className="tabular">{dateCourte(t.date)}</span>, tri: (t) => t.date, export: (t) => dateCourte(t.date) },
  {
    cle: "intervenant",
    libelle: "Intervenant",
    rendu: (t) => (
      <span className="grid">
        <span className="font-semibold">{t.intervenant}</span>
        {t.matricule ? <small className="tabular text-[12.5px] text-ink-muted">{t.matricule}</small> : null}
      </span>
    ),
    tri: (t) => t.intervenant,
    export: (t) => (t.matricule ? `${t.intervenant} (${t.matricule})` : t.intervenant),
  },
  { cle: "heures", libelle: "Heures", rendu: (t) => heures(t.heures), tri: (t) => t.heures, numerique: true },
  { cle: "taux", libelle: "Taux horaire", rendu: (t) => xaf(t.tauxHoraireFcfa), tri: (t) => t.tauxHoraireFcfa, numerique: true, secondaire: true },
  { cle: "montant", libelle: "Montant", rendu: (t) => xaf(t.montantFcfa), tri: (t) => t.montantFcfa, numerique: true },
  { cle: "commentaire", libelle: "Commentaire", rendu: (t) => t.commentaire ?? "—", tri: (t) => t.commentaire ?? "", secondaire: true },
  { cle: "saisi", libelle: "Saisi par", rendu: (t) => t.saisiPar ?? "—", tri: (t) => t.saisiPar ?? "", secondaire: true },
]

const colonnesPieces: ColonneTableau<Piece>[] = [
  { cle: "le", libelle: "Date", rendu: (p) => <Horodatage le={p.le} />, tri: (p) => p.le, export: (p) => new Date(p.le) },
  {
    cle: "sens",
    libelle: "Mouvement",
    rendu: (p) =>
      p.sens === "sortie" ? (
        <Pastille ton="info" icone={Package}>
          Sortie
        </Pastille>
      ) : (
        <Pastille ton="neutral" icone={Undo2}>
          Retour
        </Pastille>
      ),
    tri: (p) => p.sens,
    export: (p) => (p.sens === "sortie" ? "Sortie" : "Retour"),
  },
  {
    cle: "article",
    libelle: "Article",
    rendu: (p) => (
      <span className="grid">
        <LienInterne href={`/materiel/stock/${p.articleId}`} mono>
          {p.reference}
        </LienInterne>
        <small className="text-[12.5px] text-ink-muted">{p.designation}</small>
      </span>
    ),
    tri: (p) => p.reference,
    export: (p) => `${p.reference} — ${p.designation}`,
  },
  {
    cle: "quantite",
    libelle: "Quantité",
    rendu: (p) => `${p.sens === "sortie" ? "−" : "+"}${quantite(p.quantite, p.unite)}`,
    tri: (p) => (p.sens === "sortie" ? -p.quantite : p.quantite),
    numerique: true,
  },
  { cle: "valeur", libelle: "Valeur", rendu: (p) => xaf(p.valeurFcfa), tri: (p) => p.valeurFcfa, numerique: true },
  { cle: "auteur", libelle: "Par", rendu: (p) => p.auteur ?? "—", tri: (p) => p.auteur ?? "", secondaire: true },
]

const colonnesAchats: ColonneTableau<AchatLie>[] = [
  { cle: "numero", libelle: "Demande", rendu: (a) => <span className="tabular font-semibold">{a.numero}</span>, tri: (a) => a.numero },
  { cle: "statut", libelle: "Statut", rendu: (a) => <TagAchat statut={a.statut} />, tri: (a) => a.statut, export: (a) => STATUTS_ACHAT[a.statut].libelle },
  { cle: "quantite", libelle: "Quantité", rendu: (a) => quantite(a.quantite), tri: (a) => a.quantite, numerique: true },
  { cle: "montant", libelle: "Montant", rendu: (a) => xaf(a.montantFcfa), tri: (a) => a.montantFcfa, numerique: true },
]

/* ============================================================== Écran */

/** Page d'un OT : garde contre un identifiant mal formé, puis le dossier. */
export function PageDossierOt({ otId }: { otId: string }) {
  return (
    <GardeDossier
      key={otId}
      secours={
        <CadreGmao titre="Ordre de travail" retour={RETOUR}>
          <DossierIntrouvable quoi="Ordre de travail" retour={RETOUR} />
        </CadreGmao>
      }
    >
      <DossierOtEcran otId={otId} />
    </GardeDossier>
  )
}

export function DossierOtEcran({ otId }: { otId: string }) {
  const dossier = useQuery(gmaoApi.queries.ordreTravail, { otId: otId as never })
  if (dossier === undefined) {
    return (
      <CadreGmao titre="Ordre de travail" retour={RETOUR}>
        <DossierEnChargement />
      </CadreGmao>
    )
  }
  if (dossier === null) {
    return (
      <CadreGmao titre="Ordre de travail introuvable" retour={RETOUR}>
        <DossierIntrouvable quoi="Ordre de travail" retour={RETOUR} />
      </CadreGmao>
    )
  }
  return <DossierOtCharge dossier={dossier} />
}

function DossierOtCharge({ dossier }: { dossier: DossierOt }) {
  const droits = useDroitsGmao()
  const operation = useOperation()
  const demarrer = useMutation(gmaoApi.mutations.demarrerOt)
  const [fenetre, setFenetre] = useState<ActionOt | null>(null)
  const { ot, engin, atelier, plan, visite, incident } = dossier

  const plan_ = actionsOt({
    statut: ot.statut,
    peut: droits.peut,
    termineParMoi: ot.termineParMoi,
    piecesRetournables: piecesNettes(dossier.pieces).length > 0,
  })
  const possible = (action: ActionOt) => plan_.principale === action || plan_.autres.includes(action)
  const succes = (message: string) => operation.signaler({ ton: "success", titre: message })

  const bouton = (action: ActionOt, variante: "primary" | "secondary" | "ghost" | "danger" = "secondary") => {
    const Icone = ICONES_ACTIONS[action]
    if (action === "demarrer") {
      return (
        <Button
          key={action}
          type="button"
          variant={variante}
          loading={operation.enCours === "demarrer"}
          loadingLabel="Démarrage…"
          onClick={() => void operation.executer("demarrer", () => demarrer({ otId: ot.id }), `${ot.numero} : travaux commencés.`)}
        >
          <Icone />
          {LIBELLES_ACTIONS_OT[action]}
        </Button>
      )
    }
    return (
      <Button key={action} type="button" variant={variante} onClick={() => setFenetre(action)}>
        <Icone />
        {LIBELLES_ACTIONS_OT[action]}
      </Button>
    )
  }

  // En-tête : la prochaine étape en `primary`, les décisions de cycle de vie à côté.
  const ENTETE: readonly ActionOt[] = ["replanifier", "modifier", "refuser_reception", "annuler"]
  const actionsEntete = (
    <>
      {ENTETE.filter((action) => plan_.autres.includes(action)).map((action) => bouton(action, action === "annuler" ? "ghost" : "secondary"))}
      {plan_.principale ? bouton(plan_.principale, "primary") : null}
    </>
  )
  const actionPanneau = (action: ActionOt) => (possible(action) ? bouton(action, "secondary") : null)

  const debutImmo = ot.debutReel
  const finImmo = ot.finReelle ?? ot.clotureLe
  const etape = etapeOt(ot.statut)

  return (
    <CadreGmao
      titre={`${ot.numero} · ${ot.titre}`}
      description={engin ? `${FAMILLES[engin.famille]} ${engin.numero} · ${engin.serie} — ${TYPES_OT[ot.type].toLowerCase()}, ${ORIGINES_OT[ot.origine].toLowerCase()}` : undefined}
      retour={RETOUR}
      actions={plan_.principale || plan_.autres.some((action) => ENTETE.includes(action)) ? actionsEntete : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagOt statut={ot.statut} />
        <TagPriorite priorite={ot.priorite} />
        {ot.enRetard ? <TagRetard /> : null}
        {ot.immobilisant ? <Pastille ton="warning">Immobilisant</Pastille> : <Pastille ton="neutral">Sans immobilisation</Pastille>}
        <span className="ml-auto">
          <LienBouton href={`/materiel/ordres/${ot.id}/impression`} variante="ghost">
            <Printer />
            Imprimer l&apos;OT
          </LienBouton>
        </span>
      </div>

      <RetourOperation retour={operation.retour} />

      {plan_.separationTaches ? (
        <Encart icone={UserCheck} titre="Séparation des tâches : la remise en service revient à un autre agent" ton="vigilance">
          Vous avez déclaré la fin des travaux de cet OT. Un autre agent habilité réceptionne l&apos;engin et le remet en service ; vous pouvez encore refuser la réception si un défaut subsiste.
        </Encart>
      ) : null}

      {ot.statut === "annule" ? (
        <InlineMessage tone="warning" title="OT annulé">
          {ot.motifAnnulation ?? "Motif non renseigné."}
        </InlineMessage>
      ) : null}

      <Panneau titre="Cycle de vie" icone={ClipboardList}>
        {etape >= 0 ? <CycleVie etapes={ETAPES_OT} courante={etape} /> : null}
        <p className="text-[14px]">
          <b>Étape actuelle : {STATUTS_OT[ot.statut].libelle}.</b> <span className="text-ink-muted">{PROCHAINE_ETAPE_OT[ot.statut]}</span>
        </p>
      </Panneau>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="grid min-w-0 content-start gap-5">
          <Panneau titre="Demande" icone={FileText}>
            <p className="text-[14px] whitespace-pre-line">{ot.description}</p>
            {plan ? (
              <div className="grid gap-1.5">
                <h3 className="text-[14px] font-bold">
                  Opérations du plan <span className="tabular">{plan.code}</span>
                </h3>
                <ul className="grid list-disc gap-0.5 pl-5 text-[14px]">
                  {plan.operations.map((operationPlan) => (
                    <li key={operationPlan}>{operationPlan}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Panneau>

          <Panneau titre="Compte rendu des travaux" icone={Flag}>
            {ot.compteRendu ? (
              <p className="text-[14px] whitespace-pre-line">{ot.compteRendu}</p>
            ) : (
              <p className="text-small text-ink-muted">Rédigé à la déclaration de fin des travaux.</p>
            )}
          </Panneau>

          <Panneau titre="Temps passés" icone={Timer} sousTitre={heures(ot.heuresPassees)} actions={actionPanneau("saisir_temps")}>
            <TableauDonnees
              libelle={`Temps passés sur ${ot.numero}`}
              colonnes={colonnesTemps}
              lignes={dossier.temps}
              cle={(t) => t.id}
              exportNom={`${ot.numero}-temps`}
              triInitial={{ cle: "date", sens: "desc" }}
              parPage={10}
              vide={{ titre: "Aucun temps saisi", description: ot.statut === "en_cours" ? "Saisissez le temps de chaque intervenant, au quart d'heure." : "Le temps se saisit pendant les travaux." }}
              pied={
                dossier.temps.length > 0 ? (
                  <tr>
                    <td colSpan={2} className="px-3.5 py-2.5">
                      Total
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular-nums">{heures(ot.heuresPassees)}</td>
                    <td className="hidden md:table-cell" />
                    <td className="px-3.5 py-2.5 text-right tabular-nums">{xaf(ot.coutMainOeuvreFcfa)}</td>
                    <td colSpan={2} className="hidden md:table-cell" />
                  </tr>
                ) : undefined
              }
            />
          </Panneau>

          <Panneau
            titre="Pièces"
            icone={Package}
            sousTitre={xaf(ot.coutPiecesFcfa)}
            actions={
              <>
                {actionPanneau("retourner")}
                {actionPanneau("consommer")}
              </>
            }
          >
            <TableauDonnees
              libelle={`Pièces de ${ot.numero}`}
              colonnes={colonnesPieces}
              lignes={dossier.pieces}
              cle={(p) => p.id}
              exportNom={`${ot.numero}-pieces`}
              triInitial={{ cle: "le", sens: "desc" }}
              parPage={10}
              vide={{ titre: "Aucune pièce consommée", description: "Les sorties de magasin imputées à l'OT apparaissent ici, avec leurs retours." }}
            />
          </Panneau>

          <Panneau titre="Achats liés" icone={ShoppingCart} actions={actionPanneau("demander_achat")}>
            <TableauDonnees
              libelle={`Demandes d'achat liées à ${ot.numero}`}
              colonnes={colonnesAchats}
              lignes={dossier.achats}
              cle={(a) => a.id}
              lien={(a) => `/materiel/achats/${a.id}`}
              exportNom={`${ot.numero}-achats`}
              parPage={10}
              vide={{ titre: "Aucun achat lié", description: "Une pièce manquante se demande depuis l'OT en cours : la demande lui reste rattachée." }}
            />
          </Panneau>
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <Panneau titre="Dossier" icone={Wrench}>
            <Fiche
              elements={[
                [
                  "Engin",
                  engin ? (
                    <span key="engin" className="inline-flex flex-wrap items-center justify-end gap-2">
                      <Link href={`/materiel/parc/${engin.id}` as Route} className="tabular text-accent-ink underline-offset-2 hover:underline">
                        {engin.numero}
                      </Link>
                      <TagEngin statut={engin.statut} />
                    </span>
                  ) : (
                    "—"
                  ),
                ],
                engin ? ["Série", engin.serie] : null,
                ["Nature", TYPES_OT[ot.type]],
                ["Origine", ORIGINES_OT[ot.origine]],
                ["Atelier", atelier?.nom ?? "—"],
                ["Équipe", ot.equipe ?? "Non affectée"],
                ["Demandé le", <Horodatage key="dl" le={ot.demandeLe} />],
                ["Demandé par", ot.demandeur ?? "Système"],
                ot.planifiePar ? ["Planifié par", ot.planifiePar] : null,
                ["Début prévu", <Horodatage key="dp" le={ot.debutPrevu} />],
                ["Fin prévue", <Horodatage key="fp" le={ot.finPrevue} />],
                ["Début réel", <Horodatage key="dr" le={ot.debutReel} />],
                ["Fin des travaux", <Horodatage key="fr" le={ot.finReelle} />],
                ot.terminePar ? ["Travaux déclarés par", ot.terminePar] : null,
                [
                  "Immobilisation",
                  ot.immobilisant
                    ? debutImmo
                      ? `Oui · ${finImmo ? duree(finImmo - debutImmo) : "en cours depuis le " + dateHeure(debutImmo)}`
                      : "Oui, dès le démarrage"
                    : "Non",
                ],
                ot.kmDebut !== null ? ["Compteur au démarrage", <span key="km" className="tabular">{km(ot.kmDebut)}</span>] : null,
                ot.organe ? ["Organe", ot.organe] : null,
                plan ? ["Plan préventif", <LienInterne key="plan" href={`/materiel/preventif/${plan.id}`} mono>{`${plan.code} · ${plan.libelle}`}</LienInterne>] : null,
                visite
                  ? ["Visite d'origine", <LienInterne key="visite" href={`/materiel/visites/${visite.id}`} mono>{`${visite.numero} · ${visite.convoi}`}</LienInterne>]
                  : null,
                incident
                  ? ["Incident d'origine", <LienInterne key="incident" href={`/gestion/incidents/${incident.id}`} mono>{incident.reference ?? "Incident"}</LienInterne>]
                  : null,
                ot.clotureLe ? ["Clôturé le", <Horodatage key="cl" le={ot.clotureLe} />] : null,
                ot.cloturePar ? ["Remis en service par", ot.cloturePar] : null,
              ]}
            />
          </Panneau>

          <Panneau titre="Coûts" icone={Coins} actions={actionPanneau("cout_externe")}>
            <Fiche
              elements={[
                ["Main-d'œuvre", <span key="mo" className="tabular">{xaf(ot.coutMainOeuvreFcfa)}</span>],
                atelier ? ["Taux de l'atelier", <span key="t" className="tabular">{xaf(atelier.tauxHoraireFcfa)} / h</span>] : null,
                ["Pièces", <span key="p" className="tabular">{xaf(ot.coutPiecesFcfa)}</span>],
                ["Prestations externes", <span key="e" className="tabular">{xaf(ot.coutExterneFcfa)}</span>],
                ["Total", <b key="tot" className="tabular text-[16px]">{xaf(ot.coutTotalFcfa)}</b>],
              ]}
            />
          </Panneau>

          <Panneau titre="Chronologie" icone={History}>
            <Chronologie evenements={chronologieGmao(dossier.chronologie)} />
          </Panneau>
        </div>
      </div>

      <Fenetres dossier={dossier} fenetre={fenetre} fermer={() => setFenetre(null)} succes={succes} />
    </CadreGmao>
  )
}

/** Monte uniquement la fenêtre ouverte : chaque formulaire repart de l'état du dossier. */
function Fenetres({ dossier, fenetre, fermer, succes }: { dossier: DossierOt; fenetre: ActionOt | null; fermer: () => void; succes: (message: string) => void }) {
  const commun = {
    dossier,
    open: true,
    onOpenChange: (ouvert: boolean) => {
      if (!ouvert) fermer()
    },
    onSucces: succes,
  }
  let contenu: ReactNode = null
  switch (fenetre) {
    case "modifier":
      contenu = <FenetreModifierOt {...commun} />
      break
    case "planifier":
    case "replanifier":
      contenu = <FenetrePlanifierOt {...commun} />
      break
    case "saisir_temps":
      contenu = <FenetreTempsOt {...commun} />
      break
    case "consommer":
      contenu = <FenetreConsommerOt {...commun} />
      break
    case "retourner":
      contenu = <FenetreRetourOt {...commun} />
      break
    case "cout_externe":
      contenu = <FenetreCoutExterneOt {...commun} />
      break
    case "terminer":
      contenu = <FenetreTerminerOt {...commun} />
      break
    case "refuser_reception":
      contenu = <FenetreRefusReceptionOt {...commun} />
      break
    case "cloturer":
      contenu = <FenetreCloturerOt {...commun} />
      break
    case "annuler":
      contenu = <FenetreAnnulerOt {...commun} />
      break
    case "demander_achat":
      contenu = (
        <DialogueDemandeAchat
          open
          onOpenChange={commun.onOpenChange}
          atelierId={dossier.ot.atelierId}
          ot={{ id: dossier.ot.id, numero: dossier.ot.numero }}
          onSucces={succes}
        />
      )
      break
    default:
      contenu = null
  }
  return contenu
}

