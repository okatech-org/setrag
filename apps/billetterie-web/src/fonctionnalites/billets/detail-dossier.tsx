"use client"

import { RouteIcon, SearchIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRef, useState, type ReactNode } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Tenue } from "@workspace/ui/components/compte-a-rebours"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { PastilleDesserte } from "@workspace/ui/voyage/statut"
import { cn } from "@workspace/ui/lib/utils"

import { BarreApp } from "@/coquille/barre-app"
import { AvisCopieLocale } from "@/fonctionnalites/hors-ligne/copie-locale"
import { useDonneesLocales } from "@/fonctionnalites/hors-ligne/donnees-locales"
import { adressePaiement } from "@/fonctionnalites/tunnel/adresses"
import { LimiteErreur } from "@/fonctionnalites/tunnel/limite-erreur"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"
import { useContact } from "@/lib/acces-reservation"
import { dateCourte, dateLongue, heure, prix } from "@/lib/format"
import { nomTrain } from "@/lib/voyage"

import {
  ActionsDossier,
  RAPPEL_CONTROLE,
  useActionsBillets,
} from "./actions-billets"
import { BilletTitre } from "./billet-titre"
import {
  aPayer,
  finDeTenue,
  libelleMoyen,
  nomVoyageur,
  placeDe,
  statutVente,
  tenueEcoulee,
  type Dossier,
} from "./dossier"
import { Attente, Conteneur, PastilleVente, Reference } from "./elements"
import { FeuilleAnnulerOption, FeuilleAnnulerOuModifier } from "./feuilles"
import { useMaintenant } from "./horloge"
import { AccesReservation, normaliserReference } from "./retrouver-reservation"
import { useHoraires, type Horaires } from "./use-horaires"

const MINUTE = 60_000

/** Lien vers le suivi du train d'un dossier. */
export function lienSuivi(trip: {
  trainNumber: string
  serviceDate: string
}): Route {
  return `/suivi?train=${encodeURIComponent(trip.trainNumber)}&date=${trip.serviceDate}` as Route
}

function Cadre({
  titre = "Réservation",
  sousTitre,
  children,
}: {
  titre?: string
  sousTitre?: string
  children: ReactNode
}) {
  return (
    <>
      <BarreApp titre={titre} sousTitre={sousTitre} retour="/billets" />
      <Conteneur>{children}</Conteneur>
    </>
  )
}

function HorsReseau() {
  return (
    <EmptyState
      title="Hors réseau"
      description="Cette réservation n'est pas enregistrée sur ce téléphone. Seuls les billets d'un compte s'y gardent ; elle s'affichera dès le retour du réseau."
    />
  )
}

/**
 * Détail d'une réservation : `/billets/<référence>`.
 *
 * Le serveur fait autorité dès qu'il répond — y compris pour dire que le
 * dossier n'existe plus. Seul son silence (hors réseau, antenne saturée)
 * laisse la place à la copie enregistrée sur l'appareil.
 */
export function DetailDossier({ reference: brute }: { reference: string }) {
  const reference = normaliserReference(brute)
  const auth = useTravelerAuth()
  // `undefined` tant que l'onglet n'a pas été lu (hydratation).
  const contact = useContact(reference)
  const { dossiers, enLigne } = useDonneesLocales()
  const local =
    dossiers.find((dossier) => dossier.sale.number === reference) ?? null
  const compte = auth.isAuthenticated && auth.isProfileReady
  const peutCharger = compte || Boolean(contact)

  // Un billet enregistré s'affiche sans attendre la session : hors réseau,
  // elle ne peut pas être revalidée, et un billet payé ne se cache pas
  // derrière un écran de connexion.
  if (!local && contact === undefined) {
    return (
      <Cadre>
        <Attente phrase="Ouverture de la réservation…" />
      </Cadre>
    )
  }
  if (!local && !contact && !enLigne) {
    return (
      <Cadre>
        <HorsReseau />
      </Cadre>
    )
  }
  if (
    !local &&
    !contact &&
    (auth.isLoading || (auth.isAuthenticated && !auth.isProfileReady))
  ) {
    return (
      <Cadre>
        <Attente phrase="Ouverture de la réservation…" />
      </Cadre>
    )
  }
  if (!peutCharger && !local) {
    return (
      <Cadre>
        <AccesReservation reference={reference} />
      </Cadre>
    )
  }
  return (
    <LimiteErreur
      key={contact ?? "compte"}
      secours={() => (
        <Cadre>
          <AccesReservation
            reference={reference}
            erreur="La réservation n'a pas pu être lue. Vérifiez le téléphone donné au moment de réserver, puis réessayez."
          />
        </Cadre>
      )}
    >
      <DossierServeur
        reference={reference}
        contact={contact ?? null}
        local={local}
        peutCharger={peutCharger}
        invite={!auth.isAuthenticated}
      />
    </LimiteErreur>
  )
}

