"use client"

import {
  CarFront,
  CircleCheck,
  Clock,
  FileCheck,
  Info,
  Luggage,
  MapPin,
  Package,
  PackagePlus,
  Phone,
  Printer,
  QrCode,
  ScanLine,
  Search,
  Ticket,
  Trash2,
  User,
  Weight,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense, useCallback, useRef, useState, type ReactNode } from "react"

import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/choice"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { PastilleBillet, type StatutBillet } from "@workspace/ui/voyage/statut"
import { cn } from "@workspace/ui/lib/utils"

import { EnTetePage, Panneau } from "@/components/charte"
import { dateCourte, heure, jourDeService, montant, nomTrain, xaf, type ChoixMoyen } from "@/lib/agent-data"

import { CadreGuichet, ChargementEcran, LimiteErreur, useGuichet, useMaintenant } from "./guichet/cadre"
import { MODE_E2E, POSTE, messageErreur, useEcriture, useLecture, type BilletTrouve, type Contexte, type Desserte } from "./guichet/donnees"
import { CaisseFermee, Encart, HorsReseau, LigneRecap, Recap } from "./guichet/elements"
import { CodeTicket, FiletTicket, LigneTicket, TicketThermique, useImpression } from "./guichet/impression"
import {
  AttentePaiement,
  ChoixMoyens,
  REGLEMENT_INITIAL,
  ZoneReglement,
  estADistance,
  moyenBackend,
  reglementPret,
  type EtatReglement,
} from "./guichet/reglement"

/* ═══════════════════════ Encaissement des annexes ═════════════════════════ */

/** Moyens acceptés pour les produits hors billet. */
const MOYENS_ANNEXES: readonly ChoixMoyen[] = ["especes", "airtel_money", "moov_money", "carte", "en_compte"]

interface ArgsReglement {
  method: ReturnType<typeof moyenBackend>
  tendered?: number
  paymentId?: never
  reference?: string
  corporateAccountId?: never
}

/**
 * Règlement d'un produit hors billet : immédiat au comptoir ; pour un
 * paiement mobile, la demande part d'abord à l'opérateur et la vente n'est
 * écrite qu'à sa confirmation.
 */
function useEncaissementAnnexe() {
  const demander = useEcriture(api.functions.guichet.demanderPaiement)
  const annuler = useEcriture(api.functions.guichet.annulerDemandePaiement)
  const [paiementId, setPaiementId] = useState<string | null>(null)
  const [erreur, setErreur] = useState("")
  const suite = useRef<((paymentId: string) => Promise<void>) | null>(null)

  const encaisser = useCallback(
    async (reglement: EtatReglement, total: number, vendre: (args: ArgsReglement) => Promise<void>) => {
      setErreur("")
      const base: ArgsReglement = {
        method: moyenBackend(reglement),
        reference: reglement.reference.trim() || undefined,
        corporateAccountId: reglement.moyen === "en_compte" ? (reglement.compteId as never) : undefined,
      }
      if (estADistance(reglement.moyen)) {
        try {
          const demande = await demander({ method: base.method, amountXaf: total, payerPhone: reglement.telephone })
          suite.current = (id) => vendre({ ...base, paymentId: id as never })
          setPaiementId(demande.paiementId)
        } catch (cause) {
          setErreur(messageErreur(cause, "La demande de paiement n'a pas pu partir."))
        }
        return
      }
      await vendre({ ...base, tendered: reglement.moyen === "especes" ? Number(reglement.recu || 0) : undefined })
    },
    [demander]
  )

  const attente = (
    <AttentePaiement
      paiementId={paiementId}
      onConfirme={(paiement) => {
        setPaiementId(null)
        void suite.current?.(paiement.id)
      }}
      onEchec={(paiement) => {
        setPaiementId(null)
        setErreur(`${paiement.raison ?? "Paiement refusé par l'opérateur."} Proposez un autre moyen de paiement.`)
      }}
      onAnnuler={() => {
        const id = paiementId
        setPaiementId(null)
        if (id) void annuler({ paiementId: id as never }).catch(() => undefined)
      }}
    />
  )
  return { encaisser, attente, erreurPaiement: erreur, enAttente: paiementId !== null }
}

/** Bloc de règlement : les moyens, puis la saisie propre au moyen retenu. */
function BlocReglement({
  reglement,
  onReglement,
  total,
  tentativesMax,
}: {
  reglement: EtatReglement
  onReglement: (r: EtatReglement) => void
  total: number | undefined
  tentativesMax: number
}) {
  return (
    <section className="grid gap-3" aria-label="Règlement">
      <h2 className="text-[16px] font-bold">Règlement</h2>
      <ChoixMoyens valeur={reglement.moyen} onChange={(moyen) => onReglement({ ...reglement, moyen })} permis={MOYENS_ANNEXES} />
      {total !== undefined ? <ZoneReglement etat={reglement} onChange={onReglement} total={total} tentativesMax={tentativesMax} /> : null}
    </section>
  )
}

function libelleAction(reglement: EtatReglement, total: number | undefined, verbe: string) {
  if (total === undefined) return "Complétez la saisie pour le tarif"
  const pret = reglementPret(reglement, total)
  if (!pret.pret) return pret.raison
  return estADistance(reglement.moyen) ? `Envoyer la demande · ${xaf(total)}` : `${verbe} · ${xaf(total)}`
}

/* ════════════════════════ Billet de rattachement ══════════════════════════ */

