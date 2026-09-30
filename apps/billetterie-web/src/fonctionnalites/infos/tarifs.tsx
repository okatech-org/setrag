"use client"

import { FileCheckIcon, SearchIcon, StoreIcon } from "lucide-react"
import Link from "next/link"

import { useQuery } from "@workspace/api/hooks"
import { LONG_DISTANCE_THRESHOLD_KM } from "@workspace/backend/fares"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tag } from "@workspace/ui/components/tag"

import {
  useGares,
  useReductions,
  type Reduction,
} from "@/fonctionnalites/reference/use-reference"
import { dateCourte, heure, prix } from "@/lib/format"
import {
  CLASSES,
  LIBELLE_CLASSE,
  VOYAGEURS_MAX,
  libelleTypeTrain,
  nomTrain,
} from "@/lib/voyage"

import {
  EnAttente,
  EnTeteInfo,
  Fait,
  Faits,
  LienSuite,
  PageInfo,
  SectionInfo,
  Source,
  Texte,
} from "./elements"
import { CLASSES_PAR_TYPE, TENUE_MINUTES } from "./regles"

const SOMMAIRE = [
  ["classes", "Les classes"],
  ["calcul", "Le calcul"],
  ["reductions", "Réductions"],
  ["groupes", "Groupes"],
  ["prix-fige", "Le prix figé"],
] as const

/* ─────────────────────────────── Les classes ─────────────────────────────── */

function Classes() {
  return (
    <SectionInfo
      id="classes"
      numero="01"
      titre="Trois classes"
      intro="Deuxième, Première et VIP. Tous les trains n’ont pas les trois."
    >
      <ul
        aria-label="Classes vendues selon le type de train"
        className="grid rounded-md border border-line bg-surface"
      >
        {CLASSES_PAR_TYPE.map(({ type, classes }) => {
          const absentes = CLASSES.filter((classe) => !classes.includes(classe))
          return (
            <li
              key={type}
              className="grid gap-2 border-t border-line px-4 py-4 first:border-t-0 md:grid-cols-[160px_minmax(0,1fr)] md:items-center md:px-5"
            >
              <b className="text-[15.5px]">{libelleTypeTrain(type)}</b>
              <span className="flex flex-wrap items-center gap-1.5">
                {classes.map((classe) => (
                  <Tag key={classe} tone="accent">
                    {LIBELLE_CLASSE[classe].nom}
                  </Tag>
                ))}
                {absentes.map((classe) => (
                  <span
                    key={classe}
                    className="px-1 text-[13px] text-ink-muted"
                  >
                    Pas de {LIBELLE_CLASSE[classe].nom}
                  </span>
                ))}
              </span>
            </li>
          )
        })}
      </ul>
      <Texte>
        Chaque train affiche ses classes dans les résultats de recherche, avec
        les places qui restent.
      </Texte>
      <Source>
        barème kilométrique, annexe 2 du cahier des charges SETRAG (§9.8.1).
      </Source>
    </SectionInfo>
  )
}

/* ──────────────────────────────── Le calcul ──────────────────────────────── */

const ETAPES: { titre: string; texte: string }[] = [
  {
    titre: "La distance",
    texte:
      "On compte les kilomètres entre votre gare de départ et votre gare d’arrivée.",
  },
  {
    titre: "Le taux au kilomètre",
    texte: `Chaque type de train a son taux dans chaque classe, avec deux paliers : moins de ${LONG_DISTANCE_THRESHOLD_KM} km, et ${LONG_DISTANCE_THRESHOLD_KM} km ou plus. Le taux du palier vaut pour tout le trajet.`,
  },
  {
    titre: "Votre réduction",
    texte: "Enfant, militaire… Une seule réduction par voyageur, jamais deux.",
  },
  {
    titre: "Les taxes",
    texte:
      "La TVA et la contribution spéciale de solidarité sont comprises. Le prix affiché est celui que vous payez.",
  },
  {
    titre: "L’arrondi",
    texte:
      "Le prix s’arrondit à 10 F sous 100 km, à 50 F de 100 à 299 km, à 100 F à partir de 300 km.",
  },
  {
    titre: "Le remplissage",
    texte:
      "Les places se vendent par contingents. Quand le moins cher est épuisé, le suivant coûte plus. SETRAG peut aussi moduler le prix selon la date de réservation, le jour du départ ou le canal de vente, dans un plancher et un plafond.",
  },
]

