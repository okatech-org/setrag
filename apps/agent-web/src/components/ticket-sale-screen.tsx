"use client"

import { Banknote, Building2, CreditCard, Send, Smartphone, TriangleAlert, X } from "lucide-react"
import type { Route } from "next"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useRef, useState } from "react"

import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { signalerNavigation } from "@/coquille/filet-navigation"
import { MOYENS, libelleClasse, nomTrain, xaf, type ChoixMoyen } from "@/lib/agent-data"
import {
  effacerBrouillonVente,
  signatureTenue,
  useBrouillonVente,
  type BrouillonVente,
  type VoyageurBrouillon,
} from "@/lib/sale-draft"

import { CadreGuichet, ChargementEcran, useGuichet } from "./guichet/cadre"
import { POSTE, messageErreur, useEcriture, useLecture, type Desserte, type Paiement } from "./guichet/donnees"
import { BarreVente, CaisseFermee, EnTeteTunnel, HorsReseau } from "./guichet/elements"
import {
  AttentePaiement,
  REGLEMENT_INITIAL,
  estADistance,
  moyenBackend,
  reglementPret,
  saisirChiffre,
  type EtatReglement,
} from "./guichet/reglement"
import { EtapeEncaissement } from "./guichet/tunnel-encaissement"
import { EtapePlaces } from "./guichet/tunnel-places"
import { EtapeTrajet } from "./guichet/tunnel-trajet"
import { EtapeVoyageurs } from "./guichet/tunnel-voyageurs"
import {
  brouillonInitial,
  comptesDepuis,
  ordreCategories,
  resumeVente,
  voyageursPourComptes,
} from "./guichet/vente-billet"

/**
 * Vente d'un billet au guichet : Trajet → Places → Voyageurs → Encaissement.
 *
 * Les étapes vivent dans l'adresse (`?etape=`) : le bouton Retour du
 * navigateur remonte le tunnel. La saisie est gardée dans l'onglet, la tenue
 * des places dans Convex.
 */

type Etape = "trajet" | "places" | "voyageurs" | "encaissement"
const ETAPES: readonly Etape[] = ["trajet", "places", "voyageurs", "encaissement"]

const ICONE_MOYEN: Record<ChoixMoyen, typeof Banknote> = {
  especes: Banknote,
  airtel_money: Smartphone,
  moov_money: Smartphone,
  carte: CreditCard,
  clickpay: Send,
  en_compte: Building2,
}

/** Heure courante, rafraîchie chaque seconde tant qu'une tenue court. */
function useMaintenant(actif: boolean) {
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    if (!actif) return
    const minuterie = window.setInterval(() => setMaintenant(Date.now()), 1000)
    return () => window.clearInterval(minuterie)
  }, [actif])
  return maintenant
}

function tousPlaces(brouillon: BrouillonVente) {
  return brouillon.voyageurs.every((v) => Boolean(v.seatId))
}

function identitesCompletes(brouillon: BrouillonVente) {
  return brouillon.voyageurs.every((v) => v.nom.trim() && v.prenom.trim())
}

export function TicketSalePageClient() {
  return (
    <Suspense fallback={null}>
      <TunnelBillet />
    </Suspense>
  )
}