function RechercheBillet({ reference, onReference, billet, libelle = "Billet du voyageur" }: { reference: string; onReference: (r: string) => void; billet: BilletTrouve | null | undefined; libelle?: string }) {
  const [saisie, setSaisie] = useState(reference)
  const champ = useRef<HTMLInputElement>(null)
  return (
    <Panneau titre={libelle} icone={Ticket}>
      <form
        className="grid gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          onReference(saisie.trim())
        }}
      >
        {/* L'aide passe sous la ligne : les boutons s'alignent sur le champ, pas sur elle. */}
        <div className="flex flex-wrap items-end gap-2">
        <Field label="N° de billet ou lecture du code" htmlFor="billet-reference" className="min-w-[220px] flex-1">
          <Input ref={champ} id="billet-reference" className="tabular" autoComplete="off" value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="B-OWE-PV-20261001-000042" aria-describedby="billet-reference-aide" />
        </Field>
        <Button type="submit" variant="secondary">
          <Search aria-hidden />
          Rechercher
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setSaisie("")
            champ.current?.focus()
          }}
        >
          <QrCode aria-hidden />
          Scanner
        </Button>
        </div>
        <p id="billet-reference-aide" className="text-[12px] text-ink-muted">
          Le lecteur de codes écrit ici puis valide de lui-même.
        </p>
      </form>
      {billet === undefined && reference ? (
        <p role="status" className="text-small text-ink-muted">
          Recherche du billet…
        </p>
      ) : billet === null ? (
        <InlineMessage tone="warning" title="Billet introuvable.">
          Vérifiez le numéro imprimé sous le code du billet.
        </InlineMessage>
      ) : billet ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-line px-3.5 py-3">
          <span className="grid size-8 place-items-center rounded-pill bg-accent-base text-ink-inverse">
            <ScanLine aria-hidden className="size-4" />
          </span>
          <span className="grid min-w-0 flex-1">
            <b className="font-semibold">{billet.voyageur}</b>
            <small className="text-[12.5px] text-ink-muted">
              {billet.desserte ? `${nomTrain(billet.desserte.trainType, billet.desserte.trainNumber)} · ${dateCourte(billet.desserte.serviceDate)} · ` : ""}
              {billet.origine?.name ?? "?"} → {billet.arrivee?.name ?? "?"}
              {billet.place ? ` · ${billet.voiture ?? ""} ${billet.place}` : ""}
            </small>
          </span>
          <PastilleBillet statut={billet.statut as StatutBillet} />
        </div>
      ) : null}
    </Panneau>
  )
}

function Succes({ titre, texte, children }: { titre: string; texte: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md bg-success-soft px-5 py-4 text-success-ink" role="status">
      <CircleCheck aria-hidden className="size-8 shrink-0" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <b className="text-[18px] text-ink">{titre}</b>
        <span className="text-[14px]">{texte}</span>
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  )
}

/* ═════════════════════════════ Bagage ═════════════════════════════════════ */

const NATURES = ["Valise", "Sac", "Valise et sac", "Carton", "Malle", "Autre"]

interface ResultatBagage {
  etiquette: string
  total: number
  monnaie: number
  billet: BilletTrouve
  pieces: number
  poids: number
}

function EtiquetteBagage({ etiquette, billet, pieces, poids, rang }: { etiquette: string | null; billet: BilletTrouve | null | undefined; pieces: number; poids: number; rang: number }) {
  return (
    <TicketThermique>
      <div className="text-center font-semibold">
        BAGAGE · {billet?.origine?.code ?? "—"} → {billet?.arrivee?.code ?? "—"}
      </div>
      {etiquette ? (
        <div className="text-center text-[18px] leading-tight font-semibold break-all">{etiquette}</div>
      ) : (
        <div className="text-center text-[11px] text-ink-muted">N° d&apos;étiquette attribué à l&apos;encaissement</div>
      )}
      {etiquette ? <CodeTicket valeur={etiquette} legende={`Code de l'étiquette ${etiquette}`} /> : null}
      <LigneTicket gauche={billet?.desserte ? nomTrain(billet.desserte.trainType, billet.desserte.trainNumber) : "Train"} droite={billet?.desserte ? dateCourte(billet.desserte.serviceDate) : "—"} />
      <LigneTicket gauche={`${pieces} pièce${pieces > 1 ? "s" : ""}`} droite={`${String(poids).replace(".", ",")} kg`} />
      <LigneTicket gauche={billet?.voyageur ?? "Voyageur"} droite={billet?.numero ?? ""} />
      <FiletTicket />
      <div className="text-center text-[10.5px] text-ink-muted">
        Étiquette à poser sur la poignée · {rang}/{pieces}
      </div>
    </TicketThermique>
  )
}

