import { QrCode, Ticket, TrainFront, Users } from "lucide-react"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

const MODULES = [
  {
    href: "/guichet",
    icon: Ticket,
    title: "Guichet",
    description:
      "Émettre une réservation, encaisser au comptoir et imprimer les billets.",
  },
  {
    href: "/controle",
    icon: QrCode,
    title: "Contrôle",
    description:
      "Scanner les QR codes à l'embarquement et consulter le manifeste passagers.",
  },
  {
    href: "/dessertes",
    icon: TrainFront,
    title: "Dessertes",
    description:
      "Suivre les départs du jour, déclarer un retard ou annuler une circulation.",
  },
  {
    href: "/utilisateurs",
    icon: Users,
    title: "Utilisateurs",
    description:
      "Gérer les comptes agents, les rôles et les rattachements aux gares.",
  },
]

export default function TableauDeBordPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Portail agent
        </span>
        <h1 className="text-3xl font-bold tracking-tight">
          Exploitation du Transgabonais
        </h1>
        <p className="text-muted-foreground">
          Accès réservé aux agents SETRAG habilités.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MODULES.map(({ href, icon: Icon, title, description }) => (
          <Card key={href}>
            <CardHeader>
              <Icon className="text-primary size-6" />
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" asChild>
                <Link href={href}>Ouvrir</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  )
}