function DossierServeur({
  reference,
  contact,
  local,
  peutCharger,
  invite,
}: {
  reference: string
  contact: string | null
  local: Dossier | null
  peutCharger: boolean
  invite: boolean
}) {
  const serveur = useQuery(
    api.functions.bookings.getByReference,
    peutCharger ? { reference, contactPhone: contact ?? undefined } : "skip"
  )
  const { enLigne, recuLe } = useDonneesLocales()
  const dossier = serveur === undefined ? local : serveur
  const depuisLeCache = serveur === undefined && local !== null

  // `null` : référence inconnue ou téléphone qui ne lui correspond pas. Le
  // serveur ne dit pas lequel, l'écran non plus ; et la copie locale ne
  // recouvre pas cette réponse.
  if (serveur === null) {
    return (
      <Cadre>
        <AccesReservation
          reference={reference}
          erreur="Référence ou téléphone incorrect."
        />
      </Cadre>
    )
  }
  if (!dossier) {
    return (
      <Cadre>
        {enLigne ? (
          <Attente phrase="Ouverture de la réservation…" />
        ) : (
          <HorsReseau />
        )}
      </Cadre>
    )
  }
  if (!dossier.trip) {
    return (
      <Cadre>
        <EmptyState
          title="Trajet introuvable"
          description="Le train de cette réservation n'est plus publié. Le guichet d'une gare SETRAG peut vous renseigner."
        />
      </Cadre>
    )
  }
  return (
    <VueDossier
      dossier={dossier}
      contact={contact}
      depuisLeCache={depuisLeCache}
      recuLe={recuLe}
      enLigne={enLigne}
      invite={invite && !depuisLeCache}
    />
  )
}

/** Le train du dossier : son état, et ce que ça change. */
function EtatTrain({
  dossier,
  horaires,
}: {
  dossier: Dossier
  horaires: Horaires
}) {
  const trip = dossier.trip!
  const retard = trip.status === "termine" ? 0 : Math.max(0, trip.delayMinutes)
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PastilleDesserte statut={trip.status} retard={trip.delayMinutes} />
        <span className="text-[14px] font-semibold text-ink-muted">
          {nomTrain(trip.trainType, trip.trainNumber)} ·{" "}
          {dateCourte(trip.serviceDate)}
          {horaires.departAt !== null && (
            <>
              {" · "}
              <span className="font-mono tabular-nums">
                {heure(horaires.departAt)} →{" "}
                {horaires.arriveeAt === null
                  ? "--:--"
                  : heure(horaires.arriveeAt)}
              </span>
            </>
          )}
        </span>
      </div>
      {trip.status === "annule" ? (
        <InlineMessage tone="danger" title="Ce train est supprimé.">
          Pour un report ou un remboursement, adressez-vous au guichet
          d&apos;une gare SETRAG avec votre référence.
        </InlineMessage>
      ) : retard > 0 ? (
        <InlineMessage
          tone="warning"
          title={`Le train partira ${retard} min plus tard.`}
        >
          {horaires.departAt !== null && horaires.arriveeAt !== null ? (
            <>
              Départ estimé à{" "}
              <b className="font-mono">
                {heure(horaires.departAt + retard * MINUTE)}
              </b>
              , arrivée vers{" "}
              <b className="font-mono">
                {heure(horaires.arriveeAt + retard * MINUTE)}
              </b>
              .{" "}
            </>
          ) : null}
          Votre billet reste celui-ci.
        </InlineMessage>
      ) : null}
    </div>
  )
}

