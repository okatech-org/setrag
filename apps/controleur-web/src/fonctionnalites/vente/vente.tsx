"use client"

import { ChevronDownIcon, UserIcon } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Field, Input } from "@workspace/ui/components/field"
import { Stepper } from "@workspace/ui/components/stepper"
import { Billet } from "@workspace/ui/voyage/billet"
import { cn } from "@workspace/ui/lib/utils"

import { TERRAIN } from "@/composants/boutons"
import { PastilleEnvoi, useEtatEnvoi } from "@/composants/etat-envoi"
import { Cases } from "@/composants/cases"
import { ChampSelection, ChoixGare } from "@/composants/choix-gare"
import { Message } from "@/composants/message"
import { Bas, BarreApp, Corps } from "@/coquille/ecran"
import { humanError } from "@/lib/errors"
import {
  classeCourte,
  classeLongue,
  dateCourte,
  heure,
  montant,
  montantCourt,
  taux,
} from "@/lib/format"
import { useMaintenant } from "@/hooks/use-maintenant"
import { commitOperation, getTicketByNumber } from "@/lib/offline/db"
import {
  availableClasses,
  libelleRegle,
  quoteOnboard,
  type OnboardQuote,
} from "@/lib/offline/fares"
import { clientId, localNumber, nowMs } from "@/lib/offline/ids"
import type {
  EmbarkedStop,
  EmbarkedTicket,
  LocalSale,
} from "@/lib/offline/types"
import { arretDeRang, arretsOrdonnes } from "@/lib/position"
import { nomDuTrain, numeroVoiture } from "@/lib/train"

import { useTerminal } from "../terminal/contexte-terminal"
import { useVentesLocales } from "./ventes-locales"

/**
 * Régulariser : la vente à bord. Trois étapes, trois gares sur le ruban des
 * étapes, comme le tunnel d'achat.
 *
 * Le prix n'est jamais saisi : il sort des données embarquées, par le calcul
 * même de la vente serveur — barème kilométrique, puis yield (contingent,
 * règles, bornes). La vente part en file d'envoi et prend son numéro
 * définitif au retour du signal ; le voyageur repart avec une référence
 * provisoire, et l'écran le dit. Aucune place n'est bloquée : à bord, on
 * constate, on ne réserve pas.
 */

const coefficient = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 2,
})

/**
 * Comment le prix est formé, en une ligne :
 * « Barème 15 800 · Bas prix ×0,8 · dernière minute +10 % ».
 */
function compositionDuPrix(devis: OnboardQuote): string {
  const morceaux = [`Barème ${montantCourt(devis.baremeTtc)}`]
  if (devis.contingent) {
    morceaux.push(
      `${devis.contingent.label} ×${coefficient.format(devis.contingent.coefficient)}`
    )
  }
  for (const regle of devis.regles) {
    const signe = regle.modifierPct > 0 ? "+" : "−"
    morceaux.push(
      `${libelleRegle(regle)} ${signe}${Math.abs(regle.modifierPct)} %`
    )
  }
  if (devis.borne) morceaux.push("borné")
  if (morceaux.length === 1) morceaux.push("sans modulation")
  return morceaux.join(" · ")
}

type Etape = 0 | 1 | 2
type Classe = "DEUXIEME" | "PREMIERE" | "VIP"

const BILLETS_COURANTS = [5_000, 10_000, 15_000, 20_000]

