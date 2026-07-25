import { ArrowRight, ShieldCheck, Smartphone, TrainFront } from "lucide-react"
import Link from "next/link"

import { GaresDesservies } from "@/components/gares-desservies"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

const AVANTAGES = [
  {
    icon: TrainFront,
    title: "Horaires en temps réel",
    description:
      "Départs, retards et disponibilités par classe, mis à jour en continu sur toute la ligne Owendo–Franceville.",
  },
  {
    icon: Smartphone,
    title: "Paiement mobile",
    description:
      "Airtel Money, Moov Money ou carte bancaire. Votre billet électronique est disponible immédiatement.",
  },
  {
    icon: ShieldCheck,
    title: "Billet nominatif sécurisé",
    description:
      "Chaque billet porte un QR code contrôlé à l'embarquement par les agents SETRAG.",
  },
]

export default function AccueilPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-16">
      <section className="flex flex-col gap-6">
        <span className="text-primary w-fit rounded-full bg-primary-light px-3 py-1 text-xs font-semibold tracking-wide uppercase">
          Société d&apos;Exploitation du Transgabonais
        </span>
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Votre billet de train, en quelques minutes.
        </h1>
        <p className="text-muted-foreground max-w-2xl text-lg text-pretty">
          Recherchez une desserte, choisissez votre classe et payez en ligne.
          Le billet électronique s&apos;ajoute automatiquement à votre espace
          voyageur et à l&apos;application mobile SETRAG.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <Link href="/recherche">
              Rechercher un train
              <ArrowRight />
            </Link>
          </Button>
          <Button size="lg" variant="secondary" asChild>
            <Link href="/mes-billets">Mes billets</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {AVANTAGES.map(({ icon: Icon, title, description }) => (
          <Card key={title}>
            <CardHeader>
              <Icon className="text-primary size-6" />
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Gares desservies</h2>
        <GaresDesservies />
      </section>
    </main>
  )
}