export function BaggageSaleScreen({ contexte, peutVendre, referenceInitiale }: { contexte: Contexte; peutVendre: boolean; referenceInitiale: string }) {
  const [reference, setReference] = useState(referenceInitiale)
  const billet = useLecture(api.functions.guichet.billet, reference ? { reference } : "skip")
  const [pieces, setPieces] = useState("1")
  const [poids, setPoids] = useState("")
  const [nature, setNature] = useState(NATURES[0]!)
  const [destinataire, setDestinataire] = useState("")
  const [reglement, setReglement] = useState<EtatReglement>(REGLEMENT_INITIAL)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState("")
  const [resultat, setResultat] = useState<ResultatBagage | null>(null)
  const vendre = useEcriture(api.functions.ancillaries.sellBaggage)
  const { imprimer, zone } = useImpression()
  const { encaisser, attente, erreurPaiement } = useEncaissementAnnexe()

  const poidsKg = Number(poids.replace(",", "."))
  const nbPieces = Math.max(1, Math.trunc(Number(pieces) || 1))
  const tropLourd = poidsKg > 30
  const billetValide = billet?.statut === "valide"
  const devis = useLecture(
    api.functions.ancillaries.quoteBaggage,
    billet && billetValide && poidsKg > 0 && !tropLourd ? { ticketId: billet.id as never, weightKg: poidsKg } : "skip"
  )
  const total = devis?.totalTtc

  const imprimerEtiquettes = (r: ResultatBagage) =>
    imprimer(
      Array.from({ length: r.pieces }, (_, i) => <EtiquetteBagage key={i} etiquette={r.etiquette} billet={r.billet} pieces={r.pieces} poids={r.poids} rang={i + 1} />),
      "ticket"
    )

  const soumettre = async () => {
    if (!billet || !billetValide || total === undefined) return
    setEnCours(true)
    setErreur("")
    try {
      await encaisser(reglement, total, async (args) => {
        try {
          const r = await vendre({
            ticketId: billet.id as never,
            weightKg: poidsKg,
            pieceCount: nbPieces,
            description: nature,
            senderName: billet.voyageur,
            recipientName: destinataire.trim() || undefined,
            deviceId: POSTE,
            ...args,
          })
          const fait = { etiquette: r.tagNumber, total: r.amounts.ttc, monnaie: r.changeXaf, billet, pieces: nbPieces, poids: poidsKg }
          setResultat(fait)
          if (!MODE_E2E) imprimerEtiquettes(fait)
        } catch (cause) {
          setErreur(messageErreur(cause, "Le bagage n'a pas pu être enregistré."))
        }
      })
    } finally {
      setEnCours(false)
    }
  }

  const recommencer = () => {
    setResultat(null)
    setReference("")
    setPoids("")
    setPieces("1")
    setDestinataire("")
    setReglement(REGLEMENT_INITIAL)
  }

  const franchise = devis ? Math.max(0, poidsKg - devis.breakdown.excessKg) : 0
  return (
    <>
      <EnTetePage
        surtitre="Guichet · bagage accompagné"
        titre="Enregistrer un bagage"
        description="Un bagage suit un billet : on part du billet, on pèse, on étiquette. Au-delà de 30 kg, c'est un colis express."
      />
      {resultat ? (
        <Succes
          titre={`Bagage ${resultat.etiquette} enregistré`}
          texte={
            <>
              <span className="tabular">{xaf(resultat.total)}</span>
              {resultat.monnaie > 0 ? (
                <>
                  {" "}
                  · rendu <span className="tabular">{xaf(resultat.monnaie)}</span>
                </>
              ) : null}{" "}
              · {resultat.pieces} étiquette{resultat.pieces > 1 ? "s" : ""}
            </>
          }
        >
          <Button type="button" variant="secondary" onClick={() => imprimerEtiquettes(resultat)}>
            <Printer aria-hidden />
            Réimprimer les étiquettes
          </Button>
          <Button type="button" variant="ghost" onClick={recommencer}>
            <Luggage aria-hidden />
            Nouveau bagage
          </Button>
        </Succes>
      ) : null}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 gap-4">
          <RechercheBillet reference={reference} onReference={setReference} billet={reference ? billet : undefined} />
          {billet && !billetValide ? (
            <InlineMessage tone="warning" title="Ce billet ne permet pas d'enregistrer un bagage.">
              Seul un billet valide, non encore utilisé, reçoit un bagage.
            </InlineMessage>
          ) : null}
          <Panneau titre="Pesée" icone={Weight}>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Nombre de pièces" htmlFor="bagage-pieces">
                <Input id="bagage-pieces" className="tabular" inputMode="numeric" value={pieces} onChange={(e) => setPieces(e.target.value.replace(/\D/g, ""))} />
              </Field>
              <Field label="Poids total (kg)" htmlFor="bagage-poids" hint="Balance du guichet · 30 kg au plus" error={tropLourd ? "Au-delà de 30 kg : colis express" : undefined}>
                <Input id="bagage-poids" className="tabular" inputMode="decimal" value={poids} onChange={(e) => setPoids(e.target.value.replace(/[^\d.,]/g, ""))} />
              </Field>
              <Field label="Nature" htmlFor="bagage-nature">
                <SelectNative id="bagage-nature" value={nature} onChange={(e) => setNature(e.target.value)}>
                  {NATURES.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </SelectNative>
              </Field>
            </div>
            <Field label="Destinataire à l'arrivée" htmlFor="bagage-destinataire" hint="Facultatif · si une autre personne retire le bagage.">
              <Input id="bagage-destinataire" value={destinataire} onChange={(e) => setDestinataire(e.target.value)} />
            </Field>
            {tropLourd ? (
              <InlineMessage tone="warning" title="Au-delà de 30 kg, ce n'est plus un bagage.">
                <Link href={"/vente/colis" as Route} className="font-semibold underline">
                  Enregistrer un colis express
                </Link>
              </InlineMessage>
            ) : (
              <Encart icone={Info} titre={devis ? `Franchise : ${String(franchise).replace(".", ",")} kg` : "Franchise selon le barème"}>
                Au-delà de la franchise, chaque kilogramme est facturé au barème bagages de la zone.
              </Encart>
            )}
          </Panneau>
          {!resultat ? <BlocReglement reglement={reglement} onReglement={setReglement} total={total} tentativesMax={contexte.parametres.tentativesMobile} /> : null}
        </div>
        <div className="grid gap-4 xl:sticky xl:top-20">
          <Recap titre={billet ? `${billet.origine?.name ?? "?"} → ${billet.arrivee?.name ?? "?"}` : "Trajet du billet"} sousTitre={billet ? `${montant(billet.distanceKm)} km` : "Saisissez d'abord le billet"}>
            {devis ? (
              <>
                <LigneRecap libelle="Frais d'enregistrement" valeur={`${montant(devis.breakdown.registrationHt)} HT`} />
                <LigneRecap libelle={`Excédent · ${String(devis.breakdown.excessKg).replace(".", ",")} kg`} valeur={`${montant(devis.breakdown.excessHt)} HT`} />
                <LigneRecap libelle="Taxes" valeur={montant(devis.totalTtc - devis.breakdown.totalHt)} />
                <LigneRecap libelle="Total" valeur={xaf(devis.totalTtc)} fort />
              </>
            ) : (
              <p className="text-small text-ink-muted">Le tarif s&apos;affiche dès la pesée.</p>
            )}
          </Recap>
          <EtiquetteBagage etiquette={resultat?.etiquette ?? null} billet={billet} pieces={nbPieces} poids={poidsKg || 0} rang={1} />
          {erreur || erreurPaiement ? (
            <InlineMessage tone="danger" title="Enregistrement refusé.">
              {erreur || erreurPaiement}
            </InlineMessage>
          ) : null}
          {!resultat ? (
          <Button
            type="button"
            size="lg"
            block
            loading={enCours}
            loadingLabel="Enregistrement…"
            disabled={!peutVendre || !billetValide || total === undefined || !reglementPret(reglement, total).pret}
            onClick={soumettre}
          >
            <Printer aria-hidden />
            {!billetValide ? "Saisissez un billet valide" : !(poidsKg > 0) ? "Pesez le bagage" : tropLourd ? "Au-delà de 30 kg : colis express" : libelleAction(reglement, total, "Encaisser et étiqueter")}
          </Button>
          ) : null}
        </div>
      </div>
      {attente}
      {zone}
    </>
  )
}

/* ══════════════════════════════ Colis ═════════════════════════════════════ */

interface Article {
  description: string
  poids: string
}

const CONSIGNES = ["Fragile", "Denrées périssables", "Ne pas renverser"]

function VignetteColis({ expedition, vignette, article, rang, total, origine, arrivee, destinataire, consignes }: { expedition: string; vignette: string; article: Article; rang: number; total: number; origine: string; arrivee: string; destinataire: string; consignes: string[] }) {
  return (
    <TicketThermique>
      <div className="text-center font-semibold">
        COLIS EXPRESS · {origine} → {arrivee}
      </div>
      <div className="text-center text-[18px] leading-tight font-semibold">{expedition}</div>
      <CodeTicket valeur={vignette} legende={`Code de la vignette ${vignette}`} />
      <LigneTicket gauche={vignette} droite={`${rang}/${total}`} />
      <LigneTicket gauche={article.description || "Article"} droite={`${article.poids.replace(".", ",")} kg`} />
      <LigneTicket gauche="Pour" droite={destinataire} />
      {consignes.length ? <div className="text-center font-semibold">{consignes.join(" · ").toUpperCase()}</div> : null}
    </TicketThermique>
  )
}

export function ParcelSaleScreen({ contexte, peutVendre }: { contexte: Contexte; peutVendre: boolean }) {
  const gares = useLecture(api.functions.referential.listStations, {})
  const [expediteur, setExpediteur] = useState({ nom: "", telephone: "", piece: "" })
  const [destinataire, setDestinataire] = useState({ nom: "", telephone: "" })
  const [origineChoisie, setOrigine] = useState(contexte.pointOfSale.stationId ?? "")
  const [arrivee, setArrivee] = useState("")
  const [articles, setArticles] = useState<Article[]>([{ description: "", poids: "" }])
  const [valeur, setValeur] = useState("")
  const [consignes, setConsignes] = useState<string[]>([])
  const [jour, setJour] = useState<0 | 1>(0)
  const [tripId, setTripId] = useState("")
  const [reglement, setReglement] = useState<EtatReglement>(REGLEMENT_INITIAL)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState("")
  const [resultat, setResultat] = useState<{ expedition: string; vignettes: string[]; total: number; monnaie: number } | null>(null)
  const vendre = useEcriture(api.functions.ancillaries.sellParcel)
  const { imprimer, zone } = useImpression()
  const { encaisser, attente, erreurPaiement } = useEncaissementAnnexe()

  const origine = origineChoisie
  const poids = articles.map((a) => Number(a.poids.replace(",", ".")))
  const articlesValides = articles.length > 0 && poids.every((p) => p > 0 && p <= 100) && articles.every((a) => a.description.trim())
  const devis = useLecture(
    api.functions.ancillaries.quoteParcel,
    origine && arrivee && origine !== arrivee && poids.every((p) => p > 0 && p <= 100)
      ? { originStationId: origine as never, destinationStationId: arrivee as never, items: poids.map((weightKg) => ({ weightKg })) }
      : "skip"
  )
  const maintenant = useMaintenant()
  const serviceDate = jourDeService(maintenant, jour)
  const dessertes = useLecture(
    api.functions.guichet.dessertes,
    origine && arrivee && origine !== arrivee ? { originStationId: origine as never, destinationStationId: arrivee as never, serviceDate, discountCodes: [""] } : "skip"
  )
  const trains = (dessertes ?? []).filter((d) => d.status !== "annule" && d.departAt + d.delayMinutes * 60_000 > maintenant)
  const sansTrain = Boolean(arrivee && dessertes && trains.length === 0)
  const train: Desserte | undefined = trains.find((d) => d.tripId === tripId)
  const total = devis?.totalTtc
  const nomGare = (id: string) => gares?.find((g) => g._id === id)
  const coordonnees = expediteur.nom.trim() && expediteur.telephone.trim() && destinataire.nom.trim() && destinataire.telephone.trim()

  const soumettre = async () => {
    if (total === undefined) return
    setEnCours(true)
    setErreur("")
    try {
      await encaisser(reglement, total, async (args) => {
        try {
          const r = await vendre({
            originStationId: origine as never,
            destinationStationId: arrivee as never,
            senderName: expediteur.nom.trim(),
            senderPhone: expediteur.telephone.trim(),
            senderIdDocument: expediteur.piece.trim() || undefined,
            recipientName: destinataire.nom.trim(),
            recipientPhone: destinataire.telephone.trim(),
            items: articles.map((a, i) => ({ description: a.description.trim(), weightKg: poids[i]! })),
            declaredValueXaf: valeur ? Number(valeur) : undefined,
            handling: consignes,
            tripId: tripId ? (tripId as never) : undefined,
            deviceId: POSTE,
            ...args,
          })
          const fait = { expedition: r.shipmentNumber, vignettes: r.stickers, total: r.amounts.ttc, monnaie: r.changeXaf }
          setResultat(fait)
          if (!MODE_E2E) imprimerVignettes(fait.expedition, fait.vignettes)
        } catch (cause) {
          setErreur(messageErreur(cause, "Le colis n'a pas pu être enregistré."))
        }
      })
    } finally {
      setEnCours(false)
    }
  }

  const imprimerVignettes = (expedition: string, vignettes: string[]) =>
    imprimer(
      vignettes.map((v, i) => (
        <VignetteColis
          key={v}
          expedition={expedition}
          vignette={v}
          article={articles[i] ?? { description: "", poids: "" }}
          rang={i + 1}
          total={vignettes.length}
          origine={nomGare(origine)?.code ?? ""}
          arrivee={nomGare(arrivee)?.code ?? ""}
          destinataire={destinataire.nom}
          consignes={consignes}
        />
      )),
      "ticket"
    )

  const listeGares = (gares ?? []).map((g) => (
    <option key={g._id} value={g._id}>
      {g.name}
    </option>
  ))

  return (
    <>
      <EnTetePage
        surtitre="Guichet · messagerie"
        titre="Expédier un colis"
        description="Colis jusqu'à 100 kg par article, tarifé par zone de distance et palier de 10 kg. Le destinataire est prévenu à l'arrivée."
      />
      {resultat ? (
        <Succes
          titre={`Colis ${resultat.expedition} enregistré`}
          texte={
            <>
              <span className="tabular">{xaf(resultat.total)}</span>
              {resultat.monnaie > 0 ? (
                <>
                  {" "}
                  · rendu <span className="tabular">{xaf(resultat.monnaie)}</span>
                </>
              ) : null}{" "}
              · {resultat.vignettes.length} vignette{resultat.vignettes.length > 1 ? "s" : ""}
            </>
          }
        >
          <Button type="button" variant="secondary" onClick={() => imprimerVignettes(resultat.expedition, resultat.vignettes)}>
            <Printer aria-hidden />
            Réimprimer les vignettes
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setResultat(null)
              setArticles([{ description: "", poids: "" }])
              setExpediteur({ nom: "", telephone: "", piece: "" })
              setDestinataire({ nom: "", telephone: "" })
              setValeur("")
              setConsignes([])
              setReglement(REGLEMENT_INITIAL)
            }}
          >
            <Package aria-hidden />
            Nouveau colis
          </Button>
        </Succes>
      ) : null}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 gap-4">
          <Panneau titre="Expéditeur" icone={User}>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Nom ou raison sociale" htmlFor="colis-expediteur">
                <Input id="colis-expediteur" value={expediteur.nom} onChange={(e) => setExpediteur({ ...expediteur, nom: e.target.value })} />
              </Field>
              <Field label="Téléphone" htmlFor="colis-expediteur-tel">
                <Input id="colis-expediteur-tel" type="tel" value={expediteur.telephone} onChange={(e) => setExpediteur({ ...expediteur, telephone: e.target.value })} />
              </Field>
              <Field label="Pièce d'identité" htmlFor="colis-piece" hint="Facultatif">
                <Input id="colis-piece" value={expediteur.piece} onChange={(e) => setExpediteur({ ...expediteur, piece: e.target.value })} />
              </Field>
            </div>
          </Panneau>
          <Panneau titre="Destinataire" icone={MapPin}>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Nom" htmlFor="colis-destinataire">
                <Input id="colis-destinataire" value={destinataire.nom} onChange={(e) => setDestinataire({ ...destinataire, nom: e.target.value })} />
              </Field>
              <Field label="Téléphone" htmlFor="colis-destinataire-tel">
                <Input id="colis-destinataire-tel" type="tel" value={destinataire.telephone} onChange={(e) => setDestinataire({ ...destinataire, telephone: e.target.value })} />
              </Field>
              <Field label="Gare d'arrivée" htmlFor="colis-arrivee">
                <SelectNative id="colis-arrivee" value={arrivee} onChange={(e) => setArrivee(e.target.value)}>
                  <option value="">Choisir la gare</option>
                  {listeGares}
                </SelectNative>
              </Field>
            </div>
            {!contexte.pointOfSale.stationId ? (
              <Field label="Gare de départ" htmlFor="colis-origine">
                <SelectNative id="colis-origine" value={origineChoisie} onChange={(e) => setOrigine(e.target.value)}>
                  <option value="">Choisir la gare</option>
                  {listeGares}
                </SelectNative>
              </Field>
            ) : null}
          </Panneau>
          <Panneau
            titre="Colis"
            icone={Package}
            actions={
              <Button type="button" variant="secondary" size="sm" disabled={articles.length >= 10} onClick={() => setArticles([...articles, { description: "", poids: "" }])}>
                <PackagePlus aria-hidden />
                Ajouter un article
              </Button>
            }
          >
            {articles.map((article, index) => (
              <div key={index} className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
                <Field label={`Contenu déclaré · article ${index + 1}`} htmlFor={`colis-article-${index}`}>
                  <Input
                    id={`colis-article-${index}`}
                    value={article.description}
                    placeholder="Pièces détachées"
                    onChange={(e) => setArticles(articles.map((a, i) => (i === index ? { ...a, description: e.target.value } : a)))}
                  />
                </Field>
                <Field label="Poids (kg)" htmlFor={`colis-poids-${index}`}>
                  <Input
                    id={`colis-poids-${index}`}
                    className="tabular"
                    inputMode="decimal"
                    value={article.poids}
                    onChange={(e) => setArticles(articles.map((a, i) => (i === index ? { ...a, poids: e.target.value.replace(/[^\d.,]/g, "") } : a)))}
                  />
                </Field>
                <Button type="button" variant="ghost" size="icon" aria-label={`Retirer l'article ${index + 1}`} disabled={articles.length === 1} onClick={() => setArticles(articles.filter((_, i) => i !== index))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div className="grid gap-3 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
              <Field label="Valeur déclarée (XAF)" htmlFor="colis-valeur" hint="Sert au calcul de l'indemnité en cas de perte.">
                <Input id="colis-valeur" className="tabular" inputMode="numeric" value={valeur} onChange={(e) => setValeur(e.target.value.replace(/\D/g, ""))} />
              </Field>
              <div className="grid content-start gap-1.5">
                <span className="text-[13px] font-medium">Consignes</span>
                {/* Pastilles de 34 px, comme les filtres ; la zone cliquable garde ses 44 px. */}
                <div className="flex flex-wrap gap-x-1.5" role="group" aria-label="Consignes de manutention">
                  {CONSIGNES.map((c) => {
                    const active = consignes.includes(c)
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setConsignes(active ? consignes.filter((x) => x !== c) : [...consignes, c])}
                        className="inline-flex min-h-11 items-center rounded-pill"
                      >
                        <span
                          className={cn(
                            "inline-flex h-[34px] items-center gap-1.5 rounded-pill border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors duration-[var(--dur-fast)]",
                            active ? "border-accent-base bg-accent-soft text-accent-ink" : "border-line-strong bg-surface text-ink-muted hover:text-ink"
                          )}
                        >
                          {active ? <CircleCheck aria-hidden className="size-3.5" /> : null}
                          {c}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </Panneau>
          <Panneau titre="Acheminement" icone={Clock}>
            <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)] md:items-end">
              <SegmentedControl
                label="Jour d'acheminement"
                size="touch"
                value={String(jour)}
                onValueChange={(v) => {
                  setJour(v === "1" ? 1 : 0)
                  setTripId("")
                }}
                options={[
                  { value: "0", label: "Aujourd'hui" },
                  { value: "1", label: "Demain" },
                ]}
              />
              <Field label="Train" htmlFor="colis-train">
                <SelectNative id="colis-train" aria-describedby={sansTrain ? "colis-train-aide" : undefined} value={tripId} onChange={(e) => setTripId(e.target.value)} disabled={!arrivee}>
                  <option value="">Premier train disponible</option>
                  {trains.map((d) => (
                    <option key={d.tripId} value={d.tripId}>
                      {nomTrain(d.trainType, d.trainNumber)} · départ {heure(d.departAt)} · arrivée {heure(d.arriveeAt)}
                    </option>
                  ))}
                </SelectNative>
              </Field>
            </div>
            {/* Sous la ligne : dedans, l'aide décalerait le sélecteur de jour. */}
            {sansTrain ? (
              <p id="colis-train-aide" className="-mt-2 text-[12px] text-ink-muted">
                Aucun train ce jour-là sur ce trajet.
              </p>
            ) : null}
          </Panneau>
          {!resultat ? <BlocReglement reglement={reglement} onReglement={setReglement} total={total} tentativesMax={contexte.parametres.tentativesMobile} /> : null}
        </div>
        <div className="grid gap-4 xl:sticky xl:top-20">
          <Recap
            titre={`${nomGare(origine)?.name ?? "Départ"} → ${nomGare(arrivee)?.name ?? "Arrivée"}`}
            sousTitre={devis ? `${montant(devis.distanceKm)} km · zone ${devis.zone}${train ? ` · ${nomTrain(train.trainType, train.trainNumber)}` : ""}` : "Choisissez la gare et pesez"}
          >
            {devis ? (
              <>
                {devis.breakdown.items.map((item, i) => (
                  <LigneRecap key={i} libelle={`Article ${i + 1} · palier ${item.weightTier} kg, zone ${item.zone}`} valeur={`${montant(item.totalHt)} HT`} />
                ))}
                <LigneRecap libelle="Taxes" valeur={montant(devis.totalTtc - devis.breakdown.totalHt)} />
                <LigneRecap libelle="Total" valeur={xaf(devis.totalTtc)} fort />
              </>
            ) : (
              <p className="text-small text-ink-muted">Le tarif s&apos;affiche dès la gare d&apos;arrivée et les poids saisis.</p>
            )}
          </Recap>
          {train ? (
            <Encart icone={Clock} titre={`Disponible à ${nomGare(arrivee)?.name ?? "l'arrivée"}`}>
              {dateCourte(jourDeService(train.arriveeAt))} vers {heure(train.arriveeAt)} · retrait sur pièce d&apos;identité
            </Encart>
          ) : null}
          {erreur || erreurPaiement ? (
            <InlineMessage tone="danger" title="Enregistrement refusé.">
              {erreur || erreurPaiement}
            </InlineMessage>
          ) : null}
          {!resultat ? (
          <Button
            type="button"
            size="lg"
            block
            loading={enCours}
            loadingLabel="Enregistrement…"
            disabled={!peutVendre || !coordonnees || !articlesValides || total === undefined || !reglementPret(reglement, total).pret}
            onClick={soumettre}
          >
            <Printer aria-hidden />
            {!coordonnees ? "Coordonnées des deux parties à saisir" : !articlesValides ? "Contenu et poids de chaque article" : libelleAction(reglement, total, "Encaisser et étiqueter")}
          </Button>
          ) : null}
        </div>
      </div>
      {attente}
      {zone}
    </>
  )
}

/* ═══════════════════════ Prestations spéciales ════════════════════════════ */

export function SpecialTransportScreen({ contexte, peutVendre, typeInitial }: { contexte: Contexte; peutVendre: boolean; typeInitial: "auto" | "funeraire" }) {
  const gares = useLecture(api.functions.referential.listStations, {})
  const [type, setType] = useState<"auto" | "funeraire">(typeInitial)
  const [reference, setReference] = useState("")
  const billet = useLecture(api.functions.guichet.billet, type === "auto" && reference ? { reference } : "skip")
  const [arrivee, setArrivee] = useState("")
  const [jour, setJour] = useState<0 | 1>(0)
  const [tripId, setTripId] = useState("")
  const [tonnage, setTonnage] = useState("")
  const [expediteur, setExpediteur] = useState("")
  const [piecesVerifiees, setPiecesVerifiees] = useState(false)
  const [reglement, setReglement] = useState<EtatReglement>(REGLEMENT_INITIAL)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState("")
  const [resultat, setResultat] = useState<{ expedition: string; total: number; monnaie: number } | null>(null)
  const vendreAuto = useEcriture(api.functions.ancillaries.sellVehicleTransport)
  const vendreFuneraire = useEcriture(api.functions.ancillaries.sellFuneralTransport)
  const { imprimer, zone } = useImpression()
  const { encaisser, attente, erreurPaiement } = useEncaissementAnnexe()

  const origine = contexte.pointOfSale.stationId ?? ""
  const tonnes = Number(tonnage.replace(",", "."))
  const billetValide = billet?.statut === "valide"
  const maintenant = useMaintenant()
  const serviceDate = jourDeService(maintenant, jour)
  const dessertes = useLecture(
    api.functions.guichet.dessertes,
    type === "funeraire" && origine && arrivee && origine !== arrivee ? { originStationId: origine as never, destinationStationId: arrivee as never, serviceDate, discountCodes: [""] } : "skip"
  )
  const trains = (dessertes ?? []).filter((d) => d.status !== "annule" && d.departAt + d.delayMinutes * 60_000 > maintenant)
  const sansTrain = Boolean(arrivee && dessertes && trains.length === 0)
  const devis = useLecture(
    api.functions.ancillaries.quoteSpecialTransport,
    tonnes > 0
      ? type === "auto"
        ? billet && billetValide
          ? { product: "taa" as const, ticketId: billet.id as never, tonnage: tonnes }
          : "skip"
        : origine && arrivee && origine !== arrivee
          ? { product: "funeraire" as const, originStationId: origine as never, destinationStationId: arrivee as never, tonnage: tonnes }
          : "skip"
      : "skip"
  )
  const total = devis?.totalTtc
  const pret = type === "auto" ? billetValide && expediteur.trim() : Boolean(tripId) && expediteur.trim() && piecesVerifiees
  const nomGare = (id: string) => gares?.find((g) => g._id === id)?.name

  const soumettre = async () => {
    if (total === undefined) return
    setEnCours(true)
    setErreur("")
    try {
      await encaisser(reglement, total, async (args) => {
        try {
          const r =
            type === "auto"
              ? await vendreAuto({
                  ticketId: billet!.id as never,
                  tonnage: tonnes,
                  senderName: expediteur.trim(),
                  validUntil: (billet!.desserte?.departAt ?? Date.now()) + 2 * 86_400_000,
                  deviceId: POSTE,
                  ...args,
                })
              : await vendreFuneraire({
                  tripId: tripId as never,
                  originStationId: origine as never,
                  destinationStationId: arrivee as never,
                  tonnage: tonnes,
                  senderName: expediteur.trim(),
                  deviceId: POSTE,
                  ...args,
                })
          const fait = { expedition: r.shipmentNumber, total: r.amounts.ttc, monnaie: r.changeXaf }
          setResultat(fait)
          if (!MODE_E2E) imprimer(<RecuPrestation type={type} expedition={fait.expedition} total={fait.total} expediteur={expediteur} tonnes={tonnes} />, "ticket")
        } catch (cause) {
          setErreur(messageErreur(cause, "La prestation n'a pas pu être enregistrée."))
        }
      })
    } finally {
      setEnCours(false)
    }
  }

  return (
    <>
      <EnTetePage
        surtitre="Guichet · prestations spéciales"
        titre="Prestation spéciale"
        description="Un véhicule voyage avec son propriétaire, sur son billet. Un transport funéraire s'enregistre sur une desserte, pièces administratives vérifiées."
      />
      <SegmentedControl
        label="Type de prestation"
        size="touch"
        value={type}
        onValueChange={(v) => {
          setType(v as "auto" | "funeraire")
          setResultat(null)
          setErreur("")
        }}
        options={[
          { value: "auto", label: "Auto accompagné" },
          { value: "funeraire", label: "Transport funéraire" },
        ]}
        className="w-full max-w-md"
      />
      {resultat ? (
        <Succes titre={`Prestation ${resultat.expedition} enregistrée`} texte={<span className="tabular">{xaf(resultat.total)}</span>}>
          <Button type="button" variant="secondary" onClick={() => imprimer(<RecuPrestation type={type} expedition={resultat.expedition} total={resultat.total} expediteur={expediteur} tonnes={tonnes} />, "ticket")}>
            <Printer aria-hidden />
            Réimprimer le reçu
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setResultat(null)
              setTonnage("")
              setExpediteur("")
              setPiecesVerifiees(false)
              setReglement(REGLEMENT_INITIAL)
            }}
          >
            Nouvelle prestation
          </Button>
        </Succes>
      ) : null}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 gap-4">
          {type === "auto" ? (
            <RechercheBillet libelle="Billet du propriétaire" reference={reference} onReference={setReference} billet={reference ? billet : undefined} />
          ) : (
            <Panneau titre="Trajet et desserte" icone={MapPin}>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Gare de départ" htmlFor="special-origine">
                  <Input id="special-origine" value={nomGare(origine) ?? contexte.pointOfSale.name} disabled />
                </Field>
                <Field label="Gare d'arrivée" htmlFor="special-arrivee">
                  <SelectNative id="special-arrivee" value={arrivee} onChange={(e) => setArrivee(e.target.value)}>
                    <option value="">Choisir la gare</option>
                    {(gares ?? []).filter((g) => g._id !== origine).map((g) => (
                      <option key={g._id} value={g._id}>
                        {g.name}
                      </option>
                    ))}
                  </SelectNative>
                </Field>
              </div>
              <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)] md:items-end">
                <SegmentedControl
                  label="Jour du transport"
                  size="touch"
                  value={String(jour)}
                  onValueChange={(v) => {
                    setJour(v === "1" ? 1 : 0)
                    setTripId("")
                  }}
                  options={[
                    { value: "0", label: "Aujourd'hui" },
                    { value: "1", label: "Demain" },
                  ]}
                />
                <Field label="Desserte" htmlFor="special-desserte">
                  <SelectNative id="special-desserte" aria-describedby={sansTrain ? "special-desserte-aide" : undefined} value={tripId} disabled={!arrivee} onChange={(e) => setTripId(e.target.value)}>
                    <option value="">Choisir le train</option>
                    {trains.map((d) => (
                      <option key={d.tripId} value={d.tripId}>
                        {nomTrain(d.trainType, d.trainNumber)} · {heure(d.departAt)}
                      </option>
                    ))}
                  </SelectNative>
                </Field>
              </div>
              {sansTrain ? (
                <p id="special-desserte-aide" className="-mt-2 text-[12px] text-ink-muted">
                  Aucun train ce jour-là sur ce trajet.
                </p>
              ) : null}
              <Encart icone={FileCheck} titre="Pièces administratives exigées" ton="info">
                Autorisation de transport de corps, certificat de décès et laissez-passer mortuaire.
              </Encart>
              <Checkbox label="Pièces présentées et vérifiées au guichet" checked={piecesVerifiees} onCheckedChange={(v) => setPiecesVerifiees(v === true)} />
            </Panneau>
          )}
          <Panneau titre={type === "auto" ? "Véhicule" : "Convoi"} icone={type === "auto" ? CarFront : Package}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Tonnage (t)" htmlFor="special-tonnage" hint="Poids du véhicule ou du convoi, en tonnes.">
                <Input id="special-tonnage" className="tabular" inputMode="decimal" value={tonnage} onChange={(e) => setTonnage(e.target.value.replace(/[^\d.,]/g, ""))} />
              </Field>
              <Field label={type === "auto" ? "Propriétaire" : "Famille ou pompes funèbres"} htmlFor="special-expediteur">
                <Input id="special-expediteur" value={expediteur} onChange={(e) => setExpediteur(e.target.value)} placeholder={type === "auto" && billet ? billet.voyageur : undefined} />
              </Field>
            </div>
            {type === "auto" && billet?.desserte ? (
              <Encart icone={Phone} titre={`Embarquement avec le ${nomTrain(billet.desserte.trainType, billet.desserte.trainNumber)}`}>
                Le véhicule voyage le {dateCourte(billet.desserte.serviceDate)} ; la prestation reste valable deux jours après le départ.
              </Encart>
            ) : null}
          </Panneau>
          {!resultat ? <BlocReglement reglement={reglement} onReglement={setReglement} total={total} tentativesMax={contexte.parametres.tentativesMobile} /> : null}
        </div>
        <div className="grid gap-4 xl:sticky xl:top-20">
          <Recap titre={type === "auto" ? "Auto accompagné" : "Transport funéraire"} sousTitre={devis ? `${montant(devis.distanceKm)} km · zone ${devis.breakdown.zone}` : "Tarif au tonnage"}>
            {devis ? (
              <>
                <LigneRecap libelle={`${String(tonnes).replace(".", ",")} t × ${montant(devis.breakdown.ratePerTonneHt)} HT`} valeur={`${montant(devis.breakdown.totalHt)} HT`} />
                <LigneRecap libelle="Taxes" valeur={montant(devis.totalTtc - devis.breakdown.totalHt)} />
                <LigneRecap libelle="Total" valeur={xaf(devis.totalTtc)} fort />
              </>
            ) : (
              <p className="text-small text-ink-muted">{type === "auto" ? "Saisissez le billet et le tonnage." : "Choisissez la gare d'arrivée et le tonnage."}</p>
            )}
          </Recap>
          {erreur || erreurPaiement ? (
            <InlineMessage tone="danger" title="Enregistrement refusé.">
              {erreur || erreurPaiement}
            </InlineMessage>
          ) : null}
          {!resultat ? (
          <Button
            type="button"
            size="lg"
            block
            loading={enCours}
            loadingLabel="Enregistrement…"
            disabled={!peutVendre || !pret || total === undefined || !reglementPret(reglement, total).pret}
            onClick={soumettre}
          >
            {!pret ? (type === "auto" ? "Billet valide et propriétaire à saisir" : "Desserte, expéditeur et pièces à vérifier") : libelleAction(reglement, total, "Encaisser")}
          </Button>
          ) : null}
        </div>
      </div>
      {attente}
      {zone}
    </>
  )
}

