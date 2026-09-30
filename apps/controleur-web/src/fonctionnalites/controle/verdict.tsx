"use client"

import {
  CircleCheckIcon,
  HistoryIcon,
  MapPinIcon,
  OctagonXIcon,
  SearchIcon,
  type LucideIcon,
} from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Tag } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

import { TERRAIN } from "@/composants/boutons"
import { CarteTitre } from "@/composants/carte-titre"
import { Message } from "@/composants/message"
import { PictoVerdict } from "@/composants/picto-verdict"
import { useApparence } from "@/coquille/apparence"
import { Bas, Corps } from "@/coquille/ecran"
import { humanError } from "@/lib/errors"
import { classeLongue, heure, jour } from "@/lib/format"
import { freshness } from "@/lib/offline/manifest"
import type {
  EmbarkedManifest,
  Verdict as VerdictLocal,
} from "@/lib/offline/types"
import { arretDeRang } from "@/lib/position"
import { preferences } from "@/lib/preferences"
import { retourDuVerdict } from "@/lib/retour"
import {
  enregistreLeControle,
  FAMILLE_DU_VERDICT,
  LIBELLE_SUITE,
  LIBELLE_VERDICT,
  sourceDuVerdict,
  suitesDuVerdict,
  type Famille,
  type Suite,
} from "@/lib/verdicts"

import { useTerminal } from "../terminal/contexte-terminal"
import { BilletTitre } from "./billet-titre"
import { useControle, type ResultatControle } from "./controle"

/** Délai du retour automatique au viseur, après un titre accepté. */
export const RETOUR_AUTO_MS = 1500

const FOND: Record<Famille, string> = {
  accepte: "bg-success-soft text-success-ink",
  vigilance: "verdict-vigilance bg-warning-soft pb-[25px] text-warning-ink",
  refus: "verdict-refus text-danger-ink",
  lecture: "bg-surface-sunk text-ink",
}

/** Un titre dont le trajet n'est plus acquis : la voie du billet est vide. */
const TRAJET_PERDU: VerdictLocal[] = [
  "annule",
  "rembourse",
  "non_paye",
  "expire",
]

/**
 * Le verdict, en plein écran. Il s'écrit en toutes lettres, en tête, avec sa
 * forme ; la source (signature ou manifeste) au-dessus du mot ; le billet du
 * voyageur dessous. Les actions sont en bas, au pouce — aucune dans le tiers
 * supérieur. Un seul bouton primaire, même quand trois suites sont possibles.
 */
