"use client"

import { ListIcon } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Feuille } from "@workspace/ui/components/feuille"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { LigneArrets } from "@workspace/ui/components/ligne-arrets"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { CarteTrajet } from "@workspace/ui/voyage/carte-trajet"
import { ChoixCartes } from "@workspace/ui/voyage/choix"
import {
  Recapitulatif,
  type LigneRecap,
} from "@workspace/ui/voyage/recapitulatif"
import { PastilleDesserte } from "@workspace/ui/voyage/statut"

import { BarreAction } from "@/coquille/barre-action"
import { BarreApp } from "@/coquille/barre-app"
import { useNaviguer } from "@/coquille/filet-navigation"
import {
  useGares,
  useReductions,
  type Gare,
  type Reduction,
} from "@/fonctionnalites/reference/use-reference"
import { useToday } from "@/hooks/use-today"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"
import { lireContact, memoriserContact } from "@/lib/acces-reservation"
import {
  arriveLendemain,
  dateCourte,
  dateLongue,
  duree,
  heure,
  minutesEntre,
  prix,
  prixCourt,
  telephone,
} from "@/lib/format"
import { codesReduction, lireRecherche, type Recherche } from "@/lib/recherche"
import { EXEMPLE_TELEPHONE, lireTelephone } from "@/lib/telephone"
import { estLeTitulaire, voyageurMoi } from "@/lib/titulaire"
import {
  CLASSES,
  LIBELLE_CLASSE,
  SEUIL_PLACES,
  estClasse,
  nomTrain,
  type Classe,
} from "@/lib/voyage"

import {
  adresseConnexion,
  adressePaiement,
  adresseReservation,
  adresseResultats,
} from "../adresses"
import {
  EcranMessage,
  EnTeteTunnel,
  Page,
  SqueletteTunnel,
  libelleEtape,
} from "../etapes"
import { LimiteErreur } from "../limite-erreur"
import { messageServeur, useDerniereValeur } from "../outils"
import { classeParDefaut, type Resultat } from "../resultats/modele"
import { BlocVoyageur, type Candidat } from "./bloc-voyageur"
import {
  ajuster,
  lireBrouillon,
  sauverBrouillon,
  type Brouillon,
  type BrouillonVoyageur,
} from "./brouillon"
import { idChamp, valider } from "./validation"

const ETAPE = 1

function Titre({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <h2
      className={`text-[12px] font-semibold tracking-[0.06em] text-ink-muted uppercase ${className ?? ""}`}
    >
      {children}
    </h2>
  )
}

/** Donne le focus au champ, ou au premier contrôle d'un groupe (le sexe). */
function focaliser(id: string) {
  const element = document.getElementById(id)
  if (!element) return
  const cible = element.matches("input, select, textarea, button")
    ? element
    : element.querySelector<HTMLElement>("input, select, textarea, button")
  cible?.focus()
  cible?.scrollIntoView({ block: "center", behavior: "smooth" })
}

/** Un refus du serveur, dit au voyageur avec ce qu'il peut faire. */
function expliquerRefus(erreur: unknown, classe: Classe): string {
  const message = messageServeur(erreur)
  if (!message)
    return "La réservation n'a pas abouti. Vérifiez votre connexion, puis réessayez."
  if (/Places insuffisantes|Aucune place libre/.test(message)) {
    return `Il ne reste plus assez de places en ${LIBELLE_CLASSE[classe].nom.toLowerCase()} sur ce train. Choisissez une autre classe ou un autre train.`
  }
  if (/fermée à la vente|« annule »|« termine »/.test(message))
    return "Ce train n'est plus en vente. Choisissez-en un autre."
  if (/Réduction .* inconnue/.test(message))
    return "Une réduction choisie n'est plus proposée. Retirez-la, puis réessayez."
  return `La réservation n'a pas abouti : ${message}`
}

/**
 * Étape 2 du tunnel : qui voyage, dans quelle classe, et comment vous
 * joindre. L'adresse porte le train et la classe
 * (`/reservation?desserte=…&classe=…&de=…`), le brouillon des voyageurs reste
 * dans l'onglet.
 */
