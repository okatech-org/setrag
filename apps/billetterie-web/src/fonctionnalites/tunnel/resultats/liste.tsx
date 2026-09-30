"use client"

import { BanIcon } from "lucide-react"
import { useEffect, useMemo, useState, type CSSProperties } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { Tag } from "@workspace/ui/components/tag"
import { Chargeur } from "@workspace/ui/components/voie"
import { CarteTrajet } from "@workspace/ui/voyage/carte-trajet"
import { ChoixCartes } from "@workspace/ui/voyage/choix"
import { PastilleDesserte } from "@workspace/ui/voyage/statut"

import { BarreAction } from "@/coquille/barre-action"
import { useNaviguer } from "@/coquille/filet-navigation"
import { JOURS_EN_VENTE } from "@/fonctionnalites/recherche/choix-date"
import {
  useReductions,
  type Gare,
} from "@/fonctionnalites/reference/use-reference"
import {
  ajouterJours,
  arriveLendemain,
  dateCourte,
  dateLongue,
  dateRelative,
  duree,
  heure,
  minutesEntre,
  prix,
  prixCourt,
} from "@/lib/format"
import {
  codesReduction,
  libelleVoyageurs,
  memoriserRecherche,
  type Recherche,
} from "@/lib/recherche"
import {
  ecrireSession,
  lireSession,
  useValeurSession,
} from "@/lib/stockage-session"
import {
  CLASSES,
  LIBELLE_CLASSE,
  SEUIL_PLACES,
  estClasse,
  nomTrain,
  type Classe,
} from "@/lib/voyage"

import { adresseReservation, adresseResultats } from "../adresses"
import { EcranMessage, Page } from "../etapes"
import { useAttenteLongue } from "../outils"
import { BandeJours, useProchainJour, type Trajet } from "./calendrier"
import {
  GroupesFiltres,
  PastillesFiltres,
  aDesFiltres,
  useGroupesFiltres,
} from "./filtres"
import {
  SANS_FILTRE,
  TRIS,
  classeParDefaut,
  estTri,
  filtrer,
  nombreFiltres,
  prixDes,
  trier,
  type Filtres,
  type Resultat,
  type Tri,
} from "./modele"

const CLE_TRI = "setrag:tri-resultats"
const CLE_CHOIX = "setrag:choix-trajet"

interface Choix {
  tripId: string
  classe: Classe | null
}

/** Le train choisi est retenu pour la recherche : le retour depuis les voyageurs le retrouve. */
function lireChoix(cle: string): Choix | null {
  try {
    const valeur = JSON.parse(lireSession(CLE_CHOIX) ?? "null") as {
      cle?: string
      tripId?: string
      classe?: string
    } | null
    if (!valeur || valeur.cle !== cle || !valeur.tripId) return null
    return {
      tripId: valeur.tripId,
      classe: estClasse(valeur.classe) ? valeur.classe : null,
    }
  } catch {
    return null
  }
}

function arrets(n: number) {
  return n === 0 ? "direct" : `${n} arrêt${n > 1 ? "s" : ""}`
}

function Squelettes() {
  return (
    <div className="grid gap-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <SkeletonLines key={i} className="h-[132px]" />
      ))}
    </div>
  )
}

/**
 * La liste des trains d'un jour, pour une recherche. Montée pour une seule
 * recherche (`key`) : changer de jour repart d'une sélection vide, et la
 * cascade rejoue.
 */
