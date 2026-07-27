import { CircleHelp, FileDown, MapPin, TrainFront } from "lucide-react"
import Link from "next/link"

import { PageIntro } from "@/components/site-shell"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { InlineMessage } from "@workspace/ui/components/inline-message"

const QUESTIONS = [
  {
    title: "Je ne retrouve pas mon billet",
    answer:
      "Ouvrez Mes réservations après connexion. Sans compte, utilisez le lien du dossier et le téléphone saisi pendant l’achat.",
    icon: FileDown,
  },
  {
    title: "Mon train est retardé ou supprimé",
    answer:
      "Le suivi de desserte indique le statut, le retard et les horaires estimés transmis par l’exploitation.",
    icon: TrainFront,
  },
  {
    title: "Je souhaite annuler",
    answer:
      "Une réservation non payée peut être annulée depuis Mes réservations. Pour un billet payé, les conditions de remboursement dépendent des CGV et doivent être validées par un guichet.",
    icon: CircleHelp,
  },
  {
    title: "J’ai besoin d’aide en gare",
    answer:
      "Présentez votre référence de réservation et une pièce d’identité dans une gare SETRAG. Les guichets vous assistent de 06:00 à 20:00.",
    icon: MapPin,
  },
]

export default function AidePage() {
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 px-s-5 py-s-5 md:gap-8 md:px-6 md:py-12">
      <PageIntro
        className="hidden md:grid"
        eyebrow="Assistance voyageur"
        title="Comment pouvons-nous vous aider ?"
        description="Accédez rapidement à votre dossier, au suivi de votre train et aux informations utiles avant le départ."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {QUESTIONS.map(({ title, answer, icon: Icon }) => (
          <Card key={title}>
            <CardHeader>
              <Icon className="size-5 text-accent-ink" aria-hidden />
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-small text-ink-muted">{answer}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <InlineMessage
        tone="info"
        title="Les demandes par e-mail seront activées avec le fournisseur de messagerie."
      >
        En attendant, le téléchargement des billets et l’assistance en gare
        restent disponibles.
      </InlineMessage>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/mes-reservations">Mes réservations</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/suivi">Suivre un train</Link>
        </Button>
      </div>
    </main>
  )
}
