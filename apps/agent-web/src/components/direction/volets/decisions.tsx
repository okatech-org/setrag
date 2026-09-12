import Link from "next/link"

import { DocumentButton } from "@/components/document-button"

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Tag, type TagProps } from "@workspace/ui/components/tag"

import {
  DIRECTIONS,
  DIRECTION_CONNECTION_LABELS,
  ORGANIGRAMME_NOTE,
  directionConnection,
  directionsSummaryLabel,
  type DirectionConnection,
} from "../direction-map"
import type {
  ExecutiveOverviewDto,
  ExecutiveSourceState,
} from "../executive-dto"
import { ProvenanceSummary, ProvenanceTag } from "../provenance"
import { ArbitrationList } from "./overview"
import type { ExecutiveVoletProps } from "./types"

type DataQualityState = "empty" | "not_connected" | "unavailable"

const DATA_QUALITY_STATE_LABELS: Readonly<Record<DataQualityState, string>> = {
  empty: "Vide",
  not_connected: "Non raccordé",
  unavailable: "Non accessible",
}

const DATA_QUALITY_TONES: Readonly<
  Record<DataQualityState, NonNullable<TagProps["tone"]>>
> = {
  empty: "neutral",
  not_connected: "second",
  unavailable: "neutral",
}

const DIRECTION_CONNECTION_TONES: Readonly<
  Record<DirectionConnection, NonNullable<TagProps["tone"]>>
> = {
  connected: "success",
  partial: "warning",
  not_connected: "second",
  unavailable: "neutral",
  loading: "neutral",
}

/** Trois manques structurels : ces directions n'ont aucune source persistée. */
const STRUCTURAL_DATA_QUALITY_REQUESTS = [
  { key: "structural-dmat", text: "Raccorder le parc matériel", owner: "DMAT" },
  {
    key: "structural-dinfra",
    text: "Raccorder l’état de la voie et le PRN",
    owner: "DINFRA",
  },
  {
    key: "structural-drh",
    text: "Raccorder la paie et les effectifs",
    owner: "DRH",
  },
] as const

interface DataQualitySource {
  key: string
  state: ExecutiveSourceState
  subject: string
  owner: string
}

function isDataQualityState(
  state: ExecutiveSourceState
): state is DataQualityState {
  return (
    state === "empty" || state === "not_connected" || state === "unavailable"
  )
}

function dataQualityVerb(state: DataQualityState) {
  return state === "empty" ? "Compléter" : "Raccorder"
}

interface DataQualityItem {
  key: string
  text: string
  owner: string
  state: DataQualityState
}

function dataQualityItems(data: ExecutiveOverviewDto): DataQualityItem[] {
  const sources: readonly DataQualitySource[] = [
    {
      key: "passenger",
      state: data.passenger.state,
      subject: "les recettes et volumes voyageurs",
      owner: "DCFV",
    },
    {
      key: "freight",
      state: data.freight.state,
      subject: "l’activité Fret",
      owner: "DCFV",
    },
    {
      key: "cotraf",
      state: data.cotraf.state,
      subject: "les circulations et conflits d’exploitation",
      owner: "DEF",
    },
    {
      key: "finance",
      state: data.finance.state,
      subject: "le journal comptable et la conformité",
      owner: "DFC",
    },
    {
      key: "continuity",
      state: data.continuity.state,
      subject: "les politiques de continuité PCA/PRA",
      owner: "DSED",
    },
    {
      key: "health",
      state: data.health.state,
      subject: "la supervision technique",
      owner: "DSI",
    },
    {
      key: "safety",
      state: data.safety.state,
      subject: "la synthèse des incidents et procès-verbaux",
      owner: "DSED",
    },
    {
      key: "occupancy",
      state: data.occupancy.state,
      subject: "le remplissage par desserte",
      owner: "DCFV",
    },
  ]

  const dynamicItems = sources
    .filter(
      (source): source is DataQualitySource & { state: DataQualityState } =>
        isDataQualityState(source.state)
    )
    .map((source): DataQualityItem => ({
      key: source.key,
      text: `${dataQualityVerb(source.state)} ${source.subject}`,
      owner: source.owner,
      state: source.state,
    }))

  const structuralItems: DataQualityItem[] =
    STRUCTURAL_DATA_QUALITY_REQUESTS.map((request) => ({
      key: request.key,
      text: request.text,
      owner: request.owner,
      state: "not_connected",
    }))

  return [...dynamicItems, ...structuralItems]
}

