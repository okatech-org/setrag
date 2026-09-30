"use client"

import { CreditCardIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/choice"
import {
  Tenue,
  useCompteARebours,
} from "@workspace/ui/components/compte-a-rebours"
import { Feuille } from "@workspace/ui/components/feuille"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { Chargeur } from "@workspace/ui/components/voie"
import { ChoixCartes, MarqueOperateur } from "@workspace/ui/voyage/choix"
import { Recapitulatif } from "@workspace/ui/voyage/recapitulatif"

import { BarreAction } from "@/coquille/barre-action"
import { BarreApp } from "@/coquille/barre-app"
import { useNaviguer } from "@/coquille/filet-navigation"
import { useReductions } from "@/fonctionnalites/reference/use-reference"
import { lireContact } from "@/lib/acces-reservation"
import { CGV_VERSION, LIBELLE_VERSION_CGV } from "@/lib/cgv"
import { dateCourte, heure, prix, prixCourt, telephone } from "@/lib/format"
import { erreurTelephone, lireTelephone } from "@/lib/telephone"
import { LIBELLE_CLASSE, nomTrain } from "@/lib/voyage"

import {
  adresseAttente,
  adresseConfirmation,
  adresseReservation,
  adresseResultats,
  rechercheDuDossier,
  type Dossier,
} from "../adresses"
import { EnTeteTunnel, Page, libelleEtape } from "../etapes"
import { messageServeur } from "../outils"
import { oublierReservationEnCours } from "../reservation/brouillon"
import { AvecReservation } from "./avec-reservation"
import { EcranSortie } from "./sortie"

const ETAPE = 2

/** Moyens proposés en ligne, d'après le validateur `paymentMethod` du schéma (espèces et compte restent au guichet). */
type Moyen = "airtel_money" | "moov_money" | "carte" | "clickpay"
const MOBILE_MONEY: Partial<Record<Moyen, string>> = {
  airtel_money: "Airtel Money",
  moov_money: "Moov Money",
}

const MOYENS = [
  {
    valeur: "airtel_money",
    libelle: "Airtel Money",
    detail: "Validation sur votre téléphone",
    fin: <MarqueOperateur>AIRTEL</MarqueOperateur>,
  },
  {
    valeur: "moov_money",
    libelle: "Moov Money",
    detail: "Validation sur votre téléphone",
    fin: <MarqueOperateur>MOOV</MarqueOperateur>,
  },
  {
    valeur: "carte",
    libelle: "Carte bancaire",
    detail: "Visa, Mastercard",
    fin: (
      <MarqueOperateur>
        <CreditCardIcon aria-hidden />
      </MarqueOperateur>
    ),
  },
  {
    valeur: "clickpay",
    libelle: "Click-Pay",
    fin: <MarqueOperateur>CLICK</MarqueOperateur>,
  },
]

/**
 * Étape 3 du tunnel : payer une réservation tenue (`/paiement?ref=…`).
 *
 * Aucun prestataire de paiement n'est encore relié : `bookings.confirm`
 * enregistre le règlement tel quel (prestataire « simule »). L'écran le dit,
 * et ne simule aucun délai. Le serveur n'accepte le règlement que du
 * titulaire connecté ou avec le téléphone de contact mémorisé dans l'onglet.
 */
export function Paiement() {
  const reference = useSearchParams().get("ref")
  return (
    <>
      <BarreApp titre="Paiement" sousTitre={libelleEtape(ETAPE)} retour />
      <EnTeteTunnel
        etape={ETAPE}
        titre="Paiement"
        detail={
          reference ? (
            <span className="tabular">Réservation {reference}</span>
          ) : undefined
        }
      />
      <AvecReservation reference={reference}>
        {(dossier) => <EcranPaiement dossier={dossier} />}
      </AvecReservation>
    </>
  )
}

function EcranPaiement({ dossier }: { dossier: Dossier }) {
  const { sale } = dossier
  const [paye, setPaye] = useState(false)
  const restant = useCompteARebours(sale.priceLockedUntil)
  const enAttente = sale.status === "en_attente_paiement"

  if (paye && sale.status === "confirmee") {
    return (
      <Page className="py-12">
        <Chargeur>Paiement enregistré. Ouverture de vos billets…</Chargeur>
      </Page>
    )
  }
  if (enAttente && sale.priceLockedUntil !== undefined && restant > 0) {
    return <FormulairePaiement dossier={dossier} onPaye={() => setPaye(true)} />
  }
  return <EcranSortie dossier={dossier} />
}

function FormulairePaiement({
  dossier,
  onPaye,
}: {
  dossier: Dossier
  onPaye: () => void
}) {
  const { sale, tickets, trip, origin, destination } = dossier
  const reference = sale.number
  const naviguer = useNaviguer()
  const { enfant, reductions } = useReductions()
  const recherche = rechercheDuDossier(dossier, enfant?.code ?? null)
  const detail = useQuery(
    api.functions.trips.get,
    trip ? { tripId: trip._id } : "skip"
  )

  const [moyen, setMoyen] = useState<Moyen | "">("")
  const [reseau, setReseau] = useState<"visa" | "mastercard">("visa")
  const [numero, setNumero] = useState(() =>
    sale.contactPhone ? telephone(sale.contactPhone) : ""
  )
  const [cgv, setCgv] = useState(false)
  const [tente, setTente] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [refus, setRefus] = useState<string | null>(null)
  const [annulation, setAnnulation] = useState(false)
  const [annulationEnCours, setAnnulationEnCours] = useState(false)

  const confirmer = useMutation(api.functions.bookings.confirm)
  const annuler = useMutation(api.functions.bookings.cancelHold)

  const classe = tickets[0]?.serviceClass
  const operateur = moyen ? MOBILE_MONEY[moyen] : undefined
  const lecture = lireTelephone(numero, { gabonais: true })
  const erreurs = {
    moyen: tente && !moyen ? "Choisissez un moyen de paiement." : undefined,
    numero:
      tente && operateur && !lecture.ok
        ? lecture.raison === "vide"
          ? `Indiquez le numéro ${operateur} à débiter.`
          : erreurTelephone(lecture.raison)
        : undefined,
    cgv:
      tente && !cgv
        ? "Acceptez les conditions générales pour payer."
        : undefined,
  }

  // Heures à la gare du voyageur, pas au départ du train.
  const arrets = detail?.stops
  const t0 = tickets[0]
  const departA =
    arrets && t0
      ? (arrets[t0.fromStopIndex]?.departureAt ??
        arrets[t0.fromStopIndex]?.arrivalAt)
      : undefined
  const arriveeA =
    arrets && t0
      ? (arrets[t0.toStopIndex]?.arrivalAt ??
        arrets[t0.toStopIndex]?.departureAt)
      : undefined
  const train = trip ? nomTrain(trip.trainType, trip.trainNumber) : ""
  const quand = [
    trip ? dateCourte(trip.serviceDate) : null,
    departA && arriveeA ? `${heure(departA)} → ${heure(arriveeA)}` : null,
    train,
  ]
    .filter(Boolean)
    .join(" · ")
  const trajet = `${origin?.name ?? "Départ"} → ${destination?.name ?? "Arrivée"}`

  const payer = async () => {
    setTente(true)
    setRefus(null)
    if (!moyen) {
      document
        .querySelector<HTMLElement>("#moyens-paiement [role=radio]")
        ?.focus()
      return
    }
    if (operateur && !lecture.ok) {
      document.getElementById("numero-debite")?.focus()
      return
    }
    if (!cgv) {
      document.getElementById("accord-cgv")?.focus()
      return
    }
    setEnvoi(true)
    try {
      await confirmer({
        reference,
        method: moyen === "carte" ? reseau : moyen,
        payerPhone: operateur && lecture.ok ? lecture.numero : undefined,
        // Sans compte, le téléphone de contact prouve l'accès au règlement,
        // comme à la lecture et à l'annulation.
        contactPhone: lireContact(reference) ?? undefined,
        cgvVersion: CGV_VERSION,
      })
      onPaye()
      oublierReservationEnCours(reference)
      if (operateur) naviguer(adresseAttente(reference))
      else naviguer(adresseConfirmation(reference), { remplacer: true })
    } catch (erreur) {
      const message = messageServeur(erreur)
      if (message && /déjà réglée/.test(message)) {
        naviguer(adresseConfirmation(reference), { remplacer: true })
        return
      }
      setRefus(
        !message
          ? "Le paiement n'a pas abouti. Vérifiez votre connexion, puis réessayez."
          : /délai de règlement/.test(message)
            ? "Le délai de paiement est écoulé : vos places ont été remises en vente."
            : `Le paiement n'a pas abouti : ${message}`
      )
      setEnvoi(false)
    }
  }

  const confirmerAnnulation = async () => {
    setAnnulationEnCours(true)
    try {
      await annuler({
        reference,
        contactPhone: lireContact(reference) ?? undefined,
      })
      toast("Réservation annulée. Ses places sont remises en vente.")
      naviguer(recherche ? adresseResultats(recherche) : "/", {
        remplacer: true,
      })
    } catch (erreur) {
      setAnnulationEnCours(false)
      setAnnulation(false)
      setRefus(
        `L'annulation n'a pas abouti${messageServeur(erreur) ? ` : ${messageServeur(erreur)}` : ". Réessayez."}`
      )
    }
  }

  const lignes = tickets.map((ticket) => {
    const code = ticket.fare.fareCode ?? ticket.fare.discountCode
    const reduction = code
      ? reductions?.find((r) => r.code === code)
      : undefined
    return {
      libelle: `${ticket.passenger.firstName} ${ticket.passenger.lastName}${reduction ? ` · ${reduction.label.toLowerCase()} −${reduction.ratePct} %` : ""}`,
      montant: prixCourt(ticket.unitPriceTtc),
    }
  })

  return (
    <>
      <Page className="grid gap-6 pt-2 pb-8 md:grid-cols-[minmax(0,1fr)_360px] md:items-start md:gap-8 md:pb-12">
        <div className="grid min-w-0 gap-5">
          <Tenue fin={sale.priceLockedUntil!} />

          <InlineMessage tone="info" title="Aucun débit réel pour l'instant.">
            Les opérateurs de paiement ne sont pas encore reliés : le règlement
            est enregistré sans prélèvement.
          </InlineMessage>

          <section
            aria-labelledby="titre-moyen"
            className="grid gap-2.5"
            id="moyens-paiement"
          >
            <h2 id="titre-moyen" className="text-[17px] font-bold">
              Comment payer ?
            </h2>
            <ChoixCartes
              label="Moyen de paiement"
              colonnes={2}
              valeur={moyen}
              onChange={(valeur) => setMoyen(valeur as Moyen)}
              options={MOYENS}
              sousChoix={
                operateur ? (
                  <Field
                    label={`Numéro ${operateur} à débiter`}
                    htmlFor="numero-debite"
                    hint="Le compte Mobile Money qui paie, un numéro gabonais."
                    error={erreurs.numero}
                    className="pt-1 pb-2"
                  >
                    <Input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={numero}
                      onChange={(e) => setNumero(e.target.value)}
                    />
                  </Field>
                ) : moyen === "carte" ? (
                  <div className="grid gap-1.5 pt-1 pb-2">
                    <span className="text-[13px] font-medium" id="titre-reseau">
                      Réseau de la carte
                    </span>
                    <SegmentedControl
                      label="Réseau de la carte"
                      size="touch"
                      className="justify-self-start"
                      options={[
                        { value: "visa", label: "Visa" },
                        { value: "mastercard", label: "Mastercard" },
                      ]}
                      value={reseau}
                      onValueChange={(valeur) =>
                        setReseau(
                          valeur === "mastercard" ? "mastercard" : "visa"
                        )
                      }
                    />
                  </div>
                ) : undefined
              }
            />
            {erreurs.moyen && (
              <p
                role="alert"
                className="text-[12px] font-medium text-danger-ink"
              >
                {erreurs.moyen}
              </p>
            )}
          </section>

          <div className="grid gap-1">
            <Checkbox
              id="accord-cgv"
              label={`J'accepte les conditions générales de vente (version ${LIBELLE_VERSION_CGV}).`}
              checked={cgv}
              onCheckedChange={(valeur) => setCgv(valeur === true)}
              aria-invalid={erreurs.cgv ? true : undefined}
              aria-describedby={erreurs.cgv ? "accord-cgv-erreur" : undefined}
            />
            {erreurs.cgv && (
              <p
                id="accord-cgv-erreur"
                className="text-[12px] font-medium text-danger-ink"
              >
                {erreurs.cgv}
              </p>
            )}
            <Link
              href={"/conditions" as Route}
              target="_blank"
              className="inline-flex min-h-11 items-center justify-self-start text-[14px] font-semibold text-accent-ink hover:underline"
            >
              Lire les conditions générales
              <span className="sr-only"> (nouvel onglet)</span>
            </Link>
          </div>

          {refus && (
            <InlineMessage tone="danger" title="Paiement refusé.">
              {refus}
            </InlineMessage>
          )}

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {recherche && trip && classe && (
              <Button asChild variant="ghost">
                <Link href={adresseReservation(recherche, trip._id, classe)}>
                  Modifier les voyageurs
                </Link>
              </Button>
            )}
            <Button
              variant="danger"
              onClick={() => setAnnulation(true)}
              className="ml-auto"
              aria-haspopup="dialog"
            >
              Annuler la réservation
            </Button>
          </div>
        </div>

        <aside className="md:sticky md:top-[92px]" aria-label="Récapitulatif">
          <Recapitulatif
            titre={trajet}
            sousTitre={quand}
            lignes={lignes}
            total={prix(sale.amounts.ttc)}
          >
            <p className="text-caption text-ink-muted">
              {classe && `${LIBELLE_CLASSE[classe].nom}. `}Dont TVA{" "}
              {prix(sale.amounts.vat)}
              {sale.amounts.css > 0 && ` et CSS ${prix(sale.amounts.css)}`}.
              Prix figé jusqu&apos;à{" "}
              <span className="tabular">{heure(sale.priceLockedUntil!)}</span>.
            </p>
          </Recapitulatif>
        </aside>
      </Page>

      <BarreAction
        className="mt-auto"
        info={
          <>
            <b>{trajet}</b>
            <span className="tabular">{quand}</span>
          </>
        }
        total={{
          libelle: `${tickets.length} billet${tickets.length > 1 ? "s" : ""}${classe ? ` · ${LIBELLE_CLASSE[classe].nom}` : ""}`,
          montant: <span className="tabular">{prix(sale.amounts.ttc)}</span>,
        }}
      >
        <Button
          size="lg"
          loading={envoi}
          onClick={payer}
          className="md:min-w-[240px]"
        >
          Payer {prix(sale.amounts.ttc)}
        </Button>
      </BarreAction>

      <Feuille
        open={annulation}
        onOpenChange={(ouvert) => !annulationEnCours && setAnnulation(ouvert)}
        titre="Annuler cette réservation ?"
        description="Ses places sont remises en vente tout de suite. Rien ne vous est débité."
        pied={
          <div className="grid gap-2">
            <Button
              variant="danger"
              block
              size="lg"
              loading={annulationEnCours}
              onClick={confirmerAnnulation}
            >
              Oui, annuler la réservation
            </Button>
            <Button
              variant="ghost"
              block
              disabled={annulationEnCours}
              onClick={() => setAnnulation(false)}
            >
              Garder ma réservation
            </Button>
          </div>
        }
      >
        <p className="text-small text-ink-muted">
          Réservation <span className="tabular">{reference}</span> · {trajet}
          {quand ? ` · ${quand}` : ""}.
        </p>
      </Feuille>
    </>
  )
}