export function Reservation() {
  const parametres = useSearchParams()
  const recherche = useMemo(() => lireRecherche(parametres), [parametres])
  const desserte = parametres.get("desserte")
  const naviguer = useNaviguer()
  const instant = useToday()
  const { gares, parCode } = useGares()
  const reductions = useReductions()
  const depart = parCode(recherche?.de)
  const arrivee = parCode(recherche?.a)

  const sortie =
    recherche === null || (gares !== undefined && (!depart || !arrivee))
      ? "accueil"
      : !desserte
        ? "resultats"
        : null
  const renvoye = useRef(false)
  useEffect(() => {
    if (!sortie || renvoye.current) return
    renvoye.current = true
    if (sortie === "accueil" || !recherche) {
      toast(
        "Cette réservation est incomplète. Commencez par chercher un train."
      )
      naviguer("/", { remplacer: true })
    } else {
      toast("Choisissez d'abord un train.")
      naviguer(adresseResultats(recherche), { remplacer: true })
    }
  }, [sortie, recherche, naviguer])

  const barre = (
    <BarreApp
      titre="Voyageurs et classe"
      sousTitre={libelleEtape(ETAPE)}
      retour={recherche ? adresseResultats(recherche) : "/"}
    />
  )

  if (sortie) {
    return (
      <>
        {barre}
        <Page className="py-8">
          <EcranMessage
            titre="Il manque le train à réserver."
            description="Retour à la recherche…"
          />
        </Page>
      </>
    )
  }
  if (
    !recherche ||
    !desserte ||
    !depart ||
    !arrivee ||
    instant === null ||
    reductions.chargement
  ) {
    return (
      <>
        {barre}
        <EnTeteTunnel
          etape={ETAPE}
          titre="Qui voyage ?"
          detail={libelleEtape(ETAPE).toLowerCase()}
        />
        <SqueletteTunnel />
      </>
    )
  }

  return (
    <>
      {barre}
      <EnTeteTunnel
        etape={ETAPE}
        titre="Qui voyage ?"
        detail={libelleEtape(ETAPE).toLowerCase()}
      />
      <LimiteErreur
        key={desserte}
        secours={(erreur) => (
          <Page className="py-6">
            <EcranMessage
              titre="Le prix de ce voyage n'a pas pu être calculé."
              description={
                messageServeur(erreur) ??
                "Vérifiez votre connexion, puis réessayez."
              }
              action={
                <Button
                  variant="secondary"
                  onClick={() => window.location.reload()}
                >
                  Réessayer
                </Button>
              }
            />
          </Page>
        )}
      >
        <DesserteChoisie
          recherche={recherche}
          desserte={desserte}
          depart={depart}
          arrivee={arrivee}
        />
      </LimiteErreur>
    </>
  )
}

/**
 * Vérifie que le train est toujours proposé pour ce trajet, puis ouvre le
 * formulaire. La première lecture reprend celle des résultats (même requête,
 * déjà en cache quand on vient de la liste).
 */
function DesserteChoisie({
  recherche,
  desserte,
  depart,
  arrivee,
}: {
  recherche: Recherche
  desserte: string
  depart: Gare
  arrivee: Gare
}) {
  const { enfant } = useReductions()
  const voyageurs = recherche.adultes + recherche.enfants
  const resultats = useQuery(api.functions.trips.search, {
    originStationId: depart._id,
    destinationStationId: arrivee._id,
    serviceDate: recherche.le,
    passengers: voyageurs,
    discountCodes: codesReduction(recherche, enfant?.code ?? null),
  })
  const resultat = resultats?.find((r) => r.trip._id === desserte)

  if (resultats === undefined) {
    return (
      <Page
        className="grid gap-4 pt-2 pb-10 md:grid-cols-[minmax(0,1fr)_360px] md:gap-8"
        aria-hidden
      >
        <div className="grid content-start gap-4">
          <SkeletonLines className="h-[132px]" />
          <SkeletonLines className="h-[220px]" />
        </div>
        <SkeletonLines className="h-[260px]" />
      </Page>
    )
  }
  const retour = (
    <Button asChild variant="secondary">
      <Link href={adresseResultats(recherche)}>Voir les autres trains</Link>
    </Button>
  )
  if (!resultat) {
    return (
      <Page className="py-6">
        <EcranMessage
          titre="Ce train n'est plus proposé pour ce trajet."
          description="Il a pu quitter la vente depuis votre recherche."
          action={retour}
        />
      </Page>
    )
  }
  if (resultat.trip.status === "annule") {
    return (
      <Page className="py-6">
        <EcranMessage
          titre="Ce train est supprimé."
          description="Il ne circulera pas ce jour-là. Choisissez-en un autre."
          action={retour}
        />
      </Page>
    )
  }
  if (!resultat.hasAvailability) {
    return (
      <Page className="py-6">
        <EcranMessage
          titre="Ce train est complet pour votre groupe."
          description="Aucune classe n'a assez de places sur votre trajet."
          action={retour}
        />
      </Page>
    )
  }
  return (
    <FormulaireVoyageurs
      recherche={recherche}
      depart={depart}
      arrivee={arrivee}
      initial={resultat}
    />
  )
}