function TunnelBillet() {
  const router = useRouter()
  const params = useSearchParams()
  const demandee = (ETAPES as readonly string[]).includes(params.get("etape") ?? "") ? (params.get("etape") as Etape) : "trajet"
  const { contexte, enLigne, caisseOuverte, peutVendre } = useGuichet()
  const gares = useLecture(api.functions.referential.listStations, {})
  const categories = useLecture(api.functions.fareSchedules.publicDiscounts, {})
  const [brouillon, setBrouillon] = useBrouillonVente()
  const tenir = useEcriture(api.functions.guichet.tenirPlaces)
  const liberer = useEcriture(api.functions.guichet.libererTenue)
  const encaisser = useEcriture(api.functions.guichet.encaisserBillets)
  const annulerDemande = useEcriture(api.functions.guichet.annulerDemandePaiement)

  const [reglement, setReglement] = useState<EtatReglement>(REGLEMENT_INITIAL)
  const [enCours, setEnCours] = useState<null | "tenue" | "encaissement">(null)
  const [erreur, setErreur] = useState("")
  const [paiementId, setPaiementId] = useState<string | null>(null)
  const [tentative, setTentative] = useState(false)
  const maintenant = useMaintenant(Boolean(brouillon?.tenue))

  // Premier passage : un brouillon neuf, au départ de la gare du guichet.
  useEffect(() => {
    if (!brouillon && contexte && gares) setBrouillon(brouillonInitial(contexte, gares))
  }, [brouillon, contexte, gares, setBrouillon])

  const signature = brouillon ? signatureTenue(brouillon.desserte, brouillon.voyageurs) : ""
  const tenueFraiche = Boolean(brouillon?.tenue && brouillon.tenue.signature === signature && brouillon.tenue.finTenue > maintenant)
  const tenueExpiree = Boolean(brouillon?.tenue && brouillon.tenue.finTenue <= maintenant)
  const tenueActive = brouillon?.tenue && brouillon.tenue.finTenue > maintenant ? brouillon.tenue.finTenue : null

  // Une étape ne s'ouvre que si les précédentes sont faites.
  const accessible = (etape: Etape) => {
    if (!brouillon) return etape === "trajet"
    if (etape === "trajet") return true
    if (!brouillon.desserte) return false
    if (etape === "places") return true
    if (!tousPlaces(brouillon) || !brouillon.tenue) return false
    if (etape === "voyageurs") return true
    return identitesCompletes(brouillon)
  }
  const etape = [...ETAPES].slice(0, ETAPES.indexOf(demandee) + 1).reverse().find(accessible) ?? "trajet"

  const naviguer = useCallback(
    (suivante: Etape, remplacer: boolean) => {
      signalerNavigation()
      const href = (suivante === "trajet" ? "/vente/billet" : `/vente/billet?etape=${suivante}`) as Route
      if (remplacer) router.replace(href)
      else router.push(href)
      window.scrollTo({ top: 0 })
    },
    [router]
  )
  const aller = (suivante: Etape, remplacer = false) => {
    setErreur("")
    naviguer(suivante, remplacer)
  }

  // Une étape demandée trop tôt renvoie à la dernière étape accessible.
  const sortie = useRef(false)
  useEffect(() => {
    if (!sortie.current && brouillon && etape !== demandee) naviguer(etape, true)
  }, [brouillon, etape, demandee, naviguer])

  const maj = useCallback(
    (modifier: (courant: BrouillonVente) => BrouillonVente) => setBrouillon((courant) => (courant ? modifier(courant) : courant)),
    [setBrouillon]
  )

  /** Rend la tenue en cours, sans attendre : elle expirerait de toute façon. */
  const rendreTenue = useCallback(
    (venteId: string | undefined) => {
      if (venteId) void liberer({ venteId: venteId as never }).catch(() => undefined)
    },
    [liberer]
  )

  /* ── Tenue des places ───────────────────────────────────────────────── */
  const tenirMaintenant = useCallback(
    async (instantane: BrouillonVente) => {
      if (!instantane.desserte) return false
      setEnCours("tenue")
      setErreur("")
      try {
        const tenue = await tenir({
          tripId: instantane.desserte.tripId as never,
          originStationId: instantane.origineId as never,
          destinationStationId: instantane.arriveeId as never,
          serviceClass: instantane.desserte.classe,
          passagers: instantane.voyageurs.map((v) => ({
            seatId: v.seatId as never,
            discountCode: v.categorie || undefined,
          })),
          remplace: (instantane.tenue?.venteId as never) ?? undefined,
          deviceId: POSTE,
        })
        const signatureTenue_ = signatureTenue(instantane.desserte, instantane.voyageurs)
        maj((courant) => ({
          ...courant,
          tenue: {
            venteId: tenue.venteId,
            numero: tenue.numero,
            finTenue: tenue.finTenue,
            montants: tenue.montants,
            billets: tenue.billets.map((b) => ({ ...b, id: b.id, seatId: b.seatId })),
            signature: signatureTenue_,
          },
          voyageurs: courant.voyageurs.map((v, i) => ({
            ...v,
            voiture: tenue.billets[i]?.voiture ?? v.voiture,
            place: tenue.billets[i]?.place ?? v.place,
          })),
        }))
        return true
      } catch (cause) {
        setErreur(messageErreur(cause, "Les places n'ont pas pu être tenues."))
        return false
      } finally {
        setEnCours(null)
      }
    },
    [tenir, maj, setEnCours, setErreur]
  )

  // Catégorie changée à l'étape Voyageurs : le prix change, la tenue suit.
  const signatureDemandee = useRef("")
  useEffect(() => {
    if (!brouillon || etape !== "voyageurs" || enCours || !brouillon.tenue) return
    if (brouillon.tenue.signature === signature || tenueExpiree) return
    if (signatureDemandee.current === signature) return
    signatureDemandee.current = signature
    void tenirMaintenant(brouillon)
  }, [brouillon, etape, enCours, signature, tenueExpiree, tenirMaintenant])

  /* ── Encaissement ───────────────────────────────────────────────────── */
  const allerConfirmation = useCallback(
    (venteId: string, imprimer: boolean) => {
      // Le brouillon s'efface à l'arrivée sur la confirmation : l'effacer ici
      // ramènerait le tunnel au trajet avant que la navigation n'aboutisse.
      sortie.current = true
      setPaiementId(null)
      signalerNavigation()
      router.push(`/vente/confirmation/${venteId}${imprimer ? "?imprimer=1" : ""}` as Route)
    },
    [router, setPaiementId]
  )

  const encaisserMaintenant = async () => {
    if (!brouillon?.tenue) return
    setEnCours("encaissement")
    setErreur("")
    try {
      const resultat = await encaisser({
        venteId: brouillon.tenue.venteId as never,
        voyageurs: brouillon.voyageurs.map((v, i) => ({
          billetId: brouillon.tenue!.billets[i]!.id as never,
          lastName: v.nom,
          firstName: v.prenom,
          gender: v.civilite,
          phone: v.telephone.trim() || undefined,
        })),
        method: moyenBackend(reglement),
        tendered: reglement.moyen === "especes" ? Number(reglement.recu || 0) : undefined,
        payerPhone: estADistance(reglement.moyen) ? reglement.telephone : undefined,
        reference: reglement.reference.trim() || undefined,
        corporateAccountId: reglement.moyen === "en_compte" ? (reglement.compteId as never) : undefined,
      })
      if (resultat.statut === "en_attente" && resultat.paiementId) setPaiementId(resultat.paiementId)
      else allerConfirmation(resultat.venteId, brouillon.imprimer)
    } catch (cause) {
      setErreur(messageErreur(cause, "La vente n'a pas pu être encaissée."))
    } finally {
      setEnCours(null)
    }
  }

  /* ── Clavier : Entrée avance, lettres des moyens, chiffres des espèces ── */
  const etatClavier = useRef({ etape, reglement, paiementId })
  useEffect(() => {
    etatClavier.current = { etape, reglement, paiementId }
  })
  useEffect(() => {
    const ecouter = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const cible = event.target as HTMLElement | null
      if (document.querySelector("[role='dialog']") || etatClavier.current.paiementId) return
      const saisie = cible?.closest("input, textarea, select, [contenteditable='true']")
      if (event.key === "Enter") {
        if (cible?.closest("button, a, select, textarea, form, [role='radio']")) return
        const bouton = document.querySelector<HTMLButtonElement>("[data-action-principale]")
        if (bouton && !bouton.disabled) {
          event.preventDefault()
          bouton.click()
        }
        return
      }
      if (saisie || etatClavier.current.etape !== "encaissement") return
      const moyen = MOYENS.find((m) => m.touche === event.key.toUpperCase())
      if (moyen) {
        event.preventDefault()
        setReglement((r) => ({ ...r, moyen: moyen.code }))
        return
      }
      if (etatClavier.current.reglement.moyen === "especes" && (/^[0-9]$/.test(event.key) || event.key === "Backspace")) {
        event.preventDefault()
        setReglement((r) => ({ ...r, recu: saisirChiffre(r.recu, event.key === "Backspace" ? "⌫" : event.key) }))
      }
    }
    window.addEventListener("keydown", ecouter)
    return () => window.removeEventListener("keydown", ecouter)
  }, [])

  /* ── Rendu ──────────────────────────────────────────────────────────── */
  if (!contexte || !gares || !categories || !brouillon) {
    return (
      <CadreGuichet contexte={contexte}>
        <EnTeteTunnel titre="Vendre un billet" etape={0} />
        <ChargementEcran libelle="Préparation de la vente…" />
      </CadreGuichet>
    )
  }

  const desserte = brouillon.desserte
  const titreBarre = desserte ? `${nomTrain(desserte.trainType, desserte.trainNumber)} · ${libelleClasse(desserte.classe)}` : undefined
  const total = brouillon.tenue ? xaf(brouillon.tenue.montants.ttc) : undefined
  const abandonner = () => {
    rendreTenue(brouillon.tenue?.venteId)
    effacerBrouillonVente()
    setReglement(REGLEMENT_INITIAL)
    aller("trajet", true)
  }
  const index = ETAPES.indexOf(etape)
  const titres: Record<Etape, { titre: string; texte?: string }> = {
    trajet: { titre: "Vendre un billet" },
    places: { titre: "Choisir les places", texte: "Choisissez le voyageur, puis sa place. Les places sont tenues dès que vous passez à la saisie des voyageurs." },
    voyageurs: { titre: "Voyageurs", texte: "Nom tel qu'il figure sur la pièce d'identité : le contrôleur le compare à bord." },
    encaissement: { titre: "Encaissement" },
  }

  const messageTenue = tenueExpiree && etape !== "trajet" && (
    <InlineMessage tone="warning" title="Délai de tenue écoulé.">
      <span className="flex flex-wrap items-center gap-3">
        Les places ont été rendues à la vente.
        <Button type="button" variant="secondary" size="sm" loading={enCours === "tenue"} onClick={() => void tenirMaintenant(brouillon)}>
          Tenir à nouveau les places
        </Button>
      </span>
    </InlineMessage>
  )

  const pret = brouillon.tenue ? reglementPret(reglement, brouillon.tenue.montants.ttc) : { pret: false as const, raison: "" }
  const IconeMoyen = ICONE_MOYEN[reglement.moyen]

  return (
    <CadreGuichet contexte={contexte} className="flex min-h-[calc(100dvh-7rem)] flex-col">
      <EnTeteTunnel titre={titres[etape].titre} texte={titres[etape].texte} etape={index} />
      {!enLigne ? <HorsReseau /> : null}
      {!caisseOuverte ? <CaisseFermee /> : null}
      {messageTenue}
      {erreur ? (
        <InlineMessage tone="danger" title="Opération refusée.">
          {erreur}
        </InlineMessage>
      ) : null}
      {brouillon.tenue || brouillon.desserte ? (
        <div className="-mt-2 flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={abandonner}>
            <X aria-hidden />
            Abandonner la vente
          </Button>
        </div>
      ) : null}

      {etape === "trajet" ? (
        <EtapeTrajet
          brouillon={brouillon}
          gares={gares}
          categories={categories}
          bloque={!peutVendre}
          onCriteres={(criteres) =>
            maj((courant) => {
              const change = criteres.origineId !== courant.origineId || criteres.arriveeId !== courant.arriveeId || criteres.date !== courant.date
              if (!change) return courant
              rendreTenue(courant.tenue?.venteId)
              return { ...courant, ...criteres, desserte: null, tenue: null, voyageurs: courant.voyageurs.map(sansPlace) }
            })
          }
          onComptes={(comptes) =>
            maj((courant) => ({
              ...courant,
              comptes,
              voyageurs: voyageursPourComptes(comptes, ordreCategories(categories), courant.voyageurs),
            }))
          }
          onChoisir={(choisie: Desserte, classe) =>
            maj((courant) => {
              const memeDesserte = courant.desserte?.tripId === choisie.tripId && courant.desserte.classe === classe
              if (memeDesserte) return courant
              rendreTenue(courant.tenue?.venteId)
              return {
                ...courant,
                tenue: null,
                voyageurs: courant.voyageurs.map(sansPlace),
                desserte: {
                  tripId: choisie.tripId,
                  trainNumber: choisie.trainNumber,
                  trainType: choisie.trainType,
                  serviceDate: choisie.serviceDate,
                  departAt: choisie.departAt,
                  arriveeAt: choisie.arriveeAt,
                  fromIndex: choisie.fromIndex,
                  toIndex: choisie.toIndex,
                  distanceKm: choisie.distanceKm,
                  arretsIntermediaires: choisie.arretsIntermediaires,
                  delayMinutes: choisie.delayMinutes,
                  classe,
                },
              }
            })
          }
          onSuivant={() => aller("places")}
        />
      ) : null}

      {etape === "places" ? (
        <>
          <EtapePlaces
            brouillon={brouillon}
            categories={categories}
            tenueActive={tenueFraiche ? tenueActive : null}
            onVoyageurs={(voyageurs) => maj((courant) => ({ ...courant, voyageurs }))}
          />
          <BarreVente
            titre={titreBarre}
            resume={`${resumeVente(brouillon)} · ${brouillon.voyageurs.filter((v) => v.seatId).length} placé${brouillon.voyageurs.filter((v) => v.seatId).length > 1 ? "s" : ""}`}
            total={tenueFraiche ? total : undefined}
            retour={{ libelle: "Retour", onClick: () => aller("trajet") }}
            action={{
              libelle: "Saisir les voyageurs",
              touche: "Entrée",
              disabled: !peutVendre || !tousPlaces(brouillon),
              loading: enCours === "tenue",
              loadingLabel: "Tenue des places…",
              onClick: async () => {
                if (tenueFraiche || (await tenirMaintenant(brouillon))) aller("voyageurs")
              },
            }}
          />
        </>
      ) : null}

      {etape === "voyageurs" ? (
        <>
          <EtapeVoyageurs
            brouillon={brouillon}
            categories={categories}
            tenueActive={tenueActive}
            recalcul={enCours === "tenue"}
            erreurs={tentative}
            onVoyageur={(i, voyageur: VoyageurBrouillon) =>
              maj((courant) => {
                const voyageurs = courant.voyageurs.map((v, j) => (j === i ? voyageur : v))
                return { ...courant, voyageurs, comptes: comptesDepuis(voyageurs) }
              })
            }
            onOptions={(options) => maj((courant) => ({ ...courant, ...options }))}
          />
          <BarreVente
            titre={titreBarre}
            resume={resumeVente(brouillon)}
            total={total}
            retour={{ libelle: "Retour", onClick: () => aller("places") }}
            action={{
              libelle: "Passer à l'encaissement",
              touche: "Entrée",
              disabled: !peutVendre || enCours === "tenue",
              onClick: async () => {
                setTentative(true)
                if (!identitesCompletes(brouillon)) {
                  setErreur("Saisissez le nom et le prénom de chaque voyageur.")
                  return
                }
                if (!tenueFraiche && !(await tenirMaintenant(brouillon))) return
                const premier = brouillon.voyageurs.find((v) => v.telephone.trim())?.telephone ?? ""
                setReglement((r) => ({
                  ...r,
                  moyen: brouillon.conventionne ? "en_compte" : r.moyen,
                  telephone: r.telephone || premier,
                }))
                setTentative(false)
                aller("encaissement")
              },
            }}
          />
        </>
      ) : null}

      {etape === "encaissement" && brouillon.tenue ? (
        <>
          <EtapeEncaissement
            brouillon={brouillon}
            gares={gares}
            categories={categories}
            reglement={reglement}
            onReglement={setReglement}
            tentativesMax={contexte.parametres.tentativesMobile}
            tenueActive={tenueActive}
            disabled={enCours === "encaissement"}
          />
          <BarreVente
            titre={titreBarre}
            resume={resumeVente(brouillon)}
            total={total}
            retour={{ libelle: "Retour", onClick: () => aller("voyageurs") }}
            action={{
              icone: pret.pret ? IconeMoyen : TriangleAlert,
              libelle: !pret.pret
                ? pret.raison
                : estADistance(reglement.moyen)
                  ? `Envoyer la demande · ${xaf(brouillon.tenue.montants.ttc)}`
                  : `Encaisser ${xaf(brouillon.tenue.montants.ttc)}`,
              touche: "Entrée",
              disabled: !peutVendre || !pret.pret || !tenueFraiche,
              loading: enCours === "encaissement",
              loadingLabel: "Encaissement…",
              onClick: () => void encaisserMaintenant(),
            }}
          />
        </>
      ) : null}

      <AttentePaiement
        paiementId={paiementId}
        onConfirme={(paiement: Paiement) => allerConfirmation(paiement.vente?.id ?? brouillon.tenue?.venteId ?? "", brouillon.imprimer)}
        onEchec={(paiement: Paiement) => {
          setPaiementId(null)
          setErreur(`${paiement.raison ?? "Paiement refusé par l'opérateur."} Les places restent tenues : proposez un autre moyen de paiement.`)
        }}
        onAnnuler={() => {
          const id = paiementId
          setPaiementId(null)
          if (id) void annulerDemande({ paiementId: id as never }).catch(() => undefined)
        }}
      />
    </CadreGuichet>
  )
}

function sansPlace(voyageur: VoyageurBrouillon): VoyageurBrouillon {
  return { ...voyageur, seatId: undefined, place: undefined, voiture: undefined }
}
