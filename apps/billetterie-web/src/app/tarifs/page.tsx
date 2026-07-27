import { PageIntro } from "@/components/site-shell"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { InlineMessage } from "@workspace/ui/components/inline-message"

export default function TarifsPage() {
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 px-s-5 py-s-5 md:gap-8 md:px-6 md:py-12">
      <PageIntro
        className="hidden md:grid"
        eyebrow="Informations voyage"
        title="Tarifs officiels"
        description="Le prix dépend du trajet, de la classe, du contingent disponible et des réductions applicables."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Deuxième classe", "Le tarif de référence pour voyager assis."],
          ["Première classe", "Davantage de confort et un contingent dédié."],
          ["VIP", "Places limitées selon la composition du train."],
        ].map(([title, description]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-small text-ink-muted">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <InlineMessage
        tone="info"
        title="Le prix affiché avant paiement fait foi."
      >
        Il est calculé par le barème SETRAG et figé pendant les 15 minutes de
        votre réservation. Les justificatifs de réduction peuvent être contrôlés
        en gare.
      </InlineMessage>
    </main>
  )
}
