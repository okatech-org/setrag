"use client"

import type { FunctionReturnType } from "convex/server"
import { Archive, ArrowRight, FilePlus2, FileStack, Inbox, Mail, Megaphone, Workflow } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"

import {
  CelluleDouble,
  Indicateur,
  Indicateurs,
  LienBouton,
  Panneau,
  TableauDonnees,
  type ColonneTableau,
} from "@/components/charte"
import { dateCourte, dateHeure } from "@/components/gestion/referentiels/format"

import { CadreGed, MENTION_LECTURE_GED } from "./cadre"
import {
  NATURES_ETAPE,
  STATUTS_DOCUMENT,
  TYPES_DOCUMENT,
  TagClassification,
  TagDemo,
  TagStatutDocument,
  libelleDirection,
} from "./statuts"

type Tableau = FunctionReturnType<typeof api.modules.ged.queries.tableauDeBord>
type Ligne = Tableau["recents"][number]

export const colonnesDocuments: ColonneTableau<Ligne>[] = [
  {
    cle: "reference",
    libelle: "Référence",
    rendu: (ligne) => <CelluleDouble mono haut={ligne.reference} bas={dateCourte(Date.parse(`${ligne.dateDocument}T12:00:00Z`))} />,
    tri: (ligne) => ligne.reference,
  },
  {
    cle: "titre",
    libelle: "Pièce",
    rendu: (ligne) => (
      <span className="grid gap-1">
        <CelluleDouble haut={ligne.titre} bas={`${TYPES_DOCUMENT[ligne.type]} · ${ligne.classement.code}`} />
        <TagDemo origine={ligne.origine} />
      </span>
    ),
    tri: (ligne) => ligne.titre,
    export: (ligne) => ligne.titre,
  },
  {
    cle: "direction",
    libelle: "Direction",
    rendu: (ligne) => libelleDirection(ligne.direction),
    tri: (ligne) => ligne.direction,
    secondaire: true,
  },
  {
    cle: "classification",
    libelle: "Accès",
    rendu: (ligne) => <TagClassification classification={ligne.classification} />,
    tri: (ligne) => ["public", "interne", "confidentiel", "restreint"].indexOf(ligne.classification),
    export: (ligne) => ligne.classification,
    secondaire: true,
  },
  {
    cle: "statut",
    libelle: "État",
    rendu: (ligne) => <TagStatutDocument statut={ligne.statut} />,
    tri: (ligne) => ligne.statut,
    export: (ligne) => STATUTS_DOCUMENT[ligne.statut].libelle,
  },
  {
    cle: "maj",
    libelle: "Mise à jour",
    rendu: (ligne) => <span className="tabular">{dateHeure(ligne.updatedAt)}</span>,
    tri: (ligne) => ligne.updatedAt,
    secondaire: true,
  },
]

function ListeVide({ texte }: { texte: string }) {
  return <p className="text-small text-ink-muted">{texte}</p>
}