function FormulaireVoyageurs({
  recherche,
  depart,
  arrivee,
  initial,
}: {
  recherche: Recherche
  depart: Gare
  arrivee: Gare
  initial: Resultat
}) {
  const naviguer = useNaviguer()
  const parametres = useSearchParams()
  const { enfant, individuelles, reductions } = useReductions()
  const { isAuthenticated, isProfileReady, profile } = useTravelerAuth()
  const voyageurs = recherche.adultes + recherche.enfants
  const tripId = initial.trip._id

  /* ── Brouillon ──────────────────────────────────────────────────────── */
  // Monté après le premier rendu (la desserte vient du serveur) : lire
  // l'onglet ici ne crée pas d'écart d'hydratation.
  const [brouillon, setBrouillon] = useState<Brouillon>(() =>
    ajuster(lireBrouillon(), voyageurs)
  )
  useEffect(() => sauverBrouillon(brouillon), [brouillon])

  const modifierVoyageur = (index: number, modif: Partial<BrouillonVoyageur>) =>
    setBrouillon((b) => ({
      ...b,
      voyageurs: b.voyageurs.map((v, i) =>
        i === index ? { ...v, ...modif } : v
      ),
    }))

  /* ── Préremplissage depuis le compte ───────────────────────────────── */
  // Le compte porte son voyageur « Moi » (le profil, civilité comprise) : le
  // premier voyageur est prérempli, et « Moi » est proposé à chaque bloc.
  const profil = profile?.user ?? null
  const enregistres = useQuery(
    api.functions.customers.listSavedPassengers,
    isAuthenticated && isProfileReady ? {} : "skip"
  )
  const moi = useMemo(
    () => voyageurMoi(profil, enregistres ?? []),
    [profil, enregistres]
  )
  const [prerempli, setPrerempli] = useState(false)
  // On attend les fiches quand le profil n'a pas de civilité : celle d'un
  // compte ancien se retrouve dans la fiche qu'il avait créée pour lui-même.
  if (profil && !prerempli && (profil.gender || enregistres !== undefined)) {
    setPrerempli(true)
    setBrouillon((b) => {
      const premier = b.voyageurs[0]
      const vide = premier && !premier.prenom.trim() && !premier.nom.trim()
      const email =
        profil.email && !profil.email.endsWith("@auth.setrag.local")
          ? profil.email
          : ""
      return {
        ...b,
        voyageurs:
          vide && moi
            ? [
                {
                  ...premier,
                  prenom: moi.prenom,
                  nom: moi.nom,
                  sexe: premier.sexe || moi.sexe || "",
                  source: "moi",
                },
                ...b.voyageurs.slice(1),
              ]
            : b.voyageurs,
        telephone: b.telephone || (profil.phone ? telephone(profil.phone) : ""),
        email: b.email || email,
      }
    })
  }

  const candidats = useMemo((): Candidat[] => {
    const liste: Candidat[] = []
    if (moi) {
      liste.push({
        id: "moi",
        libelle: "Moi",
        voyageur: {
          prenom: moi.prenom,
          nom: moi.nom,
          ...(moi.sexe ? { sexe: moi.sexe } : {}),
        },
      })
    }
    for (const p of enregistres ?? []) {
      // La fiche que le titulaire avait créée pour lui-même ferait doublon
      // avec « Moi ».
      if (moi && estLeTitulaire(profil, p)) continue
      liste.push({
        id: p._id,
        libelle: `${p.firstName} ${p.lastName}`,
        voyageur: {
          prenom: p.firstName,
          nom: p.lastName,
          sexe: p.gender,
          naissance: p.birthDate ?? "",
          reduction: p.discountCode ?? "",
          urgence: p.emergencyPhone ?? "",
        },
      })
    }
    return liste
  }, [moi, profil, enregistres])

  /* ── Prix : devis du serveur, voyageur par voyageur ────────────────── */
  const codes = brouillon.voyageurs.map((v, i) =>
    i >= recherche.adultes
      ? (enfant?.code ?? "")
      : individuelles.some((r) => r.code === v.reduction)
        ? v.reduction
        : ""
  )
  const trajet = {
    originStationId: depart._id,
    destinationStationId: arrivee._id,
  }
  const lecture = useDerniereValeur(
    useQuery(api.functions.trips.search, {
      ...trajet,
      serviceDate: recherche.le,
      passengers: voyageurs,
      discountCodes: codes,
    })
  )
  const resultat = lecture
    ? lecture.find((r) => r.trip._id === tripId)
    : initial

  const classeUrl = parametres.get("classe")
  const classe: Classe | null =
    resultat &&
    estClasse(classeUrl) &&
    resultat.availableByClass[classeUrl] !== undefined
      ? classeUrl
      : resultat
        ? classeParDefaut(resultat, voyageurs)
        : null
  const places =
    resultat && classe ? (resultat.availableByClass[classe] ?? 0) : 0
  const classeOuverte = Boolean(
    resultat && classe && places >= voyageurs && resultat.prixParClasse[classe]
  )

  const argsDevis =
    classe && classeOuverte
      ? { tripId, ...trajet, serviceClass: classe, passengerCount: voyageurs }
      : null
  const devis = useDerniereValeur(
    useQuery(
      api.functions.bookings.quote,
      argsDevis ? { ...argsDevis, discountCodes: codes } : "skip"
    )
  )
  const plein = useDerniereValeur(
    useQuery(api.functions.bookings.quote, argsDevis ?? "skip")
  )

  const choisirClasse = (valeur: string) => {
    if (!estClasse(valeur)) return
    // Sans navigation : l'adresse suit le choix, la page ne remonte pas.
    window.history.replaceState(
      null,
      "",
      adresseReservation(recherche, tripId, valeur)
    )
  }

  /* ── Arrêts ────────────────────────────────────────────────────────── */
  const [arretsOuverts, setArretsOuverts] = useState(false)
  const detail = useQuery(
    api.functions.trips.get,
    arretsOuverts ? { tripId } : "skip"
  )

  /* ── Envoi ─────────────────────────────────────────────────────────── */
  const creer = useMutation(api.functions.bookings.create)
  const relacher = useMutation(api.functions.bookings.cancelHold)
  const [tente, setTente] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [refus, setRefus] = useState<string | null>(null)
  const toutesErreurs = valider({
    brouillon,
    adultes: recherche.adultes,
    enfant,
    dateVoyage: recherche.le,
  })
  const erreurs = tente ? toutesErreurs : new Map<string, string>()

  const continuer = async () => {
    setTente(true)
    setRefus(null)
    if (!classe || !classeOuverte) {
      document
        .getElementById("choix-classe")
        ?.scrollIntoView({ block: "center", behavior: "smooth" })
      return
    }
    const premiere = toutesErreurs.keys().next()
    if (!premiere.done) {
      focaliser(premiere.value)
      return
    }
    const contact = lireTelephone(brouillon.telephone)
    if (!contact.ok) return
    setEnvoi(true)
    try {
      const reservation = await creer({
        tripId,
        ...trajet,
        serviceClass: classe,
        passengers: brouillon.voyageurs.map((v, i) => ({
          firstName: v.prenom.trim(),
          lastName: v.nom.trim(),
          gender: v.sexe as "M" | "F",
          birthDate:
            i >= recherche.adultes && v.naissance ? v.naissance : undefined,
          discountCode: codes[i] || undefined,
          emergencyPhone: v.urgence.trim()
            ? (lireTelephone(v.urgence) as { numero: string }).numero
            : undefined,
        })),
        contactPhone: contact.numero,
        contactEmail: brouillon.email.trim() || undefined,
      })
      memoriserContact(reservation.reference, contact.numero)
      // Une réservation précédente, faite depuis ce brouillon et jamais
      // payée, garderait ses places tenues : on les rend à la vente.
      const precedente = brouillon.enCours
      if (precedente && precedente !== reservation.reference) {
        void relacher({
          reference: precedente,
          contactPhone: lireContact(precedente) ?? undefined,
        }).catch(() => undefined)
      }
      const suivant = { ...brouillon, enCours: reservation.reference }
      sauverBrouillon(suivant)
      setBrouillon(suivant)
      naviguer(adressePaiement(reservation.reference))
    } catch (erreur) {
      setRefus(expliquerRefus(erreur, classe))
      setEnvoi(false)
    }
  }

  if (!resultat) {
    return (
      <Page className="py-6">
        <EcranMessage
          titre="Ce train vient de quitter la vente."
          description="Il n'est plus proposé pour ce trajet."
          action={
            <Button asChild variant="secondary">
              <Link href={adresseResultats(recherche)}>
                Voir les autres trains
              </Link>
            </Button>
          }
        />
      </Page>
    )
  }

  const train = nomTrain(resultat.trip.trainType, resultat.trip.trainNumber)
  const horaires = `${heure(resultat.departureAt)} → ${heure(resultat.arrivalAt)}`
  const lignes = lignesRecap({
    brouillon,
    adultes: recherche.adultes,
    devis,
    plein,
    reductions: reductions ?? [],
  })
  const minutesTenue = devis ? Math.round(devis.holdDurationMs / 60_000) : null
  const retourConnexion = adresseConnexion(
    `/reservation?${parametres.toString()}`
  )

  return (
    <>
      <Page className="grid gap-6 pt-2 pb-8 md:grid-cols-[minmax(0,1fr)_360px] md:items-start md:gap-8 md:pb-12">
        <div className="grid min-w-0 gap-6">
          <div className="grid gap-2">
            <CarteTrajet
              depart={{ heure: heure(resultat.departureAt), gare: depart.name }}
              arrivee={{
                heure: heure(resultat.arrivalAt),
                gare: arrivee.name,
                lendemain: arriveLendemain(
                  resultat.departureAt,
                  resultat.arrivalAt
                ),
              }}
              duree={duree(
                minutesEntre(resultat.departureAt, resultat.arrivalAt)
              )}
              detail={dateCourte(recherche.le)}
              train={train}
              pastilles={
                resultat.trip.status !== "planifie" ||
                resultat.trip.delayMinutes > 0 ? (
                  <PastilleDesserte
                    statut={resultat.trip.status}
                    retard={resultat.trip.delayMinutes}
                  />
                ) : undefined
              }
              etat="choisi"
            />
            <Button
              variant="ghost"
              className="justify-self-start"
              onClick={() => setArretsOuverts(true)}
              aria-haspopup="dialog"
            >
              <ListIcon aria-hidden />
              {resultat.intermediateStops === 0
                ? "Train direct : voir le trajet"
                : `Voir les ${resultat.intermediateStops} arrêts`}
            </Button>
          </div>

          <section
            aria-labelledby="titre-classe"
            id="choix-classe"
            className="grid gap-2.5"
          >
            <Titre>
              <span id="titre-classe">Classe</span>
            </Titre>
            <ChoixCartes
              label="Classe"
              colonnes={3}
              valeur={classe ?? ""}
              onChange={choisirClasse}
              options={CLASSES.filter(
                (c) => resultat.availableByClass[c] !== undefined
              ).map((c) => {
                const n = resultat.availableByClass[c] ?? 0
                const total = resultat.prixParClasse[c]?.totalTtc
                const complet = n < voyageurs
                return {
                  valeur: c,
                  libelle: LIBELLE_CLASSE[c].nom,
                  detail: complet
                    ? undefined
                    : total === undefined
                      ? "Prix indisponible"
                      : n < SEUIL_PLACES
                        ? `Plus que ${n} place${n > 1 ? "s" : ""}`
                        : undefined,
                  fin: complet ? (
                    "Complet"
                  ) : total === undefined ? undefined : (
                    <span className="tabular">{prixCourt(total)}</span>
                  ),
                  indisponible: complet || total === undefined,
                }
              })}
            />
            {classe && !classeOuverte && (
              <InlineMessage
                tone="warning"
                title={`La ${LIBELLE_CLASSE[classe].nom.toLowerCase()} est complète sur ce trajet.`}
              >
                Choisissez une autre classe pour continuer.
              </InlineMessage>
            )}
            <p className="text-caption text-ink-muted">
              Les places sont attribuées automatiquement quand vous réservez.
            </p>
          </section>

          <section aria-labelledby="titre-voyageurs" className="grid gap-3">
            <Titre>
              <span id="titre-voyageurs">Voyageurs</span>
            </Titre>
            {!isAuthenticated && (
              <p className="text-small text-ink-muted">
                Vous avez un compte ?{" "}
                <Link
                  href={retourConnexion}
                  className="font-semibold text-accent-ink underline-offset-2 hover:underline"
                >
                  Connectez-vous
                </Link>{" "}
                pour préremplir vos voyageurs.
              </p>
            )}
            {brouillon.voyageurs.map((voyageur, index) => (
              <BlocVoyageur
                key={index}
                index={index}
                enfant={index >= recherche.adultes}
                reductionEnfant={enfant}
                individuelles={individuelles}
                voyageur={voyageur}
                candidats={candidats.filter(
                  (c) =>
                    !brouillon.voyageurs.some(
                      (v, i) => i !== index && v.source === c.id
                    )
                )}
                erreurs={erreurs}
                dateVoyage={recherche.le}
                onChange={(modif) => modifierVoyageur(index, modif)}
              />
            ))}
          </section>

          <section aria-labelledby="titre-contact" className="grid gap-3">
            <Titre>
              <span id="titre-contact">Contact</span>
            </Titre>
            <div className="grid gap-3 rounded-lg border border-line bg-surface p-4 md:grid-cols-2 md:p-5">
              <Field
                label="Téléphone"
                htmlFor={idChamp.telephone}
                hint={`9 chiffres, par exemple ${EXEMPLE_TELEPHONE}, ou avec l'indicatif du pays. Avec la référence, il permet de retrouver la réservation.`}
                error={erreurs.get(idChamp.telephone)}
              >
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={brouillon.telephone}
                  onChange={(e) =>
                    setBrouillon((b) => ({ ...b, telephone: e.target.value }))
                  }
                />
              </Field>
              <Field
                label="E-mail (facultatif)"
                htmlFor={idChamp.email}
                hint="Si l'envoi par e-mail est en service, vos billets y arrivent après le paiement."
                error={erreurs.get(idChamp.email)}
              >
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={brouillon.email}
                  onChange={(e) =>
                    setBrouillon((b) => ({ ...b, email: e.target.value }))
                  }
                />
              </Field>
            </div>
          </section>

          {tente && toutesErreurs.size > 0 && (
            <p role="alert" className="text-small font-medium text-danger-ink">
              {toutesErreurs.size === 1
                ? "Un champ est à compléter ou à corriger."
                : `${toutesErreurs.size} champs sont à compléter ou à corriger.`}
            </p>
          )}
          {refus && (
            <InlineMessage tone="danger" title="Réservation refusée.">
              {refus}
            </InlineMessage>
          )}
        </div>

        <aside
          className="grid gap-3 md:sticky md:top-[92px]"
          aria-label="Récapitulatif"
        >
          {devis && classe ? (
            <Recapitulatif
              titre={`${depart.name} → ${arrivee.name}`}
              sousTitre={`${dateCourte(recherche.le)} · ${horaires} · ${train} · ${LIBELLE_CLASSE[classe].court} classe`.replace(
                "VIP classe",
                "VIP"
              )}
              lignes={lignes}
              total={prix(devis.totalTtc)}
            />
          ) : (
            <SkeletonLines className="h-[220px]" />
          )}
          <p className="text-caption text-ink-muted">
            Prix indicatif, calculé par la SETRAG pour votre groupe.
            {minutesTenue !== null &&
              ` En continuant, il est figé et vos places sont tenues ${minutesTenue} minutes, le temps de payer.`}
          </p>
        </aside>
      </Page>

      <BarreAction
        className="mt-auto"
        info={
          <>
            <b>
              {train}
              {classe ? ` · ${LIBELLE_CLASSE[classe].nom}` : ""}
            </b>
            <span className="tabular">
              {dateCourte(recherche.le)} · {horaires}
            </span>
          </>
        }
        total={
          devis
            ? {
                libelle: `Total · ${voyageurs} voyageur${voyageurs > 1 ? "s" : ""}`,
                montant: (
                  <span className="tabular">{prix(devis.totalTtc)}</span>
                ),
              }
            : undefined
        }
      >
        <Button
          size="lg"
          loading={envoi}
          onClick={continuer}
          className="md:min-w-[240px]"
        >
          Continuer vers le paiement
        </Button>
      </BarreAction>

      <Feuille
        open={arretsOuverts}
        onOpenChange={setArretsOuverts}
        titre="Arrêts desservis"
        description={`${train} · ${dateLongue(recherche.le)}`}
        hauteur="haute"
      >
        {detail === undefined ? (
          <SkeletonLines />
        ) : (
          <LigneArrets
            arrets={detail.stops
              .slice(resultat.fromIndex, resultat.toIndex + 1)
              .map((arret, i, tous) => {
                const prevu = arret.departureAt ?? arret.arrivalAt
                const retard = resultat.trip.delayMinutes * 60_000
                return {
                  nom: arret.station?.name ?? "Gare",
                  heure: prevu ? heure(prevu + retard) : "—",
                  heurePrevue: prevu && retard ? heure(prevu) : undefined,
                  km: arret.kilometerPoint,
                  majeur: i === 0 || i === tous.length - 1,
                  mention:
                    i === 0
                      ? "Montée"
                      : i === tous.length - 1
                        ? "Descente"
                        : undefined,
                }
              })}
          />
        )}
      </Feuille>
    </>
  )
}