/** Le prochain train au départ de la première gare de la ligne, chiffré par le backend. */
function ExemplePrix() {
  const { gares } = useGares()
  const origine = gares?.[0]
  const departs = useQuery(
    api.functions.trips.nextDepartures,
    origine ? { originCode: origine.code, limit: 1 } : "skip"
  )
  const depart = departs?.[0]
  const dessertes = useQuery(
    api.functions.trips.search,
    depart?.destination
      ? {
          originStationId: depart.origin.stationId,
          destinationStationId: depart.destination.stationId,
          serviceDate: depart.serviceDate,
          passengers: 1,
        }
      : "skip"
  )

  if (
    gares === undefined ||
    departs === undefined ||
    (depart?.destination && dessertes === undefined)
  ) {
    return <Skeleton className="h-52 rounded-lg" />
  }
  const desserte = dessertes?.find((d) => d.trip._id === depart?.tripId)
  const classes = desserte
    ? CLASSES.filter((classe) => desserte.prixParClasse[classe])
    : []
  if (!depart?.destination || !desserte || classes.length === 0) {
    return (
      <Texte>
        Aucun train n’est ouvert à la vente pour l’instant : l’exemple chiffré
        reviendra avec le prochain départ.
      </Texte>
    )
  }

  return (
    <figure className="grid gap-4 rounded-lg border border-line bg-surface p-5 md:p-6">
      <figcaption className="grid gap-1">
        <span className="text-mono-label text-ink-muted">
          Exemple calculé à l’instant
        </span>
        <b className="text-[17px] leading-snug">
          {depart.origin.name} → {depart.destination.name}
        </b>
        <span className="text-small text-ink-muted">
          {nomTrain(depart.trainType, depart.trainNumber)} ·{" "}
          {dateCourte(depart.serviceDate)} · départ{" "}
          <span className="tabular">{heure(desserte.departureAt)}</span> ·{" "}
          <span className="tabular">{desserte.distanceKm} km</span>
        </span>
      </figcaption>
      <dl className="grid gap-2 sm:grid-cols-3">
        {classes.map((classe) => (
          <div
            key={classe}
            className="grid gap-0.5 rounded-md bg-surface-sunk px-4 py-3"
          >
            <dt className="text-small font-semibold text-ink-muted">
              {LIBELLE_CLASSE[classe].nom}
            </dt>
            <dd className="font-mono text-[22px] leading-tight font-semibold tabular-nums">
              {prix(desserte.prixParClasse[classe]!.unitaireTtc)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-small text-ink-muted">
        Un adulte, en ligne, sans réduction. Ce prix peut changer d’ici votre
        réservation : il ne se fige qu’à ce moment-là.
      </p>
    </figure>
  )
}

function Calcul() {
  return (
    <SectionInfo
      id="calcul"
      numero="02"
      titre="Comment le prix se calcule"
      intro="Le système fait le calcul dans cet ordre, pour chaque voyageur."
    >
      <ol className="grid rounded-md border border-line bg-surface">
        {ETAPES.map((etape, i) => (
          <li
            key={etape.titre}
            className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-3 border-t border-line px-4 py-4 first:border-t-0 md:px-5"
          >
            <span className="font-mono text-[13px] leading-6 font-semibold text-ink-faint">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="grid max-w-[68ch] gap-1">
              <b className="text-[15.5px]">{etape.titre}</b>
              <p className="text-[15px] leading-relaxed text-ink-muted">
                {etape.texte}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <ExemplePrix />
      <Source>
        moteur tarifaire du système ; règles d’arrondi et yield management du
        cahier des charges (annexe 2, §9.8.2 ; §7.11).
      </Source>
    </SectionInfo>
  )
}

/* ─────────────────────────────── Réductions ──────────────────────────────── */

function bornes(
  min: number | null,
  max: number | null,
  unite: string,
  pluriel: string
): string | null {
  if (min !== null && max !== null) return `De ${min} à ${max} ${pluriel}`
  if (min !== null) return `À partir de ${min} ${pluriel}`
  if (max !== null) return `Jusqu’à ${max} ${max > 1 ? pluriel : unite}`
  return null
}

/** Le libellé de la grille dit souvent déjà les bornes (« Enfant de 4 à 11 ans ») : on ne les répète pas. */
function dejaDit(libelle: string, min: number | null) {
  return min !== null && libelle.includes(String(min))
}

function LigneReduction({ reduction }: { reduction: Reduction }) {
  const age = dejaDit(reduction.label, reduction.minAge)
    ? null
    : bornes(reduction.minAge, reduction.maxAge, "an", "ans")
  const groupe = dejaDit(reduction.label, reduction.minPassengers)
    ? null
    : bornes(
        reduction.minPassengers,
        reduction.maxPassengers,
        "voyageur",
        "voyageurs"
      )
  const auGuichet =
    reduction.minPassengers !== null && reduction.minPassengers > VOYAGEURS_MAX
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 border-t border-line px-4 py-4 first:border-t-0 md:px-5">
      <b className="text-[15.5px] leading-snug">{reduction.label}</b>
      <b className="row-span-2 font-mono text-[19px] leading-tight text-success-ink tabular-nums">
        −{reduction.ratePct} %
      </b>
      <span className="flex flex-wrap gap-1.5">
        {age && <Tag>{age}</Tag>}
        {groupe && <Tag>{groupe}</Tag>}
        {auGuichet && (
          <Tag tone="info">
            <StoreIcon aria-hidden />
            Au guichet
          </Tag>
        )}
        {reduction.requiresProof && (
          <Tag tone="warning">
            <FileCheckIcon aria-hidden />
            Justificatif demandé
          </Tag>
        )}
      </span>
    </li>
  )
}

function Reductions() {
  const { reductions, enfant } = useReductions()
  const individuelles = reductions?.filter((r) => r.minPassengers === null)

  return (
    <SectionInfo
      id="reductions"
      numero="03"
      titre="Réductions"
      intro="Elles viennent de la grille tarifaire en vigueur. Chaque voyageur a droit à une réduction au plus."
    >
      {individuelles === undefined ? (
        <Skeleton className="h-40 rounded-md" />
      ) : individuelles.length === 0 ? (
        <Texte>
          La grille en vigueur n’ouvre aucune réduction individuelle au public.
        </Texte>
      ) : (
        <ul className="grid rounded-md border border-line bg-surface">
          {individuelles.map((reduction) => (
            <LigneReduction key={reduction.code} reduction={reduction} />
          ))}
        </ul>
      )}
      <Faits>
        <Fait terme="Justificatif">
          Une réduction marquée « justificatif demandé » suppose de pouvoir
          prouver votre droit : l’âge de l’enfant, l’ordre de mission du
          militaire. Gardez-le sur vous pendant le voyage.
        </Fait>
        {enfant && (
          <Fait terme="Tarif enfant">
            Le cahier des charges le réserve aux enfants accompagnés d’un
            parent.
          </Fait>
        )}
        <Fait terme="Abonnements">
          Les cartes d’abonnement du cahier des charges (un an, six mois, trois
          mois, demi-tarif) ne sont pas encore en vente.
        </Fait>
      </Faits>
      {enfant?.minAge != null && (
        <EnAttente>
          Le barème ne prévoit rien pour les enfants de moins de {enfant.minAge}{" "}
          ans. Renseignez-vous au guichet avant de voyager.
        </EnAttente>
      )}
      <EnAttente>
        Tarifs week-end, étudiant, troisième âge et promotionnel : le cahier des
        charges les prévoit, mais SETRAG n’a pas fixé leurs taux. Ils ne
        s’appliquent pas aujourd’hui.
      </EnAttente>
      <Source>
        grille tarifaire active (réductions publiques) ; cahier des charges
        SETRAG, annexe 2 (§1.1.1.1.2 à 1.1.1.2.4).
      </Source>
    </SectionInfo>
  )
}

/* ──────────────────────────────── Groupes ────────────────────────────────── */

function Groupes() {
  const { reductions } = useReductions()
  const groupes = reductions
    ?.filter((r) => r.minPassengers !== null)
    .sort((a, b) => (a.minPassengers ?? 0) - (b.minPassengers ?? 0))

  return (
    <SectionInfo
      id="groupes"
      numero="04"
      titre="Groupes"
      intro={`En ligne, une réservation compte ${VOYAGEURS_MAX} voyageurs au plus. À partir de ${VOYAGEURS_MAX + 1}, réservez au guichet : les tarifs de groupe s’y appliquent.`}
    >
      {groupes === undefined ? (
        <Skeleton className="h-28 rounded-md" />
      ) : (
        groupes.length > 0 && (
          <ul className="grid rounded-md border border-line bg-surface">
            {groupes.map((reduction) => (
              <LigneReduction key={reduction.code} reduction={reduction} />
            ))}
          </ul>
        )
      )}
      <EnAttente>
        La réservation en ligne des groupes de plus de {VOYAGEURS_MAX} voyageurs
        n’est pas encore décidée.
      </EnAttente>
    </SectionInfo>
  )
}

/* ─────────────────────────────── Le prix figé ────────────────────────────── */

function PrixFige() {
  return (
    <SectionInfo
      id="prix-fige"
      numero="05"
      titre="Le prix figé"
      intro="Le prix bouge tant que vous cherchez. Il ne bouge plus dès que vous réservez."
    >
      <Faits>
        <Fait terme="Dans les résultats">
          Le prix est indicatif. Il est calculé pour votre groupe, au moment où
          vous cherchez.
        </Fait>
        <Fait terme="À la réservation">
          Le prix est figé et vos places sont tenues {TENUE_MINUTES} minutes.
          Vous payez ce montant, même si le train se remplit entre-temps.
        </Fait>
        <Fait terme={`Après ${TENUE_MINUTES} minutes`}>
          Sans paiement, la réservation expire et les places retournent à la
          vente. Il faut refaire une recherche, et le prix a pu changer.
        </Fait>
        <Fait terme="Au guichet">
          Une réservation faite en ligne peut aussi se régler au guichet d’une
          gare, dans le même délai.
        </Fait>
      </Faits>
      <div className="flex flex-wrap gap-x-6">
        <LienSuite href="/bagages">Bagages et colis</LienSuite>
        <LienSuite href="/aide">Questions fréquentes</LienSuite>
        <LienSuite href="/conditions">Conditions de vente</LienSuite>
      </div>
    </SectionInfo>
  )
}

export function Tarifs() {
  return (
    <PageInfo
      sommaire={[...SOMMAIRE]}
      entete={
        <EnTeteInfo
          surtitre="Tarifs"
          titre="Un prix au kilomètre, figé quand vous réservez"
          intro={
            <p>
              Le système calcule le prix de chaque trajet à partir de la
              distance, du type de train et de la classe. Une fois la
              réservation faite, il ne change plus.
            </p>
          }
          actions={
            <Button asChild>
              <Link href="/">
                <SearchIcon aria-hidden />
                Chercher un train
              </Link>
            </Button>
          }
        />
      }
    >
      <Classes />
      <Calcul />
      <Reductions />
      <Groupes />
      <PrixFige />
    </PageInfo>
  )
}
