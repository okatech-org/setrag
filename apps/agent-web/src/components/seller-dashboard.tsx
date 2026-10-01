"use client"

import {
  Banknote,
  CircleCheck,
  Coins,
  History,
  Luggage,
  Package,
  RotateCcw,
  Search,
  Ticket,
  TrainFront,
  type LucideIcon,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { api } from "@workspace/backend/generated"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { BandeauTrafic } from "@workspace/ui/voyage/bandeau-trafic"
import { PastilleDesserte } from "@workspace/ui/voyage/statut"
import { cn } from "@workspace/ui/lib/utils"

import {
  EnTetePage,
  Indicateur,
  Indicateurs,
  LienBouton,
  Panneau,
} from "@/components/charte"
import { signalerNavigation } from "@/coquille/filet-navigation"
import { useToucheRaccourci } from "@/coquille/raccourcis"
import {
  dateCourte,
  heure,
  jourDeService,
  libelleProduit,
  montant,
  montantSigne,
  nomTrain,
  xaf,
} from "@/lib/agent-data"

import {
  CadreGuichet,
  ChargementEcran,
  LimiteErreur,
  useGuichet,
} from "./guichet/cadre"
import { useLecture, type Accueil, type Contexte } from "./guichet/donnees"
import { CaisseFermee, HorsReseau, Touche } from "./guichet/elements"

/* ═════════════════════════════ Raccourcis ═════════════════════════════════ */

// La touche de chaque tuile est celle du menu, telle que l'agent l'a réglée.
const RACCOURCIS: readonly {
  href: string
  titre: string
  aide: string
  icone: LucideIcon
  vente: boolean
}[] = [
  {
    href: "/vente/billet",
    titre: "Vendre un billet",
    aide: "Trajet, places, voyageurs, encaissement",
    icone: Ticket,
    vente: true,
  },
  {
    href: "/vente/bagage",
    titre: "Bagage",
    aide: "Rattaché à un billet, 30 kg au plus",
    icone: Luggage,
    vente: true,
  },
  {
    href: "/vente/colis",
    titre: "Colis express",
    aide: "Tarif par zone et palier de poids",
    icone: Package,
    vente: true,
  },
  {
    href: "/vente/operations",
    titre: "Après-vente",
    aide: "Duplicata, annulation, remboursement",
    icone: RotateCcw,
    vente: false,
  },
]

export function RaccourciProduit({
  href,
  titre,
  aide,
  icone: Icone,
  principal,
  indisponible,
}: {
  href: string
  titre: string
  aide: string
  icone: LucideIcon
  principal?: boolean
  /** Raison écrite de l'indisponibilité (caisse fermée, réseau perdu). */
  indisponible?: string
}) {
  const touche = useToucheRaccourci(href)
  const classes = cn(
    "relative grid min-h-32 content-start gap-2 rounded-md border p-4 text-left transition-[border-color,box-shadow,transform] duration-[var(--dur-fast)]",
    principal
      ? "border-accent-base bg-accent-base text-ink-inverse"
      : "border-line bg-surface text-ink hover:border-accent-line hover:shadow-[var(--sh-md)]",
    indisponible ? "cursor-not-allowed opacity-55" : "active:scale-[0.99]"
  )
  const contenu = (
    <>
      <Icone
        aria-hidden
        className={cn(
          "size-7 stroke-[1.8]",
          principal ? "text-ink-inverse/80" : "text-accent-ink"
        )}
      />
      <b className="pr-8 text-[17px] font-bold">{titre}</b>
      <small
        className={cn(
          "text-small",
          principal ? "text-ink-inverse/80" : "text-ink-muted"
        )}
      >
        {indisponible ?? aide}
      </small>
      {touche ? (
        <Touche surAccent={principal} className="absolute top-4 right-4">
          {touche}
        </Touche>
      ) : null}
      {principal ? (
        <span
          aria-hidden
          className="bg-ruban absolute right-4 bottom-3 left-4 h-1 rounded-[2px]"
        />
      ) : null}
    </>
  )
  if (indisponible) {
    return (
      <div
        role="link"
        aria-disabled="true"
        aria-label={`${titre} — ${indisponible}`}
        className={classes}
      >
        {contenu}
      </div>
    )
  }
  return (
    <Link
      href={href as Route}
      className={classes}
      onClick={() => signalerNavigation()}
    >
      {contenu}
    </Link>
  )
}

/* ══════════════════════════════ Écran ═════════════════════════════════════ */

export function SellerDashboardScreen({
  contexte,
  accueil,
  enLigne,
  onOuvrirOperation,
}: {
  contexte: Contexte
  accueil: Accueil | undefined
  enLigne: boolean
  onOuvrirOperation: (id: string) => void
}) {
  const caisse = contexte.session
  const blocage = !enLigne
    ? "Réseau perdu : carnet de secours"
    : !caisse
      ? "Caisse fermée : ouvrez-la d'abord"
      : undefined
  const prenom = contexte.seller.firstName ?? "à vous"
  const station = contexte.pointOfSale.stationName ?? contexte.pointOfSale.name

  return (
    <>
      <EnTetePage
        surtitre={`${contexte.pointOfSale.name} · ${dateCourte(jourDeService(), true)}`}
        titre={`Bonjour ${prenom}`}
        description={
          caisse
            ? `Caisse ouverte à ${heure(caisse.openedAt)} avec ${xaf(caisse.openingFloatXaf)}. Les chiffres se mettent à jour à chaque vente.`
            : "La caisse est fermée : ouvrez-la avec son fonds pour commencer à vendre."
        }
        actions={
          <LienBouton href="/vente/operations">
            <Search aria-hidden />
            Rechercher une opération
          </LienBouton>
        }
      />
      {!enLigne ? <HorsReseau /> : null}
      {!caisse ? <CaisseFermee /> : null}

      {(accueil?.trafic ?? []).map((t) => (
        <BandeauTrafic
          key={t.tripId}
          arrondi
          titre={
            t.status === "annule"
              ? `${nomTrain(t.trainType, t.trainNumber)} du ${dateCourte(t.serviceDate)} : supprimé.`
              : `${nomTrain(t.trainType, t.trainNumber)} : départ à ${heure(t.departAt + t.delayMinutes * 60_000)} au lieu de ${heure(t.departAt)}.`
          }
        >
          {t.status === "annule"
            ? "Proposez un autre train ; le remboursement se fait sans pénalité."
            : "Prévenez les voyageurs au guichet ; les billets restent valables."}
        </BandeauTrafic>
      ))}

      <nav
        aria-label="Produits du guichet"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {RACCOURCIS.map((r, index) => (
          <RaccourciProduit
            key={r.href}
            {...r}
            principal={index === 0}
            indisponible={r.vente ? blocage : undefined}
          />
        ))}
      </nav>

      {accueil === undefined ? (
        <ChargementEcran libelle="Chargement des indicateurs…" />
      ) : (
        <>
          <Indicateurs>
            <Indicateur
              fort
              libelle="Encaissé aujourd'hui"
              icone={Coins}
              valeur={montant(accueil.indicateurs.encaisse)}
              unite="XAF"
              evolution={{
                sens: "neutre",
                texte: `${accueil.indicateurs.operations} opération${accueil.indicateurs.operations > 1 ? "s" : ""}`,
              }}
            />
            <Indicateur
              libelle="Billets émis"
              icone={Ticket}
              valeur={accueil.indicateurs.billets}
              evolution={{
                sens: "neutre",
                texte: `dont ${accueil.indicateurs.enfants} enfant${accueil.indicateurs.enfants > 1 ? "s" : ""}`,
              }}
            />
            <Indicateur
              libelle="Espèces attendues"
              icone={Banknote}
              valeur={montant(accueil.indicateurs.especesAttendues)}
              unite="XAF"
              evolution={{ sens: "neutre", texte: "fonds compris" }}
            />
            <Indicateur
              libelle="Annulations et remboursements"
              icone={RotateCcw}
              valeur={accueil.indicateurs.sorties}
              evolution={{
                sens: "neutre",
                texte: accueil.indicateurs.sorties
                  ? `${montantSigne(accueil.indicateurs.sortiesMontant)} XAF`
                  : "aucun aujourd'hui",
              }}
            />
          </Indicateurs>

          {/* Sur grand écran, départs et opérations occupent toute la hauteur
              restante ; chaque liste défile dans son bloc. */}
          <div className="grid gap-4 xl:min-h-[320px] xl:flex-1 xl:basis-0 xl:grid-cols-2">
            <ProchainsDeparts accueil={accueil} station={station} />
            <DernieresOperations
              accueil={accueil}
              onOuvrir={onOuvrirOperation}
            />
          </div>
        </>
      )}
    </>
  )
}

/** Heure de Libreville, rafraîchie à la minute ; vide avant hydratation. */
function useHorloge() {
  const [maintenant, setMaintenant] = useState<number | null>(null)
  useEffect(() => {
    let minuteur = 0
    const battre = () => {
      const t = Date.now()
      setMaintenant(t)
      minuteur = window.setTimeout(battre, 60_000 - (t % 60_000) + 250)
    }
    battre()
    return () => window.clearTimeout(minuteur)
  }, [])
  return maintenant === null ? "" : heure(maintenant)
}

/**
 * Prochains départs, comme le tableau d'affichage en gare : fond encre, heures
 * en jaune, horloge de Libreville. Fond encre dans les deux thèmes : les
 * pastilles y prennent les teintes du thème sombre.
 */
function ProchainsDeparts({
  accueil,
  station,
}: {
  accueil: Accueil
  station: string
}) {
  const horloge = useHorloge()
  return (
    <section
      data-theme="dark"
      aria-label={`Prochains départs de ${station}`}
      className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-brand-encre text-[oklch(0.97_0.006_257)]"
    >
      <header className="flex items-center gap-3 border-b border-[oklch(0.32_0.02_257)] px-5 py-3.5">
        <TrainFront aria-hidden className="size-5" />
        <h2 className="text-[16px] font-bold">
          Prochains départs de {station}
        </h2>
        {horloge ? (
          <span className="tabular ml-auto text-[18px] font-semibold text-brand-jaune">
            {horloge}
          </span>
        ) : null}
      </header>
      {accueil.departs.length === 0 ? (
        <div className="grid justify-items-center gap-3 px-5 py-8 text-center">
          <b className="text-[16px]">
            Plus aucun départ aujourd&apos;hui ni demain
          </b>
          <p className="text-[14px] text-[oklch(0.78_0.016_257)]">
            Les dessertes des jours suivants se vendent depuis la vente de
            billet.
          </p>
          <LienBouton href="/vente/billet">Vendre un billet</LienBouton>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-[11.5px] font-semibold tracking-[0.06em] text-[oklch(0.7_0.02_257)] uppercase">
                <th scope="col" className="px-5 pt-2.5 pb-1.5">
                  Départ
                </th>
                <th scope="col" className="px-2 pt-2.5 pb-1.5">
                  Destination
                </th>
                <th scope="col" className="px-2 pt-2.5 pb-1.5 text-center">
                  2e
                </th>
                <th scope="col" className="px-2 pt-2.5 pb-1.5 text-center">
                  1re
                </th>
                <th scope="col" className="px-5 pt-2.5 pb-1.5">
                  État
                </th>
              </tr>
            </thead>
            <tbody>
              {accueil.departs.map((d) => (
                <tr
                  key={d.tripId}
                  className="border-t border-[oklch(0.28_0.02_257)] align-middle"
                >
                  <td className="w-[96px] py-3 pl-5">
                    <span className="tabular block text-[20px] font-semibold text-brand-jaune">
                      {heure(d.departAt)}
                    </span>
                    <small className="block text-[12px] text-[oklch(0.7_0.02_257)]">
                      {dateCourte(d.serviceDate)}
                    </small>
                  </td>
                  <td className="px-2 py-3">
                    <b className="block text-[16px] font-bold">
                      {d.destination ?? "—"}
                    </b>
                    <small className="block text-[12.5px] text-[oklch(0.72_0.02_257)]">
                      {nomTrain(d.trainType, d.trainNumber)}
                    </small>
                  </td>
                  {(["DEUXIEME", "PREMIERE"] as const).map((classe) => (
                    <td
                      key={classe}
                      className="tabular w-[64px] px-2 py-3 text-center text-[18px] font-semibold"
                    >
                      {d.disponibles[classe] ?? "—"}
                    </td>
                  ))}
                  <td className="py-3 pr-5 pl-2">
                    <PastilleDesserte
                      statut={d.status}
                      retard={d.delayMinutes}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-[oklch(0.28_0.02_257)] px-5 py-2.5 text-[12.5px] text-[oklch(0.7_0.02_257)]">
            Places libres jusqu&apos;au terminus, en 2e et 1re classe.
          </p>
        </div>
      )}
    </section>
  )
}

function DernieresOperations({
  accueil,
  onOuvrir,
}: {
  accueil: Accueil
  onOuvrir: (id: string) => void
}) {
  return (
    <Panneau
      titre="Dernières opérations"
      icone={History}
      plein
      className="flex min-h-0 flex-col"
      actions={
        <Link
          href={"/vente/operations" as Route}
          className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent-ink hover:underline"
        >
          Tout voir
        </Link>
      }
    >
      {accueil.operations.length === 0 ? (
        <EmptyState
          illustration={
            <CircleCheck aria-hidden className="size-10 text-ink-faint" />
          }
          title="Aucune opération dans cette caisse"
          description="La première vente apparaîtra ici, avec son numéro."
        />
      ) : (
        <div className="relative min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[480px] border-collapse text-[14px]">
            <thead>
              <tr className="bg-surface-sunk text-left text-[11.5px] font-semibold tracking-[0.05em] text-ink-muted uppercase">
                <th scope="col" className="px-3.5 py-2.5">
                  N°
                </th>
                <th scope="col" className="px-3.5 py-2.5">
                  Produit
                </th>
                <th scope="col" className="px-3.5 py-2.5 text-right">
                  Montant
                </th>
                <th scope="col" className="px-3.5 py-2.5 text-right">
                  Heure
                </th>
              </tr>
            </thead>
            <tbody>
              {accueil.operations.map((o) => (
                <tr
                  key={o.id}
                  tabIndex={0}
                  onClick={() => onOuvrir(o.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      onOuvrir(o.id)
                    }
                  }}
                  className="cursor-pointer border-t border-line hover:bg-surface-sunk focus-visible:bg-surface-sunk"
                >
                  <td className="tabular px-3.5 py-2.5 text-[12.5px] whitespace-nowrap">
                    {o.numero.replace(/^([A-Z])-[A-Z-]+-\d{8}-/, "$1-")}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <b className="block font-semibold">
                      {libelleProduit(o.produit, o.kind)}
                    </b>
                    <small className="text-[12.5px] text-ink-muted">
                      {o.client ?? o.trajet ?? "—"}
                    </small>
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">
                    {montantSigne(o.montant)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">
                    {heure(o.heure)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panneau>
  )
}

export function SellerDashboardPageClient() {
  const { contexte, enLigne } = useGuichet()
  return (
    <CadreGuichet
      contexte={contexte}
      className="xl:flex xl:h-[calc(100dvh-7rem)] xl:flex-col"
    >
      {contexte ? (
        <LimiteErreur titre="L'accueil n'a pas pu être chargé.">
          <AccueilConnecte contexte={contexte} enLigne={enLigne} />
        </LimiteErreur>
      ) : (
        <div className="grid gap-4">
          <SkeletonLines />
          <ChargementEcran libelle="Chargement de l'espace vendeur…" />
        </div>
      )}
    </CadreGuichet>
  )
}

function AccueilConnecte({
  contexte,
  enLigne,
}: {
  contexte: Contexte
  enLigne: boolean
}) {
  const router = useRouter()
  const accueil = useLecture(api.functions.guichet.accueil, {})
  return (
    <SellerDashboardScreen
      contexte={contexte}
      accueil={accueil}
      enLigne={enLigne}
      onOuvrirOperation={(id) => {
        signalerNavigation()
        router.push(`/vente/operations?op=${id}` as Route)
      }}
    />
  )
}