/** Les billets : au doigt, un par écran sur mobile ; côte à côte sur grand écran. */
function Billets({
  dossier,
  horaires,
  onRang,
}: {
  dossier: Dossier
  horaires: Horaires
  onRang: (rang: number) => void
}) {
  const bande = useRef<HTMLUListElement>(null)
  const [rang, setRang] = useState(0)
  const total = dossier.tickets.length

  const surDefilement = () => {
    const element = bande.current
    const premier = element?.firstElementChild as HTMLElement | null
    if (!element || !premier) return
    const suivant = Math.min(
      total - 1,
      Math.max(0, Math.round(element.scrollLeft / (premier.offsetWidth + 12)))
    )
    if (suivant !== rang) {
      setRang(suivant)
      onRang(suivant)
    }
  }

  return (
    <div className="grid gap-3">
      <ul
        ref={bande}
        onScroll={surDefilement}
        aria-label="Billets du dossier"
        className="-mx-4 no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] md:gap-4 md:overflow-visible md:px-0"
      >
        {dossier.tickets.map((titre, index) => (
          <li key={titre._id} className="w-full shrink-0 snap-center md:w-auto">
            <BilletTitre
              dossier={dossier}
              titre={titre}
              horaires={horaires}
              rang={index + 1}
            />
          </li>
        ))}
      </ul>
      {total > 1 && (
        <div aria-hidden className="flex justify-center gap-1.5 md:hidden">
          {dossier.tickets.map((titre, index) => (
            <i
              key={titre._id}
              className={cn(
                "h-[7px] rounded-pill transition-[width] duration-[var(--dur-base)]",
                index === rang ? "w-5 bg-ink" : "w-[7px] bg-line-strong"
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Le temps qui reste avant le départ, retard compris. */
function Depart({
  dossier,
  departAt,
  maintenant,
}: {
  dossier: Dossier
  departAt: number | null
  maintenant: number
}) {
  const trip = dossier.trip!
  if (
    departAt === null ||
    trip.status === "annule" ||
    trip.status === "termine"
  )
    return null
  const retard = Math.max(0, trip.delayMinutes)
  const reste = departAt + retard * MINUTE - maintenant
  if (reste <= 0) return null
  const heures = Math.floor(reste / 3_600_000)
  const minutes = Math.floor((reste % 3_600_000) / MINUTE)
  const valeur =
    reste < 3_600_000
      ? `${Math.max(1, minutes)} min`
      : heures < 24
        ? `${heures} h ${String(minutes).padStart(2, "0")}`
        : `${Math.floor(heures / 24)} j ${heures % 24} h`
  return (
    <p className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-3 text-[14px] font-medium text-ink-muted">
      <span>{retard > 0 ? "Départ estimé dans" : "Départ dans"}</span>
      <b className="font-mono text-[20px] font-semibold text-ink tabular-nums">
        {valeur}
      </b>
    </p>
  )
}

function Ligne({
  libelle,
  children,
}: {
  libelle: string
  children: ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-ink-muted">{libelle}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  )
}

/** Le dossier en clair : référence, voyageurs, montant, règlement. */
function Recapitulatif({
  dossier,
  maintenant,
}: {
  dossier: Dossier
  maintenant: number | null
}) {
  const trip = dossier.trip!
  const reglement = dossier.payments.find(
    (paiement) => paiement.status === "confirme"
  )
  const statut = maintenant === null ? null : statutVente(dossier, maintenant)
  return (
    <section
      aria-label="Récapitulatif de la réservation"
      className="grid gap-3 rounded-md border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid min-w-0">
          <span className="text-[12px] font-semibold tracking-[0.06em] text-ink-muted uppercase">
            Référence
          </span>
          <Reference
            reference={dossier.sale.number}
            className="-my-1 text-[15px]"
          />
        </div>
        {statut && <PastilleVente statut={statut} />}
      </div>
      <dl className="text-small grid gap-2 border-t border-line pt-3">
        <Ligne libelle="Trajet">
          {dossier.origin?.name} → {dossier.destination?.name}
        </Ligne>
        <Ligne libelle="Date">{dateLongue(trip.serviceDate)}</Ligne>
        {dossier.tickets.map((titre) => (
          <Ligne key={titre._id} libelle={nomVoyageur(titre)}>
            <span className="text-ink-muted">{placeDe(titre) ?? "—"}</span>
          </Ligne>
        ))}
        <Ligne libelle={reglement ? "Payé" : "Montant"}>
          <b className="font-mono tabular-nums">
            {prix(dossier.sale.amounts.ttc)}
          </b>
        </Ligne>
        {reglement && (
          <Ligne libelle="Règlement">{libelleMoyen(reglement.method)}</Ligne>
        )}
        {dossier.adjustments.map((ecriture) => (
          <Ligne
            key={ecriture._id}
            libelle={
              ecriture.kind === "remboursement" ? "Remboursement" : "Annulation"
            }
          >
            <span className="font-mono tabular-nums">
              {prix(Math.abs(ecriture.amounts.ttc))}
            </span>
          </Ligne>
        ))}
      </dl>
      {reglement?.provider === "simule" && (
        <p className="text-[12.5px] text-ink-muted">
          Règlement simulé : le paiement en ligne n&apos;est pas encore branché
          à un opérateur.
        </p>
      )}
    </section>
  )
}

function VueDossier({
  dossier,
  contact,
  depuisLeCache,
  recuLe,
  enLigne,
  invite,
}: {
  dossier: Dossier
  contact: string | null
  depuisLeCache: boolean
  recuLe: number | null
  enLigne: boolean
  invite: boolean
}) {
  const maintenant = useMaintenant(30_000)
  const horaires = useHoraires(dossier)
  const actions = useActionsBillets(dossier, contact, horaires)
  const [rang, setRang] = useState(0)
  const [feuille, setFeuille] = useState<null | "annuler" | "guichet">(null)
  const trip = dossier.trip!
  const reference = dossier.sale.number
  const titres = dossier.tickets
  const regle = dossier.sale.status === "confirmee"
  const aRegler = maintenant !== null && aPayer(dossier, maintenant)
  const ecoulee = maintenant !== null && tenueEcoulee(dossier, maintenant)
  const fin = finDeTenue(dossier)
  const trajet = `${dossier.origin?.name ?? "Départ"} → ${dossier.destination?.name ?? "Arrivée"}`

  return (
    <>
      <BarreApp
        titre={
          regle && titres.length > 1
            ? `Billet ${rang + 1} sur ${titres.length}`
            : regle
              ? "Votre billet"
              : "Réservation"
        }
        sousTitre={trajet}
        retour="/billets"
      />
      <Conteneur>
        <div className="hidden gap-1 md:grid">
          <Link
            href="/billets"
            className="text-small font-semibold text-accent-ink underline-offset-4 hover:underline"
          >
            Mes billets
          </Link>
          <h1 className="text-h2">{trajet}</h1>
        </div>

        {depuisLeCache && (
          <AvisCopieLocale
            recuLe={recuLe}
            enLigne={enLigne}
            objet="Les informations de ce dossier"
          />
        )}

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)] md:items-start md:gap-8">
          <div className="grid min-w-0 gap-4">
            <EtatTrain dossier={dossier} horaires={horaires} />

            {aRegler && fin !== null && (
              <section
                aria-label="Paiement"
                className="grid gap-3 rounded-md border border-line bg-surface p-4"
              >
                <div className="grid gap-1">
                  <b className="text-[17px]">Réservation non payée</b>
                  <p className="text-small text-ink-muted">
                    Aucun billet n&apos;est émis avant le paiement. Passé le
                    délai, les places sont remises en vente.
                  </p>
                </div>
                <Tenue fin={fin} />
                <div className="grid gap-2 md:flex md:flex-wrap">
                  <Button asChild size="lg">
                    <Link href={adressePaiement(reference)}>
                      Payer{" "}
                      <span className="font-mono">
                        {prix(dossier.sale.amounts.ttc)}
                      </span>
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => setFeuille("annuler")}
                  >
                    Annuler la réservation
                  </Button>
                </div>
              </section>
            )}

            {(ecoulee ||
              dossier.sale.status === "expiree" ||
              dossier.sale.status === "annulee") && (
              <InlineMessage
                tone="info"
                title={
                  dossier.sale.status === "annulee"
                    ? "Cette réservation est annulée."
                    : "Le délai de paiement est écoulé."
                }
              >
                Les places ont été remises en vente. Pour faire ce voyage,
                cherchez à nouveau un train.
              </InlineMessage>
            )}

            <Billets dossier={dossier} horaires={horaires} onRang={setRang} />

            {regle && (
              <p className="text-center text-[12.5px] text-ink-muted md:text-left">
                {RAPPEL_CONTROLE} Au contrôle, montez la luminosité de
                l&apos;écran.
              </p>
            )}
            {regle && maintenant !== null && (
              <Depart
                dossier={dossier}
                departAt={horaires.departAt}
                maintenant={maintenant}
              />
            )}
          </div>

          <aside className="grid min-w-0 gap-4">
            <Recapitulatif dossier={dossier} maintenant={maintenant} />
            {invite && regle && (
              <InlineMessage tone="info" title="Réservation faite sans compte.">
                Elle n&apos;est pas gardée sur ce téléphone : téléchargez le PDF
                pour l&apos;avoir sans réseau.
              </InlineMessage>
            )}
            <ActionsDossier dossier={dossier} actions={actions} />
            <div className="grid gap-2">
              <Button asChild variant="secondary" size="lg">
                <Link href={lienSuivi(trip)}>
                  <RouteIcon aria-hidden />
                  Suivre ce train
                </Link>
              </Button>
              {regle && (
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={() => setFeuille("guichet")}
                >
                  Annuler ou modifier
                </Button>
              )}
              {(ecoulee ||
                dossier.sale.status === "expiree" ||
                dossier.sale.status === "annulee") && (
                <Button asChild variant="ghost" size="lg">
                  <Link href="/">
                    <SearchIcon aria-hidden />
                    Chercher un train
                  </Link>
                </Button>
              )}
            </div>
          </aside>
        </div>
      </Conteneur>

      <FeuilleAnnulerOption
        reference={reference}
        contact={contact}
        ouvert={feuille === "annuler"}
        onOuvertChange={(ouvert) => setFeuille(ouvert ? "annuler" : null)}
      />
      <FeuilleAnnulerOuModifier
        reference={reference}
        ouvert={feuille === "guichet"}
        onOuvertChange={(ouvert) => setFeuille(ouvert ? "guichet" : null)}
      />
    </>
  )
}