export function DecisionsVolet({ data }: ExecutiveVoletProps) {
  const items = dataQualityItems(data)
  const hasGedModule = data.modules.some((module) => module.code === "ged")

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <section
        aria-labelledby="arbitrer-decisions-titre"
        className="grid gap-3"
      >
        <h2 id="arbitrer-decisions-titre" className="text-h4">
          Signaux à arbitrer
        </h2>
        <ArbitrationList data={data} />
      </section>

      <section
        aria-labelledby="qualite-titre"
        className="grid gap-4 rounded-lg border border-line bg-surface p-5"
      >
        <h2 id="qualite-titre" className="text-h4">
          Demandes de qualité de données
        </h2>
        {items.length === 0 ? (
          <p className="text-small text-ink-muted">
            Aucune demande : toutes les sources visibles sont alimentées.
          </p>
        ) : (
          <ol className="grid gap-2">
            {items.map((item) => (
              <li
                key={item.key}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-2 first:border-t-0 first:pt-0"
              >
                <span className="text-small text-ink">
                  {item.text} —{" "}
                  <span className="font-semibold">{item.owner}</span>
                </span>
                <Tag tone={DATA_QUALITY_TONES[item.state]}>
                  {DATA_QUALITY_STATE_LABELS[item.state]}
                </Tag>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section
        aria-labelledby="approbations-titre"
        className="grid gap-3 rounded-lg border border-line bg-surface p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="approbations-titre" className="text-h4">
            Approbations en attente
          </h2>
          <ProvenanceTag state="not_connected" />
        </div>
        <p className="text-small text-ink-muted">
          Les circuits d’approbation ne sont pas encore lus dans cet espace.
        </p>
        {hasGedModule ? (
          <Link
            href="/bureautique"
            className="text-small flex min-h-target w-fit items-center font-semibold text-accent-ink underline-offset-4 hover:underline"
          >
            Ouvrir la Bureautique
          </Link>
        ) : null}
      </section>

      <section
        aria-labelledby="ressources-titre"
        className="grid gap-3 rounded-lg border border-line bg-surface p-5"
      >
        <h2 id="ressources-titre" className="text-h4">
          Ressources de décision
        </h2>
        <Link
          href="/etudes"
          className="grid min-h-target content-center gap-1 rounded-md border border-line p-4 transition-colors hover:border-accent-line hover:bg-surface-sunk"
        >
          <span className="text-small font-semibold text-accent-ink">
            Audit &amp; documents
          </span>
          <span className="text-caption text-ink-muted">
            Études, livre blanc et documents officiels
          </span>
        </Link>
        <div className="grid gap-2 rounded-md border border-line p-4">
          <h3 className="text-small font-semibold text-ink">
            Dossier de recette de l’espace Direction générale
          </h3>
          <p className="text-caption text-ink-muted">
            Scénarios à dérouler par volet, questions d’orientation à trancher
            et grille de visa de la Direction générale.
          </p>
          <div className="flex flex-wrap gap-2">
            <DocumentButton
              file="RECETTE_ESPACE_DIRECTION_GENERALE.pdf"
              variant="secondary"
            >
              Télécharger le dossier (.pdf)
            </DocumentButton>
            <DocumentButton
              file="RECETTE_ESPACE_DIRECTION_GENERALE.md"
              variant="ghost"
            >
              Version texte (.md)
            </DocumentButton>
          </div>
        </div>
      </section>

      <section
        id="raccordement"
        aria-labelledby="raccordement-titre"
        className="grid gap-4 rounded-lg border border-line bg-surface p-5"
      >
        <div>
          <h2 id="raccordement-titre" className="text-h4">
            Raccordement des directions
          </h2>
          <p className="text-caption mt-1 text-ink-muted">
            {ORGANIGRAMME_NOTE}
          </p>
        </div>
        <p className="text-small text-ink-muted">
          {directionsSummaryLabel(data)}
        </p>
        <Table>
          <TableCaption>
            Directions, modules et état de raccordement
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Direction</TableHead>
              <TableHead>Mission</TableHead>
              <TableHead>Modules</TableHead>
              <TableHead>État</TableHead>
              <TableHead>Démonstration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DIRECTIONS.map((entry) => {
              const connection = directionConnection(entry, data)
              const moduleVisible = entry.modules.some((code) =>
                data.modules.some((module) => module.code === code)
              )
              return (
                <TableRow key={entry.code}>
                  <TableCell className="font-semibold whitespace-normal text-ink">
                    {entry.label}
                  </TableCell>
                  <TableCell className="whitespace-normal text-ink-muted">
                    {entry.mission}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {entry.modules
                      .map(
                        (code) =>
                          data.modules.find((module) => module.code === code)
                            ?.label ?? code
                      )
                      .join(" · ")}
                  </TableCell>
                  <TableCell>
                    <Tag tone={DIRECTION_CONNECTION_TONES[connection]}>
                      {DIRECTION_CONNECTION_LABELS[connection]}
                    </Tag>
                  </TableCell>
                  <TableCell>
                    {entry.demoHref && entry.demoLabel && moduleVisible ? (
                      <Link
                        href={entry.demoHref}
                        className="inline-flex min-h-target items-center font-semibold text-accent-ink underline-offset-4 hover:underline"
                      >
                        {entry.demoLabel}
                      </Link>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </section>

      <ProvenanceSummary
        states={[
          data.passenger.state,
          data.freight.state,
          data.cotraf.state,
          data.finance.state,
          data.continuity.state,
          data.health.state,
          data.safety.state,
          data.occupancy.state,
        ]}
      />
    </div>
  )
}