/**
 * Lignes du récapitulatif : chaque voyageur à plein tarif, puis sa
 * réduction en montant négatif. Les deux devis viennent du serveur ; l'écart
 * entre eux est ce que la réduction fait gagner.
 */
function lignesRecap({
  brouillon,
  adultes,
  devis,
  plein,
  reductions,
}: {
  brouillon: Brouillon
  adultes: number
  devis:
    | {
        lines: {
          unitPriceTtc: number
          discountCode: string | null
          discountLabel: string | null
        }[]
      }
    | undefined
  plein: { lines: { unitPriceTtc: number }[] } | undefined
  reductions: Reduction[]
}): LigneRecap[] {
  if (!devis) return []
  return brouillon.voyageurs.flatMap((v, i) => {
    const nom =
      [v.prenom.trim(), v.nom.trim()].filter(Boolean).join(" ") ||
      `Voyageur ${i + 1}`
    const ligne = devis.lines[i]
    const base = plein?.lines[i]?.unitPriceTtc ?? ligne?.unitPriceTtc ?? 0
    const lignes: LigneRecap[] = [
      {
        libelle: `${nom} · ${i >= adultes ? "enfant" : "adulte"}`,
        montant: prixCourt(base),
      },
    ]
    if (ligne?.discountCode && base > ligne.unitPriceTtc) {
      const taux = reductions.find(
        (r) => r.code === ligne.discountCode
      )?.ratePct
      lignes.push({
        libelle: `Réduction ${(ligne.discountLabel ?? "").toLowerCase()}${taux ? ` −${taux} %` : ""}`,
        montant: `−${prixCourt(base - ligne.unitPriceTtc)}`,
        remise: true,
      })
    }
    return lignes
  })
}
