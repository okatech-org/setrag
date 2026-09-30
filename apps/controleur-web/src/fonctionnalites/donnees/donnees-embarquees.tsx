"use client"

import {
  KeyRoundIcon,
  ReceiptIcon,
  RouteIcon,
  TrainFrontIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useConvex } from "convex/react"

import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Tag } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

import { INACTIF_EXPLIQUE, TERRAIN } from "@/composants/boutons"
import { Ligne, Liste } from "@/composants/liste"
import { Message } from "@/composants/message"
import { Progression } from "@/composants/progression"
import { Bas, BarreApp, Corps, Note } from "@/coquille/ecran"
import { humanError } from "@/lib/errors"
import { listTickets } from "@/lib/offline/db"
import { downloadManifest, freshness, type DownloadProgress } from "@/lib/offline/manifest"
import type { TerminalSettings } from "@/lib/offline/types"
import { memeVoiture } from "@/lib/train"
import { nomDuTrain } from "@/lib/train"

import { useTerminal } from "../terminal/contexte-terminal"

/**
 * Données embarquées — ce que le terminal emporte, et d'où il le tient.
 *
 * Dernière étape avec réseau. L'écran ne cache pas ce qu'il fait : il annonce
 * le volume, montre l'avancement par lot — une voie que le ruban remplit — et
 * laisse interrompre : les lots déjà écrits restent acquis, et la reprise
 * repart du dernier curseur confirmé.
 */