export function VenteABord() {
  const parametres = useSearchParams()
  const { manifest, settings, refresh, ready } = useTerminal()
  const arrets = useMemo(
    () => (manifest ? arretsOrdonnes(manifest) : []),
    [manifest]
  )
  const terminus = arrets[arrets.length - 1]

  const [etape, setEtape] = useState<Etape>(0)
  // Par défaut, la dernière gare atteinte — lue quand le terminal est prêt.
  const [departChoisi, setDepart] = useState<number | undefined>(undefined)
  const [destination, setDestination] = useState<number | undefined>(undefined)
  const [classe, setClasse] = useState<Classe>("DEUXIEME")
  const [mode, setMode] = useState<"especes" | "airtel_money">("especes")
  const [remis, setRemis] = useState("")
  const [nom, setNom] = useState("")
  const [prenom, setPrenom] = useState("")
  const [sexe, setSexe] = useState<"M" | "F">("M")
  const [telephone, setTelephone] = useState("")
  const [identite, setIdentite] = useState(false)
  const [choixDepart, setChoixDepart] = useState(false)
  const [choixArrivee, setChoixArrivee] = useState(false)
  const [vendu, setVendu] = useState<LocalSale | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [titre, setTitre] = useState<EmbarkedTicket | null>(null)

  const reference = parametres.get("titre")
  // Régularisation d'un titre contrôlé : on reprend sa classe et son porteur.
  useEffect(() => {
    if (!manifest || !reference) return
    let annule = false
    void getTicketByNumber(manifest.tripId, reference).then((trouve) => {
      if (annule || !trouve) return
      setTitre(trouve)
      if (
        trouve.serviceClass === "DEUXIEME" ||
        trouve.serviceClass === "PREMIERE" ||
        trouve.serviceClass === "VIP"
      ) {
        setClasse(trouve.serviceClass)
      }
      setNom(trouve.passenger.lastName)
      setPrenom(trouve.passenger.firstName)
      setSexe(trouve.passenger.gender)
    })
    return () => {
      annule = true
    }
  }, [manifest, reference])

  const depart = departChoisi ?? settings.currentStopIndex
  const arrivee = destination ?? terminus?.sequence
  const classes = useMemo(
    () => (manifest ? availableClasses(manifest) : []),
    [manifest]
  )

  // L'instant de la vente compte (délai avant départ, validité des règles) ;
  // il n'est connu qu'une fois l'écran monté sur le terminal.
  const maintenant = useMaintenant(60_000)
  const ventesLocales = useVentesLocales(manifest?.tripId)

  const calcul = useMemo(() => {
    if (!manifest || arrivee === undefined)
      return { devis: null, erreur: "Aucun manifeste embarqué." }
    if (maintenant === null) return { devis: null, erreur: null }
    try {
      return {
        devis: quoteOnboard(
          manifest,
          {
            fromSequence: depart,
            toSequence: arrivee,
            serviceClass: classe,
          },
          { now: maintenant, ventesLocales }
        ),
        erreur: null,
      }
    } catch (error) {
      return { devis: null, erreur: (error as Error).message }
    }
  }, [manifest, depart, arrivee, classe, maintenant, ventesLocales])
  const { devis, erreur } = calcul

  const valeurRemise = Number.parseInt(remis.replace(/\s/g, ""), 10) || 0
  const rendu = devis ? valeurRemise - devis.ttc : 0

  if (!ready) return null
  if (!manifest) {
    return (
      <>
        <BarreApp retour="/scan" titre="Vente à bord" />
        <Corps>
          <Message ton="alerte" titre="Aucun manifeste embarqué.">
            La vente à bord exige le barème kilométrique de la desserte.
          </Message>
        </Corps>
        <Bas>
          <Button size="lg" block className={TERRAIN} asChild>
            <Link href="/manifeste">Télécharger le manifeste</Link>
          </Button>
        </Bas>
      </>
    )
  }

  const gareDepart = arretDeRang(manifest, depart)
  const gareArrivee =
    arrivee !== undefined ? arretDeRang(manifest, arrivee) : undefined
  const voiture = numeroVoiture(settings.coachLabel)
  const sousTitre = `${nomDuTrain(manifest)} · voiture ${voiture}${titre ? ` · titre de ${titre.passenger.lastName} ${titre.passenger.firstName}` : ""}`

  async function confirmer() {
    if (!devis || !manifest || !gareDepart || !gareArrivee) return
    if (mode === "especes" && rendu < 0) {
      toast.error("Montant remis insuffisant.")
      return
    }
    setEnCours(true)
    try {
      const vente: LocalSale = {
        clientSaleId: clientId("sale"),
        tripId: manifest.tripId,
        originStationId: gareDepart.stationId,
        destinationStationId: gareArrivee.stationId,
        originName: gareDepart.name,
        destinationName: gareArrivee.name,
        serviceClass: classe,
        passengers: [
          {
            lastName: nom.trim() || "VOYAGEUR",
            firstName: prenom.trim() || "À BORD",
            gender: sexe,
            phone: telephone.trim() || undefined,
          },
        ],
        distanceKm: devis.distanceKm,
        quotedXaf: devis.ttc,
        tenderedXaf: mode === "especes" ? valeurRemise : undefined,
        changeXaf: mode === "especes" ? rendu : undefined,
        method: mode,
        localRef: localNumber("B", 4),
        soldAt: nowMs(),
        state: "pending",
      }
      // Vente et mise en file, dans une seule transaction.
      await commitOperation("sale", vente.clientSaleId, vente)
      await refresh()
      setVendu(vente)
      setEtape(2)
    } catch (error) {
      toast.error(humanError(error))
    } finally {
      setEnCours(false)
    }
  }

  const etapes = (
    <Stepper
      steps={[
        { label: "Trajet" },
        { label: "Encaissement" },
        { label: "Titre" },
      ]}
      current={etape}
    />
  )

  if (etape === 2 && vendu) {
    return (
      <TitreRemis
        vente={vendu}
        depart={gareDepart}
        arrivee={gareArrivee}
        etapes={etapes}
      />
    )
  }

  return (
    <>
      {etape === 1 ? (
        <BarreApp
          titre="Vente à bord"
          sousTitre={sousTitre}
          onRetour={() => setEtape(0)}
        />
      ) : (
        <BarreApp titre="Vente à bord" sousTitre={sousTitre} retour="/scan" />
      )}
      {etape === 0 ? (
        <>
          <Corps>
            {etapes}
            <Field
              label="Départ du trajet restant"
              hint={
                depart === settings.currentStopIndex
                  ? "Dernière gare atteinte."
                  : undefined
              }
            >
              <ChampSelection
                valeur={gareDepart?.name ?? "—"}
                complement={gareDepart && `PK ${gareDepart.kilometerPoint}`}
                onClick={() => setChoixDepart(true)}
              />
            </Field>
            <Field label="Destination">
              <ChampSelection
                valeur={gareArrivee?.name ?? "—"}
                complement={gareArrivee && `PK ${gareArrivee.kilometerPoint}`}
                onClick={() => setChoixArrivee(true)}
              />
            </Field>
            <div className="grid gap-1.5">
              <p className="text-[13px] font-medium">Classe</p>
              <Cases
                label="Classe"
                options={(classes.length
                  ? classes
                  : (["DEUXIEME"] as Classe[])
                ).map((c) => ({
                  valeur: c,
                  libelle: classeCourte(c),
                  nom: classeLongue(c),
                }))}
                valeur={classe}
                onChange={setClasse}
                colonnes={3}
              />
            </div>
            {erreur ? (
              <Message ton="danger" titre="Tarif indisponible.">
                {erreur}
              </Message>
            ) : (
              devis && (
                <>
                  <div className="grid gap-1 rounded-md border border-line bg-surface px-3.5 py-3">
                    <small className="font-mono text-[12.5px] font-medium text-ink-muted">
                      {devis.distanceKm} km · {taux(devis.ratePerKm)} FCFA/km ·{" "}
                      {manifest.fare?.label}
                    </small>
                    <b className="font-mono text-[30px] leading-[1.1] font-bold tabular-nums">
                      {montant(devis.ttc)}
                    </b>
                    {devis.methode === "yield" && (
                      <small
                        data-testid="composition-prix"
                        className="text-[12.5px] leading-snug font-medium text-ink-muted"
                      >
                        {compositionDuPrix(devis)}
                      </small>
                    )}
                  </div>
                  {devis.methode === "bareme" && (
                    <Message ton="alerte" titre="Prix du barème seul.">
                      Ce manifeste ne porte pas le yield de la desserte : le
                      serveur pourra facturer un autre montant. Mettez le
                      manifeste à jour dès que le réseau le permet.
                    </Message>
                  )}
                </>
              )
            )}
          </Corps>
          <Bas>
            <Button
              size="lg"
              block
              className={TERRAIN}
              disabled={!devis}
              onClick={() => setEtape(1)}
            >
              {devis ? `Encaisser ${montant(devis.ttc)}` : "Encaisser"}
            </Button>
          </Bas>
          <ChoixGare
            open={choixDepart}
            onOpenChange={setChoixDepart}
            titre="Départ du trajet restant"
            description="En principe, la dernière gare atteinte."
            arrets={arrets}
            valeur={depart}
            exclue={(arret) =>
              terminus !== undefined && arret.sequence >= terminus.sequence
            }
            onChoisir={(arret) => {
              setDepart(arret.sequence)
              if (arrivee !== undefined && arrivee <= arret.sequence)
                setDestination(undefined)
            }}
          />
          <ChoixGare
            open={choixArrivee}
            onOpenChange={setChoixArrivee}
            titre="Destination"
            arrets={arrets}
            valeur={arrivee}
            exclue={(arret) => arret.sequence <= depart}
            onChoisir={(arret) => setDestination(arret.sequence)}
          />
        </>
      ) : (
        devis && (
          <>
            <Corps serre>
              {etapes}
              <div className="flex items-baseline justify-between gap-3 rounded-md bg-accent-soft px-3.5 py-3 text-[14px] font-semibold text-accent-ink">
                <span className="min-w-0">
                  Montant dû
                  <small className="block text-[12.5px] font-medium opacity-85">
                    {gareDepart?.name} → {gareArrivee?.name}
                  </small>
                </span>
                <b className="font-mono text-[24px] font-bold whitespace-nowrap tabular-nums">
                  {montant(devis.ttc)}
                </b>
              </div>
              <div className="grid gap-1">
                <p className="text-[13px] font-medium">Mode de paiement</p>
                <Cases
                  label="Mode de paiement"
                  options={[
                    { valeur: "especes", libelle: "Espèces" },
                    { valeur: "airtel_money", libelle: "Mobile money" },
                  ]}
                  valeur={mode}
                  onChange={setMode}
                  serre
                />
              </div>
              {mode !== "especes" ? (
                <Message ton="alerte" titre="Le mobile money exige le réseau.">
                  La demande partira à la reconnexion et le titre reste dû. Ne
                  laissez pas croire au voyageur que le paiement est passé.
                </Message>
              ) : (
                <>
                  <div className="grid gap-1.5">
                    <label
                      htmlFor="remis"
                      className="text-[13px] leading-snug font-medium"
                    >
                      Montant remis
                    </label>
                    <div className="relative">
                      <Input
                        id="remis"
                        inputMode="numeric"
                        autoComplete="off"
                        className="pr-16 font-mono tabular-nums"
                        value={remis ? montantCourt(valeurRemise) : ""}
                        placeholder="0"
                        onChange={(event) =>
                          setRemis(event.target.value.replace(/\D/g, ""))
                        }
                      />
                      <span
                        aria-hidden
                        className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[13px] font-medium text-ink-muted"
                      >
                        FCFA
                      </span>
                    </div>
                  </div>
                  <div
                    className="grid grid-cols-4 gap-1.5"
                    role="group"
                    aria-label="Billets courants"
                  >
                    {BILLETS_COURANTS.map((billet) => (
                      <button
                        key={billet}
                        type="button"
                        aria-pressed={valeurRemise === billet}
                        onClick={() => setRemis(String(billet))}
                        className={cn(
                          "grid min-h-12 place-items-center rounded-md border bg-surface font-mono text-[13.5px] font-semibold",
                          valeurRemise === billet
                            ? "border-accent-base text-accent-ink shadow-[inset_0_0_0_1px_var(--c-accent)]"
                            : "border-line-strong"
                        )}
                      >
                        {montantCourt(billet)}
                      </button>
                    ))}
                  </div>
                  <div
                    role="status"
                    className={cn(
                      "flex items-baseline justify-between gap-3 rounded-md px-3.5 py-2.5 text-[14px] font-semibold",
                      rendu < 0
                        ? "bg-danger-soft text-danger-ink"
                        : "bg-surface-sunk"
                    )}
                  >
                    <span>
                      {rendu < 0 ? "Montant insuffisant" : "À rendre"}
                    </span>
                    <b className="font-mono text-[22px] font-bold tabular-nums">
                      {rendu < 0
                        ? `il manque ${montant(-rendu)}`
                        : montant(rendu)}
                    </b>
                  </div>
                </>
              )}
              <div className="rounded-md border border-line bg-surface">
                <button
                  type="button"
                  aria-expanded={identite}
                  onClick={() => setIdentite((ouvert) => !ouvert)}
                  className="flex min-h-12 w-full items-center gap-2 px-3.5 text-left text-[14px] font-semibold"
                >
                  <UserIcon
                    aria-hidden
                    className="size-[18px] text-ink-muted"
                  />
                  <span>
                    Identité du voyageur{" "}
                    <small className="font-medium text-ink-muted">
                      · facultative
                    </small>
                  </span>
                  <ChevronDownIcon
                    aria-hidden
                    className={cn(
                      "ml-auto size-[18px] text-ink-muted transition-transform",
                      identite && "rotate-180"
                    )}
                  />
                </button>
                {identite && (
                  <div className="grid gap-3 border-t border-line p-3.5">
                    <Field label="Nom" htmlFor="vente-nom">
                      <Input
                        value={nom}
                        autoCapitalize="characters"
                        onChange={(e) => setNom(e.target.value)}
                      />
                    </Field>
                    <Field label="Prénom" htmlFor="vente-prenom">
                      <Input
                        value={prenom}
                        onChange={(e) => setPrenom(e.target.value)}
                      />
                    </Field>
                    <Cases
                      label="Sexe"
                      options={[
                        { valeur: "M", libelle: "Masculin" },
                        { valeur: "F", libelle: "Féminin" },
                      ]}
                      valeur={sexe}
                      onChange={setSexe}
                      serre
                    />
                    <Field
                      label="Téléphone"
                      htmlFor="vente-telephone"
                      hint="Pour l'envoi de la référence définitive."
                    >
                      <Input
                        inputMode="tel"
                        placeholder="+241 …"
                        value={telephone}
                        onChange={(e) => setTelephone(e.target.value)}
                      />
                    </Field>
                  </div>
                )}
              </div>
            </Corps>
            <Bas>
              <Button
                size="lg"
                block
                className={TERRAIN}
                loading={enCours}
                loadingLabel="Enregistrement…"
                disabled={mode === "especes" && rendu < 0}
                onClick={() => void confirmer()}
              >
                Confirmer le paiement
              </Button>
              <Button variant="ghost" block onClick={() => setEtape(0)}>
                Revenir au trajet
              </Button>
            </Bas>
          </>
        )
      )}
    </>
  )
}

