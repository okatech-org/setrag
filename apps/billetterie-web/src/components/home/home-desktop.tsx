import {
  ArrowRight,
  Clock3,
  MapPinned,
  ShieldCheck,
  TimerReset,
  TrainFront,
} from "lucide-react"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { cn } from "@workspace/ui/lib/utils"

import { TripSearchForm } from "@/components/trip-search-form"
import { UpcomingDepartures } from "@/components/upcoming-departures"

const FACTS = [
  {
    value: "648 km",
    label: "de ligne, d’Owendo à Franceville",
    icon: MapPinned,
  },
  {
    value: "22 gares",
    label: "desservies par les trains voyageurs",
    icon: TrainFront,
  },
  { value: "5 min", label: "pour acheter son billet en ligne", icon: Clock3 },
  {
    value: "15 min",
    label: "de prix garanti dès la réservation",
    icon: TimerReset,
  },
]

/**
 * Accueil du bureau — vitrine.
 *
 * Le mobile ne reprend pas cette page : il ouvre sur le prochain billet et une
 * recherche repliée, voir `HomeMobile`.
 */
export function HomeDesktop({ className }: { className?: string }) {
  return (
    <main
      data-experience="public-web"
      className={cn("hidden min-w-0 md:block", className)}
    >
      <section className="bg-ink text-ink-inverse">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 pt-14 pb-28 lg:grid-cols-[1fr_1.15fr] lg:items-end lg:pb-36">
          <div className="grid gap-5">
            <span className="text-mono-label text-accent-on-ink">
              Owendo ↔ Franceville · 648 km · 22 gares
            </span>
            <h1 className="text-display max-w-xl">
              Traversez le Gabon en un seul billet.
            </h1>
            <p className="text-body-lg max-w-2xl text-ink-faint">
              Réservez votre place à bord du Transgabonais et payez par Airtel
              Money, Moov Money ou carte bancaire — en moins de cinq minutes.
            </p>
          </div>
          <div className="hidden justify-end lg:flex">
            <span className="grid size-36 place-items-center rounded-pill border border-accent-line text-accent-on-ink">
              <TrainFront className="size-16" aria-hidden />
            </span>
          </div>
        </div>
      </section>

      <section
        id="recherche"
        className="mx-auto -mt-20 grid max-w-7xl gap-6 px-4 sm:px-6"
      >
        <TripSearchForm />
        <InlineMessage
          tone="warning"
          title="TR-201 partira avec 25 min de retard aujourd’hui."
        >
          Votre place est conservée et les correspondances à Franceville sont
          maintenues.
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <Link href="/suivi?train=TR-201">Suivre TR-201</Link>
          </Button>
        </InlineMessage>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
        {FACTS.map(({ value, label, icon: Icon }) => (
          <article
            key={value}
            className="grid gap-2 rounded-lg border border-line bg-surface p-5"
          >
            <Icon className="size-5 text-accent-ink" aria-hidden />
            <strong className="text-h3">{value}</strong>
            <span className="text-small text-ink-muted">{label}</span>
          </article>
        ))}
      </section>

      <section className="mx-auto grid max-w-7xl min-w-0 gap-6 px-4 pb-10 sm:px-6">
        <UpcomingDepartures />
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-6 py-12 md:grid-cols-3">
        {(
          [
            [
              "Tarifs officiels",
              "Barème par classe et réductions enfant, groupe et militaire.",
              "/tarifs",
            ],
            [
              "Bagages",
              "Franchise incluse et règles pour les bagages volumineux.",
              "/bagages",
            ],
            [
              "Voyage serein",
              "Billet nominatif sécurisé et assistance dans les 22 gares.",
              "/aide",
            ],
          ] as const
        ).map(([title, text, href], index) => (
          <article
            key={title}
            className="grid gap-3 rounded-lg bg-surface-sunk p-6"
          >
            {index === 2 && <ShieldCheck className="text-accent-ink" />}
            <h2 className="text-h4">{title}</h2>
            <p className="text-small text-ink-muted">{text}</p>
            <Link href={href} className="font-semibold text-accent-ink">
              En savoir plus <ArrowRight className="inline size-4" />
            </Link>
          </article>
        ))}
      </section>
    </main>
  )
}
