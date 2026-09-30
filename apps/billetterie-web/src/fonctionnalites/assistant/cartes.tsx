"use client"

import {
  ArrowRightIcon,
  CalendarClockIcon,
  CircleCheckIcon,
  CircleXIcon,
  DownloadIcon,
  LogInIcon,
  NotebookPenIcon,
  ReceiptTextIcon,
  SmartphoneIcon,
  TicketIcon,
  TrainFrontIcon,
  UserRoundCogIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, type ReactNode } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/choice"
import { Tenue } from "@workspace/ui/components/compte-a-rebours"
import { Voie } from "@workspace/ui/components/voie"
import { PastilleBillet, PastilleDesserte, type StatutBillet, type StatutDesserte } from "@workspace/ui/voyage/statut"
import { cn } from "@workspace/ui/lib/utils"

import { useMaintenant } from "@/hooks/use-maintenant"
import { lireContact } from "@/lib/acces-reservation"
import { dateCourte, duree, heure, minutesEntre, prix } from "@/lib/format"
import { parametresRecherche } from "@/lib/recherche"
import { CIVILITES } from "@/lib/titulaire"
import { LIBELLE_CLASSE, estClasse, nomTrain } from "@/lib/voyage"

import { useGares } from "../reference/use-reference"
import { useRuban } from "./contexte-ruban"
import { nombreDe, recordOf, texteDe, type Approbation, type Carte } from "./types"

/* ───────────────────────────── Charpente d'une carte ───────────────────────────── */

function Cadre({
  icone,
  titre,
  fin,
  danger,
  children,
  pied,
}: {
  icone: ReactNode
  titre: ReactNode
  fin?: ReactNode
  danger?: boolean
  children?: ReactNode
  pied?: ReactNode
}) {
  return (
    <section
      className={cn(
        "st-apparait overflow-hidden rounded-[16px] border bg-surface [&>*]:[animation-delay:0ms]",
        danger ? "border-danger/45" : "border-line"
      )}
    >
      <header className="flex items-center gap-2 border-b border-line px-3.5 py-2.5 text-[11.5px] font-bold tracking-[0.05em] text-ink-muted uppercase [&_svg]:size-[15px]">
        {icone}
        <span className="min-w-0 truncate">{titre}</span>
        {fin && <span className="ml-auto font-mono text-[12.5px] font-semibold tracking-normal text-ink normal-case">{fin}</span>}
      </header>
      {children && <div className="grid gap-2.5 px-3.5 py-3">{children}</div>}
      {pied && <div className="flex flex-wrap gap-2 px-3.5 pb-3.5 [&>*]:min-w-[120px] [&>*]:flex-1">{pied}</div>}
    </section>
  )
}

