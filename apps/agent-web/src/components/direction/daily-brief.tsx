import type { Route } from "next"
import Link from "next/link"

import { formatXaf } from "@/lib/format"

import {
  deriveExecutiveArbitrations,
  pluralize,
  type ExecutiveOverviewDto,
  type ExecutiveSourceState,
} from "./executive-dto"
import { periodHref, presetLabel } from "./executive-period"
import { ProvenanceMention, ProvenanceTag } from "./provenance"

const NUMBER_FORMATTER = new Intl.NumberFormat("fr-FR")
const PERCENT_FORMATTER = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
})
const DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
})

interface BriefLine {
  id: string
  text: string
  state: ExecutiveSourceState
}

function variationText(value: number | null | undefined) {
  if (value === null || value === undefined) return "sans période de référence"
  const sign = value > 0 ? "+" : value < 0 ? "−" : ""
  return `${sign}${PERCENT_FORMATTER.format(Math.abs(value))} % vs période précédente`
}

/** Le point : une phrase factuelle par source, chacune avec sa provenance. */
export function briefLines(data: ExecutiveOverviewDto): BriefLine[] {
  const lines: BriefLine[] = []

  const service = data.service
  if (service.state === "operational") {
    const late = service.trips.filter(({ status }) => status === "retarde")
    const cancelled = service.trips.filter(({ status }) => status === "annule")
    const maxDelay = Math.max(
      0,
      ...late.map(({ delayMinutes }) => delayMinutes)
    )
    lines.push({
      id: "service",
      state: "operational",
      text: `Aujourd’hui : ${pluralize(service.trips.length, "desserte voyageurs", "dessertes voyageurs")}, ${pluralize(late.length, "retardée")}${late.length > 0 ? ` (+${NUMBER_FORMATTER.format(maxDelay)} min)` : ""}, ${pluralize(cancelled.length, "annulée")}.`,
    })
  } else {
    lines.push({
      id: "service",
      state: service.state,
      text:
        service.state === "loading"
          ? "Aujourd’hui : lecture des dessertes voyageurs…"
          : "Aujourd’hui : aucune desserte voyageurs enregistrée.",
    })
  }

  const cotraf = data.cotraf
  if (cotraf.state === "operational" || cotraf.state === "synthetic_demo") {
    lines.push({
      id: "cotraf",
      state: cotraf.state,
      text: `Sur la ligne : ${pluralize(cotraf.circulations ?? 0, "circulation en ligne", "circulations en ligne")}, ${pluralize(cotraf.delayed ?? 0, "en retard", "en retard")}, ${pluralize(cotraf.conflicts ?? 0, "conflit de croisement", "conflits de croisement")}.`,
    })
  } else {
    lines.push({
      id: "cotraf",
      state: cotraf.state,
      text:
        cotraf.state === "loading"
          ? "Sur la ligne : lecture des circulations…"
          : cotraf.state === "empty"
            ? "Sur la ligne : aucune circulation enregistrée."
            : "Sur la ligne : circulations non accessibles à ce compte.",
    })
  }

  const safety = data.safety
  if (safety.state === "operational" && safety.summary) {
    const { incidents, penalties } = safety.summary
    lines.push({
      id: "safety",
      state: "operational",
      text: `Sécurité à bord, ${presetLabel(data.period.preset).toLowerCase()} : ${pluralize(incidents.total, "incident signalé", "incidents signalés")}, dont ${pluralize(incidents.criticalOpen, "critique non résolu", "critiques non résolus")} ; ${pluralize(penalties.total, "procès-verbal", "procès-verbaux")}.`,
    })
  } else {
    lines.push({
      id: "safety",
      state: safety.state,
      text:
        safety.state === "loading"
          ? "Sécurité à bord : lecture de la synthèse…"
          : safety.state === "empty"
            ? "Sécurité à bord : aucun incident ni procès-verbal enregistré sur la période."
            : "Sécurité à bord : synthèse non accessible à ce compte.",
    })
  }

  const passenger = data.passenger
  if (passenger.state === "operational") {
    lines.push({
      id: "passenger",
      state: "operational",
      text: `Voyageurs, ${presetLabel(data.period.preset).toLowerCase()} : ${formatXaf(passenger.revenueNet ?? 0)} nets, ${pluralize(passenger.tickets ?? 0, "billet")}, ${variationText(passenger.revenueVariationPct)}.`,
    })
  } else {
    lines.push({
      id: "passenger",
      state: passenger.state,
      text:
        passenger.state === "loading"
          ? "Voyageurs : lecture des journées clôturées…"
          : passenger.state === "empty"
            ? "Voyageurs : aucune journée clôturée sur la période."
            : "Voyageurs : source non accessible à ce compte.",
    })
  }

  const freight = data.freight
  if (freight.state === "synthetic_demo") {
    lines.push({
      id: "freight",
      state: "synthetic_demo",
      text: "Fret : chiffres de démonstration, non raccordés à l’exploitation.",
    })
  } else if (freight.state === "operational") {
    lines.push({
      id: "freight",
      state: "operational",
      text: `Fret : ${NUMBER_FORMATTER.format(freight.tonnes ?? 0)} t en mouvement, ${pluralize(freight.activity?.value ?? 0, "opération active", "opérations actives")}, ${pluralize(freight.criticalAlerts ?? 0, "alerte critique ouverte", "alertes critiques ouvertes")}.`,
    })
  } else {
    lines.push({
      id: "freight",
      state: freight.state,
      text:
        freight.state === "loading"
          ? "Fret : lecture du tableau de bord…"
          : freight.state === "empty"
            ? "Fret : aucune opération enregistrée."
            : "Fret : module non accessible à ce compte.",
    })
  }

  const finance = data.finance
  if (finance.state === "operational" || finance.state === "synthetic_demo") {
    lines.push({
      id: "finance",
      state: finance.state,
      text:
        finance.blockers.length > 0
          ? `Finance : ${pluralize(finance.blockers.length, "prérequis non établi", "prérequis non établis")} (${finance.blockers[0]}).`
          : "Finance : aucun prérequis en attente.",
    })
  } else {
    lines.push({
      id: "finance",
      state: finance.state,
      text:
        finance.state === "loading"
          ? "Finance : lecture du journal…"
          : finance.state === "empty"
            ? "Finance : aucun lot comptable enregistré."
            : "Finance : module non accessible à ce compte.",
    })
  }

  const continuity = data.continuity
  if (
    continuity.state === "operational" ||
    continuity.state === "synthetic_demo"
  ) {
    lines.push({
      id: "continuity",
      state: continuity.state,
      text: `Continuité : ${NUMBER_FORMATTER.format(continuity.readyPolicyCount ?? 0)} sur ${pluralize(continuity.evaluatedPolicyCount ?? 0, "politique PCA/PRA prouvée", "politiques PCA/PRA prouvées")}.`,
    })
  } else {
    lines.push({
      id: "continuity",
      state: continuity.state,
      text:
        continuity.state === "loading"
          ? "Continuité : lecture du registre PCA/PRA…"
          : continuity.state === "empty"
            ? "Continuité : aucune politique PCA/PRA approuvée."
            : "Continuité : registre non accessible à ce compte.",
    })
  }

  return lines
}