/**
 * Titre remis : un billet, mais pas encore de code. Le terminal ne détient
 * pas la clé privée — il ne peut pas signer. Plutôt qu'un faux code, le
 * billet porte la référence provisoire, en grand, et le dit. Le ruban
 * traverse la découpe une fois, comme à l'émission dans la billetterie.
 */
function TitreRemis({
  vente,
  depart,
  arrivee,
  etapes,
}: {
  vente: LocalSale
  depart: EmbarkedStop | undefined
  arrivee: EmbarkedStop | undefined
  etapes: React.ReactNode
}) {
  const { manifest } = useTerminal()
  const lu = useEtatEnvoi<LocalSale>("sale", vente.clientSaleId)
  if (!manifest) return null
  const heureDepart = depart?.departureAt ?? depart?.arrivalAt
  const heureArrivee = arrivee?.arrivalAt ?? arrivee?.departureAt
  return (
    <>
      <BarreApp
        titre="Titre remis"
        sousTitre={`${nomDuTrain(manifest)} · ${vente.originName} → ${vente.destinationName}`}
      />
      <Corps>
        {etapes}
        {vente.method === "especes" ? (
          <Message ton="ok" titre="Titre délivré.">
            Réglé en espèces · {montant(vente.changeXaf ?? 0)} rendus
          </Message>
        ) : (
          <Message ton="alerte" titre="Titre délivré, paiement en attente.">
            Le paiement mobile partira au retour du réseau : le titre reste dû
            tant qu&apos;il n&apos;est pas confirmé.
          </Message>
        )}
        <Billet
          emis
          train={`${nomDuTrain(manifest)} · ${dateCourte(manifest.serviceDate)}`}
          depart={{
            heure: heureDepart !== undefined ? heure(heureDepart) : "--:--",
            gare: vente.originName,
          }}
          arrivee={{
            heure: heureArrivee !== undefined ? heure(heureArrivee) : "--:--",
            gare: vente.destinationName,
          }}
          milieu={`${vente.distanceKm} km`}
          cases={[
            { libelle: "Classe", valeur: classeCourte(vente.serviceClass) },
            { libelle: "Réglé", valeur: montantCourt(vente.quotedXaf) },
          ]}
          fondDecoupe="var(--c-canvas)"
        >
          <div className="grid justify-items-center gap-1 rounded-md border-[1.5px] border-dashed border-line-strong p-3 text-center">
            <b className="font-mono text-[22px] font-semibold tracking-[0.02em] text-ink">
              {vente.localRef}
            </b>
            <small className="text-[11.5px] leading-[1.4] font-medium text-ink-muted">
              Référence provisoire : numéro définitif et code Aztec à la
              synchronisation.
            </small>
          </div>
        </Billet>
        <div className="flex flex-wrap items-center gap-1.5">
          <PastilleEnvoi
            etat={lu?.state ?? vente.state}
            className="h-[30px] text-[13px]"
          />
          {lu?.serverSaleNumber && (
            <span className="text-[12.5px] font-medium text-ink-muted">
              Numéro définitif{" "}
              <span className="tabular text-ink">{lu.serverSaleNumber}</span>
            </span>
          )}
        </div>
        {lu?.serverXaf !== undefined && (
          <dl
            data-testid="prix-compares"
            className="grid grid-cols-2 gap-3 rounded-md border border-line bg-surface px-3.5 py-2.5"
          >
            <div className="grid gap-0.5">
              <dt className="text-[12.5px] font-medium text-ink-muted">
                Encaissé à bord
              </dt>
              <dd className="font-mono text-[16px] font-bold tabular-nums">
                {montant(vente.quotedXaf)}
              </dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-[12.5px] font-medium text-ink-muted">
                Recalculé par le serveur
              </dt>
              <dd className="font-mono text-[16px] font-bold tabular-nums">
                {montant(lu.serverXaf)}
              </dd>
            </div>
          </dl>
        )}
        {lu?.serverXaf !== undefined && lu.serverXaf !== vente.quotedXaf && (
          <Message ton="alerte" titre="Écart de tarification.">
            Le système a facturé {montant(lu.serverXaf)} pour{" "}
            {montant(vente.quotedXaf)} encaissés à bord. Signalez-le à votre
            caisse : l&apos;écart doit être justifié.
          </Message>
        )}
      </Corps>
      <Bas>
        <Button size="lg" block className={TERRAIN} asChild>
          <Link href="/scan">Terminer et scanner le suivant</Link>
        </Button>
        <Button variant="ghost" block asChild>
          <Link href="/historique">Voir la file d&apos;envoi</Link>
        </Button>
      </Bas>
    </>
  )
}