/** Une carte traitée devient une ligne de résumé : un seul bouton actif dans le fil. */
function Fait({ children, lien }: { children: ReactNode; lien?: { href: string; libelle: string } }) {
  return (
    <div className="st-apparait flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[16px] border border-line bg-surface px-3.5 py-3 text-[13.5px] font-semibold text-success-ink">
      <span className="inline-flex items-center gap-1.5">
        <CircleCheckIcon className="size-[15px]" aria-hidden />
        {children}
      </span>
      {lien && (
        // Adresse construite depuis une référence du backend : route typée non vérifiable ici.
        <Link href={lien.href as never} className="ml-auto inline-flex min-h-11 items-center gap-1 text-accent-ink">
          {lien.libelle}
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  )
}

function Ligne({ libelle, valeur, remise }: { libelle: ReactNode; valeur: ReactNode; remise?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-[14px] text-ink-muted">
      <span className="min-w-0">{libelle}</span>
      <span className={cn("font-mono tabular-nums", remise ? "text-success-ink" : "text-ink")}>{valeur}</span>
    </div>
  )
}

/* ─────────────────────────────── Trajets ─────────────────────────────── */

interface TrajetCarte {
  tripId: string
  trainNumber: string
  trainType: string
  serviceDate: string
  status: StatutDesserte
  departureAt: number
  arrivalAt: number
  prixMin: number | null
  hasAvailability: boolean
}

function lireTrajets(payload: unknown) {
  const racine = recordOf(payload)
  const brut = Array.isArray(payload) ? payload : Array.isArray(racine.trips) ? racine.trips : []
  const trajets: TrajetCarte[] = brut.flatMap((valeur) => {
    const t = recordOf(valeur)
    const tripId = texteDe(t.tripId)
    const depart = nombreDe(t.departureAt)
    const arrivee = nombreDe(t.arrivalAt)
    if (!tripId || depart === undefined || arrivee === undefined) return []
    const prixClasses = Object.values(recordOf(t.prixParClasse)).flatMap((p) => nombreDe(recordOf(p).totalTtc) ?? [])
    return [
      {
        tripId,
        trainNumber: texteDe(t.trainNumber) ?? "",
        trainType: texteDe(t.trainType) ?? "",
        serviceDate: texteDe(t.serviceDate) ?? "",
        status: (texteDe(t.status) ?? "planifie") as StatutDesserte,
        departureAt: depart,
        arrivalAt: arrivee,
        prixMin: prixClasses.length ? Math.min(...prixClasses) : null,
        hasAvailability: t.hasAvailability === true,
      },
    ]
  })
  return {
    trajets,
    serviceDate: texteDe(racine.serviceDate) ?? trajets[0]?.serviceDate,
    originStationId: texteDe(racine.originStationId),
    destinationStationId: texteDe(racine.destinationStationId),
    passengers: nombreDe(racine.passengers) ?? 1,
  }
}

function CarteTrajets({ payload }: { payload: unknown }) {
  const { envoyer, reflechit } = useRuban()
  const { parId } = useGares()
  const [choisi, setChoisi] = useState<string | null>(null)
  const { trajets, serviceDate, originStationId, destinationStationId, passengers } = lireTrajets(payload)
  const de = parId(originStationId)
  const a = parId(destinationStationId)

  if (trajets.length === 0) {
    return (
      <Cadre icone={<TrainFrontIcon aria-hidden />} titre="Trajets">
        <p className="text-small text-ink-muted">Aucune desserte ce jour-là sur ce trajet.</p>
      </Cadre>
    )
  }
  const choix = trajets.find((t) => t.tripId === choisi)
  const toutVoir =
    de && a && serviceDate ? `/resultats?${new URLSearchParams(parametresRecherche({ de: de.code, a: a.code, le: serviceDate, adultes: passengers, enfants: 0 }))}` : null

  return (
    <Cadre
      icone={<TrainFrontIcon aria-hidden />}
      titre={`${de && a ? `${de.name} → ${a.name}` : "Trajets"}${serviceDate ? ` · ${dateCourte(serviceDate)}` : ""}`}
      pied={
        <>
          {choix && (
            <Button
              size="sm"
              disabled={reflechit}
              onClick={() => void envoyer(`Je prends le ${nomTrain(choix.trainType, choix.trainNumber)} de ${heure(choix.departureAt)}.`)}
            >
              Prendre ce train
            </Button>
          )}
          {toutVoir && (
            <Button asChild variant="secondary" size="sm">
              <Link href={toutVoir as never}>Tous les horaires</Link>
            </Button>
          )}
        </>
      }
    >
      <ul className="grid gap-2">
        {trajets.slice(0, 4).map((t) => {
          const supprime = t.status === "annule"
          return (
            <li key={t.tripId}>
              <button
                type="button"
                disabled={supprime || !t.hasAvailability}
                aria-pressed={choisi === t.tripId}
                onClick={() => setChoisi((c) => (c === t.tripId ? null : t.tripId))}
                className={cn(
                  "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2.5 text-left transition-[border-color,box-shadow] duration-[var(--dur-base)] disabled:opacity-60",
                  choisi === t.tripId ? "border-accent-base shadow-[inset_0_0_0_1px_var(--c-accent)]" : "border-line enabled:hover:border-line-strong"
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <b className={cn("font-mono text-[18px] font-semibold tabular-nums", supprime && "line-through")}>{heure(t.departureAt)}</b>
                  <Voie etat={choisi === t.tripId ? "pleine" : "vide"} className="min-w-6" />
                  <b className={cn("font-mono text-[18px] font-semibold tabular-nums", supprime && "line-through")}>{heure(t.arrivalAt)}</b>
                </span>
                <span className="row-span-2 text-right text-[15px] font-bold">
                  {supprime ? (
                    <PastilleDesserte statut="annule" />
                  ) : !t.hasAvailability ? (
                    <span className="text-[13px] font-semibold text-ink-muted">Complet</span>
                  ) : t.prixMin !== null ? (
                    <>
                      <small className="block text-[11px] font-medium text-ink-muted">dès</small>
                      <span className="font-mono tabular-nums">{prix(t.prixMin)}</span>
                    </>
                  ) : null}
                </span>
                <span className="flex items-center gap-2 text-[12.5px] text-ink-muted">
                  {nomTrain(t.trainType, t.trainNumber)} · {duree(minutesEntre(t.departureAt, t.arrivalAt))}
                  {t.status === "retarde" && <PastilleDesserte statut="retarde" />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Cadre>
  )
}

/* ─────────────────────────────── Devis ─────────────────────────────── */

function CarteDevis({ payload }: { payload: unknown }) {
  const devis = recordOf(payload)
  const lignes = Array.isArray(devis.lines) ? devis.lines.map(recordOf) : []
  const total = nombreDe(devis.totalTtc)
  if (total === undefined) return null
  const disponibles = nombreDe(devis.available)
  return (
    <Cadre icone={<ReceiptTextIcon aria-hidden />} titre="Prix" fin={prix(total)}>
      {lignes.map((ligne, i) => (
        <Ligne key={i} libelle={texteDe(ligne.discountLabel) ?? `Voyageur ${i + 1}`} valeur={prix(nombreDe(ligne.unitPriceTtc) ?? 0)} remise={Boolean(ligne.discountCode)} />
      ))}
      {devis.hasAvailability === false ? (
        <p className="text-small font-semibold text-danger-ink">Plus assez de places dans cette classe.</p>
      ) : (
        disponibles !== undefined && disponibles < 10 && <p className="text-small text-ink-muted">Plus que {disponibles} places dans cette classe.</p>
      )}
      <p className="text-caption text-ink-muted">Prix indicatif : il est figé à la réservation.</p>
    </Cadre>
  )
}

/* ───────────────────────────── Réservation ───────────────────────────── */

/** Réservation relue sur le serveur : l'état et la tenue restent à jour. */
function useReservation(reference: string | undefined) {
  const contact = reference ? lireContact(reference) : null
  // Le propriétaire connecté n'a pas besoin du téléphone ; un invité, si.
  return useQuery(api.functions.bookings.getByReference, reference ? { reference, contactPhone: contact ?? undefined } : "skip")
}

function CarteReservation({ payload }: { payload: unknown }) {
  const racine = recordOf(payload)
  const reference = texteDe(racine.reference) ?? texteDe(recordOf(racine.sale).number)
  const dossier = useReservation(reference)
  const maintenant = useMaintenant(1_000)
  if (!reference) return null
  const vente = dossier?.sale
  const trajet = dossier?.trip
  const contexte = recordOf(racine.paymentContext)
  const depart = trajet?.departureAt ?? nombreDe(contexte.departureAt)
  const arrivee = trajet?.arrivalAt ?? nombreDe(contexte.arrivalAt)
  const origine = dossier?.origin?.name ?? texteDe(contexte.originName)
  const destination = dossier?.destination?.name ?? texteDe(contexte.destinationName)
  const enAttente = (vente?.status ?? "en_attente_paiement") === "en_attente_paiement"
  const tenue = vente?.priceLockedUntil ?? nombreDe(racine.holdExpiresAt)

  if (vente && vente.status === "confirmee") {
    return <Fait lien={{ href: `/billets/${encodeURIComponent(reference)}`, libelle: "Voir les billets" }}>Réservation {reference} payée</Fait>
  }
  return (
    <Cadre
      icone={<TicketIcon aria-hidden />}
      titre={`Réservation · ${reference}`}
      fin={vente ? prix(vente.amounts.ttc) : undefined}
      pied={
        enAttente ? (
          <Button asChild size="sm" variant="secondary">
            <Link href={`/paiement?ref=${encodeURIComponent(reference)}` as never}>Payer sur la page de paiement</Link>
          </Button>
        ) : undefined
      }
    >
      {origine && destination && (
        <p className="text-[15px] font-semibold">
          {origine} → {destination}
          {depart !== undefined && arrivee !== undefined && (
            <span className="ml-2 font-mono text-[13px] font-medium text-ink-muted tabular-nums">
              {heure(depart)} → {heure(arrivee)}
            </span>
          )}
        </p>
      )}
      {dossier?.tickets.map((billet) => (
        <Ligne
          key={billet._id}
          libelle={`${billet.passenger.firstName} ${billet.passenger.lastName} · ${estClasse(billet.serviceClass) ? LIBELLE_CLASSE[billet.serviceClass].court : billet.serviceClass}`}
          valeur={prix(billet.unitPriceTtc)}
        />
      ))}
      {enAttente && tenue && maintenant !== null && tenue > maintenant && <Tenue fin={tenue} />}
      {vente && !enAttente && vente.status !== "confirmee" && <p className="text-small font-semibold text-ink-muted">Réservation {vente.status === "expiree" ? "expirée : les places ont été libérées" : "annulée"}.</p>}
    </Cadre>
  )
}

/* ───────────────────────── Mes réservations, mes billets ───────────────────────── */

function CarteMesReservations({ payload }: { payload: unknown }) {
  const liste = Array.isArray(payload) ? payload.map(recordOf) : []
  return (
    <Cadre icone={<TicketIcon aria-hidden />} titre="Mes réservations">
      {liste.length === 0 && <p className="text-small text-ink-muted">Aucune réservation sur ce compte.</p>}
      <ul className="grid divide-y divide-line">
        {liste.slice(0, 5).map((dossier) => {
          const vente = recordOf(dossier.sale)
          const trajet = recordOf(dossier.trip)
          const reference = texteDe(vente.number)
          if (!reference) return null
          return (
            <li key={reference}>
              <Link href={`/billets/${encodeURIComponent(reference)}` as never} className="flex min-h-12 items-center gap-3 py-1.5 text-[14px]">
                <span className="min-w-0 flex-1">
                  <b className="block truncate">
                    {texteDe(recordOf(dossier.origin).name) ?? "—"} → {texteDe(recordOf(dossier.destination).name) ?? "—"}
                  </b>
                  <small className="font-mono text-[12px] text-ink-muted">
                    {texteDe(trajet.serviceDate) ? dateCourte(texteDe(trajet.serviceDate)!) : ""} · {reference}
                  </small>
                </span>
                <ArrowRightIcon className="size-4 text-ink-muted" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
    </Cadre>
  )
}

function CarteMesBillets({ payload }: { payload: unknown }) {
  const liste = Array.isArray(payload) ? payload.map(recordOf) : []
  return (
    <Cadre icone={<TicketIcon aria-hidden />} titre="Mes billets valides">
      {liste.length === 0 && <p className="text-small text-ink-muted">Aucun billet valide pour le moment.</p>}
      <ul className="grid divide-y divide-line">
        {liste.slice(0, 5).map((element) => {
          const billet = recordOf(element.ticket)
          const trajet = recordOf(element.trip)
          const reference = texteDe(element.reference)
          const id = texteDe(billet._id)
          if (!reference || !id) return null
          const passager = recordOf(billet.passenger)
          return (
            <li key={id}>
              <Link href={`/billets/${encodeURIComponent(reference)}` as never} className="flex min-h-12 items-center gap-3 py-1.5 text-[14px]">
                <span className="min-w-0 flex-1">
                  <b className="block truncate">
                    {texteDe(recordOf(element.origin).name) ?? "—"} → {texteDe(recordOf(element.destination).name) ?? "—"}
                  </b>
                  <small className="text-[12px] text-ink-muted">
                    {texteDe(passager.firstName)} {texteDe(passager.lastName)} · {nombreDe(trajet.departureAt) ? heure(nombreDe(trajet.departureAt)!) : ""}
                  </small>
                </span>
                <PastilleBillet statut={(texteDe(billet.status) ?? "valide") as StatutBillet} />
              </Link>
            </li>
          )
        })}
      </ul>
    </Cadre>
  )
}

function CarteTelechargement({ payload }: { payload: unknown }) {
  const url = texteDe(recordOf(payload).url)
  if (!url?.startsWith("https://")) return null
  return (
    <Cadre icone={<DownloadIcon aria-hidden />} titre="Billet PDF">
      <Button asChild variant="secondary" size="sm">
        <a href={url} target="_blank" rel="noreferrer" download>
          <DownloadIcon />
          Télécharger le billet
        </a>
      </Button>
    </Cadre>
  )
}

/* ───────────────────────────── Connexion ───────────────────────────── */

export const CLE_ROUVRIR = "setrag:ruban-rouvrir"

function CarteConnexion({ payload }: { payload: unknown }) {
  const chemin = usePathname()
  const motif = texteDe(recordOf(payload).reason) ?? texteDe(recordOf(payload).motif)
  return (
    <Cadre
      icone={<LogInIcon aria-hidden />}
      titre="Votre compte"
      pied={
        <Button asChild size="sm" variant="secondary">
          <Link
            href={{ pathname: "/connexion", query: { retour: chemin } }}
            onClick={() => {
              try {
                window.sessionStorage.setItem(CLE_ROUVRIR, "1")
              } catch {
                // Sans stockage, la fenêtre de Ruban restera fermée au retour.
              }
            }}
          >
            Me connecter
          </Link>
        </Button>
      }
    >
      <p className="text-small">{motif ?? "Connectez-vous : je retrouverai vos réservations, vos billets et vos voyageurs enregistrés."}</p>
      <p className="text-caption text-ink-muted">Notre conversation sera rattachée à votre compte ; vous la retrouverez ici.</p>
    </Cadre>
  )
}

/* ─────────────────────────── Ce que Ruban retient ─────────────────────────── */

/**
 * Ruban vient de noter (ou d'oublier) quelque chose : on le montre, en une
 * ligne, avec le chemin vers la liste complète — rien ne se retient en
 * silence.
 */
function CarteNote({ payload }: { payload: unknown }) {
  const note = recordOf(payload)
  const contenu = texteDe(note.content)
  const nombre = nombreDe(note.count)
  let texte: string | null = null
  if (note.action === "noted" && contenu) texte = `Noté : ${contenu}`
  else if (note.action === "forgotten") texte = contenu ? `Oublié : ${contenu}` : "Note oubliée"
  else if (note.action === "forgotten_all") texte = nombre ? `Ruban a tout oublié (${nombre} note${nombre > 1 ? "s" : ""})` : "Ruban a tout oublié"
  if (!texte) return null
  return (
    <div className="st-apparait flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[16px] border border-line bg-surface px-3.5 py-2 text-[13.5px]">
      <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-ink">
        <NotebookPenIcon className="size-[15px] shrink-0 text-ink-muted" aria-hidden />
        <span className="min-w-0">{texte}</span>
      </span>
      <Link href="/compte/ruban" className="ml-auto inline-flex min-h-11 items-center gap-1 font-semibold text-accent-ink">
        Ce que Ruban retient
        <ArrowRightIcon className="size-4" aria-hidden />
      </Link>
    </div>
  )
}

/* ───────────────────────────── Confirmations ───────────────────────────── */

/** « M. », « Mme » devant le nom d'un voyageur : la civilité portée par le billet. */
const CIVILITE_COURTE: Record<string, string> = { M: "M. ", F: "Mme " }

/** Libellés des champs du profil, dans l'ordre où ils se lisent. */
const CHAMPS_PROFIL: Record<string, string> = {
  gender: "Civilité",
  firstName: "Prénom",
  lastName: "Nom",
  phone: "Téléphone",
  email: "E-mail",
}

const MOYENS: Record<string, string> = {
  airtel_money: "Airtel Money",
  moov_money: "Moov Money",
  visa: "Carte Visa",
  mastercard: "Carte Mastercard",
  clickpay: "ClickPay",
}

/**
 * Une action préparée par Ruban, qui n'aboutit que par le bouton de la carte.
 * Le bouton dit exactement ce qu'il fait ; les arguments viennent du serveur
 * et ne sont jamais modifiables ici.
 */
export function CarteApprobation({ approbation, principale }: { approbation: Approbation; principale: boolean }) {
  const { confirmer, refuser } = useRuban()
  const entree = recordOf(approbation.input)
  const reference = texteDe(entree.reference)
  const dossier = useReservation(approbation.toolName === "pay_booking" || approbation.toolName === "cancel_booking" ? reference : undefined)
  const enCours = approbation.etat === "en-cours"
  const maintenant = useMaintenant(1_000)
  // Comme dans le tunnel : les CGV s'acceptent d'un geste explicite, pas par
  // une mention sous le bouton.
  const [cgvAcceptees, setCgvAcceptees] = useState(false)

  if (approbation.etat === "refusee") {
    return <p className="text-small font-medium text-ink-muted">Action annulée : {approbation.label.toLowerCase()}.</p>
  }
  if (approbation.etat === "confirmee") {
    const resultat = recordOf(approbation.resultat)
    const ref = texteDe(resultat.reference) ?? reference
    if (approbation.toolName === "create_booking" && ref) {
      return <CarteReservation payload={approbation.resultat} />
    }
    if (approbation.toolName === "pay_booking" && ref) {
      return (
        <Fait lien={{ href: `/confirmation?ref=${encodeURIComponent(ref)}`, libelle: "Voir les billets" }}>
          Payé{nombreDe(resultat.amountTtc) !== undefined ? ` · ${prix(nombreDe(resultat.amountTtc)!)}` : ""}
          {MOYENS[texteDe(entree.method) ?? ""] ? ` · ${MOYENS[texteDe(entree.method)!]}` : ""}
        </Fait>
      )
    }
    if (approbation.toolName === "cancel_booking") return <Fait>Réservation {ref} annulée : les places sont libérées</Fait>
    return <Fait>{approbation.label} : fait</Fait>
  }

  const erreur = approbation.etat === "echec" && approbation.erreur && <p className="text-small font-semibold text-danger-ink">{approbation.erreur}</p>

  switch (approbation.toolName) {
    case "create_booking": {
      const voyageurs = Array.isArray(entree.passengers) ? entree.passengers.map(recordOf) : []
      const classe = texteDe(entree.serviceClass)
      return (
        <Cadre
          icone={<TicketIcon aria-hidden />}
          titre="Réserver"
          pied={
            <>
              <Button size="sm" variant={principale ? "primary" : "secondary"} loading={enCours} onClick={() => void confirmer(approbation.callId)}>
                Réserver
              </Button>
              <Button size="sm" variant="ghost" disabled={enCours} onClick={() => void refuser(approbation.callId)}>
                Annuler
              </Button>
            </>
          }
        >
          {voyageurs.map((v, i) => (
            <Ligne key={i} libelle={`${CIVILITE_COURTE[texteDe(v.gender) ?? ""] ?? ""}${texteDe(v.firstName) ?? ""} ${texteDe(v.lastName) ?? ""}`} valeur={texteDe(v.discountCode) ? "réduction" : "adulte"} />
          ))}
          {classe && estClasse(classe) && <Ligne libelle="Classe" valeur={LIBELLE_CLASSE[classe].nom} />}
          {texteDe(entree.contactPhone) && <Ligne libelle="Contact" valeur={texteDe(entree.contactPhone)} />}
          <p className="text-caption text-ink-muted">Les places sont tenues 15 minutes ; vous payez ensuite.</p>
          {erreur}
        </Cadre>
      )
    }
    case "pay_booking": {
      const moyen = MOYENS[texteDe(entree.method) ?? ""] ?? "Paiement"
      const montant = dossier?.sale.amounts.ttc
      const mobile = entree.method === "airtel_money" || entree.method === "moov_money"
      return (
        <Cadre
          icone={<SmartphoneIcon aria-hidden />}
          titre={`Paiement · ${moyen}`}
          fin={montant !== undefined ? prix(montant) : undefined}
          pied={
            <>
              <Button
                size="sm"
                variant={principale ? "primary" : "secondary"}
                loading={enCours}
                disabled={!cgvAcceptees}
                onClick={() => void confirmer(approbation.callId)}
              >
                {montant !== undefined ? `Payer ${prix(montant)}` : "Payer"}
              </Button>
              <Button size="sm" variant="ghost" disabled={enCours} onClick={() => void refuser(approbation.callId)}>
                Payer autrement
              </Button>
            </>
          }
        >
          {reference && <Ligne libelle="Réservation" valeur={reference} />}
          {texteDe(entree.payerPhone) && <Ligne libelle="Numéro débité" valeur={texteDe(entree.payerPhone)} />}
          {dossier?.sale.priceLockedUntil && maintenant !== null && dossier.sale.priceLockedUntil > maintenant && <Tenue fin={dossier.sale.priceLockedUntil} />}
          <p className="text-caption text-ink-muted">
            {/* Même aveu que l'écran de paiement : aucun opérateur n'est relié,
                rien n'est prélevé ni à valider sur le téléphone. */}
            Aucun débit réel pour l&apos;instant : les opérateurs de paiement ne sont pas encore reliés, le règlement est enregistré sans prélèvement.{" "}
            {mobile ? "Je ne vous demanderai jamais votre code secret." : ""}
          </p>
          <Checkbox
            label="J’accepte les conditions générales de vente"
            checked={cgvAcceptees}
            onCheckedChange={(valeur) => setCgvAcceptees(valeur === true)}
            disabled={enCours}
          />
          <Link href="/conditions" target="_blank" rel="noreferrer" className="-mt-1 w-fit text-[13px] font-semibold text-accent-ink underline underline-offset-2">
            Lire les conditions
          </Link>
          {erreur}
        </Cadre>
      )
    }
    case "cancel_booking":
      return (
        <Cadre
          danger
          icone={<CircleXIcon aria-hidden />}
          titre={`Annuler · ${reference ?? "réservation"}`}
          pied={
            <>
              <Button size="sm" variant="danger" loading={enCours} onClick={() => void confirmer(approbation.callId)}>
                Annuler la réservation {reference}
              </Button>
              <Button size="sm" variant="ghost" disabled={enCours} onClick={() => void refuser(approbation.callId)}>
                La garder
              </Button>
            </>
          }
        >
          <p className="text-small">Les places seront libérées tout de suite. Rien n&apos;a été payé.</p>
          {erreur}
        </Cadre>
      )
    case "update_my_profile": {
      const changements = Object.entries(CHAMPS_PROFIL).flatMap(([cle, libelle]) => {
        const valeur = texteDe(entree[cle])
        if (!valeur) return []
        return [{ cle, libelle, valeur: cle === "gender" ? (CIVILITES[valeur as "M" | "F"] ?? valeur) : valeur }]
      })
      return (
        <Cadre
          icone={<UserRoundCogIcon aria-hidden />}
          titre="Modifier mon profil"
          pied={
            <>
              <Button size="sm" variant={principale ? "primary" : "secondary"} loading={enCours} onClick={() => void confirmer(approbation.callId)}>
                Enregistrer
              </Button>
              <Button size="sm" variant="ghost" disabled={enCours} onClick={() => void refuser(approbation.callId)}>
                Annuler
              </Button>
            </>
          }
        >
          {changements.map((c) => (
            <Ligne key={c.cle} libelle={c.libelle} valeur={c.valeur} />
          ))}
          {erreur}
        </Cadre>
      )
    }
    default:
      return (
        <Cadre
          icone={approbation.toolName.includes("profile") ? <UserRoundCogIcon aria-hidden /> : <CalendarClockIcon aria-hidden />}
          titre={approbation.label}
          pied={
            <>
              <Button size="sm" variant={principale ? "primary" : "secondary"} loading={enCours} onClick={() => void confirmer(approbation.callId)}>
                Confirmer
              </Button>
              <Button size="sm" variant="ghost" disabled={enCours} onClick={() => void refuser(approbation.callId)}>
                Annuler
              </Button>
            </>
          }
        >
          {Object.entries(entree)
            .filter(([, v]) => typeof v === "string" && v)
            .map(([cle, v]) => (
              <Ligne key={cle} libelle={cle} valeur={String(v)} />
            ))}
          {erreur}
        </Cadre>
      )
  }
}

/** Le rendu d'une carte du fil, selon ce que le backend a produit. */
export function CarteDuFil({ carte }: { carte: Carte }) {
  switch (carte.type) {
    case "show_trip_results":
      return <CarteTrajets payload={carte.payload} />
    case "show_quote":
      return <CarteDevis payload={carte.payload} />
    case "show_booking":
    case "show_payment_confirmation":
    case "show_cancellation":
      return <CarteReservation payload={carte.payload} />
    case "show_my_bookings":
      return <CarteMesReservations payload={carte.payload} />
    case "show_my_tickets":
      return <CarteMesBillets payload={carte.payload} />
    case "download_ticket":
      return <CarteTelechargement payload={carte.payload} />
    case "request_sign_in":
      return <CarteConnexion payload={carte.payload} />
    case "show_memory":
      return <CarteNote payload={carte.payload} />
    default:
      return null
  }
}