export function ListeResultats({
  recherche,
  depart,
  arrivee,
  aujourdhui,
  masquerAction,
}: {
  recherche: Recherche
  depart: Gare
  arrivee: Gare
  aujourdhui: string
  /** Formulaire de recherche ouvert : son bouton est le seul principal. */
  masquerAction: boolean
}) {
  const naviguer = useNaviguer()
  const { enfant, chargement: chargementReductions } = useReductions()
  const voyageurs = recherche.adultes + recherche.enfants
  const finVente = ajouterJours(aujourdhui, JOURS_EN_VENTE - 1)
  const horsVente =
    recherche.le < aujourdhui
      ? "passee"
      : recherche.le > finVente
        ? "pas-ouverte"
        : null

  const codes = codesReduction(recherche, enfant?.code ?? null)
  // Avec des enfants, on attend leur réduction : sans elle, le prix affiché serait faux.
  const pret = recherche.enfants === 0 || !chargementReductions
  const trajet: Trajet = {
    originStationId: depart._id,
    destinationStationId: arrivee._id,
    passengers: voyageurs,
    discountCodes: codes,
  }

  const resultats = useQuery(
    api.functions.trips.search,
    pret && !horsVente ? { ...trajet, serviceDate: recherche.le } : "skip"
  )
  const chargement = resultats === undefined && !horsVente
  const longue = useAttenteLongue(chargement)

  const cle = adresseResultats(recherche)
  const [choix, setChoix] = useState<Choix | null>(() => lireChoix(cle))
  useEffect(() => {
    ecrireSession(CLE_CHOIX, choix ? JSON.stringify({ cle, ...choix }) : null)
  }, [choix, cle])

  const triMemorise = useValeurSession(CLE_TRI)
  const tri: Tri = estTri(triMemorise) ? triMemorise : "heure"
  const [filtres, setFiltres] = useState<Filtres>(SANS_FILTRE)

  const liste = useMemo(() => resultats ?? [], [resultats])
  const groupes = useGroupesFiltres(liste)
  const affiches = useMemo(
    () => trier(filtrer(liste, filtres), tri, voyageurs),
    [liste, filtres, tri, voyageurs]
  )
  const ouverts = liste.filter((r) => r.hasAvailability)
  const toutFerme =
    resultats !== undefined && liste.length > 0 && ouverts.length === 0
  const prochain = useProchainJour(
    trajet,
    recherche.le,
    finVente,
    pret && !horsVente && resultats !== undefined && ouverts.length === 0
  )

  const prixMeilleur = useMemo(() => {
    const prix = liste.flatMap((r) => prixDes(r, voyageurs) ?? [])
    return prix.length > 1 && new Set(prix).size > 1 ? Math.min(...prix) : null
  }, [liste, voyageurs])

  const allerAu = (le: string) => {
    const suivante = { ...recherche, le }
    memoriserRecherche(suivante)
    naviguer(adresseResultats(suivante), { remplacer: true })
  }

  const choisi = choix
    ? liste.find((r) => r.trip._id === choix.tripId)
    : undefined
  const classeChoisie =
    choisi &&
    choix?.classe &&
    (choisi.availableByClass[choix.classe] ?? 0) >= voyageurs
      ? choix.classe
      : null
  const totalChoisi =
    choisi && classeChoisie
      ? choisi.prixParClasse[classeChoisie]?.totalTtc
      : undefined

  const continuer = () => {
    if (!choisi || !classeChoisie) return
    naviguer(adresseReservation(recherche, choisi.trip._id, classeChoisie))
  }

  const etatVide = () => {
    if (horsVente === "passee") {
      return (
        <EcranMessage
          titre="Cette date est passée."
          description="Choisissez un autre jour de voyage."
          action={
            <Button variant="secondary" onClick={() => allerAu(aujourdhui)}>
              Voir les trains d&apos;aujourd&apos;hui
            </Button>
          }
        />
      )
    }
    if (horsVente === "pas-ouverte") {
      return (
        <EcranMessage
          titre="La vente de ce jour n'est pas encore ouverte."
          description={`Elle ouvre ${JOURS_EN_VENTE - 1} jours avant le départ. Le dernier jour en vente est le ${dateLongue(finVente)}.`}
          action={
            <Button variant="secondary" onClick={() => allerAu(finVente)}>
              Voir le {dateCourte(finVente).toLowerCase()}
            </Button>
          }
        />
      )
    }
    return (
      <EcranMessage
        titre="Aucun train ce jour-là."
        description={
          prochain === undefined
            ? "Recherche du prochain train…"
            : prochain
              ? `Le prochain train avec de la place part le ${dateLongue(prochain)}.`
              : `Aucun train n'est ouvert à la vente d'ici le ${dateLongue(finVente)} sur ce trajet.`
        }
        action={
          prochain ? (
            <Button variant="secondary" onClick={() => allerAu(prochain)}>
              Voir le {dateCourte(prochain).toLowerCase()}
            </Button>
          ) : undefined
        }
      />
    )
  }

  const avecFiltres = aDesFiltres(groupes)

  return (
    <>
      <Page className="grid gap-4 pt-2 pb-8 md:gap-5 md:pb-12">
        <BandeJours
          trajet={trajet}
          date={recherche.le}
          aujourdhui={aujourdhui}
          finVente={finVente}
          onChoisir={allerAu}
        />

        {horsVente || (resultats !== undefined && liste.length === 0) ? (
          etatVide()
        ) : (
          <div
            className={`grid gap-5 ${avecFiltres ? "md:grid-cols-[210px_minmax(0,1fr)] md:gap-8" : ""}`}
          >
            {avecFiltres && (
              <aside
                aria-label="Filtres"
                className="hidden content-start gap-4 md:grid"
              >
                <GroupesFiltres
                  groupes={groupes}
                  filtres={filtres}
                  onChange={setFiltres}
                />
                {nombreFiltres(filtres) > 0 && (
                  <Button
                    variant="ghost"
                    className="justify-self-start px-0"
                    onClick={() => setFiltres(SANS_FILTRE)}
                  >
                    Tout afficher
                  </Button>
                )}
              </aside>
            )}

            <section
              aria-labelledby="titre-liste"
              className="grid min-w-0 content-start gap-3"
            >
              {avecFiltres && resultats !== undefined && (
                <PastillesFiltres
                  groupes={groupes}
                  filtres={filtres}
                  onChange={setFiltres}
                  resultats={liste}
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <h2
                  id="titre-liste"
                  className="text-[15px] font-semibold text-ink-muted"
                  aria-live="polite"
                >
                  {resultats === undefined
                    ? "Recherche en cours"
                    : `${affiches.length} train${affiches.length > 1 ? "s" : ""}${affiches.length !== liste.length ? ` sur ${liste.length}` : ""} · ${dateRelative(recherche.le, aujourdhui)}`}
                </h2>
                {liste.length > 1 && (
                  <SegmentedControl
                    label="Trier les trains"
                    size="touch"
                    options={TRIS}
                    value={tri}
                    onValueChange={(valeur) => ecrireSession(CLE_TRI, valeur)}
                  />
                )}
              </div>

              {toutFerme && (
                <InlineMessage
                  tone="warning"
                  title={
                    liste.every((r) => r.trip.status === "annule")
                      ? "Les trains de ce jour sont supprimés."
                      : `Plus de place ce jour-là pour ${voyageurs > 1 ? `${voyageurs} voyageurs` : "un voyageur"}.`
                  }
                >
                  {prochain === undefined ? (
                    "Recherche du prochain train…"
                  ) : prochain ? (
                    <>
                      Le prochain train avec de la place part le{" "}
                      {dateLongue(prochain)}.{" "}
                      <button
                        type="button"
                        onClick={() => allerAu(prochain)}
                        className="min-h-11 font-semibold underline underline-offset-2"
                      >
                        Voir ce jour
                      </button>
                    </>
                  ) : (
                    "Aucun autre train n'a de place d'ici la fin de la vente."
                  )}
                </InlineMessage>
              )}

              {chargement ? (
                longue ? (
                  <Chargeur className="rounded-md border border-line bg-surface py-10">
                    Recherche des trains…
                  </Chargeur>
                ) : (
                  <Squelettes />
                )
              ) : affiches.length === 0 ? (
                <EcranMessage
                  illustration={false}
                  titre="Aucun train ne correspond à vos filtres."
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => setFiltres(SANS_FILTRE)}
                    >
                      Tout afficher
                    </Button>
                  }
                />
              ) : (
                <ul className="st-apparait grid gap-3">
                  {affiches.map((resultat, index) => (
                    <li
                      key={resultat.trip._id}
                      style={{ "--i": index } as CSSProperties}
                    >
                      <CarteResultat
                        resultat={resultat}
                        voyageurs={voyageurs}
                        depart={depart.name}
                        arrivee={arrivee.name}
                        meilleur={
                          prixMeilleur !== null &&
                          prixDes(resultat, voyageurs) === prixMeilleur
                        }
                        choix={
                          choix?.tripId === resultat.trip._id
                            ? choix.classe
                            : undefined
                        }
                        onChoisir={() =>
                          setChoix((actuel) =>
                            actuel?.tripId === resultat.trip._id
                              ? null
                              : {
                                  tripId: resultat.trip._id,
                                  classe: classeParDefaut(resultat, voyageurs),
                                }
                          )
                        }
                        onClasse={(classe) =>
                          setChoix({ tripId: resultat.trip._id, classe })
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}

              {resultats !== undefined && liste.length > 0 && (
                <p className="text-caption text-ink-muted">
                  Places et prix valent pour le trajet {depart.name} →{" "}
                  {arrivee.name} et pour votre groupe. Le prix est figé quand
                  vous réservez.
                </p>
              )}
            </section>
          </div>
        )}
      </Page>

      {choisi &&
        classeChoisie &&
        totalChoisi !== undefined &&
        !masquerAction && (
          <BarreAction
            className="mt-auto"
            info={
              <>
                <b>
                  {nomTrain(choisi.trip.trainType, choisi.trip.trainNumber)} ·{" "}
                  {LIBELLE_CLASSE[classeChoisie].nom}
                </b>
                <span className="tabular">
                  {dateCourte(recherche.le)} · {heure(choisi.departureAt)} →{" "}
                  {heure(choisi.arrivalAt)} · {libelleVoyageurs(recherche)}
                </span>
              </>
            }
            total={{
              libelle:
                voyageurs > 1 ? `Total · ${voyageurs} voyageurs` : "Total",
              montant: <span className="tabular">{prix(totalChoisi)}</span>,
            }}
          >
            <Button size="lg" onClick={continuer} className="md:min-w-[200px]">
              Continuer
            </Button>
          </BarreAction>
        )}
    </>
  )
}

/** Un train de la liste : fermé, le résumé ; choisi, ses classes. */
function CarteResultat({
  resultat,
  voyageurs,
  depart,
  arrivee,
  meilleur,
  choix,
  onChoisir,
  onClasse,
}: {
  resultat: Resultat
  voyageurs: number
  depart: string
  arrivee: string
  meilleur: boolean
  /** `undefined` : le train n'est pas choisi. */
  choix: Classe | null | undefined
  onChoisir: () => void
  onClasse: (classe: Classe) => void
}) {
  const { trip } = resultat
  const supprime = trip.status === "annule"
  const des = prixDes(resultat, voyageurs)
  const classes = CLASSES.filter(
    (classe) => resultat.availableByClass[classe] !== undefined
  )
  const complet = !supprime && !resultat.hasAvailability
  const signaler = trip.status !== "planifie" || trip.delayMinutes > 0

  return (
    <CarteTrajet
      depart={{ heure: heure(resultat.departureAt), gare: depart }}
      arrivee={{
        heure: heure(resultat.arrivalAt),
        gare: arrivee,
        lendemain: arriveLendemain(resultat.departureAt, resultat.arrivalAt),
      }}
      duree={duree(minutesEntre(resultat.departureAt, resultat.arrivalAt))}
      detail={arrets(resultat.intermediateStops)}
      train={nomTrain(trip.trainType, trip.trainNumber)}
      pastilles={
        <>
          {signaler && (
            <PastilleDesserte statut={trip.status} retard={trip.delayMinutes} />
          )}
          {complet && (
            <Tag tone="neutral">
              <BanIcon aria-hidden />
              Complet
            </Tag>
          )}
          {meilleur && <Tag tone="marque">Meilleur prix</Tag>}
          {!supprime && !complet && classes.length > 1 && (
            <span className="text-[12.5px] font-medium text-ink-muted">
              {classes.map((c) => LIBELLE_CLASSE[c].court).join(" · ")}
            </span>
          )}
        </>
      }
      prix={
        des === null
          ? undefined
          : {
              avant: voyageurs > 1 ? `dès, pour ${voyageurs} voyageurs` : "dès",
              montant: prix(des),
            }
      }
      etat={supprime ? "supprime" : choix !== undefined ? "choisi" : "defaut"}
      onChoisir={des === null ? undefined : onChoisir}
    >
      <ChoixCartes
        label={`Classe, ${nomTrain(trip.trainType, trip.trainNumber)}`}
        colonnes={3}
        valeur={choix ?? ""}
        onChange={(valeur) => estClasse(valeur) && onClasse(valeur)}
        options={classes.map((classe) => {
          const places = resultat.availableByClass[classe] ?? 0
          const total = resultat.prixParClasse[classe]?.totalTtc
          const plein = places < voyageurs
          return {
            valeur: classe,
            libelle: LIBELLE_CLASSE[classe].nom,
            detail: plein
              ? undefined
              : total === undefined
                ? "Prix indisponible"
                : places < SEUIL_PLACES
                  ? `Plus que ${places} place${places > 1 ? "s" : ""}`
                  : undefined,
            fin: plein ? (
              "Complet"
            ) : total === undefined ? undefined : (
              <span className="tabular">{prixCourt(total)}</span>
            ),
            indisponible: plein || total === undefined,
          }
        })}
      />
    </CarteTrajet>
  )
}