export function Verdict({
  resultat,
  onFermer,
  onSaisir,
}: {
  resultat: ResultatControle
  /** Retour à l'écran d'origine : le viseur, la recherche, le plan. */
  onFermer: () => void
  /** Saisie du code à la main, quand l'écran d'origine la propose. */
  onSaisir?: () => void
}) {
  useApparence({ sansOnglets: true })
  const router = useRouter()
  const { manifest, settings } = useTerminal()
  const { enregistrer } = useControle()
  const famille = FAMILLE_DU_VERDICT[resultat.verdict]
  const suites = suitesDuVerdict(resultat.verdict)
  const [auto, setAuto] = useState(suites.retourAuto)
  const [enCours, setEnCours] = useState<Suite | null>(null)

  // Le retour physique accompagne l'apparition du verdict — vibration, et son
  // si l'agent ne l'a pas coupé.
  useEffect(() => {
    retourDuVerdict(FAMILLE_DU_VERDICT[resultat.verdict], {
      son: preferences().son,
    })
  }, [resultat])

  async function agir(suite: Suite) {
    if (enCours) return
    setAuto(false)
    const ref =
      resultat.ticket?.number ??
      resultat.subscription?.cardNumber ??
      resultat.payload?.ref
    setEnCours(suite)
    try {
      if (enregistreLeControle(resultat.verdict, suite))
        await enregistrer(resultat)
      const params = new URLSearchParams()
      if (ref) params.set("titre", ref)
      params.set("motif", resultat.verdict)
      switch (suite) {
        case "valider":
        case "continuer":
        case "accepter":
        case "fermer":
        case "rescanner":
          onFermer()
          return
        case "saisir":
          if (onSaisir) onSaisir()
          else router.push("/scan")
          return
        case "regulariser":
        case "vendre":
          router.push(`/vente?${params.toString()}` as Route)
          return
        case "pv":
          router.push(`/pv?${params.toString()}` as Route)
          return
        case "chercher":
          router.push(
            (ref
              ? `/recherche?ref=${encodeURIComponent(ref)}`
              : "/recherche") as Route
          )
          return
        case "signaler": {
          const signalement = new URLSearchParams({
            categorie: "technique",
            description: `Titre ${ref ?? "sans référence"} signé avec une clé de signature inconnue du terminal (${resultat.reason ?? "clé hors service"}). À vérifier par l'exploitation.`,
          })
          router.push(`/incident?${signalement.toString()}` as Route)
          return
        }
      }
    } catch (error) {
      toast.error(humanError(error))
      setEnCours(null)
    }
  }

  // Titre accepté : retour au viseur après 1,5 s, pour contrôler en rafale.
  // Toucher l'écran annule le retour.
  useEffect(() => {
    if (!auto) return
    const minuteur = window.setTimeout(
      () => void agir("valider"),
      RETOUR_AUTO_MS
    )
    return () => window.clearTimeout(minuteur)
    // `agir` se recrée à chaque rendu ; seul l'état du retour compte ici.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto])

  if (!manifest) return null

  return (
    <div
      className="flex flex-1 flex-col"
      onPointerDownCapture={() => setAuto(false)}
    >
      <header
        aria-live="assertive"
        className={cn(
          "relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-0.5 px-5 pt-4 pb-[18px]",
          FOND[famille]
        )}
      >
        <PictoVerdict famille={famille} className="row-span-2 size-[62px]" />
        <p className="self-end text-[11.5px] font-bold tracking-[0.07em] uppercase opacity-90">
          {sourceDuVerdict(resultat)}
        </p>
        <h1 className="self-start text-[36px] leading-[1.02] font-bold tracking-[-0.015em]">
          {LIBELLE_VERDICT[resultat.verdict]}
        </h1>
        {famille !== "accepte" && resultat.reason && (
          <p className="col-span-2 mt-2.5 text-[15px] leading-[1.4] font-semibold">
            {resultat.reason}
          </p>
        )}
      </header>

      <Corps className="pt-4">
        <Contenu
          resultat={resultat}
          manifest={manifest}
          gareCourante={settings.currentStopIndex}
        />
      </Corps>

      <Bas>
        <Button
          size="lg"
          block
          className={TERRAIN}
          loading={enCours === suites.principale}
          disabled={Boolean(enCours) && enCours !== suites.principale}
          onClick={() => void agir(suites.principale)}
        >
          {LIBELLE_SUITE[suites.principale]}
        </Button>
        {suites.retourAuto && (
          <p
            className="text-center text-[12.5px] font-medium text-ink-muted"
            aria-live="polite"
          >
            {auto ? (
              <>
                Retour au viseur dans{" "}
                <span className="tabular text-ink">1,5</span>
                {" "}s · touchez l&apos;écran pour rester
              </>
            ) : (
              "Retour automatique annulé."
            )}
          </p>
        )}
        {suites.secondaires.map((suite) => (
          <Button
            key={suite}
            variant="secondary"
            block
            className={TERRAIN}
            loading={enCours === suite}
            disabled={Boolean(enCours) && enCours !== suite}
            onClick={() => void agir(suite)}
          >
            {LIBELLE_SUITE[suite]}
          </Button>
        ))}
        {suites.discretes.map((suite) => (
          <Button
            key={suite}
            variant="ghost"
            block
            disabled={Boolean(enCours)}
            onClick={() => void agir(suite)}
          >
            {LIBELLE_SUITE[suite]}
          </Button>
        ))}
      </Bas>
    </div>
  )
}

function Pastilles({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>
}

function Pastille({
  ton,
  icone: Icone,
  children,
}: {
  ton: "success" | "warning" | "danger" | "neutral"
  icone?: LucideIcon
  children: ReactNode
}) {
  return (
    <Tag tone={ton} className="h-[30px] text-[13px] [&>svg]:size-[15px]">
      {Icone && <Icone aria-hidden />}
      {children}
    </Tag>
  )
}

/** Ce que le verdict montre sous le bandeau, selon ce que l'on sait du titre. */
function Contenu({
  resultat,
  manifest,
  gareCourante,
}: {
  resultat: ResultatControle
  manifest: EmbarkedManifest
  gareCourante: number
}) {
  const { verdict, ticket, subscription, payload } = resultat

  if (verdict === "illisible") {
    return (
      <CarteTitre titre="Ce n'est pas un verdict sur le voyageur">
        <p>
          Faites présenter le code à nouveau, écran à pleine luminosité, ou
          allumez la lampe. Sur papier, dépliez le billet.
        </p>
      </CarteTitre>
    )
  }

  if (verdict === "contrefait") {
    return (
      <>
        <CarteTitre titre="Aucune identité" vide>
          <p>
            Un code que la clé SETRAG ne reconnaît pas ne dit rien de son
            porteur. Le verdict est certain, même sans réseau.
          </p>
        </CarteTitre>
        <Pastilles>
          <Pastille ton="danger" icone={OctagonXIcon}>
            signature non valide
          </Pastille>
        </Pastilles>
      </>
    )
  }

  return (
    <>
      {ticket ? (
        <BilletTitre
          manifest={manifest}
          ticket={ticket}
          trajetAcquis={!TRAJET_PERDU.includes(verdict)}
        />
      ) : subscription ? (
        <CarteTitre titre={`Abonnement ${subscription.cardNumber}`}>
          <p>
            {classeLongue(subscription.serviceClass)} · abonnement{" "}
            {subscription.kind}
          </p>
          <p>
            Valable du{" "}
            <span className="tabular">{jour(subscription.validFrom)}</span> au{" "}
            <span className="tabular">{jour(subscription.validUntil)}</span>
          </p>
        </CarteTitre>
      ) : payload ? (
        <CarteTitre titre="Ce que dit le code">
          <p>
            {verdict === "cle_hors_service"
              ? `Titre signé avec la clé v${payload.k}, que ce terminal ne connaît pas`
              : verdict === "inconnu"
                ? "Titre authentique, absent du manifeste embarqué"
                : "Titre authentique"}
            {payload.date && (
              <>
                , circulation du{" "}
                <span className="tabular">
                  {payload.date.slice(8, 10)}/{payload.date.slice(5, 7)}
                </span>
              </>
            )}{" "}
            · {classeLongue(payload.cls)}
          </p>
          <p className="tabular text-[12.5px]">N° {payload.ref}</p>
        </CarteTitre>
      ) : null}

      <Pastilles>
        {verdict === "valide" && (
          <>
            <Pastille ton="success" icone={CircleCheckIcon}>
              segment couvert
            </Pastille>
            <Pastille ton="success" icone={CircleCheckIcon}>
              1er contrôle
            </Pastille>
          </>
        )}
        {verdict === "abonnement" && (
          <Pastille ton="success" icone={CircleCheckIcon}>
            abonnement en cours de validité
          </Pastille>
        )}
        {verdict === "deja_controle" && (
          <Pastille ton="warning" icone={HistoryIcon}>
            anti-repassage
            {resultat.firstScanAt ? (
              <>
                {" · 1er contrôle "}
                <span className="tabular">{heure(resultat.firstScanAt)}</span>
              </>
            ) : (
              " · selon le manifeste"
            )}
          </Pastille>
        )}
        {resultat.manuel && (
          <Pastille ton="neutral" icone={SearchIcon}>
            recherche manuelle
          </Pastille>
        )}
      </Pastilles>

      {verdict === "hors_segment" && payload && (
        <Portee
          manifest={manifest}
          gareCourante={gareCourante}
          de={payload.from}
          a={payload.to}
        />
      )}

      {resultat.fromManifest && (
        <Message titre="Information issue du manifeste embarqué.">
          Mis à jour {freshness(manifest)}. La signature du titre, elle, est
          vérifiée localement sans réseau.
        </Message>
      )}
    </>
  )
}

/** L'écart entre la position du train et la portée du titre, en gares et en PK. */
function Portee({
  manifest,
  gareCourante,
  de,
  a,
}: {
  manifest: EmbarkedManifest
  gareCourante: number
  de: number
  a: number
}) {
  const ici = arretDeRang(manifest, gareCourante)
  const debut = arretDeRang(manifest, de)
  const fin = arretDeRang(manifest, a)
  const avant = gareCourante < de
  return (
    <p className="flex items-start gap-2 text-[13px] font-semibold text-danger-ink">
      <MapPinIcon aria-hidden className="mt-px size-4 shrink-0" />
      <span>
        Train{" "}
        {ici ? `après ${ici.name} (PK ${ici.kilometerPoint})` : "en route"} ·
        titre valable{" "}
        {avant
          ? `à partir de ${debut?.name ?? "?"} (PK ${debut?.kilometerPoint ?? "?"})`
          : `jusqu'à ${fin?.name ?? "?"} (PK ${fin?.kilometerPoint ?? "?"})`}
      </span>
    </p>
  )
}