function RecuPrestation({ type, expedition, total, expediteur, tonnes }: { type: "auto" | "funeraire"; expedition: string; total: number; expediteur: string; tonnes: number }) {
  return (
    <TicketThermique>
      <div className="text-center font-semibold">{type === "auto" ? "AUTO ACCOMPAGNÉ" : "TRANSPORT FUNÉRAIRE"}</div>
      <div className="text-center text-[18px] leading-tight font-semibold">{expedition}</div>
      <CodeTicket valeur={expedition} legende={`Code de la prestation ${expedition}`} />
      <LigneTicket gauche={expediteur || "Expéditeur"} droite={`${String(tonnes).replace(".", ",")} t`} />
      <LigneTicket gauche="Total" droite={<b>{xaf(total)}</b>} />
    </TicketThermique>
  )
}

/* ══════════════════════════════ Pages ═════════════════════════════════════ */

function CadreAnnexe({ children }: { children: (contexte: Contexte, peutVendre: boolean) => ReactNode }) {
  const { contexte, enLigne, caisseOuverte, peutVendre } = useGuichet()
  return (
    <CadreGuichet contexte={contexte}>
      {contexte ? (
        <>
          {!enLigne ? <HorsReseau /> : null}
          {!caisseOuverte ? <CaisseFermee /> : null}
          <LimiteErreur titre="Cet écran n'a pas pu être chargé.">{children(contexte, peutVendre)}</LimiteErreur>
        </>
      ) : (
        <ChargementEcran />
      )}
    </CadreGuichet>
  )
}

export function BaggageSalePageClient() {
  return (
    <Suspense fallback={null}>
      <PageBagage />
    </Suspense>
  )
}

function PageBagage() {
  const params = useSearchParams()
  return <CadreAnnexe>{(contexte, peutVendre) => <BaggageSaleScreen contexte={contexte} peutVendre={peutVendre} referenceInitiale={params.get("billet") ?? ""} />}</CadreAnnexe>
}

export function ParcelSalePageClient() {
  return <CadreAnnexe>{(contexte, peutVendre) => <ParcelSaleScreen contexte={contexte} peutVendre={peutVendre} />}</CadreAnnexe>
}

export function SpecialTransportPageClient({ initialType }: { initialType: "auto" | "funeraire" }) {
  return <CadreAnnexe>{(contexte, peutVendre) => <SpecialTransportScreen contexte={contexte} peutVendre={peutVendre} typeInitial={initialType} />}</CadreAnnexe>
}