export function AccueilGed() {
  const tableau = useQuery(api.modules.ged.queries.tableauDeBord, {})
  const peutCreer = tableau?.droits.peutCreer ?? false

  return (
    <CadreGed
      titre="Bureautique et GED"
      description="Pièces classées, circuits de visa et de signature, registre du courrier officiel et notes de service, avec leur durée légale de conservation."
      lectureSeule={tableau && !peutCreer ? MENTION_LECTURE_GED : undefined}
      actions={
        peutCreer ? (
          <>
            <LienBouton href="/bureautique/courrier?nouveau=1" variante="secondary">
              <Mail />
              Enregistrer un courrier
            </LienBouton>
            <LienBouton href="/bureautique/documents/nouveau" variante="primary">
              <FilePlus2 />
              Déposer une pièce
            </LienBouton>
          </>
        ) : null
      }
    >
      {tableau === undefined ? (
        <SkeletonLines />
      ) : (
        <>
          <Indicateurs colonnes={5}>
            <Indicateur
              libelle="Mon parapheur"
              icone={Inbox}
              valeur={tableau.indicateurs.parapheur}
              unite={tableau.indicateurs.parapheur > 1 ? "étapes" : "étape"}
              evolution={
                tableau.indicateurs.parapheur > 0
                  ? { sens: "vigilance", texte: "Visa, signature ou diffusion attendus" }
                  : { sens: "neutre", texte: "Rien ne vous attend" }
              }
            />
            <Indicateur
              libelle="Notes à lire"
              icone={Megaphone}
              valeur={tableau.indicateurs.notesALire}
              evolution={{ sens: tableau.indicateurs.notesALire > 0 ? "vigilance" : "neutre", texte: "Accusé de lecture attendu" }}
            />
            <Indicateur
              libelle="Courrier en attente"
              icone={Mail}
              valeur={tableau.indicateurs.courriersEnAttente}
              evolution={
                tableau.indicateurs.courriersEnRetard > 0
                  ? { sens: "baisse", texte: `${tableau.indicateurs.courriersEnRetard} en retard de réponse` }
                  : { sens: "neutre", texte: "Aucun retard de réponse" }
              }
            />
            <Indicateur
              libelle="Circuits en cours"
              icone={Workflow}
              valeur={tableau.indicateurs.circuitsEnCours}
              evolution={{ sens: "neutre", texte: "Visas et signatures en attente" }}
            />
            <Indicateur
              libelle="Pièces consultables"
              icone={FileStack}
              valeur={tableau.indicateurs.documents}
              evolution={
                tableau.droits.gestionnaire && tableau.indicateurs.conservationEchue > 0
                  ? { sens: "vigilance", texte: `${tableau.indicateurs.conservationEchue} en fin de conservation` }
                  : { sens: "neutre", texte: `${tableau.indicateurs.brouillons} brouillon(s) à vous` }
              }
            />
          </Indicateurs>

          <div className="grid gap-5 lg:grid-cols-3">
            <Panneau
              titre="Ce qui m'attend"
              icone={Inbox}
              actions={
                <LienBouton href="/bureautique/parapheur" variante="ghost" taille="sm">
                  Parapheur
                  <ArrowRight />
                </LienBouton>
              }
            >
              {tableau.parapheur.length === 0 ? (
                <ListeVide texte="Aucune pièce n'attend votre visa, votre signature ou votre diffusion." />
              ) : (
                <ul className="grid gap-3">
                  {tableau.parapheur.map((element) => (
                    <li key={element.etapeId}>
                      <Link
                        href={`/bureautique/documents/${element.documentId}#circuit` as Route}
                        className="grid gap-0.5 rounded-md border border-line px-3 py-2.5 hover:bg-surface-sunk"
                      >
                        <span className="tabular text-[12.5px] text-ink-muted">{element.reference}</span>
                        <b className="text-[14px] font-semibold">{element.titre}</b>
                        <small className="text-[12.5px] text-ink-muted">
                          {NATURES_ETAPE[element.nature]} · {element.libelle}
                          {element.depuis ? ` · depuis le ${dateHeure(element.depuis)}` : ""}
                        </small>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panneau>

            <Panneau
              titre="Notes à lire"
              icone={Megaphone}
              actions={
                <LienBouton href="/bureautique/notes" variante="ghost" taille="sm">
                  Toutes les notes
                  <ArrowRight />
                </LienBouton>
              }
            >
              {tableau.notesALire.length === 0 ? (
                <ListeVide texte="Vous avez accusé lecture de toutes les notes qui vous sont adressées." />
              ) : (
                <ul className="grid gap-3">
                  {tableau.notesALire.map((note) => (
                    <li key={note._id}>
                      <Link
                        href={`/bureautique/documents/${note._id}` as Route}
                        className="grid gap-0.5 rounded-md border border-line px-3 py-2.5 hover:bg-surface-sunk"
                      >
                        <span className="tabular text-[12.5px] text-ink-muted">{note.reference}</span>
                        <b className="text-[14px] font-semibold">{note.titre}</b>
                        <small className="text-[12.5px] text-ink-muted">Diffusée le {dateHeure(note.diffuseLe)}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panneau>

            <Panneau
              titre="Courrier en retard"
              icone={Mail}
              actions={
                <LienBouton href="/bureautique/courrier" variante="ghost" taille="sm">
                  Registre
                  <ArrowRight />
                </LienBouton>
              }
            >
              {tableau.courriersEnRetard.length === 0 ? (
                <ListeVide texte="Aucun courrier arrivé n'a dépassé son échéance de réponse." />
              ) : (
                <ul className="grid gap-3">
                  {tableau.courriersEnRetard.map((courrier) => (
                    <li key={courrier._id}>
                      <Link
                        href={`/bureautique/courrier/${courrier._id}` as Route}
                        className="grid gap-0.5 rounded-md border border-line px-3 py-2.5 hover:bg-surface-sunk"
                      >
                        <span className="tabular text-[12.5px] text-ink-muted">{courrier.numero}</span>
                        <b className="text-[14px] font-semibold">{courrier.objet}</b>
                        <small className="text-[12.5px] text-danger-ink">
                          Échéance dépassée : {courrier.echeanceReponse ? dateCourte(Date.parse(`${courrier.echeanceReponse}T12:00:00Z`)) : "—"} ·{" "}
                          {courrier.correspondant}
                        </small>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panneau>
          </div>

          <Panneau
            titre="Dernières pièces mises à jour"
            icone={Archive}
            plein
            actions={
              <LienBouton href="/bureautique/documents" variante="ghost" taille="sm">
                Toutes les pièces
                <ArrowRight />
              </LienBouton>
            }
          >
            <div className="p-4">
              {tableau.recents.length === 0 ? (
                <EmptyState
                  title="Aucune pièce classée"
                  description="Déposez la première pièce, ou faites charger le jeu de démonstration."
                />
              ) : (
                <TableauDonnees
                  libelle="Dernières pièces"
                  colonnes={colonnesDocuments}
                  lignes={tableau.recents}
                  cle={(ligne) => ligne._id}
                  lien={(ligne) => `/bureautique/documents/${ligne._id}`}
                  exportNom="ged-dernieres-pieces"
                  parPage={8}
                  vide={{ titre: "Aucune pièce" }}
                />
              )}
            </div>
          </Panneau>
        </>
      )}
    </CadreGed>
  )
}