export function DonneesEmbarquees() {
  const convex = useConvex()
  const router = useRouter()
  const parametres = useSearchParams()
  const { manifest, online, authenticated, refresh, settings, updateSettings } = useTerminal()
  // Le manifeste vient du serveur : réseau ET session reconnue.
  const pret = online && authenticated
  const [progres, setProgres] = useState<DownloadProgress | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [echec, setEchec] = useState<string | null>(null)
  const interrompre = useRef<AbortController | null>(null)
  const demarre = useRef(false)

  const tripId = settings.activeTripId
  // Un manifeste d'une autre desserte ne vaut pas pour celle-ci.
  const embarque = manifest && manifest.tripId === tripId ? manifest : null

  const telecharger = useCallback(async () => {
    if (!tripId) {
      toast.error("Choisissez d'abord une desserte sur la tournée.")
      return
    }
    setEchec(null)
    setEnCours(true)
    const controleur = new AbortController()
    interrompre.current = controleur
    try {
      await downloadManifest(
        tripId,
        {
          fetchHeader: (args) =>
            convex.query(api.functions.control.manifest, {
              tripId: args.tripId as never,
              includeTickets: args.includeTickets,
            }),
          fetchTickets: (args) =>
            convex.query(api.functions.control.manifestTickets, {
              tripId: args.tripId as never,
              cursor: args.cursor,
              pageSize: args.pageSize,
            }),
        },
        {
          pageSize: 100,
          resume: embarque ?? undefined,
          onProgress: setProgres,
          signal: controleur.signal,
        }
      )
      await choisirVoitureParDefaut(tripId, settings.coachLabel, updateSettings)
      await refresh()
    } catch (error) {
      // Ce qui est déjà écrit reste utilisable : on le dit, plutôt que de
      // laisser croire à une perte totale.
      setEchec(humanError(error))
      await refresh()
    } finally {
      setEnCours(false)
      interrompre.current = null
    }
  }, [convex, embarque, refresh, settings.coachLabel, tripId, updateSettings])

  // Arrivée depuis la prise de service : le téléchargement part seul, une
  // fois le serveur joignable. Choisir, puis télécharger : l'agent a déjà
  // fait le second geste.
  const auto = parametres.get("telecharger") === "1"
  useEffect(() => {
    if (!auto || !pret || !tripId || demarre.current) return
    // Le drapeau n'est posé qu'au départ effectif : un rendu qui annulerait
    // le minuteur avant son échéance ne doit pas empêcher le téléchargement.
    const minuteur = window.setTimeout(() => {
      demarre.current = true
      router.replace("/manifeste")
      void telecharger()
    }, 0)
    return () => window.clearTimeout(minuteur)
  }, [auto, pret, router, telecharger, tripId])

  const fait = enCours && progres ? progres.received : (embarque?.downloadedCount ?? 0)
  const total = enCours && progres ? progres.total : (embarque?.ticketCount ?? 0)
  const lot = progres?.batch
  const nomDesserte = embarque
    ? `${nomDuTrain(embarque)} · ${embarque.originName} → ${embarque.destinationName}`
    : (settings.activeTripLabel ?? (tripId ? "Desserte choisie" : "Aucune desserte choisie"))

  return (
    <>
      <BarreApp retour="/tournee" titre="Données embarquées" sousTitre={nomDesserte} />
      <Corps>
        {!tripId && (
          <Message ton="alerte" titre="Aucune desserte choisie.">
            Revenez à la tournée pour désigner la desserte que vous contrôlez.
          </Message>
        )}
        {echec && (
          <Message ton="danger" titre="Téléchargement interrompu.">
            {echec} — {embarque?.downloadedCount ?? 0} titres sur {embarque?.ticketCount ?? 0}{" "}
            sont embarqués. La reprise repartira du dernier lot confirmé.
          </Message>
        )}
        {embarque?.complete && !enCours && !echec && (
          <Message ton="ok" titre="Données embarquées à jour.">
            Mises à jour {freshness(embarque)}.
          </Message>
        )}
        {embarque && !embarque.complete && !enCours && !echec && (
          <Message ton="alerte" titre="Manifeste incomplet.">
            {embarque.ticketCount - embarque.downloadedCount} titres manquent :
            l&apos;absence d&apos;un titre ne vaudra pas preuve. Reprenez le
            téléchargement avant de quitter la gare.
          </Message>
        )}
        {!pret && (
          <Message
            ton="alerte"
            titre={
              online
                ? "Téléchargement impossible : session non reconnue."
                : "Téléchargement impossible sans réseau."
            }
          >
            {online
              ? "Il reprendra dès que le serveur aura reconnu la session."
              : "Ce qui est déjà embarqué reste utilisable pour contrôler."}
          </Message>
        )}

        {(embarque || enCours) && (
          <Progression
            titre="Titres de la desserte"
            fait={fait}
            total={total}
            note={
              enCours
                ? `Lot ${lot ?? 1} · téléchargement par lots, reprenable. Ne quittez pas la gare avant la fin.`
                : "Téléchargement par lots, reprenable."
            }
          />
        )}

        {embarque && (
          <>
            <Liste>
              <Ligne
                icone={KeyRoundIcon}
                libelle="Clé publique de signature"
                fin={<span className="tabular">Ed25519 · v{embarque.signing.keyVersion}</span>}
              />
              <Ligne
                icone={RouteIcon}
                libelle="Barème kilométrique"
                detail={embarque.fare?.label}
                fin={
                  embarque.fare ? (
                    <span>
                      <span className="tabular">{embarque.stops.length}</span> gares
                    </span>
                  ) : (
                    "absent"
                  )
                }
              />
              <Ligne
                icone={ReceiptIcon}
                libelle="Barème des amendes"
                fin={
                  <span>
                    <span className="tabular">{embarque.penalties.length}</span> motifs
                  </span>
                }
              />
              <Ligne
                icone={TrainFrontIcon}
                libelle="Composition du train"
                fin={
                  embarque.composition?.length ? (
                    <span>
                      <span className="tabular">{embarque.composition.length}</span> voitures
                    </span>
                  ) : (
                    "à mettre à jour"
                  )
                }
              />
            </Liste>
            {embarque.signing.isDemoKey && (
              <div className="flex flex-wrap gap-1.5">
                <Tag tone="warning" className="h-[30px] text-[13px]">
                  <KeyRoundIcon aria-hidden />
                  clé de démonstration
                </Tag>
              </div>
            )}
            {!embarque.fare && (
              <Message ton="alerte" titre="Aucun barème kilométrique embarqué.">
                La vente à bord sera refusée : le terminal ne peut pas annoncer un
                prix qu&apos;il ne sait pas calculer.
              </Message>
            )}
            <Note>
              Les données restent sur ce terminal. Elles s&apos;effacent à la
              purge de fin de tournée, une fois tout confirmé.
            </Note>
          </>
        )}
      </Corps>
      <Bas>
        {enCours ? (
          <>
            <Button size="lg" block className={TERRAIN} loading loadingLabel="Téléchargement…">
              Téléchargement…
            </Button>
            <Button
              variant="secondary"
              block
              className={TERRAIN}
              onClick={() => {
                interrompre.current?.abort()
                toast.info("Interrompu — les lots déjà écrits sont conservés.")
              }}
            >
              Interrompre — garder les lots déjà écrits
            </Button>
          </>
        ) : embarque ? (
          <>
            <Button size="lg" block className={TERRAIN} asChild>
              <Link href="/scan">
                {embarque.complete ? "Commencer le contrôle" : "Contrôler avec ce qui est embarqué"}
              </Link>
            </Button>
            <Button
              variant="secondary"
              block
              className={cn(TERRAIN, INACTIF_EXPLIQUE)}
              disabled={!pret}
              onClick={() => void telecharger()}
            >
              {!pret
                ? "Mise à jour impossible sans réseau"
                : embarque.complete
                  ? "Mettre à jour le manifeste"
                  : "Reprendre où l'on s'est arrêté"}
            </Button>
          </>
        ) : (
          <Button
            size="lg"
            block
            className={cn(TERRAIN, INACTIF_EXPLIQUE)}
            disabled={!pret || !tripId}
            onClick={() => void telecharger()}
          >
            {!pret ? "Téléchargement impossible sans réseau" : "Télécharger le manifeste"}
          </Button>
        )}
      </Bas>
    </>
  )
}

/**
 * Voiture contrôlée par défaut : celle qui porte le plus de titres, tant que
 * la voiture retenue n'en porte aucun. L'agent la change d'un geste sur le
 * viseur ; au moins l'écran ne s'ouvre-t-il pas sur une voiture vide.
 */
async function choisirVoitureParDefaut(
  tripId: string,
  courante: string,
  modifier: (patch: Partial<TerminalSettings>) => Promise<void>
) {
  const titres = await listTickets(tripId)
  const parVoiture = new Map<string, number>()
  for (const titre of titres) {
    if (!titre.coachLabel || (titre.status !== "valide" && titre.status !== "utilise")) continue
    parVoiture.set(titre.coachLabel, (parVoiture.get(titre.coachLabel) ?? 0) + 1)
  }
  if ([...parVoiture.keys()].some((repere) => memeVoiture(repere, courante))) return
  const [meilleure] = [...parVoiture.entries()].sort((a, b) => b[1] - a[1])
  if (meilleure) await modifier({ coachLabel: meilleure[0] })
}