export function DailyBrief({ data }: { data: ExecutiveOverviewDto }) {
  const lines = briefLines(data)
  const arbitrations = deriveExecutiveArbitrations(data)
  const rawDay = DATE_FORMATTER.format(
    new Date(`${data.serviceDate}T12:00:00Z`)
  )
  const dayLabel = rawDay.charAt(0).toLocaleUpperCase("fr-FR") + rawDay.slice(1)

  return (
    <section
      aria-labelledby="le-point-titre"
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-line bg-surface p-4 md:gap-4 md:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="le-point-titre" className="text-h4">
          Le point
        </h2>
        <p className="text-small text-ink-muted">
          {dayLabel} · Owendo–Franceville
        </p>
      </div>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-small md:text-body font-semibold text-ink">
            {arbitrations.length > 0 ? (
              <>
                À arbitrer :{" "}
                <Link
                  href={
                    periodHref(
                      "/direction/decisions",
                      data.period.preset
                    ) as Route
                  }
                  className="text-accent-ink underline-offset-4 hover:underline"
                >
                  {pluralize(arbitrations.length, "signal", "signaux")}
                </Link>
                .
              </>
            ) : (
              "À arbitrer : aucun signal établi à partir des sources accessibles."
            )}
          </span>
        </li>
        {lines.map((line) => (
          <li
            key={line.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-2 md:flex-nowrap md:items-start md:justify-between"
          >
            <span className="text-small md:text-body min-w-0 flex-1 basis-56 text-ink">
              {line.text}
            </span>
            <ProvenanceMention state={line.state} className="md:hidden" />
            <ProvenanceTag
              state={line.state}
              className="hidden md:inline-flex"
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
